// Prepares data for a manual/browser click-through on the local server (staging DB):
// a class, an active test student (login saved to .env.test-accounts) and an open exam.
import fs from "node:fs";
import { Session, accounts, today, nairobi, RUN, mpesaCode, onboard } from "./e2e-lib.mjs";

const admin = new Session();
await admin.call("POST", "/api/admin/login", { email: accounts.QA_ADMIN_EMAIL, password: accounts.QA_ADMIN_PASSWORD });
const { current } = (await admin.call("GET", "/api/admin/cohorts")).data;
const classId = (await admin.call("POST", "/api/admin/classes", { name: `QA UI Class ${RUN}`, description: "Browser click-through" })).data.id;

const password = `Qa-${RUN}-ui`;
const student = { name: "QA UI Student", email: `qa-ui-${RUN}@medeazy.test`, phone: "0718000001", code: mpesaCode("UI"), plan: "Individual" };
await onboard(admin, classId, [student], password);
await admin.call("PUT", `/api/admin/memberships/${student.id}`, { cohortId: current.id, startDate: today, endDate: current.endDate, reason: "QA: UI test" });

const exam = (await admin.call("POST", "/api/exams", {
  title: `QA UI Mock CAT ${RUN}`, classId, opensAt: nairobi(-1), closesAt: nairobi(240), durationMinutes: 30,
  instructions: "Answer every question. This is a QA test exam.", status: "active", autoMarkEnabled: false,
})).data;
const opts = (correct) => ["Option A", "Option B", "Option C", "Option D", "Option E"].map((content, i) => ({ content, isCorrect: i === correct }));
for (const [i, correct] of [[1, 0], [2, 2], [3, 4]]) {
  await admin.call("POST", `/api/exams/${exam.id}/questions`, { type: "mcq", content: `QA multiple-choice question ${i}`, marks: 1, explanation: `Explanation ${i}`, options: opts(correct) });
}
await admin.call("POST", `/api/exams/${exam.id}/questions`, { type: "saq", content: "QA short-answer question: name the largest artery.", marks: 1, expectedAnswer: "Aorta" });
await admin.call("POST", "/api/exams", {
  title: `QA UI Upcoming CAT ${RUN}`, classId, opensAt: nairobi(60 * 24), closesAt: nairobi(60 * 24 + 30), durationMinutes: 30, status: "active",
});
await admin.call("POST", `/api/admin/classes/${classId}/announcements`, { title: "QA welcome announcement", message: "Weekly session Monday 8 pm.", link: "https://meet.google.com/qa-test-link" });

const file = fs.readFileSync(".env.test-accounts", "utf8").split(/\r?\n/).filter((l) => l && !l.startsWith("QA_UI_"));
file.push(`QA_UI_STUDENT_EMAIL=${student.email}`, `QA_UI_STUDENT_PASSWORD=${password}`, `QA_UI_CLASS_ID=${classId}`, `QA_UI_EXAM_ID=${exam.id}`);
fs.writeFileSync(".env.test-accounts", file.join("\n") + "\n");
console.log(`UI test data ready: class ${classId}, exam ${exam.id}, student saved to .env.test-accounts`);
