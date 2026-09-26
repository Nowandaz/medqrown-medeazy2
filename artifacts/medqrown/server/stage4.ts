import type { Express, RequestHandler } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { pool } from "./db";
import { getStage10ClassMembers } from "./stage10";
import { cohortEndDate, ensureCurrentAndNextCohorts, isDate, nairobiDate } from "./stage3-storage";
import { sendLoggedEmail } from "./stage11-email";
import { publicSiteUrl } from "./site-url";

const HEADERS = ["full_name", "email", "phone", "mpesa_code", "plan"];
const CODE_PATTERN = /^[A-Z0-9]{10}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_CSV_BYTES = 1024 * 1024;
type MemberRow = {
  rowNumber: number;
  fullName: string;
  email: string;
  phone: string;
  code: string;
  plan: string;
  classification: "New student" | "Existing student" | "Error";
  errors: string[];
  studentId?: number;
};
type CsvResult = { rows: MemberRow[]; errorReport: { rowNumber: number; email: string; errors: string[] }[] };
type Queryable = { query: (sql: string, values?: unknown[]) => Promise<{ rows: any[] }> };

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizePhone(input: string): string | null {
  const digits = input.trim().replace(/[()\s-]/g, "").replace(/^\+/, "");
  if (/^0[17]\d{8}$/.test(digits)) return `+254${digits.slice(1)}`;
  if (/^254[17]\d{8}$/.test(digits)) return `+${digits}`;
  if (/^[17]\d{8}$/.test(digits)) return `+254${digits}`;
  return null;
}

