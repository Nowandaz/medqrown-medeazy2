// Stage 14 steps 9-14: reminders, expiry lock, announcements, feedback, waitlist, demo.
// Run like e2e-stage14.mjs: local server with EMAIL_OUTBOX_ONLY=true, staging database.
import { execSync } from "node:child_process";
import {
  Session, check, failureCount, accounts, today, addDays, nairobi, lastEmailTo, RUN, mpesaCode, onboard,
} from "./e2e-lib.mjs";

const PASSWORD = `Qa-${RUN}-pass`;
const admin = new Session();
await admin.call("POST", "/api/admin/login", { email: accounts.QA_ADMIN_EMAIL, password: accounts.QA_ADMIN_PASSWORD });
const { current } = (await admin.call("GET", "/api/admin/cohorts")).data;
const classId = (await admin.call("POST", "/api/admin/classes", { name: `QA Engagement ${RUN}` })).data.id;

const person = (tag, i, plan) => ({
  name: `QA ${tag}`, email: `qa-${tag.toLowerCase()}-${RUN}@medeazy.test`,
  phone: `07160000${String(i).padStart(2, "0")}`, code: plan === "Group" ? mpesaCode("GR") : mpesaCode(`E${String.fromCharCode(65 + i)}`), plan,
});
const r7 = person("Rem7", 1, "Individual");
const r3 = person("Rem3", 2, "Group");
const r0 = person("Rem0", 3, "Individual");
const rPaid = person("RemPaid", 4, "Individual");
const grace = person("Grace", 5, "Individual");
const expired = person("Expired", 6, "Individual");
const all = [r7, r3, rPaid, grace, expired];
await onboard(admin, classId, all, PASSWORD);
check("5 engagement test students onboarded", all.every((p) => p.id));
// Last-day reminder student: complimentary add (no payment), membership ends today.
const comp = await admin.call("POST", `/api/admin/classes/${classId}/members`, { fullName: r0.name, email: r0.email, phone: r0.phone, complimentary: true, note: "QA complimentary", endDate: today });
check("manual add: complimentary student with note + end date", comp.status === 201, `${comp.status} ${comp.data?.message ?? ""}`);

const setEnd = (p, endDate, startDate = addDays(endDate, -29)) =>
  admin.call("PUT", `/api/admin/memberships/${p.id}`, { cohortId: current.id, startDate, endDate, reason: "QA: date setup" });

// Exam for expiry/grace + results history (taken while everyone is active).
await setEnd(expired, addDays(today, 5), today);
await setEnd(grace, addDays(today, 5), today);
const exam = (await admin.call("POST", "/api/exams", {
  title: `QA Engagement CAT ${RUN}`, classId, opensAt: nairobi(-2), closesAt: nairobi(60), durationMinutes: 10, status: "active", autoMarkEnabled: false,
})).data;
await admin.call("POST", `/api/exams/${exam.id}/questions`, { type: "mcq", content: "QA q", marks: 1,
  options: ["A", "B", "C", "D", "E"].map((c, i) => ({ content: c, isCorrect: i === 0 })) });
await expired.session.call("POST", `/api/student/exams/${exam.id}/enter`);
const st = await expired.session.call("POST", "/api/student/start-exam");
await expired.session.call("POST", "/api/student/save-answer", { attemptId: st.data.attemptId, questionId: st.data.question.id, answer: String(st.data.question.options[0].id) });
check("expired-to-be student submits an exam while active", (await expired.session.call("POST", "/api/student/submit-exam", { attemptId: st.data.attemptId })).status === 200);
const exam2 = (await admin.call("POST", "/api/exams", {
  title: `QA Engagement CAT2 ${RUN}`, classId, opensAt: nairobi(-1), closesAt: nairobi(60), durationMinutes: 10, status: "active", autoMarkEnabled: false,
})).data;

