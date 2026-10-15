import { pool } from "./db";

export type CohortRow = {
  id: number;
  startDate: string;
  endDate: string;
  createdAt: string;
  updatedAt: string;
};

export function nairobiDate(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function dateParts(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
}

/** start + one clamped calendar month - one day, using date-only UTC arithmetic. */
export function cohortEndDate(startDate: string): string {
  const { year, month, day } = dateParts(startDate);
  const targetMonth = month === 12 ? 1 : month + 1;
  const targetYear = month === 12 ? year + 1 : year;
  const lastTargetDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  const monthLater = new Date(Date.UTC(targetYear, targetMonth - 1, Math.min(day, lastTargetDay)));
  monthLater.setUTCDate(monthLater.getUTCDate() - 1);
  return monthLater.toISOString().slice(0, 10);
}

function nextStartDate(endDate: string): string {
  const date = new Date(`${endDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Maintain the current and immediately following cohort without altering any
 * existing administrator-edited or historical dates.
 */
export async function ensureCurrentAndNextCohorts(): Promise<void> {
  const today = nairobiDate();
  const initial = await pool.query<CohortRow>(
    `SELECT id, start_date::text AS "startDate", end_date::text AS "endDate",
            created_at AS "createdAt", updated_at AS "updatedAt"
       FROM medqrown_cohorts ORDER BY start_date, id`,
  );
  let rows: CohortRow[] = initial.rows as CohortRow[];
  if (rows.length === 0) {
    await pool.query(
      `INSERT INTO medqrown_cohorts (start_date, end_date)
       VALUES ('2026-09-28', '2026-10-27') ON CONFLICT (start_date) DO NOTHING`,
    );
    const refreshed = await pool.query<CohortRow>(
      `SELECT id, start_date::text AS "startDate", end_date::text AS "endDate",
              created_at AS "createdAt", updated_at AS "updatedAt"
         FROM medqrown_cohorts ORDER BY start_date, id`,
    );
    rows = refreshed.rows as CohortRow[];
  }

  let current = rows.find((cohort) => cohort.startDate <= today && cohort.endDate >= today);
  if (!current) current = rows.find((cohort) => cohort.startDate > today);
  if (!current) {
    current = rows[rows.length - 1];
    while (current.endDate < today) {
      const startDate = nextStartDate(current.endDate);
      const endDate = cohortEndDate(startDate);
      const result = await pool.query<CohortRow>(
        `INSERT INTO medqrown_cohorts (start_date, end_date)
         VALUES ($1, $2) ON CONFLICT (start_date) DO UPDATE
           SET start_date = EXCLUDED.start_date
         RETURNING id, start_date::text AS "startDate", end_date::text AS "endDate",
                   created_at AS "createdAt", updated_at AS "updatedAt"`,
        [startDate, endDate],
      );
      current = result.rows[0] as CohortRow;
    }
  }

  // Ensure a cohort after the selected current/future cohort exists. Admins can resize cohorts
  // freely, so any later cohort counts (it need not start the day after).
  const nextStart = nextStartDate(current.endDate);
  if (!rows.some((cohort) => cohort.startDate > current!.endDate)) {
    await pool.query(
      `INSERT INTO medqrown_cohorts (start_date, end_date) VALUES ($1, $2)
       ON CONFLICT (start_date) DO NOTHING`,
      [nextStart, cohortEndDate(nextStart)],
    );
  }
}

export async function listCohorts() {
  await ensureCurrentAndNextCohorts();
  const result = await pool.query<CohortRow>(
    `SELECT id, start_date::text AS "startDate", end_date::text AS "endDate",
            created_at AS "createdAt", updated_at AS "updatedAt"
       FROM medqrown_cohorts ORDER BY start_date DESC, id DESC`,
  );
  const rows: CohortRow[] = result.rows as CohortRow[];
  const today = nairobiDate();
  const current = rows.find((item) => item.startDate <= today && item.endDate >= today)
    || rows.filter((item) => item.startDate > today).sort((a, b) => a.startDate.localeCompare(b.startDate))[0]
    || null;
  const ordered = [...rows].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const currentIndex = current ? ordered.findIndex((item) => item.id === current.id) : -1;
  const next = currentIndex >= 0 ? ordered[currentIndex + 1] || null : null;
  return { current, next, history: rows.filter((item) => current && item.startDate < current.startDate) };
}

type Queryable = { query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }> };

export type PauseState = { active: boolean; message: string | null; startedOn: string | null };

export async function getPauseState(db: Queryable = pool): Promise<PauseState> {
  const { rows } = await db.query(
    `SELECT pause_active AS active, pause_message AS message, pause_started_on::text AS "startedOn"
       FROM medqrown_settings WHERE id = 1`,
  );
  return { active: !!rows[0]?.active, message: rows[0]?.message ?? null, startedOn: rows[0]?.startedOn ?? null };
}

/**
 * The date memberships are judged against for expiry. While subscriptions are paused the
 * clock is frozen at the day the pause began, so nobody slides into grace or expiry.
 */
export function membershipAsOf(today: string, pause: PauseState): string {
  return pause.active && pause.startedOn && pause.startedOn < today ? pause.startedOn : today;
}

export function addCalendarDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export type MembershipStatus = "invited" | "active" | "grace" | "expired";

/** Starting is judged on the real date; running out is judged on the (possibly frozen) asOf date. */
export function membershipStatus(
  membership: { startDate: string; endDate: string }, graceDays: number, today: string, asOf: string,
): { status: MembershipStatus; graceEndDate: string } {
  const graceEndDate = addCalendarDays(membership.endDate, graceDays);
  const status = today < membership.startDate ? "invited"
    : asOf <= membership.endDate ? "active"
      : asOf <= graceEndDate ? "grace" : "expired";
  return { status, graceEndDate };
}

export function isDate(value: unknown): value is string {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))
    && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}

export async function getMembership(studentId: number) {
  const { rows } = await pool.query(
    `SELECT m.student_id AS "studentId", m.cohort_id AS "cohortId",
            m.start_date::text AS "startDate", m.end_date::text AS "endDate",
            m.created_at AS "createdAt", m.updated_at AS "updatedAt",
            c.start_date::text AS "cohortStartDate", c.end_date::text AS "cohortEndDate",
            s.name AS "studentName", s.email AS "studentEmail",
            EXISTS (SELECT 1 FROM medqrown_payment_entries p
                     WHERE p.student_id = m.student_id AND p.status = 'pending') AS "pendingPayment"
       FROM medqrown_memberships m
       JOIN medqrown_cohorts c ON c.id = m.cohort_id
       JOIN students s ON s.id = m.student_id
      WHERE m.student_id = $1`,
    [studentId],
  );
  const membership = rows[0];
  if (!membership) return null;
  const today = nairobiDate();
  const { rows: settingsRows } = await pool.query(
    "SELECT grace_days AS \"graceDays\" FROM medqrown_settings WHERE id = 1",
  );
  const asOf = membershipAsOf(today, await getPauseState());
  return { ...membership, ...membershipStatus(membership, Number(settingsRows[0]?.graceDays ?? 3), today, asOf) };
}

export async function listAdminMemberships(statusFilter?: string) {
  const { rows } = await pool.query(
    `SELECT m.student_id AS "studentId", m.cohort_id AS "cohortId",
            m.start_date::text AS "startDate", m.end_date::text AS "endDate",
            m.created_at AS "createdAt", m.updated_at AS "updatedAt",
            c.start_date::text AS "cohortStartDate", c.end_date::text AS "cohortEndDate",
            s.name AS "studentName", s.email AS "studentEmail",
            EXISTS (SELECT 1 FROM medqrown_payment_entries p
                     WHERE p.student_id = m.student_id AND p.status = 'pending') AS "pendingPayment",
            COALESCE((SELECT json_agg(json_build_object('id', cl.id, 'name', cl.name, 'status', cl.status)
                                      ORDER BY cl.name)
                       FROM medqrown_class_students cs JOIN medqrown_classes cl ON cl.id = cs.class_id
                      WHERE cs.student_id = m.student_id), '[]'::json) AS classes
       FROM medqrown_memberships m
       JOIN medqrown_cohorts c ON c.id = m.cohort_id
       JOIN students s ON s.id = m.student_id
      ORDER BY s.name, s.id`,
  );
  const today = nairobiDate();
  const { rows: settingsRows } = await pool.query(
    "SELECT grace_days AS \"graceDays\" FROM medqrown_settings WHERE id = 1",
  );
  const graceDays = Number(settingsRows[0]?.graceDays ?? 3);
  const asOf = membershipAsOf(today, await getPauseState());
  const results = (rows as any[]).map((membership: any) =>
    ({ ...membership, ...membershipStatus(membership, graceDays, today, asOf) }));
  return statusFilter ? results.filter((membership: any) => membership.status === statusFilter) : results;
}