function parseCsv(csv: string): { values: string[][]; error?: string } {
  if (Buffer.byteLength(csv, "utf8") > MAX_CSV_BYTES) return { values: [], error: "CSV is larger than 1 MB" };
  const records: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    if (quoted) {
      if (char === '"' && csv[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"' && cell.length === 0) {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) records.push(row);
      row = [];
      cell = "";
      if (char === "\r" && csv[i + 1] === "\n") i++;
    } else {
      cell += char;
    }
  }
  if (quoted) return { values: [], error: "CSV contains an unterminated quoted field" };
  row.push(cell);
  if (row.some((value) => value.trim() !== "")) records.push(row);
  return { values: records };
}

function parseCsvRows(csv: unknown): { rows: MemberRow[]; parseError?: string } {
  if (typeof csv !== "string" || !csv.trim()) return { rows: [], parseError: "csv must be a non-empty string" };
  const parsed = parseCsv(csv);
  if (parsed.error) return { rows: [], parseError: parsed.error };
  if (!parsed.values.length || parsed.values[0].map((v) => v.trim()).join(",") !== HEADERS.join(",")) {
    return { rows: [], parseError: `Header row must be exactly: ${HEADERS.join(",")}` };
  }
  const rows = parsed.values.slice(1).map((values, index): MemberRow => {
    const fullName = (values[0] ?? "").trim();
    const email = (values[1] ?? "").trim().toLowerCase();
    const normalizedPhone = normalizePhone(values[2] ?? "");
    const code = (values[3] ?? "").replace(/\s/g, "").toUpperCase();
    const plan = (values[4] ?? "").trim();
    const errors: string[] = [];
    if (values.length !== HEADERS.length) errors.push("Row must contain exactly 5 columns");
    if (!fullName) errors.push("Full name is required");
    if (fullName.length > 250) errors.push("Full name must be at most 250 characters");
    if (!EMAIL_PATTERN.test(email) || email.length > 254) errors.push("Invalid email address");
    if (!normalizedPhone) errors.push("Phone must be a valid Kenyan number and is normalized to +254 format");
    if (!CODE_PATTERN.test(code)) errors.push("M-Pesa code must be exactly 10 letters or digits");
    if (plan !== "Individual" && plan !== "Group") errors.push("Plan must be Individual or Group");
    return {
      rowNumber: index + 2, fullName, email, phone: normalizedPhone || (values[2] ?? "").trim(),
      code, plan, classification: errors.length ? "Error" : "New student", errors,
    };
  });
  return { rows };
}

async function validateRows(db: Queryable, rows: MemberRow[]): Promise<CsvResult> {
  const emails = [...new Set(rows.map((row) => row.email).filter(Boolean))];
  const codes = [...new Set(rows.map((row) => row.code).filter((code) => CODE_PATTERN.test(code)))];
  const existingStudents = emails.length
    ? await db.query(
      `SELECT id, email FROM students WHERE LOWER(email) = ANY($1::text[]) ORDER BY id`,
      [emails],
    )
    : { rows: [] };
  const studentByEmail = new Map<string, number>();
  for (const student of existingStudents.rows) {
    if (!studentByEmail.has(String(student.email).toLowerCase())) studentByEmail.set(String(student.email).toLowerCase(), Number(student.id));
  }
  const paymentEntries = codes.length
    ? await db.query(
      `SELECT UPPER(REGEXP_REPLACE(code, '[[:space:]]', '', 'g')) AS code, plan, COUNT(*)::int AS count,
              ARRAY_AGG(DISTINCT student_id) AS student_ids
         FROM medqrown_payment_entries
        WHERE UPPER(REGEXP_REPLACE(code, '[[:space:]]', '', 'g')) = ANY($1::text[])
          AND status <> 'rejected'
        GROUP BY UPPER(REGEXP_REPLACE(code, '[[:space:]]', '', 'g')), plan`,
      [codes],
    )
    : { rows: [] };
  const byCode = new Map<string, { count: number; individualCount: number; plans: Set<string>; studentIds: Set<number> }>();
  for (const entry of paymentEntries.rows) {
    const item = byCode.get(entry.code) ?? { count: 0, individualCount: 0, plans: new Set<string>(), studentIds: new Set<number>() };
    item.count += Number(entry.count);
    if (entry.plan === "Individual") item.individualCount += Number(entry.count);
    item.plans.add(entry.plan);
    for (const id of entry.student_ids || []) item.studentIds.add(Number(id));
    byCode.set(entry.code, item);
  }

  const emailCounts = new Map<string, number>();
  for (const row of rows) {
    if (EMAIL_PATTERN.test(row.email)) emailCounts.set(row.email, (emailCounts.get(row.email) || 0) + 1);
  }
  for (const row of rows) {
    if (emailCounts.get(row.email)! > 1) row.errors.push("Duplicate email in this file");
  }
  const rowsByCode = new Map<string, MemberRow[]>();
  for (const row of rows) {
    if (CODE_PATTERN.test(row.code) && (row.plan === "Individual" || row.plan === "Group")) {
      const group = rowsByCode.get(row.code) || [];
      group.push(row);
      rowsByCode.set(row.code, group);
    }
  }
  for (const [code, codeRows] of rowsByCode) {
    const existing = byCode.get(code) ?? { count: 0, individualCount: 0, plans: new Set<string>(), studentIds: new Set<number>() };
    const applicableRows = codeRows.filter((row) => row.errors.length === 0);
    const groupRows = applicableRows.filter((row) => row.plan === "Group");
    const individualRows = applicableRows.filter((row) => row.plan === "Individual");
    if (existing.count + applicableRows.length > 4) {
      for (const row of applicableRows) row.errors.push(`This code has already been used by ${existing.count} people; a code can be used at most 4 times`);
    }
    if (existing.individualCount + individualRows.length > 1) {
      for (const row of individualRows) row.errors.push("An Individual M-Pesa code can only be used once");
    }
    if (groupRows.length > 4) {
      for (const row of groupRows) row.errors.push("A Group M-Pesa code can be used at most 4 times");
    }
    const plansForCode = new Set([...existing.plans, ...applicableRows.map((row) => row.plan)]);
    if (plansForCode.size > 1) {
      for (const row of applicableRows) row.errors.push("Plan does not match other entries with this M-Pesa code");
    }
    const seenStudentIds = new Set(existing.studentIds);
    const seenEmails = new Set<string>();
    for (const row of codeRows) {
      const studentId = studentByEmail.get(row.email);
      if ((studentId && seenStudentIds.has(studentId)) || seenEmails.has(row.email)) {
        row.errors.push("This student already has an entry with this M-Pesa code");
      }
      if (studentId) seenStudentIds.add(studentId);
      seenEmails.add(row.email);
    }
  }
  for (const row of rows) {
    const studentId = studentByEmail.get(row.email);
    if (studentId) {
      row.studentId = studentId;
      row.classification = row.errors.length ? "Error" : "Existing student";
    } else {
      row.classification = row.errors.length ? "Error" : "New student";
    }
  }
  return {
    rows,
    errorReport: rows.filter((row) => row.errors.length).map((row) => ({
      rowNumber: row.rowNumber, email: row.email, errors: [...row.errors],
    })),
  };
}

/** Canonical Stage 4/5 M-Pesa code rule shared across CSV, manual, and renewals. */
export function normalizeMpesaCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.replace(/\s/g, "").toUpperCase();
  return CODE_PATTERN.test(code) ? code : null;
}

