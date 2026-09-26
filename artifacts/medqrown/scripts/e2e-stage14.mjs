// Stage 14 end-to-end checks against a LOCAL dev server backed by the STAGING database.
//   1. npm run dev (NODE_ENV=development, SMTP unset -> emails land in dev-outbox.log)
//   2. node scripts/create-test-admin.cjs
//   3. node scripts/e2e-stage14.mjs
// Uses only @medeazy.test addresses. Everything it creates is named "QA ..." for cleanup.
import fs from "node:fs";

const BASE = process.env.E2E_BASE || "http://localhost:5000";
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) throw new Error("E2E only runs against a local server");
const accounts = Object.fromEntries(fs.readFileSync(".env.test-accounts", "utf8").trim().split(/\r?\n/).map((l) => l.split("=")));
const RUN = Date.now().toString(36).slice(-5);
const STUDENT_PASSWORD = `Qa-${RUN}-pass`;
let failures = 0;

function check(label, ok, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
}

class Session {
  cookie = "";
  async call(method, path, body) {
    const res = await fetch(BASE + path, {
      method,
      headers: { "content-type": "application/json", ...(this.cookie ? { cookie: this.cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) this.cookie = setCookie.split(";")[0];
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data };
  }
}

const nairobi = (offsetMinutes) => {
  const d = new Date(Date.now() + offsetMinutes * 60000 + 3 * 3600000);
  return d.toISOString().slice(0, 16); // YYYY-MM-DDTHH:mm, parsed server-side as +03:00
};
const today = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
const addDays = (date, n) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

function inviteTokenFor(email) {
  const log = fs.existsSync("dev-outbox.log") ? fs.readFileSync("dev-outbox.log", "utf8") : "";
  const blocks = log.split("\n=== ").filter((b) => b.includes(`-> ${email}`));
  const match = blocks.at(-1)?.match(/\/student\/set-password\/([^\s]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

const code = (prefix) => (prefix + RUN.toUpperCase() + "0000000000").replace(/[^A-Z0-9]/g, "").slice(0, 10);
const people = {
  indiv: { name: "QA Individual", email: `qa-indiv-${RUN}@medeazy.test`, phone: "0712000001" },
  g1: { name: "QA Group One", email: `qa-g1-${RUN}@medeazy.test`, phone: "0712000002" },
  g2: { name: "QA Group Two", email: `qa-g2-${RUN}@medeazy.test`, phone: "0712000003" },
  g3: { name: "QA Group Three", email: `qa-g3-${RUN}@medeazy.test`, phone: "0712000004" },
  g4: { name: "QA Group Four", email: `qa-g4-${RUN}@medeazy.test`, phone: "0712000005" },
};
const INDIV_CODE = code("QI");
const GROUP_CODE = code("QG");

const admin = new Session();

// ---------- 1. class + cohorts ----------
{
  const login = await admin.call("POST", "/api/admin/login", { email: accounts.QA_ADMIN_EMAIL, password: accounts.QA_ADMIN_PASSWORD });
  check("admin login", login.status === 200, `status ${login.status}`);
  const cohorts = await admin.call("GET", "/api/admin/cohorts");
  const { current, next } = cohorts.data;
  check("current cohort exists", !!current, current && `${current.startDate} – ${current.endDate}`);
  check("next cohort exists and follows current", !!next && next.startDate === addDays(current.endDate, 1), next && `${next.startDate} – ${next.endDate}`);
  globalThis.current = current;
}
const klass = await admin.call("POST", "/api/admin/classes", { name: `QA Class ${RUN}`, description: "Stage 14 automated test" });
check("create class", klass.status === 201, `id ${klass.data?.id}`);
const classId = klass.data.id;

// ---------- 2. CSV upload ----------
const header = "full_name,email,phone,mpesa_code,plan";
const good = [
  `${people.indiv.name},${people.indiv.email},${people.indiv.phone},${INDIV_CODE.toLowerCase()},Individual`,
  ...["g1", "g2", "g3", "g4"].map((k) => `${people[k].name},${people[k].email},${people[k].phone},${GROUP_CODE},Group`),
];
const bad = [
  `QA Bad Email,not-an-email,0712000009,${code("QB")},Individual`,
  `QA Bad Code,qa-badcode-${RUN}@medeazy.test,0712000010,ABC,Individual`,
  `QA Dup A,qa-dup-${RUN}@medeazy.test,0712000011,${code("QD")},Individual`,
  `QA Dup B,qa-dup-${RUN}@medeazy.test,0712000012,${code("QE")},Individual`,
];
const csv = [header, ...good, ...bad].join("\n");
const preview = await admin.call("POST", `/api/admin/classes/${classId}/members/import-preview`, { csv });
check("CSV preview responds", preview.status === 200, `status ${preview.status}`);
const rows = preview.data.rows || [];
check("preview: 5 valid new students", rows.filter((r) => r.classification === "New student").length === 5,
  rows.map((r) => `${r.rowNumber}:${r.classification}`).join(" "));
check("preview: 4 error rows with reasons", rows.filter((r) => r.classification === "Error" && r.errors?.length).length === 4,
  rows.filter((r) => r.errors?.length).map((r) => `${r.rowNumber}: ${r.errors.join("; ")}`).join(" | "));
check("preview: code uppercased", rows[0]?.code === INDIV_CODE);
check("preview: phone normalised to +254", rows[0]?.phone === "+254712000001", rows[0]?.phone);
const imported = await admin.call("POST", `/api/admin/classes/${classId}/members/import-confirm`, { csv, verified: true });
check("CSV import confirm", imported.status === 200 && imported.data.imported?.length === 5,
  `imported ${imported.data.imported?.length}, errors ${imported.data.errorReport?.length}`);

const members = (await admin.call("GET", `/api/admin/classes/${classId}/members`)).data;
check("members table lists 5", Array.isArray(members) && members.length === 5, `got ${members?.length}`);
const byEmail = Object.fromEntries((members || []).map((m) => [String(m.email).toLowerCase(), m]));
for (const [key, p] of Object.entries(people)) {
  const m = byEmail[p.email];
  p.id = m?.id ?? m?.studentId;
  check(`${key}: membership = first cohort (${current.endDate})`, m?.membershipEndDate === current.endDate || m?.endDate === current.endDate,
    `end ${m?.membershipEndDate ?? m?.endDate}, status ${m?.membershipStatus ?? m?.status}, invite ${m?.inviteStatus}`);
}
check("no password fields in members response", !JSON.stringify(members).match(/password/i));

// ---------- 3. invites -> set password -> login ----------
for (const [key, p] of Object.entries(people)) {
  const token = inviteTokenFor(p.email);
  check(`${key}: invite email written`, !!token);
  if (!token) continue;
  const set = await new Session().call("POST", "/api/student/set-password", { token, password: STUDENT_PASSWORD });
  check(`${key}: set password`, set.status === 200, `status ${set.status} ${set.data?.message ?? ""}`);
  const reuse = await new Session().call("POST", "/api/student/set-password", { token, password: STUDENT_PASSWORD });
  check(`${key}: invite link is single-use`, reuse.status === 400);
  p.session = new Session();
  const login = await p.session.call("POST", "/api/student/login", { email: p.email, password: STUDENT_PASSWORD });
  check(`${key}: student login`, login.status === 200, `status ${login.status}`);
}

fs.writeFileSync(".e2e-state.json", JSON.stringify({ RUN, classId, people: Object.fromEntries(
  Object.entries(people).map(([k, p]) => [k, { email: p.email, id: p.id }])), STUDENT_PASSWORD, INDIV_CODE, GROUP_CODE }, null, 2));

// Membership starts with the cohort; for exam tests make the individual + g1 active from today.
for (const key of ["indiv", "g1"]) {
  const r = await admin.call("PUT", `/api/admin/memberships/${people[key].id}`,
    { cohortId: current.id, startDate: today, endDate: current.endDate, reason: "QA: start early for exam test" });
  check(`${key}: admin edits membership start (audited)`, r.status === 200, `status ${r.status}`);
}

// ---------- 4/5. scheduled exam, next-only navigation ----------
const exam = await admin.call("POST", "/api/exams", {
  title: `QA Mock CAT ${RUN}`, classId, opensAt: nairobi(-1), closesAt: nairobi(30), durationMinutes: 20,
  maxAttempts: 1, instructions: "QA instructions", status: "active", autoMarkEnabled: false,
});
check("create exam", exam.status === 200 && exam.data?.id, `status ${exam.status} ${exam.data?.message ?? ""}`);
const examId = exam.data.id;
const opts = (correct) => ["A", "B", "C", "D", "E"].map((c, i) => ({ content: `Option ${c}`, isCorrect: i === correct }));
for (const [i, correct] of [[1, 0], [2, 2], [3, 4]]) {
  const q = await admin.call("POST", `/api/exams/${examId}/questions`, { type: "mcq", content: `QA question ${i}`, marks: 1, explanation: `Explanation ${i}`, options: opts(correct) });
  check(`add MCQ ${i}`, q.status === 200, `status ${q.status}`);
}
const future = await admin.call("POST", "/api/exams", {
  title: `QA Future CAT ${RUN}`, classId, opensAt: nairobi(24 * 60), closesAt: nairobi(24 * 60 + 30), durationMinutes: 30, status: "active",
});
check("create future exam", future.status === 200);

const s = people.indiv.session;
const classExams = await s.call("GET", `/api/student/classes/${classId}/exams`);
const listed = JSON.stringify(classExams.data);
check("student sees class exams", classExams.status === 200 && listed.includes(`QA Mock CAT ${RUN}`), `status ${classExams.status}`);
check("future exam listed as upcoming", listed.includes(`QA Future CAT ${RUN}`));
const enterFuture = await s.call("POST", `/api/student/exams/${future.data.id}/enter`);
check("future exam cannot be entered", enterFuture.status >= 400, `status ${enterFuture.status}`);

const enter = await s.call("POST", `/api/student/exams/${examId}/enter`);
check("enter open exam", enter.status === 200, `status ${enter.status} ${enter.data?.message ?? ""}`);
const info = await s.call("GET", "/api/student/exam-info");
check("instructions: Attempt 1 of 1", info.data?.attemptsUsed === 0 && info.data?.maxAttempts === 1, `used ${info.data?.attemptsUsed} max ${info.data?.maxAttempts}`);
const start = await s.call("POST", "/api/student/start-exam");
check("start exam", start.status === 200, `status ${start.status} ${start.data?.message ?? ""}`);
const attemptId = start.data?.attempt?.id ?? start.data?.attemptId;
const q0 = start.data?.question ?? start.data?.currentQuestion;
check("first question delivered without answer key", !!q0 && !JSON.stringify(q0).match(/isCorrect|explanation/), `qid ${q0?.id}`);
const pick = (q, idx) => (q?.options || [])[idx]?.id;
const save1 = await s.call("POST", "/api/student/save-answer", { attemptId, questionId: q0?.id, answer: String(pick(q0, 0)) });
check("autosave answer", save1.status === 200, `status ${save1.status} ${save1.data?.message ?? ""}`);
const next1 = await s.call("POST", "/api/student/next-question", { attemptId, expectedCurrentQuestionIndex: 0 });
check("Next -> question 2", next1.status === 200, `status ${next1.status}`);
const back = await s.call("POST", "/api/student/save-answer", { attemptId, questionId: q0?.id, answer: String(pick(q0, 1)) });
check("cannot change an earlier answer (no going back)", back.status >= 400, `status ${back.status}`);
const q1 = next1.data?.question ?? next1.data?.currentQuestion;
await s.call("POST", "/api/student/save-answer", { attemptId, questionId: q1?.id, answer: String(pick(q1, 1)) });
const next2 = await s.call("POST", "/api/student/next-question", { attemptId, expectedCurrentQuestionIndex: 1 });
const q2 = next2.data?.question ?? next2.data?.currentQuestion;
await s.call("POST", "/api/student/save-answer", { attemptId, questionId: q2?.id, answer: String(pick(q2, 4)) });
const submit = await s.call("POST", "/api/student/submit-exam", { attemptId });
check("submit exam", submit.status === 200, `status ${submit.status} ${submit.data?.message ?? ""}`);
const again = await s.call("POST", `/api/student/exams/${examId}/enter`);
check("attempt limit enforced after 1 of 1", again.status === 403, `status ${again.status} ${again.data?.code ?? ""}`);

// ---------- 4b. unfinished attempt is auto-submitted when the exam closes ----------
const g1 = people.g1.session;
check("g1 enters exam", (await g1.call("POST", `/api/student/exams/${examId}/enter`)).status === 200);
const g1Start = await g1.call("POST", "/api/student/start-exam");
check("g1 question has no explanation/answer key", !/isCorrect|explanation/.test(JSON.stringify(g1Start.data?.question)));
await g1.call("POST", "/api/student/save-answer", { attemptId: g1Start.data?.attemptId, questionId: g1Start.data?.question?.id, answer: String(pick(g1Start.data?.question, 0)) });
const resumed = await g1.call("POST", "/api/student/start-exam");
check("attempt resumes after refresh with saved answer", resumed.data?.attemptId === g1Start.data?.attemptId && !!resumed.data?.question?.savedAnswer);
const close = await admin.call("PATCH", `/api/exams/${examId}`, { closesAt: nairobi(0) });
check("admin closes exam now", close.status === 200, `status ${close.status} ${close.data?.message ?? ""}`);
await new Promise((r) => setTimeout(r, 20000)); // server deadline sweep runs every 15 s
const g1After = await g1.call("GET", `/api/student/classes/${classId}/exams`);
check("unfinished attempt auto-submitted at close", /submitted|closed/i.test(JSON.stringify(g1After.data)) && !/in_progress/.test(JSON.stringify(g1After.data)),
  JSON.stringify(g1After.data).slice(0, 200));

// ---------- 6. results ----------
const pending = await s.call("GET", `/api/student/exams/${examId}/results`);
check("results hidden until released", pending.data?.released === false, JSON.stringify(pending.data).slice(0, 100));
const release = await admin.call("POST", `/api/admin/exams/${examId}/results/release`, { released: true });
check("admin releases results", release.status === 200, `status ${release.status} ${release.data?.message ?? ""}`);
const results = await s.call("GET", `/api/student/exams/${examId}/results`);
const rtext = JSON.stringify(results.data);
check("student sees own results", results.status === 200, `status ${results.status}`);
check("score 2/3 (answered A, B, E vs correct A, C, E)", /"score":\s*2\b|"totalScore":\s*2\b|"obtained":\s*2\b/.test(rtext), rtext.slice(0, 160));
check("results contain no rankings/averages/other students", !/rank|average|position|QA Group/i.test(rtext));
const notes = await s.call("GET", "/api/student/notifications");
check("results-released notification", JSON.stringify(notes.data).match(/result/i) !== null);
const other = await people.g1.session.call("GET", `/api/student/exams/${examId}/results`);
check("another student cannot see these results", other.status !== 200 || !/QA Individual/.test(JSON.stringify(other.data)), `status ${other.status}`);

console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILED`} (run ${RUN}, class ${classId}, exam ${examId})`);
fs.writeFileSync(".e2e-state.json", JSON.stringify({ ...JSON.parse(fs.readFileSync(".e2e-state.json", "utf8")), examId }, null, 2));
process.exit(failures ? 1 : 0);
