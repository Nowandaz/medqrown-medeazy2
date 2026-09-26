import type { Express, RequestHandler } from "express";
import { pool } from "./db";
import { ensureCurrentAndNextCohorts, cohortEndDate, isDate, nairobiDate } from "./stage3-storage";
import { insertInvite, inviteOrigin, normalizeMpesaCode, sendInvite, validatePaymentCode } from "./stage4";
import { dispatchPushToStudents } from "./stage7";
import { sendLoggedEmail } from "./stage11-email";
import { publicSiteUrl } from "./site-url";

type Queryable = { query: (sql: string, values?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }> };
type Plan = "Individual" | "Group";
const DATE_MS = 86400000;

function addDays(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.floor((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / DATE_MS);
}

async function saveNotification(db: Queryable, studentId: number, kind: string, title: string, body: string, payload: any = {}) {
  await db.query(
    `INSERT INTO medqrown_notifications (student_id, kind, title, body, payload)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [studentId, kind, title, body, JSON.stringify(payload)],
  );
}

async function nextCohortFor(db: Queryable, studentId: number): Promise<any> {
  const today = nairobiDate();
  const membership = await db.query(
    `SELECT start_date::text AS "startDate", end_date::text AS "endDate"
       FROM medqrown_memberships WHERE student_id = $1 FOR UPDATE`,
    [studentId],
  );
  const cohortsResult = await db.query(
    `SELECT id, start_date::text AS "startDate", end_date::text AS "endDate"
       FROM medqrown_cohorts ORDER BY start_date, id`,
  );
  let cohorts = cohortsResult.rows;
  if (!cohorts.length) throw new Error("No membership cohorts are configured");
  const graceResult = await db.query("SELECT grace_days AS days FROM medqrown_settings WHERE id = 1");
  const graceDays = Number(graceResult.rows[0]?.days ?? 3);
  const previous = membership.rows[0];
  if (previous) {
    const active = today >= previous.startDate && today <= previous.endDate;
    const inGrace = today > previous.endDate && today <= addDays(previous.endDate, graceDays);
    if (active || inGrace) {
      let found = cohorts.find((item: any) => item.startDate > previous.endDate);
      while (!found) {
        const tail = cohorts[cohorts.length - 1];
        const startDate = addDays(tail.endDate, 1);
        const endDate = cohortEndDate(startDate);
        await db.query(
          "INSERT INTO medqrown_cohorts (start_date, end_date) VALUES ($1, $2) ON CONFLICT (start_date) DO NOTHING",
          [startDate, endDate],
        );
        const result = await db.query(
          `SELECT id, start_date::text AS "startDate", end_date::text AS "endDate"
             FROM medqrown_cohorts WHERE start_date = $1`,
          [startDate],
        );
        cohorts.push(result.rows[0]);
        found = cohorts.find((item: any) => item.startDate > previous.endDate);
      }
      return found;
    }
  }
  const current = cohorts.find((item: any) => item.startDate <= today && item.endDate >= today)
    || cohorts.find((item: any) => item.startDate > today)
    || cohorts[cohorts.length - 1];
  const daysLeft = daysBetween(today, current.endDate);
  // Before any cohort has started, the upcoming cohort counts as current (launch case).
  if (today >= current.startDate && daysLeft >= 0 && daysLeft <= 2) {
    return cohorts.find((item: any) => item.startDate > current.endDate) || current;
  }
  return current;
}

async function chooseMembership(db: Queryable, studentId: number, adminId: number, reason: string, overrideEndDate?: string) {
  const selected = await nextCohortFor(db, studentId);
  const prior = await db.query(
    `SELECT cohort_id AS "cohortId", start_date::text AS "startDate", end_date::text AS "endDate"
       FROM medqrown_memberships WHERE student_id = $1 FOR UPDATE`,
    [studentId],
  );
  const endDate = overrideEndDate || selected.endDate;
  if (overrideEndDate && !isDate(overrideEndDate)) throw new Error("endDate must be a valid YYYY-MM-DD date");
  const cohort = overrideEndDate
    ? (await db.query("SELECT id FROM medqrown_cohorts WHERE end_date >= $1 ORDER BY start_date LIMIT 1", [endDate])).rows[0]
    : selected;
  if (!cohort?.id) throw new Error("No cohort is configured for the approved end date");
  const startDate = selected.startDate;
  await db.query(
    `INSERT INTO medqrown_memberships (student_id, cohort_id, start_date, end_date)
     VALUES ($1, $2, $3, $4) ON CONFLICT (student_id) DO UPDATE
       SET cohort_id = EXCLUDED.cohort_id, start_date = EXCLUDED.start_date,
           end_date = EXCLUDED.end_date, updated_at = CURRENT_TIMESTAMP`,
    [studentId, Number(cohort.id), startDate, endDate],
  );
  await db.query(
    `INSERT INTO medqrown_membership_audit (student_id, admin_id, reason, previous_values, new_values)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)`,
    [studentId, adminId, reason, prior.rows[0] ? JSON.stringify(prior.rows[0]) : null,
      JSON.stringify({ cohortId: Number(cohort.id), startDate, endDate })],
  );
  return { cohortId: Number(cohort.id), startDate, endDate };
}

async function memberCanRenew(studentId: number): Promise<{ allowed: boolean; message?: string }> {
  const { rows } = await pool.query(
    `SELECT m.start_date::text AS "startDate", m.end_date::text AS "endDate"
       FROM medqrown_memberships m WHERE m.student_id = $1`,
    [studentId],
  );
  const membership = rows[0];
  if (!membership) return { allowed: false, message: "A membership is required before it can be renewed" };
  const today = nairobiDate();
  if (today < addDays(membership.endDate, -7)) {
    return { allowed: false, message: "Renewal becomes available 7 days before your membership ends" };
  }
  const classMember = await pool.query(
    "SELECT 1 FROM medqrown_class_students WHERE student_id = $1 LIMIT 1",
    [studentId],
  );
  if (!classMember.rows[0]) return { allowed: false, message: "Your account is not attached to a class membership" };
  return { allowed: true };
}

export async function groupedQueue(statusFilter?: string) {
  const today = nairobiDate();
  const result = await pool.query(
    `SELECT UPPER(REGEXP_REPLACE(p.code, '[[:space:]]', '', 'g')) AS code,
            json_agg(json_build_object(
              'id', p.id, 'studentId', p.student_id, 'studentName', s.name,
              'studentEmail', s.email, 'phone', s.phone, 'plan', p.plan,
              'amount', p.amount, 'source', p.source, 'status', p.status,
              'targetCohortId', p.target_cohort_id, 'reason', p.reason,
              'reviewerId', p.reviewer_id, 'reviewerName', a.name,
              'createdAt', p.created_at, 'reviewedAt', p.reviewed_at,
              'membershipStatus', CASE WHEN m.student_id IS NULL THEN 'none'
                WHEN $1::date < m.start_date THEN 'invited'
                WHEN $1::date <= m.end_date THEN 'active'
                WHEN $1::date <= m.end_date + COALESCE(settings.grace_days, 3) THEN 'grace'
                ELSE 'expired' END
            ) ORDER BY p.created_at, p.id) AS entries,
            MIN(p.created_at) AS first_created_at,
            ARRAY_AGG(DISTINCT p.plan) AS plans,
            ARRAY_AGG(DISTINCT p.source) AS sources,
            BOOL_OR(p.plan = 'Individual') AS has_individual,
            COUNT(*)::int AS entry_count
       FROM medqrown_payment_entries p
       JOIN students s ON s.id = p.student_id
       LEFT JOIN admins a ON a.id = p.reviewer_id
       LEFT JOIN medqrown_memberships m ON m.student_id = p.student_id
       LEFT JOIN medqrown_settings settings ON settings.id = 1
      GROUP BY UPPER(REGEXP_REPLACE(p.code, '[[:space:]]', '', 'g'))
      ORDER BY MAX(p.created_at) DESC`,
    [today],
  );
  const now = Date.now();
  const groups = result.rows.map((group: any) => {
    const entries = group.entries.map((entry: any) => ({
      ...entry,
      studentId: Number(entry.studentId),
      id: Number(entry.id),
    }));
    // Rejected entries stay visible but do not count towards the code's usage.
    const active = entries.filter((entry: any) => entry.status !== "rejected");
    const plans = [...new Set(active.map((entry: any) => entry.plan))];
    const pending = entries.filter((entry: any) => entry.status === "pending");
    const flags: string[] = [];
    if (plans.length > 1) flags.push("Mixed plans for the same M-Pesa code");
    if (plans.includes("Individual") && active.length > 1) flags.push("Individual code has more than one entry");
    if (plans.includes("Group") && pending.length && active.length < 4
        && now - new Date(group.first_created_at).getTime() >= 48 * 60 * 60 * 1000) {
      flags.push("Group incomplete for at least 48 hours");
    }
    if (active.length > (plans.includes("Individual") ? 1 : 4)) flags.push("Code usage exceeds plan limit");
    const status = flags.length && pending.length ? "Flagged"
      : pending.length ? "Pending"
        : entries.every((entry: any) => entry.status === "paid") ? "Approved"
        : entries.some((entry: any) => entry.status === "rejected") ? "Rejected"
            : "Pending";
    return {
      code: group.code,
      status,
      flags,
      plans,
      expectedAmount: entries[0]?.plan === "Group" ? entries[0]?.amount : entries[0]?.amount,
      sources: [...new Set(entries.map((entry: any) => entry.source))],
      firstSubmittedAt: group.first_created_at,
      completeness: { count: active.length, required: plans.includes("Group") ? 4 : 1 },
      entries,
    };
  });
  return statusFilter ? groups.filter((item: any) => item.status.toLowerCase() === statusFilter.toLowerCase()) : groups;
}

async function notifyPaymentResult(studentId: number, status: "approved" | "rejected", reason?: string, endDate?: string) {
  const student = await pool.query("SELECT name, email FROM students WHERE id = $1", [studentId]);
  if (!student.rows[0]) return;
  const { name, email } = student.rows[0];
  const title = status === "approved" ? "Payment approved" : "Payment rejected";
  const body = status === "approved"
    ? `Your membership payment was approved${endDate ? `; your membership now ends ${endDate}` : ""}.`
    : `Your payment was rejected. Reason: ${reason}`;
  await saveNotification(pool, studentId, `payment_${status}`, title, body, { status, reason: reason || null, endDate: endDate || null });
  await sendLoggedEmail({
    to: email,
    templateKey: status === "approved" ? "payment_approved" : "payment_rejected",
    variables: { student_name: name, cohort_end: endDate || "", reason: reason || "" },
  });
}

export function registerStage5Routes(app: Express, requireAdmin: RequestHandler, requireStudent: RequestHandler): void {
  app.get("/api/student/renewal/payment-details", requireStudent, async (_req: any, res) => {
    const { rows } = await pool.query(
      `SELECT paybill, account_number AS "accountNumber", bank_name AS "bankName",
              individual_price AS "individualPrice", group_price AS "groupPrice",
              grace_days AS "graceDays" FROM medqrown_settings WHERE id = 1`,
    );
    const details = rows[0];
    res.json({ ...details, accountNote: "Please copy and paste the account number when paying via M-Pesa to avoid errors.",
      groupInstructions: `One person pays KSh ${details.groupPrice} for the group. Each of the 4 members must then enter the same M-Pesa code here (or be included in the registration form).` });
  });

  app.get("/api/student/renewal", requireStudent, async (req: any, res) => {
    const gate = await memberCanRenew(Number(req.student.id));
    const { rows } = await pool.query(
      `SELECT m.start_date::text AS "startDate", m.end_date::text AS "endDate"
         FROM medqrown_memberships m WHERE m.student_id = $1`,
      [req.student.id],
    );
    res.json({ available: gate.allowed, ...(gate.message ? { message: gate.message } : {}), membership: rows[0] || null });
  });

  app.post("/api/student/renewal", requireStudent, async (req: any, res) => {
    const code = normalizeMpesaCode(req.body?.code);
    const plan = req.body?.plan as Plan;
    if (!code || (plan !== "Individual" && plan !== "Group")) {
      return res.status(400).json({ message: "Enter a 10-character M-Pesa code (A-Z, 0-9) and choose Individual or Group" });
    }
    const gate = await memberCanRenew(Number(req.student.id));
    if (!gate.allowed) return res.status(403).json({ message: gate.message });
    const client = await pool.connect();
    let payment: any;
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`code:${code}`]);
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`student:${req.student.id}`]);
      const errors = await validatePaymentCode(client, Number(req.student.id), code, plan);
      if (errors.length) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: errors[0], errors });
      }
      const settings = await client.query(
        `SELECT CASE WHEN $1 = 'Group' THEN group_price ELSE individual_price END AS amount
           FROM medqrown_settings WHERE id = 1`,
        [plan],
      );
      const target = await nextCohortFor(client, Number(req.student.id));
      const inserted = await client.query(
        `INSERT INTO medqrown_payment_entries (student_id, code, plan, amount, source, status, target_cohort_id)
         VALUES ($1, $2, $3, $4, 'in_app', 'pending', $5)
         RETURNING id, code, plan, amount, source, status, created_at AS "createdAt"`,
        [req.student.id, code, plan, Number(settings.rows[0]?.amount ?? 0), Number(target.id)],
      );
      payment = inserted.rows[0];
      await client.query("COMMIT");
    } catch (error: any) {
      await client.query("ROLLBACK");
      if (error?.code === "23505") return res.status(400).json({ message: "This student already has a payment entry for this code" });
      throw error;
    } finally {
      client.release();
    }
    res.status(201).json({ ...payment, message: "Pending payment verification" });
  });

  app.get("/api/student/notifications", requireStudent, async (req: any, res) => {
    const { rows } = await pool.query(
      `SELECT id, kind, title, body, payload, created_at AS "createdAt", read_at AS "readAt"
         FROM medqrown_notifications WHERE student_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [req.student.id],
    );
    res.json(rows);
  });

  app.get("/api/admin/payments", requireAdmin, async (req: any, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    if (status && !["pending", "flagged", "approved", "rejected"].includes(status.toLowerCase())) {
      return res.status(400).json({ message: "status must be Pending, Flagged, Approved, or Rejected" });
    }
    res.json(await groupedQueue(status));
  });

  app.patch("/api/admin/payments/:entryId", requireAdmin, async (req: any, res) => {
    const entryId = Number(req.params.entryId);
    const code = req.body?.code === undefined ? undefined : normalizeMpesaCode(req.body.code);
    const plan = req.body?.plan;
    if (!Number.isInteger(entryId) || entryId < 1 || (req.body?.code !== undefined && !code)
        || (plan !== undefined && plan !== "Individual" && plan !== "Group")
        || (code === undefined && plan === undefined)) {
      return res.status(400).json({ message: "Provide a valid entryId and valid code and/or plan" });
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query("SELECT * FROM medqrown_payment_entries WHERE id = $1 FOR UPDATE", [entryId]);
      if (!current.rows[0]) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Payment entry not found" });
      }
      const entry = current.rows[0];
      const newCode = code || normalizeMpesaCode(entry.code)!;
      const newPlan = plan || entry.plan;
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`code:${newCode}`]);
      if (entry.status === "paid") {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: "Approved payment entries cannot be edited" });
      }
      const { rows: uses } = await client.query(
        `SELECT plan, COUNT(*)::int AS count, BOOL_OR(student_id = $2) AS used_by_student
           FROM medqrown_payment_entries
          WHERE UPPER(REGEXP_REPLACE(code, '[[:space:]]', '', 'g')) = $1 AND id <> $3
            AND status <> 'rejected'
          GROUP BY plan`,
        [newCode, entry.student_id, entryId],
      );
      const count = uses.reduce((total: number, use: any) => total + Number(use.count), 0);
      const individualCount = uses.filter((use: any) => use.plan === "Individual")
        .reduce((total: number, use: any) => total + Number(use.count), 0);
      if (uses.some((use: any) => use.used_by_student) || count >= 4
          || (newPlan === "Individual" && individualCount >= 1)) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "The edited code would duplicate a student or exceed its lifetime usage limit" });
      }
      const amountResult = await client.query(
        `SELECT CASE WHEN $1 = 'Group' THEN group_price ELSE individual_price END AS amount
           FROM medqrown_settings WHERE id = 1`,
        [newPlan],
      );
      const updated = await client.query(
        `UPDATE medqrown_payment_entries SET code = $2, plan = $3, amount = $4
          WHERE id = $1 RETURNING id, student_id AS "studentId", code, plan, amount, status`,
        [entryId, newCode, newPlan, Number(amountResult.rows[0]?.amount ?? entry.amount)],
      );
      await client.query("COMMIT");
      res.json(updated.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  app.post("/api/admin/payments/approve", requireAdmin, async (req: any, res) => {
    const ids: number[] = Array.isArray(req.body?.entryIds)
      ? [...new Set<number>((req.body.entryIds as unknown[]).map(Number))]
      : [];
    if (!ids.length || ids.some((id: number) => !Number.isInteger(id) || id < 1)) {
      return res.status(400).json({ message: "entryIds must contain one or more positive payment entry ids" });
    }
    const override = req.body?.endDate;
    if (override !== undefined && !isDate(override)) return res.status(400).json({ message: "endDate must be YYYY-MM-DD" });
    await ensureCurrentAndNextCohorts();
    const client = await pool.connect();
    const notifications: { id: number; endDate: string }[] = [];
    const invites: { id: number; token: string }[] = [];
    try {
      await client.query("BEGIN");
      const selected = await client.query(
        `SELECT id, student_id AS "studentId", code FROM medqrown_payment_entries
          WHERE id = ANY($1::int[]) AND status = 'pending' ORDER BY id FOR UPDATE`,
        [ids],
      );
      if (selected.rows.length !== ids.length) {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: "One or more entries are missing or no longer pending" });
      }
      for (const entry of selected.rows) {
        const membership = await chooseMembership(client, Number(entry.studentId), Number(req.admin.id),
          `Approved payment ${entry.code}`, override);
        await client.query(
          `UPDATE medqrown_payment_entries SET status = 'paid', reviewer_id = $2,
             reviewed_at = CURRENT_TIMESTAMP, reason = NULL WHERE id = $1`,
          [entry.id, req.admin.id],
        );
        await saveNotification(client, Number(entry.studentId), "payment_approved", "Payment approved",
          `Your membership payment was approved; your membership now ends ${membership.endDate}.`,
          { status: "approved", endDate: membership.endDate, pushReady: {
            title: "Payment approved",
            body: `Your membership payment was approved; your membership now ends ${membership.endDate}.`,
            url: "/student/dashboard",
          } });
        notifications.push({ id: Number(entry.studentId), endDate: membership.endDate });
        // New students uploaded as unverified have no account yet: issue their invite on approval.
        const account = await client.query("SELECT 1 FROM student_accounts WHERE student_id = $1", [entry.studentId]);
        if (!account.rows[0]) invites.push({ id: Number(entry.studentId), token: await insertInvite(client, Number(entry.studentId)) });
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    for (const item of notifications) {
      const student = await pool.query("SELECT name, email FROM students WHERE id = $1", [item.id]);
      if (student.rows[0]) {
        const { name, email } = student.rows[0];
        await sendLoggedEmail({
          to: email, templateKey: "payment_approved",
          variables: { student_name: name, cohort_end: item.endDate },
        });
        const invite = invites.find((candidate) => candidate.id === item.id);
        if (invite) await sendInvite(email, name, invite.token, inviteOrigin(req));
      }
    }
    const pushSent = await dispatchPushToStudents(notifications.map((item) => item.id), {
      title: "Payment approved",
      body: "Your membership payment was approved.",
      url: "/student/dashboard",
    });
    res.json({ approvedEntryIds: ids, count: ids.length, notificationsSent: notifications.length, pushSent,
      pushPendingConfiguration: !process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY || !process.env.VAPID_SUBJECT });
  });

  app.post("/api/admin/payments/reject", requireAdmin, async (req: any, res) => {
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    const ids: number[] = Array.isArray(req.body?.entryIds)
      ? [...new Set<number>((req.body.entryIds as unknown[]).map(Number))]
      : [];
    if (!reason || reason.length > 1000 || !ids.length || ids.some((id: number) => !Number.isInteger(id) || id < 1)) {
      return res.status(400).json({ message: "entryIds and a mandatory reason of at most 1000 characters are required" });
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const selected = await client.query(
        `SELECT id, student_id AS "studentId" FROM medqrown_payment_entries
          WHERE id = ANY($1::int[]) AND status = 'pending' ORDER BY id FOR UPDATE`,
        [ids],
      );
      if (selected.rows.length !== ids.length) {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: "One or more entries are missing or no longer pending" });
      }
      for (const entry of selected.rows) {
        await client.query(
          `UPDATE medqrown_payment_entries SET status = 'rejected', reviewer_id = $2,
             reviewed_at = CURRENT_TIMESTAMP, reason = $3 WHERE id = $1`,
          [entry.id, req.admin.id, reason],
        );
        await saveNotification(client, Number(entry.studentId), "payment_rejected", "Payment rejected",
          `Your payment was rejected. Reason: ${reason}`, { status: "rejected", reason, pushReady: {
            title: "Payment rejected",
            body: `Your payment was rejected. Reason: ${reason}`,
            url: "/student/dashboard",
          } });
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    for (const entryId of ids) {
      const entry = await pool.query(
        `SELECT s.id, s.name, s.email FROM medqrown_payment_entries p JOIN students s ON s.id = p.student_id WHERE p.id = $1`,
        [entryId],
      );
      if (entry.rows[0]) {
        const { name, email } = entry.rows[0];
        await sendLoggedEmail({
          to: email, templateKey: "payment_rejected",
          variables: { student_name: name, reason },
        });
      }
    }
    const studentIds = await pool.query(
      "SELECT DISTINCT student_id AS id FROM medqrown_payment_entries WHERE id = ANY($1::int[])",
      [ids],
    );
    const pushSent = await dispatchPushToStudents(studentIds.rows.map((entry: any) => Number(entry.id)), {
      title: "Payment rejected",
      body: `Your payment was rejected. Reason: ${reason}`,
      url: "/student/dashboard",
    });
    res.json({ rejectedEntryIds: ids, count: ids.length, pushSent,
      pushPendingConfiguration: !process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY || !process.env.VAPID_SUBJECT });
  });
}