// ---------- 10. grace and expiry ----------
await setEnd(grace, addDays(today, -1));      // 1 day past end, grace = 3 days
await setEnd(expired, addDays(today, -4));    // past grace
const graceMe = (await grace.session.call("GET", "/api/student/membership")).data;
check("grace status after end date", graceMe?.status === "grace", graceMe?.status);
check("grace student can still enter exams", (await grace.session.call("POST", `/api/student/exams/${exam2.id}/enter`)).status === 200);
const expMe = (await expired.session.call("GET", "/api/student/membership")).data;
check("expired status after grace", expMe?.status === "expired", expMe?.status);
check("expired student can still log in", (await new Session().call("POST", "/api/student/login", { email: expired.email, password: PASSWORD })).status === 200);
const locked = await expired.session.call("POST", `/api/student/exams/${exam2.id}/enter`);
check("expired student cannot open exams", locked.status === 403, `${locked.status} ${locked.data?.message ?? ""}`);
const expExams = JSON.stringify((await expired.session.call("GET", `/api/student/classes/${classId}/exams`)).data);
check("exam list shows locked / renew for expired", /renew|locked/i.test(expExams), expExams.slice(0, 160));
await admin.call("PATCH", `/api/exams/${exam.id}`, { closesAt: nairobi(0) });
const rel = await admin.call("POST", `/api/admin/exams/${exam.id}/results/release`, { released: true });
check("release results of closed exam", rel.status === 200, `${rel.status} ${rel.data?.message ?? ""}`);
const history = await expired.session.call("GET", "/api/student/results/history");
check("expired student still sees own past results", history.status === 200 && JSON.stringify(history.data).includes(`QA Engagement CAT ${RUN}`), `status ${history.status}`);

