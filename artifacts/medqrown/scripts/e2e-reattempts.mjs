// Free reattempts + attempt history. One student takes the same exam 5 times:
// attempts 1-4 need no approval, attempt 5 needs an approved reattempt request,
// and the released results list every attempt (Attempt 1..5) with its own score.
// Run like e2e-stage14.mjs (local server, EMAIL_OUTBOX_ONLY=true, staging DB).
// The student's login is saved to .env.test-accounts as QA_REATTEMPT_* for a browser check.
import fs from "node:fs";
import { Session, accounts, check, failureCount, today, nairobi, RUN, mpesaCode, onboard } from "./e2e-lib.mjs";

const admin = new Session();
check("admin login", (await admin.call("POST", "/api/admin/login", { email: accounts.QA_ADMIN_EMAIL, password: accounts.QA_ADMIN_PASSWORD })).status === 200);
const { current } = (await admin.call("GET", "/api/admin/cohorts")).data;
const classId = (await admin.call("POST", "/api/admin/classes", { name: `QA Reattempt Class ${RUN}`, description: "Reattempt QA" })).data.id;

const password = `Qa-${RUN}-re`;
const student = { name: "QA Reattempt Student", email: `qa-re-${RUN}@medeazy.test`, phone: "0718000002", code: mpesaCode("RE"), plan: "Individual" };
await onboard(admin, classId, [student], password);
await admin.call("PUT", `/api/admin/memberships/${student.id}`, { cohortId: current.id, startDate: today, endDate: current.endDate, reason: "QA: reattempts" });

// maxAttempts is left at its default of 1: the free reattempts must still apply.
const exam = (await admin.call("POST", "/api/exams", {
  title: `QA Reattempt CAT ${RUN}`, classId, opensAt: nairobi(-1), closesAt: nairobi(240), durationMinutes: 30,
  instructions: "QA reattempt exam.", status: "active", autoMarkEnabled: false,
})).data;
check("create exam with default max attempts", !!exam?.id && exam.maxAttempts === 1, `id ${exam?.id} max ${exam?.maxAttempts}`);
const opts = (correct) => ["Option A", "Option B", "Option C", "Option D", "Option E"].map((content, i) => ({ content, isCorrect: i === correct }));
let created = 0;
for (const i of [1, 2, 3, 4]) {
  const q = await admin.call("POST", `/api/exams/${exam.id}/questions`, { type: "mcq", content: `QA reattempt question ${i}`, marks: 1, explanation: `Explanation ${i}`, options: opts(0) });
  if (q.status === 200) created++;
}
check("create 4 questions", created === 4, `${created} created`);

const s = student.session;
/** Answers the first `correctCount` questions with option A (correct) and the rest with option B. */
async function takeExam(correctCount) {
  const start = await s.call("POST", "/api/student/start-exam");
  if (start.status !== 200) return { start };
  const attemptId = start.data.attemptId;
  let q = start.data.question;
  for (let index = 0; q; index++) {
    await s.call("POST", "/api/student/save-answer", { attemptId, questionId: q.id, answer: String(q.options[index < correctCount ? 0 : 1].id) });
    const next = await s.call("POST", "/api/student/next-question", { attemptId, expectedCurrentQuestionIndex: index });
    q = next.status === 200 ? (next.data?.question ?? null) : null;
  }
  const submit = await s.call("POST", "/api/student/submit-exam", { attemptId });
  return { start, attemptId, submit };
}

const scores = [1, 2, 3, 4, 2]; // correct answers per attempt, out of 4
const attemptIds = [];
for (let n = 1; n <= 4; n++) {
  const enter = await s.call("POST", `/api/student/exams/${exam.id}/enter`);
  check(`attempt ${n}: enter without approval`, enter.status === 200, `${enter.status} ${enter.data?.message ?? ""}`);
  const info = (await s.call("GET", "/api/student/exam-info")).data;
  check(`attempt ${n}: instructions say Attempt ${n} of 4`, info?.attemptsUsed === n - 1 && info?.maxAttempts === 4, `used ${info?.attemptsUsed} max ${info?.maxAttempts}`);
  const run = await takeExam(scores[n - 1]);
  check(`attempt ${n}: submitted`, run.submit?.status === 200, `${run.start.status} ${run.submit?.status ?? run.start.data?.message}`);
  attemptIds.push(run.attemptId);
}

const blocked = await s.call("POST", `/api/student/exams/${exam.id}/enter`);
check("attempt 5: blocked after 3 free reattempts", blocked.status === 403 && blocked.data?.code === "ATTEMPT_LIMIT_REACHED", `${blocked.status} ${blocked.data?.code}`);
const unitList = (await s.call("GET", `/api/student/classes/${classId}/exams`)).data?.find((e) => e.id === exam.id);
check("class exam list: 4 of 4 used, cannot open", unitList?.attemptsUsed === 4 && unitList?.maxAttempts === 4 && unitList?.canOpen === false, JSON.stringify({ used: unitList?.attemptsUsed, max: unitList?.maxAttempts, canOpen: unitList?.canOpen }));
const startBlocked = await s.call("POST", "/api/student/start-exam");
check("attempt 5: start-exam also blocked", startBlocked.status === 403, `${startBlocked.status}`);