/** Idempotent scheduled worker, invoked on boot and periodically by the server. */
export async function sendDueRenewalReminders(): Promise<void> {
  await ensureCurrentAndNextCohorts();
  const today = nairobiDate();
  const due = await pool.query(
    `SELECT m.student_id AS "studentId", m.end_date::text AS "endDate",
            s.name, s.email, p.plan AS "lastPlan",
            settings.individual_price AS "individualPrice", settings.group_price AS "groupPrice",
            settings.paybill, settings.account_number AS "accountNumber", settings.bank_name AS "bankName"
       FROM medqrown_memberships m
       JOIN students s ON s.id = m.student_id
       CROSS JOIN medqrown_settings settings
       LEFT JOIN LATERAL (
         SELECT plan FROM medqrown_payment_entries
          WHERE student_id = m.student_id AND status = 'paid' ORDER BY reviewed_at DESC NULLS LAST, id DESC LIMIT 1
       ) p ON TRUE
      WHERE m.end_date IN ($1::date + 7, $1::date + 3, $1::date)
        AND NOT EXISTS (
          SELECT 1 FROM medqrown_payment_entries pe
           WHERE pe.student_id = m.student_id AND pe.status IN ('pending', 'paid')
             AND pe.target_cohort_id = (
               SELECT c.id FROM medqrown_cohorts c WHERE c.start_date > m.end_date ORDER BY c.start_date LIMIT 1
             )
        )`,
    [today],
  );
  for (const candidate of due.rows) {
    const days = daysBetween(today, candidate.endDate);
    if (![7, 3, 0].includes(days)) continue;
    const client = await pool.connect();
    let claimed = false;
    try {
      const result = await client.query(
        `INSERT INTO medqrown_reminder_log (student_id, membership_end_date, days_before_end)
         VALUES ($1, $2, $3) ON CONFLICT (student_id, membership_end_date, days_before_end) DO NOTHING
         RETURNING id`,
        [candidate.studentId, candidate.endDate, days],
      );
      claimed = !!result.rows[0];
    } finally {
      client.release();
    }
    if (!claimed) continue;
    const savings = Number(candidate.individualPrice) - Number(candidate.groupPrice) / 4;
    const percent = Number(candidate.individualPrice) > 0 ? Math.round(savings / Number(candidate.individualPrice) * 100) : 0;
    const savingsMessage = candidate.lastPlan === "Individual"
      ? ` MedEazy is cheaper with friends! Join with 3 friends and save about ${percent}% (KSh ${Math.round(savings)} each per month).`
      : "";
    const renewUrl = `${publicSiteUrl()}/student/dashboard`;
    const feedbackUrl = `${publicSiteUrl()}/student/my-class`;
    const body = `Your membership ends ${candidate.endDate}. Paybill ${candidate.paybill}, account ${candidate.accountNumber} (${candidate.bankName}). Renew: ${renewUrl}. Leave feedback: ${feedbackUrl}.${savingsMessage}`;
    await saveNotification(pool, Number(candidate.studentId), "membership_renewal_reminder",
      `Membership ends in ${days} day${days === 1 ? "" : "s"}`, body, {
        endDate: candidate.endDate, daysBeforeEnd: days, paymentDetails: {
          paybill: candidate.paybill, accountNumber: candidate.accountNumber, bankName: candidate.bankName,
        }, renewUrl, feedbackUrl, push: { title: "Membership renewal reminder", body },
      });
    const reminderTemplate = days === 7 ? "renewal_7_days" : days === 3 ? "renewal_3_days" : "renewal_last_day";
    const emailResult = await sendLoggedEmail({
      to: candidate.email,
      templateKey: reminderTemplate,
      variables: {
        student_name: candidate.name, cohort_end: candidate.endDate, renew_link: renewUrl,
        paybill: candidate.paybill, account_number: candidate.accountNumber,
        bank_name: candidate.bankName, feedback_link: feedbackUrl, savings_message: savingsMessage.trim(),
      },
    });
    const emailSent = emailResult.status === "sent";
    const pushSent = await dispatchPushToStudents([Number(candidate.studentId)], {
      title: "Membership renewal reminder", body, url: renewUrl,
    });
    await pool.query(
      "UPDATE medqrown_reminder_log SET channels = $4::jsonb WHERE student_id = $1 AND membership_end_date = $2 AND days_before_end = $3",
      [candidate.studentId, candidate.endDate, days, JSON.stringify({
        email: emailSent, inApp: true, push: process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT
          ? { sent: pushSent } : "disabled_pending_configuration",
      })],
    );
  }
}