export async function validatePaymentCode(
  db: Queryable,
  studentId: number,
  code: string,
  plan: "Individual" | "Group",
): Promise<string[]> {
  const { rows } = await db.query(
    `SELECT UPPER(REGEXP_REPLACE(code, '[[:space:]]', '', 'g')) AS code, plan,
            COUNT(*)::int AS count,
            BOOL_OR(student_id = $2) AS used_by_student
       FROM medqrown_payment_entries
      WHERE UPPER(REGEXP_REPLACE(code, '[[:space:]]', '', 'g')) = $1
        AND status <> 'rejected' -- a rejected entry did not use the code; the student may resubmit
       GROUP BY UPPER(REGEXP_REPLACE(code, '[[:space:]]', '', 'g')), plan`,
    [code, studentId],
  );
  const errors: string[] = [];
  if (rows.some((entry) => entry.used_by_student)) {
    errors.push("This student already has an entry with this M-Pesa code");
  }
  const count = rows.reduce((total, entry) => total + Number(entry.count), 0);
  const individualCount = rows.filter((entry) => entry.plan === "Individual")
    .reduce((total, entry) => total + Number(entry.count), 0);
  if (count >= 4) {
    errors.push(`This code has already been used by ${count} people. Please check your code or contact us.`);
  }
  if (plan === "Individual" && individualCount >= 1) {
    errors.push("An Individual M-Pesa code can only be used once");
  }
  return errors;
}

function makeInvite() {
  const token = crypto.randomBytes(32).toString("base64url");
  return { token, hash: sha256(token), expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) };
}

export function inviteOrigin(req: { get(name: string): string | undefined; protocol: string }): string {
  const configured = publicSiteUrl();
  if (configured) return configured.replace(/\/$/, "");
  const host = req.get("host");
  if (!host) throw new Error("An application URL is required to send invitations");
  const origin = req.get("origin");
  if (origin && new URL(origin).host === host) return origin;
  return `${req.protocol}://${host}`;
}

export async function sendInvite(email: string, name: string, token: string, origin: string): Promise<void> {
  const link = `${origin}/student/set-password/${encodeURIComponent(token)}`;
  await sendLoggedEmail({
    to: email, templateKey: "invite_set_password",
    variables: { student_name: name, renew_link: link },
  });
}

async function sendCohortNotice(email: string, name: string): Promise<void> {
  await sendLoggedEmail({
    to: email, templateKey: "existing_student_enrolled",
    variables: { student_name: name },
  });
}

