import type { Express, RequestHandler } from "express";
import { pool } from "./db";
import { getMembership } from "./stage3-storage";

/**
 * Class timetable: recurring online sessions, Mock CATs, revision and lab sessions.
 * Times are Nairobi wall-clock times ("HH:MM"); dates are Nairobi calendar dates.
 */
export async function migrateTimetable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS medqrown_timetable_sessions (
      id SERIAL PRIMARY KEY,
      class_id INTEGER NOT NULL REFERENCES medqrown_classes(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'online' CHECK (kind IN ('online', 'mock_cat', 'revision', 'lab', 'other')),
      recurrence TEXT NOT NULL DEFAULT 'weekly' CHECK (recurrence IN ('weekly', 'biweekly', 'once')),
      day_of_week INTEGER CHECK (day_of_week BETWEEN 0 AND 6),
      start_date DATE NOT NULL,
      start_time TEXT NOT NULL CHECK (start_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
      end_time TEXT NOT NULL CHECK (end_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
      location TEXT,
      link TEXT,
      notes TEXT,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS medqrown_timetable_class_idx ON medqrown_timetable_sessions(class_id, active);
    -- First-login walkthrough (see /api/student/onboarding/complete)
    ALTER TABLE students ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ;
  `);
}

type SessionRow = {
  id: number; classId: number; className?: string; title: string; kind: string; recurrence: string;
  dayOfWeek: number | null; startDate: string; startTime: string; endTime: string;
  location: string | null; link: string | null; notes: string | null; active: boolean;
};

const SELECT = `SELECT t.id, t.class_id AS "classId", c.name AS "className", t.title, t.kind, t.recurrence,
                      t.day_of_week AS "dayOfWeek", t.start_date::text AS "startDate", t.start_time AS "startTime",
                      t.end_time AS "endTime", t.location, t.link, t.notes, t.active
                 FROM medqrown_timetable_sessions t JOIN medqrown_classes c ON c.id = t.class_id`;

const NAIROBI_OFFSET_MS = 3 * 60 * 60 * 1000;
const toUtc = (date: string, time: string) => new Date(Date.parse(`${date}T${time}:00Z`) - NAIROBI_OFFSET_MS);
const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Next `count` occurrences (start/end as ISO instants) that haven't finished yet. */
export function upcomingOccurrences(session: SessionRow, count = 3, now = new Date()): { startsAt: string; endsAt: string }[] {
  const out: { startsAt: string; endsAt: string }[] = [];
  const step = session.recurrence === "biweekly" ? 14 : 7;
  let date = session.startDate;
  if (session.recurrence !== "once" && session.dayOfWeek != null) {
    // Align the anchor to the configured weekday.
    const shift = (session.dayOfWeek - new Date(`${date}T00:00:00Z`).getUTCDay() + 7) % 7;
    date = addDays(date, shift);
  }
  for (let i = 0; i < 400 && out.length < count; i++) {
    const startsAt = toUtc(date, session.startTime);
    let endsAt = toUtc(date, session.endTime);
    if (endsAt <= startsAt) endsAt = new Date(endsAt.getTime() + 24 * 60 * 60 * 1000);
    if (endsAt > now) out.push({ startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() });
    if (session.recurrence === "once") break;
    date = addDays(date, step);
  }
  return out;
}

function parseSession(body: any): { value?: Record<string, any>; error?: string } {
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const kind = body?.kind ?? "online";
  const recurrence = body?.recurrence ?? "weekly";
  const startDate = body?.startDate;
  const startTime = body?.startTime;
  const endTime = body?.endTime;
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!title || title.length > 200) return { error: "Give the session a title (up to 200 characters)." };
  if (!["online", "mock_cat", "revision", "lab", "other"].includes(kind)) return { error: "Choose a valid session type." };
  if (!["weekly", "biweekly", "once"].includes(recurrence)) return { error: "Choose weekly, every two weeks, or once." };
  if (typeof startDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return { error: "Choose the first date of the session." };
  if (typeof startTime !== "string" || !time.test(startTime) || typeof endTime !== "string" || !time.test(endTime)) {
    return { error: "Enter start and end times like 20:00." };
  }
  const link = typeof body?.link === "string" && body.link.trim() ? body.link.trim() : null;
  if (link && !/^https:\/\/[^\s]+$/i.test(link)) return { error: "Links must start with https:// (e.g. a Google Meet link)." };
  const text = (value: unknown, max: number) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null);
  return {
    value: {
      title, kind, recurrence, startDate, startTime, endTime, link,
      dayOfWeek: recurrence === "once" ? null : new Date(`${startDate}T00:00:00Z`).getUTCDay(),
      location: text(body?.location, 200), notes: text(body?.notes, 1000),
      active: body?.active === undefined ? true : body.active === true,
    },
  };
}

/** The four standard consultancy sessions, starting from the given Monday. */
function standardSchedule(monday: string) {
  const saturday = addDays(monday, 5);
  return [
    { title: "Weekly Online Session", kind: "online", recurrence: "weekly", startDate: monday, startTime: "20:00", endTime: "22:00",
      notes: "We cover next week's objectives so you know the content before lectures." },
    { title: "Weekly Mock CAT", kind: "mock_cat", recurrence: "weekly", startDate: saturday, startTime: "20:00", endTime: "20:30",
      notes: "On this website — open My Class → Exams." },
    { title: "Weekly Revision Session", kind: "revision", recurrence: "weekly", startDate: saturday, startTime: "20:30", endTime: "22:30",
      notes: "We go through the tested concepts and areas of difficulty." },
    { title: "Physical Gross Anatomy Lab", kind: "lab", recurrence: "biweekly", startDate: saturday, startTime: "10:00", endTime: "13:00",
      notes: null },
  ];
}

export function registerTimetableRoutes(app: Express, requireAdmin: RequestHandler, requireStudent: RequestHandler): void {
  app.get("/api/admin/classes/:classId/timetable", requireAdmin, async (req, res) => {
    const classId = Number(req.params.classId);
    const { rows } = await pool.query(`${SELECT} WHERE t.class_id = $1 ORDER BY t.active DESC, t.day_of_week NULLS LAST, t.start_time, t.id`, [classId]);
    res.json(rows.map((row: SessionRow) => ({ ...row, next: upcomingOccurrences(row, 1)[0] ?? null })));
  });

  app.post("/api/admin/classes/:classId/timetable", requireAdmin, async (req, res) => {
    const classId = Number(req.params.classId);
    const { value, error } = parseSession(req.body);
    if (error || !value) return res.status(400).json({ message: error });
    const { rows } = await pool.query(
      `INSERT INTO medqrown_timetable_sessions
         (class_id, title, kind, recurrence, day_of_week, start_date, start_time, end_time, location, link, notes, active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [classId, value.title, value.kind, value.recurrence, value.dayOfWeek, value.startDate, value.startTime, value.endTime,
        value.location, value.link, value.notes, value.active],
    );
    res.status(201).json({ id: rows[0].id });
  });

  app.post("/api/admin/classes/:classId/timetable/standard", requireAdmin, async (req, res) => {
    const classId = Number(req.params.classId);
    const monday = typeof req.body?.startMonday === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.body.startMonday)
      ? req.body.startMonday : "2026-09-28";
    for (const session of standardSchedule(monday)) {
      await pool.query(
        `INSERT INTO medqrown_timetable_sessions (class_id, title, kind, recurrence, day_of_week, start_date, start_time, end_time, notes)
         VALUES ($1,$2,$3,$4,EXTRACT(DOW FROM $5::date)::int,$5,$6,$7,$8)`,
        [classId, session.title, session.kind, session.recurrence, session.startDate, session.startTime, session.endTime, session.notes],
      );
    }
    res.status(201).json({ ok: true });
  });

  app.patch("/api/admin/timetable/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const { value, error } = parseSession(req.body);
    if (error || !value) return res.status(400).json({ message: error });
    const { rowCount } = await pool.query(
      `UPDATE medqrown_timetable_sessions SET title=$2, kind=$3, recurrence=$4, day_of_week=$5, start_date=$6, start_time=$7,
              end_time=$8, location=$9, link=$10, notes=$11, active=$12, updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
      [id, value.title, value.kind, value.recurrence, value.dayOfWeek, value.startDate, value.startTime, value.endTime,
        value.location, value.link, value.notes, value.active],
    );
    if (!rowCount) return res.status(404).json({ message: "Session not found" });
    res.json({ ok: true });
  });

  app.delete("/api/admin/timetable/:id", requireAdmin, async (req, res) => {
    const { rowCount } = await pool.query("DELETE FROM medqrown_timetable_sessions WHERE id = $1", [Number(req.params.id)]);
    if (!rowCount) return res.status(404).json({ message: "Session not found" });
    res.json({ ok: true });
  });

  /** A student's timetable across their classes, with the next occurrences of each session. */
  app.get("/api/student/timetable", requireStudent, async (req: any, res) => {
    const membership = await getMembership(Number(req.student.id));
    const { rows } = await pool.query(
      `${SELECT} JOIN medqrown_class_students cs ON cs.class_id = t.class_id
        WHERE cs.student_id = $1 AND t.active AND c.status = 'active'
        ORDER BY t.day_of_week NULLS LAST, t.start_time, t.id`,
      [req.student.id],
    );
    // Join links are only shown to members with access (Active or Grace).
    const hasAccess = !!membership && ["active", "grace"].includes(membership.status);
    const sessions = rows.map((row: SessionRow) => ({
      ...row, link: hasAccess ? row.link : null, upcoming: upcomingOccurrences(row, 3),
    }));
    const next = sessions
      .flatMap((session: any) => session.upcoming.map((occ: any) => ({ ...occ, sessionId: session.id, title: session.title,
        kind: session.kind, className: session.className, link: session.link, location: session.location, notes: session.notes })))
      .sort((a: any, b: any) => a.startsAt.localeCompare(b.startsAt));
    res.json({ sessions, upcoming: next.slice(0, 8), linksHidden: !hasAccess });
  });
}
