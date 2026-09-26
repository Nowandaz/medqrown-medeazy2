// Per-question timing: when a question's time runs out the saved answer is kept, the attempt moves
// to the next question (server-side, even if the student's browser is closed) and the last question
// auto-submits. Run like e2e-stage14.mjs (local server, EMAIL_OUTBOX_ONLY=true, staging DB).
import { Session, check, failureCount, accounts, today, nairobi, RUN, mpesaCode, onboard } from "./e2e-lib.mjs";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const PASSWORD = `Qa-${RUN}-pq`;
const admin = new Session();
await admin.call("POST", "/api/admin/login", { email: accounts.QA_ADMIN_EMAIL, password: accounts.QA_ADMIN_PASSWORD });
const { current } = (await admin.call("GET", "/api/admin/cohorts")).data;
const classId = (await admin.call("POST", "/api/admin/classes", { name: `QA PerQuestion ${RUN}` })).data.id;
const student = { name: "QA PQ Student", email: `qa-pq-${RUN}@medeazy.test`, phone: "0719000001", code: mpesaCode("PQ"), plan: "Individual" };
await onboard(admin, classId, [student], PASSWORD);
await admin.call("PUT", `/api/admin/memberships/${student.id}`, { cohortId: current.id, startDate: today, endDate: current.endDate, reason: "QA" });

const bad = await admin.call("POST", "/api/exams", { title: "QA bad", classId, opensAt: nairobi(-1), closesAt: nairobi(60), timerMode: "per_question", perQuestionSeconds: 3 });
check("per-question time below 10 s is rejected", bad.status === 400, bad.data?.message);
const exam = await admin.call("POST", "/api/exams", {
  title: `QA Per-question ${RUN}`, classId, opensAt: nairobi(-1), closesAt: nairobi(60),
  timerMode: "per_question", perQuestionSeconds: 10, status: "active", autoMarkEnabled: false,
});
check("create per-question exam", exam.status === 200 && exam.data?.timerMode === "per_question" && exam.data?.perQuestionSeconds === 10,
  `${exam.status} ${exam.data?.timerMode} ${exam.data?.perQuestionSeconds}`);
const examId = exam.data.id;
for (const n of [1, 2, 3]) {
  await admin.call("POST", `/api/exams/${examId}/questions`, { type: "mcq", content: `PQ ${n}`, marks: 1,
    options: ["A", "B", "C", "D", "E"].map((c, i) => ({ content: c, isCorrect: i === 0 })) });
}

const s = student.session;
check("enter exam", (await s.call("POST", `/api/student/exams/${examId}/enter`)).status === 200);
const info = (await s.call("GET", "/api/student/exam-info")).data;
check("exam info reports per-question timing", info.timerMode === "per_question" && info.perQuestionSeconds === 10);
const start = (await s.call("POST", "/api/student/start-exam")).data;
check("question 1 has its own start time", start.currentQuestionIndex === 0 && !!start.questionStartedAt);
const q1 = start.question;
await s.call("POST", "/api/student/save-answer", { attemptId: start.attemptId, questionId: q1.id, answer: String(q1.options[0].id) });

// Student "closes the browser": the server must advance on its own (10 s + 5 s grace + ≤10 s sweep).
let state = start;
for (let i = 0; i < 12 && state.currentQuestionIndex === 0; i++) {
  await wait(3000);
  state = (await s.call("POST", "/api/student/start-exam")).data;
}
check("server moved to question 2 after time ran out", state.currentQuestionIndex === 1, `index ${state.currentQuestionIndex}`);
const early = await s.call("POST", "/api/student/save-answer", { attemptId: start.attemptId, questionId: q1.id, answer: String(q1.options[1].id) });
check("answer to an expired question can't be changed", early.status >= 400, `status ${early.status}`);

// Leave Q2 and Q3 unanswered; the last timeout submits the attempt.
let submitted = false;
for (let i = 0; i < 25 && !submitted; i++) {
  await wait(3000);
  const session = (await s.call("GET", "/api/student/session")).data;
  submitted = session?.attemptStatus === "submitted";
}
check("attempt auto-submitted after the last question's time", submitted);

await admin.call("PATCH", `/api/exams/${examId}`, { closesAt: nairobi(0) });
const released = await admin.call("POST", `/api/admin/exams/${examId}/results/release`, { released: true });
check("results release", released.status === 200, released.data?.message);
const results = (await s.call("GET", `/api/student/exams/${examId}/results`)).data;
check("saved answer from the timed-out question was marked (1/3)", results.totalScore === 1 && results.maxScore === 3,
  `${results.totalScore}/${results.maxScore} (${results.percentage}%)`);
check("unanswered questions still listed with the correct answer", results.questions?.length === 3);

console.log(`\n${failureCount() === 0 ? "ALL PASSED" : `${failureCount()} FAILED`} (run ${RUN}, exam ${examId})`);
process.exit(failureCount() ? 1 : 0);