async function applyMembership(client: Queryable, studentId: number, adminId: number, reason: string): Promise<{ cohortId: number; startDate: string; endDate: string }> {
  await ensureCurrentAndNextCohorts();
  const today = nairobiDate();
  const existing = await client.query(
    `SELECT m.cohort_id AS "cohortId", m.start_date::text AS "startDate", m.end_date::text AS "endDate"
       FROM medqrown_memberships m WHERE m.student_id = $1 FOR UPDATE`,
    [studentId],
  );
  const cohortsResult = await client.query(
    `SELECT id, start_date::text AS "startDate", end_date::text AS "endDate"
       FROM medqrown_cohorts ORDER BY start_date, id`,
  );
  let cohorts = cohortsResult.rows;
  if (!cohorts.length) throw new Error("No membership cohorts are configured");
  const settings = await client.query("SELECT grace_days AS days FROM medqrown_settings WHERE id = 1");
  const graceDays = Number(settings.rows[0]?.days ?? 3);
  let selected: any;
  const previous = existing.rows[0];
  if (previous) {
    const graceEnd = new Date(`${previous.endDate}T00:00:00.000Z`);
    graceEnd.setUTCDate(graceEnd.getUTCDate() + graceDays);
    const inGrace = today > previous.endDate && today <= graceEnd.toISOString().slice(0, 10);
    const active = today >= previous.startDate && today <= previous.endDate;
    if (active || inGrace) {
      selected = cohorts.find((cohort: any) => cohort.startDate > previous.endDate);
      let tail = cohorts[cohorts.length - 1];
      for (let index = 0; !selected && index < 600; index++) {
        const nextStart = new Date(`${tail.endDate}T00:00:00.000Z`);
        nextStart.setUTCDate(nextStart.getUTCDate() + 1);
        const startDate = nextStart.toISOString().slice(0, 10);
        const endDate = cohortEndDate(startDate);
        await client.query(
          `INSERT INTO medqrown_cohorts (start_date, end_date)
           VALUES ($1, $2) ON CONFLICT (start_date) DO NOTHING`,
          [startDate, endDate],
        );
        const nextCohort = await client.query(
          `SELECT id, start_date::text AS "startDate", end_date::text AS "endDate"
             FROM medqrown_cohorts WHERE start_date = $1`,
          [startDate],
        );
        tail = nextCohort.rows[0];
        cohorts.push(tail);
        selected = tail.startDate > previous.endDate ? tail : undefined;
      }
      if (!selected) throw new Error("Unable to find the next membership cohort");
    }
  }
  if (!selected) {
    const current = cohorts.find((cohort: any) => cohort.startDate <= today && cohort.endDate >= today)
      || cohorts.find((cohort: any) => cohort.startDate > today)
      || cohorts[cohorts.length - 1];
    // Before any cohort has started, the upcoming cohort counts as current (launch case).
    const withinLastThreeDays = today >= current.startDate && today <= current.endDate
      && Math.floor((Date.parse(`${current.endDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000) <= 2;
    selected = withinLastThreeDays
      ? cohorts.find((cohort: any) => cohort.startDate > current.endDate) || current
      : current;
  }
  const newValues = { cohortId: Number(selected.id), startDate: selected.startDate, endDate: selected.endDate };
  await client.query(
    `INSERT INTO medqrown_memberships (student_id, cohort_id, start_date, end_date)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (student_id) DO UPDATE
       SET cohort_id = EXCLUDED.cohort_id, start_date = EXCLUDED.start_date,
           end_date = EXCLUDED.end_date, updated_at = CURRENT_TIMESTAMP`,
    [studentId, newValues.cohortId, newValues.startDate, newValues.endDate],
  );
  await client.query(
    `INSERT INTO medqrown_membership_audit (student_id, admin_id, reason, previous_values, new_values)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)`,
    [studentId, adminId, reason, previous ? JSON.stringify(previous) : null, JSON.stringify(newValues)],
  );
  return newValues;
}

async function pendingTargetCohort(client: Queryable, studentId: number): Promise<number> {
  const today = nairobiDate();
  const membership = await client.query(
    `SELECT start_date::text AS "startDate", end_date::text AS "endDate"
       FROM medqrown_memberships WHERE student_id = $1`,
    [studentId],
  );
  const all = await client.query(
    `SELECT id, start_date::text AS "startDate", end_date::text AS "endDate"
       FROM medqrown_cohorts ORDER BY start_date`,
  );
  const cohorts = all.rows;
  if (!cohorts.length) throw new Error("No membership cohorts are configured");
  const previous = membership.rows[0];
  if (previous) {
    const settings = await client.query("SELECT grace_days AS days FROM medqrown_settings WHERE id = 1");
    const graceEnd = new Date(`${previous.endDate}T00:00:00.000Z`);
    graceEnd.setUTCDate(graceEnd.getUTCDate() + Number(settings.rows[0]?.days ?? 3));
    const active = today >= previous.startDate && today <= previous.endDate;
    const inGrace = today > previous.endDate && today <= graceEnd.toISOString().slice(0, 10);
    if (active || inGrace) {
      const next = cohorts.find((cohort: any) => cohort.startDate > previous.endDate);
      if (next) return Number(next.id);
    }
  }
  const current = cohorts.find((cohort: any) => cohort.startDate <= today && cohort.endDate >= today)
    || cohorts.find((cohort: any) => cohort.startDate > today)
    || cohorts[cohorts.length - 1];
  const daysLeft = Math.floor((Date.parse(`${current.endDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  // Before any cohort has started, the upcoming cohort counts as current (launch case).
  const target = today >= current.startDate && daysLeft >= 0 && daysLeft <= 2
    ? cohorts.find((cohort: any) => cohort.startDate > current.endDate) || current
    : current;
  return Number(target.id);
}

export async function insertInvite(client: Queryable, studentId: number) {
  const invite = makeInvite();
  await client.query(
    `INSERT INTO medqrown_invites (student_id, token_hash, expires_at, used_at, created_at)
     VALUES ($1, $2, $3, NULL, CURRENT_TIMESTAMP)
     ON CONFLICT (student_id) DO UPDATE SET token_hash = EXCLUDED.token_hash,
       expires_at = EXCLUDED.expires_at, used_at = NULL, created_at = CURRENT_TIMESTAMP`,
    [studentId, invite.hash, invite.expiresAt],
  );
  return invite.token;
}

async function recordPaidRow(
  client: Queryable,
  classId: number,
  row: MemberRow,
  adminId: number,
  verified: boolean,
  source: "csv" | "manual",
  actions: { invites: { email: string; name: string; token: string }[]; notices: { email: string; name: string }[] },
) {
  let studentId = row.studentId;
  let wasCreated = false;
  if (!studentId) {
    const inserted = await client.query(
      `INSERT INTO students (name, email, phone) VALUES ($1, $2, $3)
       RETURNING id`,
      [row.fullName, row.email.toLowerCase(), row.phone],
    );
    studentId = Number(inserted.rows[0].id);
    wasCreated = true;
  } else {
    await client.query("UPDATE students SET phone = $1 WHERE id = $2", [row.phone, studentId]);
  }
  await client.query(
    `INSERT INTO medqrown_class_students (class_id, student_id)
     VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [classId, studentId],
  );
  const settings = await client.query(
    `SELECT CASE WHEN $1 = 'Group' THEN group_price ELSE individual_price END AS amount
       FROM medqrown_settings WHERE id = 1`,
    [row.plan],
  );
  const payment = await client.query(
    `INSERT INTO medqrown_payment_entries
       (student_id, code, plan, amount, source, status, reviewer_id, reviewed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $6 = 'paid' THEN CURRENT_TIMESTAMP ELSE NULL END)
     RETURNING id`,
    [studentId, row.code, row.plan, Number(settings.rows[0]?.amount ?? 0), source,
      verified ? "paid" : "pending", verified ? adminId : null],
  );
  if (verified) {
    const membership = await applyMembership(client, studentId, adminId, `Approved ${source} payment ${row.code}`);
    await client.query("UPDATE medqrown_payment_entries SET target_cohort_id = $2 WHERE id = $1",
      [payment.rows[0].id, membership.cohortId]);
    await client.query(
      `INSERT INTO medqrown_notifications (student_id, kind, title, body, payload)
       VALUES ($1, 'payment_approved', 'Payment approved', $2, $3::jsonb)`,
      [studentId, `Your membership payment was approved; your membership now ends ${membership.endDate}.`,
        JSON.stringify({ status: "approved", endDate: membership.endDate })],
    );
    if (wasCreated) {
      const token = await insertInvite(client, studentId);
      actions.invites.push({ email: row.email, name: row.fullName, token });
    } else {
      actions.notices.push({ email: row.email, name: row.fullName });
    }
  } else if (wasCreated) {
    // An unverified student has no account password and receives an invite only once paid.
    // The invite token is issued at approval, not while payment remains pending.
  }
  if (!verified) {
    const targetCohortId = await pendingTargetCohort(client, studentId);
    await client.query("UPDATE medqrown_payment_entries SET target_cohort_id = $2 WHERE id = $1",
      [payment.rows[0].id, targetCohortId]);
  }
  return { studentId, wasCreated, paymentStatus: verified ? "paid" : "pending" };
}

export function registerStage4Routes(app: Express, requireAdmin: RequestHandler): void {
  app.get("/api/admin/classes/:classId/members", requireAdmin, async (req: any, res) => {
    const classId = Number(req.params.classId);
    if (!Number.isInteger(classId) || classId < 1) return res.status(400).json({ message: "Invalid class id" });
    res.json(await getStage10ClassMembers(classId, req.query));
  });

  app.post("/api/admin/classes/:classId/members/import-preview", requireAdmin, async (req, res) => {
    const classId = Number(req.params.classId);
    if (!Number.isInteger(classId) || classId < 1) return res.status(400).json({ message: "Invalid class id" });
    const { rows, parseError } = parseCsvRows(req.body?.csv);
    if (parseError) return res.status(400).json({ message: parseError });
    if (!rows.length) return res.status(400).json({ message: "CSV must contain at least one student row" });
    const klass = await pool.query("SELECT id FROM medqrown_classes WHERE id = $1", [classId]);
    if (!klass.rows[0]) return res.status(404).json({ message: "Class not found" });
    const preview = await validateRows(pool, rows);
    res.json({ rows: preview.rows, errorReport: preview.errorReport, verifiedDefault: true });
  });

  app.post("/api/admin/classes/:classId/members/import-confirm", requireAdmin, async (req: any, res) => {
    const classId = Number(req.params.classId);
    if (!Number.isInteger(classId) || classId < 1) return res.status(400).json({ message: "Invalid class id" });
    const { rows, parseError } = parseCsvRows(req.body?.csv);
    if (parseError) return res.status(400).json({ message: parseError });
    if (!rows.length) return res.status(400).json({ message: "CSV must contain at least one student row" });
    const verified = req.body?.verified !== false;
    const actions = { invites: [] as { email: string; name: string; token: string }[], notices: [] as { email: string; name: string }[] };
    const client = await pool.connect();
    let preview: CsvResult;
    const imported: any[] = [];
    try {
      await client.query("BEGIN");
      const klass = await client.query("SELECT id FROM medqrown_classes WHERE id = $1 FOR UPDATE", [classId]);
      if (!klass.rows[0]) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Class not found" });
      }
      const codes = [...new Set(rows.map((row) => row.code).filter((code) => CODE_PATTERN.test(code)))].sort();
      const emails = [...new Set(rows.map((row) => row.email).filter(Boolean))].sort();
      for (const key of codes.map((code) => `code:${code}`).concat(emails.map((email) => `email:${email}`))) {
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [key]);
      }
      preview = await validateRows(client, rows);
      for (const [index, row] of preview.rows.entries()) {
        if (row.errors.length) continue;
        const savepoint = `csv_row_${index}`;
        await client.query(`SAVEPOINT ${savepoint}`);
        try {
          const outcome = await recordPaidRow(client, classId, row, req.admin.id, verified, "csv", actions);
          imported.push({ rowNumber: row.rowNumber, ...outcome });
          await client.query(`RELEASE SAVEPOINT ${savepoint}`);
        } catch (error: any) {
          if (error?.code === "23505") {
            await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
            await client.query(`RELEASE SAVEPOINT ${savepoint}`);
            row.errors.push("Email is already registered; refresh preview and retry");
            row.classification = "Error";
            preview.errorReport.push({ rowNumber: row.rowNumber, email: row.email, errors: [...row.errors] });
          } else throw error;
        }
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    for (const invite of actions.invites) await sendInvite(invite.email, invite.name, invite.token, inviteOrigin(req));
    for (const notice of actions.notices) await sendCohortNotice(notice.email, notice.name);
    await pool.query(
      "INSERT INTO audit_logs (admin_id, action, details) VALUES ($1, $2, $3)",
      [req.admin.id, "class_csv_import", `Class ${classId}: imported ${imported.length} rows; verified=${verified}`],
    );
    res.json({ imported, rows: preview!.rows, errorReport: preview!.errorReport, verified });
  });

  app.post("/api/admin/classes/:classId/members", requireAdmin, async (req: any, res) => {
    const classId = Number(req.params.classId);
    if (!Number.isInteger(classId) || classId < 1) return res.status(400).json({ message: "Invalid class id" });
    const fullName = typeof req.body?.fullName === "string" ? req.body.fullName.trim() : "";
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const phone = typeof req.body?.phone === "string" ? normalizePhone(req.body.phone) : null;
    if (!fullName || fullName.length > 250 || !EMAIL_PATTERN.test(email) || email.length > 254 || !phone) {
      return res.status(400).json({ message: "Valid fullName, email, and Kenyan phone number are required" });
    }
    const complimentary = req.body?.complimentary === true;
    let row: MemberRow;
    if (complimentary) {
      const note = typeof req.body?.note === "string" ? req.body.note.trim() : "";
      const endDate = req.body?.endDate;
      if (!note || note.length > 500 || !isDate(endDate)) {
        return res.status(400).json({ message: "Complimentary adds require a note and valid endDate (YYYY-MM-DD)" });
      }
      if (endDate < nairobiDate()) return res.status(400).json({ message: "endDate cannot be before today" });
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const klass = await client.query("SELECT id FROM medqrown_classes WHERE id = $1 FOR UPDATE", [classId]);
        if (!klass.rows[0]) {
          await client.query("ROLLBACK");
          return res.status(404).json({ message: "Class not found" });
        }
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`email:${email}`]);
        const found = await client.query("SELECT id FROM students WHERE LOWER(email) = $1 ORDER BY id LIMIT 1 FOR UPDATE", [email]);
        let studentId: number;
        let wasCreated = false;
        if (found.rows[0]) {
          studentId = Number(found.rows[0].id);
          await client.query("UPDATE students SET phone = $1 WHERE id = $2", [phone, studentId]);
        } else {
          const created = await client.query("INSERT INTO students (name, email, phone) VALUES ($1, $2, $3) RETURNING id", [fullName, email, phone]);
          studentId = Number(created.rows[0].id);
          wasCreated = true;
        }
        await client.query(
          "INSERT INTO medqrown_class_students (class_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [classId, studentId],
        );
        const membership = await client.query("SELECT id FROM medqrown_cohorts WHERE end_date >= $1 ORDER BY start_date LIMIT 1", [endDate]);
        const cohortId = Number(membership.rows[0]?.id || (await client.query("SELECT id FROM medqrown_cohorts ORDER BY start_date DESC LIMIT 1")).rows[0]?.id);
        if (!cohortId) throw new Error("No membership cohorts are configured");
        const previous = await client.query(
          `SELECT cohort_id AS "cohortId", start_date::text AS "startDate", end_date::text AS "endDate"
             FROM medqrown_memberships WHERE student_id = $1 FOR UPDATE`,
          [studentId],
        );
        const startDate = nairobiDate();
        await client.query(
          `INSERT INTO medqrown_memberships (student_id, cohort_id, start_date, end_date)
           VALUES ($1, $2, $3, $4) ON CONFLICT (student_id) DO UPDATE
             SET cohort_id = EXCLUDED.cohort_id, start_date = EXCLUDED.start_date,
                 end_date = EXCLUDED.end_date, updated_at = CURRENT_TIMESTAMP`,
          [studentId, cohortId, startDate, endDate],
        );
        await client.query(
          `INSERT INTO medqrown_membership_audit (student_id, admin_id, reason, previous_values, new_values)
           VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)`,
          [studentId, req.admin.id, `Complimentary: ${note}`, previous.rows[0] ? JSON.stringify(previous.rows[0]) : null,
            JSON.stringify({ cohortId, startDate, endDate })],
        );
        let inviteToken: string | null = null;
        if (wasCreated) inviteToken = await insertInvite(client, studentId);
        await client.query("COMMIT");
        if (inviteToken) await sendInvite(email, fullName, inviteToken, inviteOrigin(req));
        else await sendCohortNotice(email, fullName);
        res.status(201).json({ studentId, classId, complimentary: true, endDate, invited: wasCreated });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
      return;
    }

    const code = typeof req.body?.code === "string" ? req.body.code.replace(/\s/g, "").toUpperCase() : "";
    const plan = req.body?.plan;
    if (!CODE_PATTERN.test(code) || (plan !== "Individual" && plan !== "Group")) {
      return res.status(400).json({ message: "Paid adds require a valid 10-character M-Pesa code and Individual or Group plan" });
    }
    row = {
      rowNumber: 1, fullName, email, phone, code, plan, classification: "New student", errors: [],
    };
    const client = await pool.connect();
    const actions = { invites: [] as { email: string; name: string; token: string }[], notices: [] as { email: string; name: string }[] };
    let outcome: any;
    try {
      await client.query("BEGIN");
      const klass = await client.query("SELECT id FROM medqrown_classes WHERE id = $1 FOR UPDATE", [classId]);
      if (!klass.rows[0]) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Class not found" });
      }
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`code:${code}`]);
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`email:${email}`]);
      const checked = await validateRows(client, [row]);
      row = checked.rows[0];
      if (row.errors.length) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Member row failed validation", errors: row.errors });
      }
      outcome = await recordPaidRow(client, classId, row, req.admin.id, req.body?.verified !== false, "manual", actions);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    for (const invite of actions.invites) await sendInvite(invite.email, invite.name, invite.token, inviteOrigin(req));
    for (const notice of actions.notices) await sendCohortNotice(notice.email, notice.name);
    res.status(201).json({ classId, ...outcome });
  });

  // Removes the student from this class only; their account, membership and results are kept.
  app.delete("/api/admin/classes/:classId/members/:studentId", requireAdmin, async (req: any, res) => {
    const classId = Number(req.params.classId);
    const studentId = Number(req.params.studentId);
    if (!Number.isInteger(classId) || classId < 1 || !Number.isInteger(studentId) || studentId < 1) {
      return res.status(400).json({ message: "Invalid class or student id" });
    }
    const { rowCount } = await pool.query(
      "DELETE FROM medqrown_class_students WHERE class_id = $1 AND student_id = $2",
      [classId, studentId],
    );
    if (!rowCount) return res.status(404).json({ message: "Student is not a member of this class" });
    await pool.query(
      "INSERT INTO audit_logs (admin_id, action, details) VALUES ($1, $2, $3)",
      [req.admin.id, "class_member_removed", `Class ${classId}: removed student ${studentId}`],
    );
    res.json({ ok: true });
  });

  app.post("/api/admin/students/:studentId/resend-invite", requireAdmin, async (req, res) => {
    const studentId = Number(req.params.studentId);
    if (!Number.isInteger(studentId) || studentId < 1) return res.status(400).json({ message: "Invalid student id" });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const student = await client.query(
        `SELECT s.id, s.name, s.email FROM students s
          WHERE s.id = $1 AND NOT EXISTS (SELECT 1 FROM student_accounts a WHERE a.student_id = s.id)
          FOR UPDATE`,
        [studentId],
      );
      if (!student.rows[0]) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Unactivated student not found" });
      }
      const token = await insertInvite(client, studentId);
      await client.query("COMMIT");
      await sendInvite(student.rows[0].email, student.rows[0].name, token, inviteOrigin(req));
      return res.json({ ok: true, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  app.post("/api/student/set-password", async (req: any, res) => {
    const token = typeof req.body?.token === "string" ? req.body.token : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!token || token.length > 200 || password.length < 6 || password.length > 128) {
      return res.status(400).json({ message: "A valid invite token and password of at least 6 characters are required" });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const invitation = await client.query(
        `SELECT i.student_id AS "studentId", s.email
           FROM medqrown_invites i JOIN students s ON s.id = i.student_id
          WHERE i.token_hash = $1 AND i.used_at IS NULL AND i.expires_at > CURRENT_TIMESTAMP
          FOR UPDATE`,
        [sha256(token)],
      );
      if (!invitation.rows[0]) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Invite link is invalid, expired, or already used" });
      }
      const studentId = Number(invitation.rows[0].studentId);
      await client.query(
        `INSERT INTO student_accounts (student_id, password_hash)
         VALUES ($1, $2)
         ON CONFLICT (student_id) DO UPDATE SET password_hash = EXCLUDED.password_hash, is_active = true`,
        [studentId, passwordHash],
      );
      await client.query("UPDATE medqrown_invites SET used_at = CURRENT_TIMESTAMP WHERE student_id = $1", [studentId]);
      await client.query("COMMIT");
      req.session.studentId = studentId;
      delete req.session.examStudentId;
      delete req.session.studentExamId;
      res.json({ message: "Password set successfully", redirectTo: "/student/dashboard" });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
}