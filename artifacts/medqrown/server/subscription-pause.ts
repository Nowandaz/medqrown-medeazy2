import type { Express, RequestHandler } from "express";
import { pool } from "./db";
import { addCalendarDays, getPauseState, isDate, nairobiDate } from "./stage3-storage";

const MESSAGE_LIMIT = 1000;

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86400000);
}

/**
 * Bulk membership end dates and the subscription pause.
 *
 * While paused, every membership's expiry is judged as of the day the pause began
 * (membershipAsOf), renewal reminders stop, and students keep full portal and exam access.
 * Resuming pushes back the end date of everyone who wasn't already expired when the pause
 * began, plus the current and later cohorts, by the number of paused days.
 */
export function registerSubscriptionPauseRoutes(app: Express, requireAdmin: RequestHandler, requireStudent: RequestHandler): void {
  app.post("/api/admin/memberships/bulk-end-date", requireAdmin, async (req: any, res) => {
    const studentIds = Array.isArray(req.body?.studentIds) ? [...new Set<number>(req.body.studentIds.map(Number))] : [];
    const endDate = req.body?.endDate;
    const extendDays = req.body?.extendDays;
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (!studentIds.length || studentIds.some((id) => !Number.isInteger(id) || id < 1)) {
      return res.status(400).json({ message: "Select at least one student" });
    }
    if (!reason) return res.status(400).json({ message: "A reason is required" });
    const setDate = endDate !== undefined && endDate !== null && endDate !== "";
    if (setDate === (extendDays !== undefined && extendDays !== null && extendDays !== "")) {
      return res.status(400).json({ message: "Give either a new end date or a number of days to extend by" });
    }
    if (setDate && !isDate(endDate)) return res.status(400).json({ message: "endDate must be YYYY-MM-DD" });
    const days = Number(extendDays);
    if (!setDate && (!Number.isInteger(days) || days === 0 || Math.abs(days) > 366)) {
      return res.status(400).json({ message: "Days must be a whole number between -366 and 366 (not 0)" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `SELECT s.id, s.name, m.cohort_id AS "cohortId", m.start_date::text AS "startDate", m.end_date::text AS "endDate"
           FROM students s LEFT JOIN medqrown_memberships m ON m.student_id = s.id
          WHERE s.id = ANY($1::int[]) FOR UPDATE OF s`,
        [studentIds],
      );
      if (rows.length !== studentIds.length) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "One or more students no longer exist" });
      }
      const withoutMembership = rows.filter((row: any) => !row.endDate).map((row: any) => row.name);
      if (withoutMembership.length) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: `These students have no membership yet, so there is no end date to change: ${withoutMembership.join(", ")}`,
        });
      }
      const changes = rows.map((row: any) => ({ ...row, newEnd: setDate ? endDate : addCalendarDays(row.endDate, days) }));
      const invalid = changes.filter((change: any) => change.newEnd < change.startDate).map((change: any) => change.name);
      if (invalid.length) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: `The new end date would fall before the start date for: ${invalid.join(", ")}` });
      }
      for (const change of changes) {
        await client.query(
          "UPDATE medqrown_memberships SET end_date = $2, updated_at = CURRENT_TIMESTAMP WHERE student_id = $1",
          [change.id, change.newEnd],
        );
        await client.query(
          `INSERT INTO medqrown_membership_audit (student_id, admin_id, reason, previous_values, new_values)
           VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)`,
          [change.id, req.admin.id, reason,
            JSON.stringify({ cohortId: change.cohortId, startDate: change.startDate, endDate: change.endDate }),
            JSON.stringify({ cohortId: change.cohortId, startDate: change.startDate, endDate: change.newEnd })],
        );
      }
      await client.query("COMMIT");
      res.json({ updated: changes.length });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  });

  app.get("/api/admin/pause", requireAdmin, async (_req, res) => {
    const [state, history] = await Promise.all([
      getPauseState(),
      pool.query(
        `SELECT p.id, p.message, p.started_on::text AS "startedOn", p.ended_on::text AS "endedOn",
                p.paused_days AS "pausedDays", p.memberships_extended AS "membershipsExtended",
                starter.name AS "startedBy", ender.name AS "endedBy"
           FROM medqrown_pauses p
           LEFT JOIN admins starter ON starter.id = p.started_by
           LEFT JOIN admins ender ON ender.id = p.ended_by
          ORDER BY p.started_on DESC, p.id DESC LIMIT 20`,
      ),
    ]);
    const today = nairobiDate();
    res.json({ ...state, pausedDaysSoFar: state.active && state.startedOn ? Math.max(0, daysBetween(state.startedOn, today)) : 0, history: history.rows });
  });

  // Start a pause, or update the message of the current one.
  app.post("/api/admin/pause", requireAdmin, async (req: any, res) => {
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    if (!message) return res.status(400).json({ message: "Write the message students will see" });
    if (message.length > MESSAGE_LIMIT) return res.status(400).json({ message: `Keep the message under ${MESSAGE_LIMIT} characters` });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await getPauseState(client);
      if (current.active) {
        await client.query("UPDATE medqrown_settings SET pause_message = $1, updated_at = CURRENT_TIMESTAMP WHERE id = 1", [message]);
        await client.query("UPDATE medqrown_pauses SET message = $1 WHERE ended_on IS NULL", [message]);
      } else {
        const today = nairobiDate();
        await client.query(
          `UPDATE medqrown_settings SET pause_active = TRUE, pause_message = $1, pause_started_on = $2,
                  updated_at = CURRENT_TIMESTAMP WHERE id = 1`,
          [message, today],
        );
        await client.query(
          "INSERT INTO medqrown_pauses (message, started_on, started_by) VALUES ($1, $2, $3)",
          [message, today, req.admin.id],
        );
      }
      await client.query("COMMIT");
      res.json(await getPauseState());
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  });

  app.post("/api/admin/pause/resume", requireAdmin, async (req: any, res) => {
    // On by default: the clock was frozen, so give back the paused days.
    const extendDates = req.body?.extendDates !== false;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT 1 FROM medqrown_settings WHERE id = 1 FOR UPDATE");
      const pause = await getPauseState(client);
      if (!pause.active || !pause.startedOn) {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: "Subscriptions are not paused" });
      }
      const today = nairobiDate();
      const pausedDays = Math.max(0, daysBetween(pause.startedOn, today));
      let membershipsExtended = 0;
      if (extendDates && pausedDays > 0) {
        const settings = await client.query("SELECT grace_days AS days FROM medqrown_settings WHERE id = 1");
        const graceDays = Number(settings.rows[0]?.days ?? 3);
        // Everyone not already expired when the pause began (active, in grace, or not yet started).
        const members = await client.query(
          `SELECT student_id AS "studentId", cohort_id AS "cohortId", start_date::text AS "startDate",
                  end_date::text AS "endDate"
             FROM medqrown_memberships WHERE end_date + $2::int >= $1::date FOR UPDATE`,
          [pause.startedOn, graceDays],
        );
        const reason = `Subscription pause ${pause.startedOn} to ${today}: ${pausedDays} day(s) added`;
        for (const member of members.rows) {
          const newEnd = addCalendarDays(member.endDate, pausedDays);
          await client.query(
            "UPDATE medqrown_memberships SET end_date = $2, updated_at = CURRENT_TIMESTAMP WHERE student_id = $1",
            [member.studentId, newEnd],
          );
          await client.query(
            `INSERT INTO medqrown_membership_audit (student_id, admin_id, reason, previous_values, new_values)
             VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)`,
            [member.studentId, req.admin.id, reason,
              JSON.stringify({ cohortId: member.cohortId, startDate: member.startDate, endDate: member.endDate }),
              JSON.stringify({ cohortId: member.cohortId, startDate: member.startDate, endDate: newEnd })],
          );
        }
        membershipsExtended = members.rows.length;
        // Shift the cohort calendar too, latest first so start dates never collide: the cohort running
        // at the pause keeps its start, cohorts that began during or after the pause move entirely.
        const cohorts = await client.query(
          `SELECT id, start_date::text AS "startDate" FROM medqrown_cohorts
            WHERE end_date >= $1::date ORDER BY start_date DESC FOR UPDATE`,
          [pause.startedOn],
        );
        for (const cohort of cohorts.rows) {
          await client.query(
            `UPDATE medqrown_cohorts
                SET start_date = CASE WHEN start_date > $3::date THEN start_date + $2::int ELSE start_date END,
                    end_date = end_date + $2::int, updated_at = CURRENT_TIMESTAMP
              WHERE id = $1`,
            [cohort.id, pausedDays, pause.startedOn],
          );
        }
      }
      await client.query(
        `UPDATE medqrown_settings SET pause_active = FALSE, pause_message = NULL, pause_started_on = NULL,
                updated_at = CURRENT_TIMESTAMP WHERE id = 1`,
      );
      await client.query(
        `UPDATE medqrown_pauses SET ended_on = $1, paused_days = $2, memberships_extended = $3, ended_by = $4
          WHERE ended_on IS NULL`,
        [today, pausedDays, membershipsExtended, req.admin.id],
      );
      await client.query("COMMIT");
      res.json({ resumed: true, pausedDays, membershipsExtended });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  });

  app.get("/api/student/pause", requireStudent, async (_req, res) => {
    const pause = await getPauseState();
    res.json(pause.active ? pause : { active: false, message: null, startedOn: null });
  });
}