const request = await s.call("POST", `/api/student/exams/${exam.id}/request-reattempt`, { reason: "QA: fifth attempt" });
check("attempt 5: reattempt request accepted", request.status === 200 && request.data?.status === "pending", `${request.status} ${request.data?.message ?? ""}`);
const pendingEnter = await s.call("POST", `/api/student/exams/${exam.id}/enter`);
check("attempt 5: still blocked while request pending", pendingEnter.status === 403, `${pendingEnter.status} ${pendingEnter.data?.code}`);
const requests = (await admin.call("GET", `/api/exams/${exam.id}/reattempt-requests`)).data || [];
const pendingRequest = requests.find((r) => r.status === "pending");
const approve = await admin.call("POST", `/api/exams/${exam.id}/reattempt-requests/${pendingRequest?.id}/approve`);
check("admin approves reattempt", approve.status === 200, `${approve.status} ${approve.data?.message ?? ""}`);

const enter5 = await s.call("POST", `/api/student/exams/${exam.id}/enter`);
check("attempt 5: enter after approval", enter5.status === 200, `${enter5.status} ${enter5.data?.message ?? ""}`);
const info5 = (await s.call("GET", "/api/student/exam-info")).data;
check("attempt 5: instructions say Attempt 5 of 5", info5?.attemptsUsed === 4 && info5?.maxAttempts === 5, `used ${info5?.attemptsUsed} max ${info5?.maxAttempts}`);
const run5 = await takeExam(scores[4]);
check("attempt 5: submitted", run5.submit?.status === 200, `${run5.submit?.status}`);
attemptIds.push(run5.attemptId);
const after5 = await s.call("POST", `/api/student/exams/${exam.id}/enter`);
check("attempt 6: blocked again (approval was single-use)", after5.status === 403, `${after5.status} ${after5.data?.code}`);

// Pending results list each attempt separately before release.
const pending = (await s.call("GET", "/api/student/results/pending")).data?.filter((r) => r.examId === exam.id) || [];
check("awaiting results lists all 5 attempts", pending.length === 5 && pending.map((r) => r.attemptNumber).sort().join() === "1,2,3,4,5", pending.map((r) => r.attemptNumber).join());

await admin.call("PATCH", `/api/exams/${exam.id}`, { closesAt: nairobi(0) });
const release = await admin.call("POST", `/api/admin/exams/${exam.id}/results/release`, { released: true });
check("release results", release.status === 200, `${release.status} ${release.data?.message ?? ""}`);

const latest = (await s.call("GET", `/api/student/exams/${exam.id}/results`)).data;
check("results default to the latest attempt", latest?.attemptNumber === 5 && latest?.attemptId === attemptIds[4] && latest?.percentage === 50, `#${latest?.attemptNumber} ${latest?.percentage}%`);
check("results list every attempt with its score",
  latest?.attempts?.map((a) => `${a.attemptNumber}:${a.percentage}`).join() === "1:25,2:50,3:75,4:100,5:50",
  latest?.attempts?.map((a) => `${a.attemptNumber}:${a.percentage}`).join());
const first = (await s.call("GET", `/api/student/exams/${exam.id}/results?attemptId=${attemptIds[0]}`)).data;
const firstPicks = first?.questions?.map((q) => q.responses[0]?.isCorrect).join();
check("attempt 1 shows its own answers", first?.attemptNumber === 1 && first?.totalScore === 1 && firstPicks === "true,false,false,false", `#${first?.attemptNumber} score ${first?.totalScore} ${firstPicks}`);
const fourth = (await s.call("GET", `/api/student/exams/${exam.id}/results?attemptId=${attemptIds[3]}`)).data;
check("attempt 4 shows its own answers", fourth?.attemptNumber === 4 && fourth?.totalScore === 4, `#${fourth?.attemptNumber} score ${fourth?.totalScore}`);
const bogus = await s.call("GET", `/api/student/exams/${exam.id}/results?attemptId=1`);
check("someone else's attempt id is refused", bogus.status === 404, `${bogus.status}`);

const history = (await s.call("GET", "/api/student/results/history")).data?.filter((r) => r.examId === exam.id) || [];
check("results history has Attempt 1..5", history.map((r) => r.attemptNumber).join() === "5,4,3,2,1", history.map((r) => `${r.attemptNumber}:${r.scorePercent}`).join());

const file = fs.readFileSync(".env.test-accounts", "utf8").split(/\r?\n/).filter((l) => l && !l.startsWith("QA_REATTEMPT_"));
file.push(`QA_REATTEMPT_STUDENT_EMAIL=${student.email}`, `QA_REATTEMPT_STUDENT_PASSWORD=${password}`, `QA_REATTEMPT_EXAM_ID=${exam.id}`);
fs.writeFileSync(".env.test-accounts", file.join("\n") + "\n");

console.log(`\n${failureCount() ? `${failureCount()} FAILED` : "ALL PASSED"} (exam ${exam.id})`);
process.exit(failureCount() ? 1 : 0);
