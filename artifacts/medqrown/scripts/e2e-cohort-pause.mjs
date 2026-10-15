// Flexible cohorts, bulk membership end dates and the subscription pause ("freeze the clock").
// Run like e2e-stage14.mjs (local server, EMAIL_OUTBOX_ONLY=true, staging DB).
// To test the freeze without waiting days it backdates the pause start directly in the staging
// database, then restores every cohort and membership date that resuming shifted.
import fs from "node:fs";
import pg from "pg";
import { Session, accounts, check, failureCount, today, addDays, nairobi, RUN, mpesaCode, onboard } from "./e2e-lib.mjs";

const env = Object.fromEntries(fs.readFileSync(".env", "utf8").split(/\r?\n/)
  .filter((line) => /^[A-Z_]+=/.test(line)).map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]));
const project = (url) => { try { return new URL(url).username.split(".")[1] || null; } catch { return null; } };
if (!env.SUPABASE_DATABASE_URL || project(env.SUPABASE_DATABASE_URL) === project(env.PROD_DATABASE_URL)) {
  throw new Error("Refusing: SUPABASE_DATABASE_URL must be the staging project");
}
const db = new pg.Client({ connectionString: env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();

const admin = new Session();
check("admin login", (await admin.call("POST", "/api/admin/login", { email: accounts.QA_ADMIN_EMAIL, password: accounts.QA_ADMIN_PASSWORD })).status === 200);
if ((await admin.call("GET", "/api/admin/pause")).data?.active) throw new Error("Staging is already paused; resume it first");

// ---------- 1. cohorts can be any length, but never overlap ----------
const { current, next } = (await admin.call("GET", "/api/admin/cohorts")).data;
const shortEnd = addDays(next.startDate, 19);
const shorter = await admin.call("PATCH", `/api/admin/cohorts/${next.id}`, { startDate: next.startDate, endDate: shortEnd, reason: "QA: 20-day cohort", moveMembers: false });
check("next cohort can be 20 days long", shorter.status === 200 && shorter.data?.endDate === shortEnd, `${shorter.status} ${shorter.data?.message ?? ""}`);
const overlap = await admin.call("PATCH", `/api/admin/cohorts/${current.id}`, { startDate: current.startDate, endDate: addDays(next.startDate, 1), reason: "QA: overlap", moveMembers: false });
check("overlapping cohorts are refused", overlap.status === 409, `${overlap.status} ${overlap.data?.message ?? ""}`);
const backwards = await admin.call("PATCH", `/api/admin/cohorts/${next.id}`, { startDate: next.startDate, endDate: addDays(next.startDate, -1), reason: "QA", moveMembers: false });
check("end before start is refused", backwards.status === 400, `${backwards.status}`);
const restored = await admin.call("PATCH", `/api/admin/cohorts/${next.id}`, { startDate: next.startDate, endDate: next.endDate, reason: "QA: restore", moveMembers: false });
check("next cohort restored", restored.status === 200 && restored.data?.endDate === next.endDate, `${restored.status}`);

// ---------- 2. bulk end dates for selected students ----------
const classId = (await admin.call("POST", "/api/admin/classes", { name: `QA Pause Class ${RUN}`, description: "Cohort/pause QA" })).data.id;
const password = `Qa-${RUN}-pz`;
const people = ["a", "b", "c"].map((k, i) => ({ name: `QA Pause ${k.toUpperCase()}`, email: `qa-pz${k}-${RUN}@medeazy.test`, phone: `071900000${i}`, code: mpesaCode(`P${k.toUpperCase()}`), plan: "Individual" }));
await onboard(admin, classId, people, password);
const [a, b, c] = people;
for (const p of [a, b]) {
  await admin.call("PUT", `/api/admin/memberships/${p.id}`, { cohortId: current.id, startDate: addDays(today, -20), endDate: addDays(today, 10), reason: "QA: pause setup" });
}
await db.query("DELETE FROM medqrown_memberships WHERE student_id = $1", [c.id]); // c has no membership
const endOf = async (id) => (await db.query("SELECT end_date::text AS e FROM medqrown_memberships WHERE student_id = $1", [id])).rows[0]?.e;

const extend = await admin.call("POST", "/api/admin/memberships/bulk-end-date", { studentIds: [a.id, b.id], extendDays: 7, reason: "QA: +7" });
check("bulk: extend 2 students by 7 days", extend.status === 200 && (await endOf(a.id)) === addDays(today, 17) && (await endOf(b.id)) === addDays(today, 17), `${extend.status} ${await endOf(a.id)}`);
const setOne = await admin.call("POST", "/api/admin/memberships/bulk-end-date", { studentIds: [a.id, b.id], endDate: addDays(today, 30), reason: "QA: set" });
check("bulk: set one date for both", setOne.status === 200 && (await endOf(b.id)) === addDays(today, 30), `${setOne.status}`);
const noMembership = await admin.call("POST", "/api/admin/memberships/bulk-end-date", { studentIds: [a.id, c.id], extendDays: 3, reason: "QA" });
check("bulk: refused when a student has no membership (no changes)", noMembership.status === 400 && (await endOf(a.id)) === addDays(today, 30), `${noMembership.status} ${noMembership.data?.message ?? ""}`);
const tooShort = await admin.call("POST", "/api/admin/memberships/bulk-end-date", { studentIds: [a.id], extendDays: -200, reason: "QA" });
check("bulk: refused when end would precede start", tooShort.status === 400, `${tooShort.status}`);
const audit = (await admin.call("GET", `/api/admin/memberships/${a.id}/audit`)).data || [];
check("bulk: each change is in the audit log", audit.some((row) => row.reason === "QA: +7") && audit.some((row) => row.reason === "QA: set"));

// ---------- 3. pause: message, access unchanged ----------
const exam = (await admin.call("POST", "/api/exams", {
  title: `QA Pause CAT ${RUN}`, classId, opensAt: nairobi(-1), closesAt: nairobi(240), durationMinutes: 30, status: "active", autoMarkEnabled: false,
})).data;
await admin.call("POST", `/api/exams/${exam.id}/questions`, { type: "mcq", content: "QA pause question", marks: 1, options: ["A", "B", "C", "D", "E"].map((content, i) => ({ content, isCorrect: i === 0 })) });

check("pause needs a message", (await admin.call("POST", "/api/admin/pause", { message: "  " })).status === 400);
const message = "Lecturers are on strike, so classes are paused. QA " + RUN;
const paused = await admin.call("POST", "/api/admin/pause", { message });
check("pause starts", paused.status === 200 && paused.data?.active === true && paused.data?.startedOn === today, JSON.stringify(paused.data));
const seen = (await a.session.call("GET", "/api/student/pause")).data;
check("student sees the pause message", seen?.active === true && seen?.message === message);
check("student can still open a CAT while paused", (await a.session.call("POST", `/api/student/exams/${exam.id}/enter`)).status === 200);
const updated = await admin.call("POST", "/api/admin/pause", { message: message + " (updated)" });
check("message can be edited while paused (start date kept)", updated.data?.message === message + " (updated)" && updated.data?.startedOn === today);

// ---------- 4. freeze: nobody runs down while paused ----------
// Pretend the pause began 5 days ago. a ended 2 days ago (would be in grace), b ended 10 days ago (expired before the pause).
await db.query("UPDATE medqrown_settings SET pause_started_on = $1 WHERE id = 1", [addDays(today, -5)]);
await db.query("UPDATE medqrown_memberships SET end_date = $2 WHERE student_id = $1", [a.id, addDays(today, -2)]);
await db.query("UPDATE medqrown_memberships SET end_date = $2 WHERE student_id = $1", [b.id, addDays(today, -10)]);
const members = (await admin.call("GET", `/api/admin/classes/${classId}/members`)).data || [];
const statusOf = (id) => members.find((m) => m.id === id)?.status;
check("frozen: a stays active (not grace) while paused", statusOf(a.id) === "active", statusOf(a.id));
check("frozen: b, expired before the pause, stays expired", statusOf(b.id) === "expired", statusOf(b.id));
const dash = (await a.session.call("GET", "/api/student/dashboard")).data;
check("frozen: a's days left are counted from the pause start", dash?.membership?.daysRemaining === 3 && dash?.membership?.paused === true, JSON.stringify(dash?.membership));
check("frozen: a can still open CATs", (await a.session.call("POST", `/api/student/exams/${exam.id}/enter`)).status === 200);

// ---------- 5. resume gives the paused days back ----------
const snapshotMembers = (await db.query(`SELECT student_id, end_date::text AS e FROM medqrown_memberships WHERE student_id <> ALL($1::int[])`, [[a.id, b.id]])).rows;
const snapshotCohorts = (await db.query(`SELECT id, start_date::text AS s, end_date::text AS e FROM medqrown_cohorts`)).rows;
const currentBefore = snapshotCohorts.find((row) => row.id === current.id);
const resume = await admin.call("POST", "/api/admin/pause/resume", { extendDates: true });
check("resume: 5 paused days", resume.status === 200 && resume.data?.pausedDays === 5, JSON.stringify(resume.data));
check("resume: a's end date moved 5 days later", (await endOf(a.id)) === addDays(today, 3), await endOf(a.id));
check("resume: b (already expired) untouched", (await endOf(b.id)) === addDays(today, -10), await endOf(b.id));
const currentAfter = (await db.query(`SELECT start_date::text AS s, end_date::text AS e FROM medqrown_cohorts WHERE id = $1`, [current.id])).rows[0];
check("resume: running cohort keeps its start, end moves 5 days", currentAfter.s === currentBefore.s && currentAfter.e === addDays(currentBefore.e, 5), JSON.stringify(currentAfter));
check("resume: student no longer sees the pause", (await a.session.call("GET", "/api/student/pause")).data?.active === false);
const history = (await admin.call("GET", "/api/admin/pause")).data?.history?.[0];
check("resume: pause recorded in history", history?.endedOn === today && history?.pausedDays === 5 && history?.membershipsExtended > 0, JSON.stringify(history));

// Put staging's other students and the cohort calendar back where they were.
await db.query("BEGIN");
for (const row of snapshotMembers) await db.query("UPDATE medqrown_memberships SET end_date = $2 WHERE student_id = $1", [row.student_id, row.e]);
await db.query("UPDATE medqrown_cohorts SET start_date = start_date - 100000 WHERE id = ANY($1::int[])", [snapshotCohorts.map((row) => row.id)]);
for (const row of snapshotCohorts) await db.query("UPDATE medqrown_cohorts SET start_date = $2, end_date = $3 WHERE id = $1", [row.id, row.s, row.e]);
await db.query("COMMIT");
const restoredCurrent = (await db.query(`SELECT end_date::text AS e FROM medqrown_cohorts WHERE id = $1`, [current.id])).rows[0];
check("staging dates restored after the test", restoredCurrent.e === currentBefore.e);
await db.end();

console.log(`\n${failureCount() ? `${failureCount()} FAILED` : "ALL PASSED"}`);
process.exit(failureCount() ? 1 : 0);