// ---------- 9. renewal reminders ----------
await setEnd(r7, addDays(today, 7));
await setEnd(r3, addDays(today, 3));
await setEnd(rPaid, addDays(today, 7));
await rPaid.session.call("POST", "/api/student/renewal", { code: mpesaCode("EP"), plan: "Individual" });
execSync("npx tsx scripts/run-reminders.ts", { env: { ...process.env, EMAIL_OUTBOX_ONLY: "true", NODE_ENV: "development" }, stdio: "pipe" });
const mail = (p) => lastEmailTo(p.email) || "";
check("7-day reminder sent", /renewal_7_days/.test(mail(r7)));
check("3-day reminder sent", /renewal_3_days/.test(mail(r3)));
check("last-day reminder sent", /renewal_last_day/.test(mail(r0)));
check("no reminder when renewal already pending", !/renewal_/.test(mail(rPaid)));
const n7 = JSON.stringify((await r7.session.call("GET", "/api/student/notifications")).data);
const n3 = JSON.stringify((await r3.session.call("GET", "/api/student/notifications")).data);
check("in-app reminder notification", /Membership ends in 7 days/.test(n7));
check("'cheaper with friends' for Individual (11%, KSh 75)", /cheaper with friends/.test(n7) && /11%/.test(n7) && /KSh 75/.test(n7));
check("no 'cheaper with friends' for Group", /Membership ends in 3 days/.test(n3) && !/cheaper with friends/.test(n3));
check("reminder links are absolute URLs", /https?:\/\/[^\s"]+\/student\/dashboard/.test(n7), n7.match(/Renew: [^ .]*/)?.[0]);
execSync("npx tsx scripts/run-reminders.ts", { env: { ...process.env, EMAIL_OUTBOX_ONLY: "true", NODE_ENV: "development" }, stdio: "pipe" });
const count7 = ((await r7.session.call("GET", "/api/student/notifications")).data || []).filter((n) => /7 days/.test(n.title)).length;
check("reminder not repeated on the next run", count7 === 1, `count ${count7}`);

// ---------- 11. announcements ----------
const ann = await admin.call("POST", `/api/admin/classes/${classId}/announcements`, { title: `QA Session ${RUN}`, message: "Monday 8 pm", link: "https://meet.google.com/qa-test-link" });
check("post announcement", ann.status === 201 || ann.status === 200, `${ann.status} ${ann.data?.message ?? ""}`);
const annList = JSON.stringify((await r7.session.call("GET", `/api/student/classes/${classId}/announcements`)).data);
check("student sees announcement in class", annList.includes(`QA Session ${RUN}`));
check("announcement in-app notification", JSON.stringify((await r7.session.call("GET", "/api/student/notifications")).data).includes(`QA Session ${RUN}`));
check("announcement email", /announcement/.test(mail(r7)));
check("expired member not sent the announcement", !JSON.stringify((await expired.session.call("GET", "/api/student/notifications")).data).includes(`QA Session ${RUN}`));

// ---------- 12. feedback ----------
const fb = await r7.session.call("POST", `/api/student/classes/${classId}/feedback`, { message: `QA general feedback ${RUN}` });
check("student sends general feedback", fb.status === 201 || fb.status === 200, `${fb.status} ${fb.data?.message ?? ""}`);
const fbAdmin = JSON.stringify((await admin.call("GET", `/api/admin/classes/${classId}/feedback`)).data);
check("admin sees named feedback", fbAdmin.includes(`QA general feedback ${RUN}`) && fbAdmin.includes("QA Rem7"));

// ---------- 13. waitlist ----------
const original = (await admin.call("GET", "/api/admin/site-settings")).data;
try {
  await admin.call("PUT", "/api/admin/site-settings", { registrationOpen: false });
  const wEmail = `qa-wait-${RUN}@medeazy.test`;
  const join = await new Session().call("POST", "/api/waitlist", { name: "QA Waiter", email: wEmail, phone: "0717000001", source: "qr" });
  check("join waitlist while closed", join.status === 201, `${join.status} ${join.data?.message ?? ""}`);
  const listed = JSON.stringify((await admin.call("GET", `/api/admin/waitlist?search=${encodeURIComponent(wEmail)}`)).data);
  check("admin sees waitlist entry", listed.includes(wEmail));
  const opened = await admin.call("PUT", "/api/admin/site-settings", { registrationOpen: true, googleFormUrl: original.googleFormUrl || "https://docs.google.com/forms/d/e/qa-test/viewform" });
  check("open registration", opened.status === 200, `${opened.status} ${opened.data?.message ?? ""}`);
  check("waitlist gets 'registration open' email", /waitlist_registration_open/.test(lastEmailTo(wEmail) || ""));
  const joinOpen = await new Session().call("POST", "/api/waitlist", { name: "QA Late Waiter", email: `qa-wait2-${RUN}@medeazy.test`, phone: "0717000002" });
  check("waitlist refuses while open", joinOpen.status === 409);
} finally {
  await admin.call("PUT", "/api/admin/site-settings", { registrationOpen: original.registrationOpen ?? false, ...(original.googleFormUrl ? { googleFormUrl: original.googleFormUrl } : {}) });
}

// ---------- 14. demo without AI ----------
const demoExams = (await new Session().call("GET", "/api/demo/exams")).data || [];
check("demo subjects available", demoExams.length >= 1, demoExams.map((e) => e.title).join(", "));
for (const demo of demoExams) {
  const qs = (await new Session().call("GET", `/api/demo/exams/${demo.id}/questions`)).data || [];
  const saq = qs.find((q) => q.type === "saq");
  check(`${demo.title}: SAQ served without model answer`, !!saq && !("modelAnswer" in saq) && !("markingPoints" in saq));
  if (!saq) continue;
  const res = await new Session().call("POST", "/api/demo/saq-submit", { examId: demo.id, questionId: saq.id, sessionId: `qa-demo-${RUN}`, response: "QA answer" });
  check(`${demo.title}: model answer + marking points returned`, res.status === 200 && !!res.data?.modelAnswer && !!res.data?.markingPoints,
    `${res.status} ${res.data?.message ?? ""}`);
}

console.log(`\n${failureCount() === 0 ? "ALL PASSED" : `${failureCount()} FAILED`} (run ${RUN}, class ${classId})`);
process.exit(failureCount() ? 1 : 0);
