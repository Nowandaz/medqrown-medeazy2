// Membership history: a student who paid for an earlier period, skipped one, then renewed
// keeps the first period's exams, never sees the skipped period's, and gets the new period's.
// Also: Not-renewed list, cohort delete protection, and "move students" shifting by days.
// Run like e2e-stage14.mjs (local server with EMAIL_OUTBOX_ONLY=true, staging database).
import { Session, check, failureCount, accounts, today, addDays, RUN, mpesaCode, onboard } from "./e2e-lib.mjs";

const PASSWORD = `Qa-${RUN}-ch`;
const admin = new Session();
await admin.call("POST", "/api/admin/login", { email: accounts.QA_ADMIN_EMAIL, password: accounts.QA_ADMIN_PASSWORD });
const cohorts = (await admin.call("GET", "/api/admin/cohorts")).data;
const { current } = cohorts;
check("cohort list includes every cohort with member counts", Array.isArray(cohorts.all) && cohorts.all.every((c) => typeof c.memberCount === "number"),
  `${cohorts.all?.length} cohorts`);
const classId = (await admin.call("POST", "/api/admin/classes", { name: `QA History ${RUN}` })).data.id;
const student = { name: "QA History Student", email: `qa-hist-${RUN}@medeazy.test`, phone: "0719100001", code: mpesaCode("HI"), plan: "Individual" };
await onboard(admin, classId, [student], PASSWORD);
const setMembership = (startDate, endDate, reason) =>
  admin.call("PUT", `/api/admin/memberships/${student.id}`, { cohortId: current.id, startDate, endDate, reason });

// Period 1: 60 to 40 days ago.
check("period 1 set", (await setMembership(addDays(today, -60), addDays(today, -40), "QA: period 1")).status === 200);

// Exams: one in period 1, one in the gap, one now. (Times are Nairobi; date-only offsets are enough.)
const at = (days, hour) => `${addDays(today, days)}T${String(hour).padStart(2, "0")}:00`;
const mkExam = async (title, openDays, closeDays) => {
  const r = await admin.call("POST", "/api/exams", { title: `${title} ${RUN}`, classId, opensAt: at(openDays, 10), closesAt: at(closeDays, 22),
    durationMinutes: 10, status: "active", autoMarkEnabled: false });
  await admin.call("POST", `/api/exams/${r.data.id}/questions`, { type: "mcq", content: "Q", marks: 1,
    options: ["A", "B", "C", "D", "E"].map((c, i) => ({ content: c, isCorrect: i === 0 })) });
  return r.data.id;
};
const examP1 = await mkExam("QA Period1 CAT", -50, -50);
const examGap = await mkExam("QA Gap CAT", -25, -25);
const examNow = await mkExam("QA Current CAT", -1, 3);
const titles = async () => ((await student.session.call("GET", `/api/student/classes/${classId}/exams`)).data || []).map((e) => e.title);

// While lapsed: period-1 exam visible, gap exam hidden, current exam shown locked.
let seen = await titles();
check("lapsed: exam from their period is visible", seen.includes(`QA Period1 CAT ${RUN}`), seen.join(" | "));
check("lapsed: exam from a period they skipped is hidden", !seen.includes(`QA Gap CAT ${RUN}`));
check("lapsed: current exam shown (locked, to renew)", seen.includes(`QA Current CAT ${RUN}`));
const lockedEnter = await student.session.call("POST", `/api/student/exams/${examNow}/enter`);
check("lapsed: current exam can't be opened", lockedEnter.status === 403, lockedEnter.data?.message);

const notRenewed = (await admin.call("GET", "/api/admin/students/not-renewed")).data;
check("Not renewed: lapsed student is listed", notRenewed.lapsed?.some((r) => r.id === student.id), `${notRenewed.lapsed?.length} lapsed`);

// Renew after the gap: a new period from 10 days ago.
check("renewal after a gap", (await setMembership(addDays(today, -10), addDays(today, 20), "QA: period 2")).status === 200);
seen = await titles();
check("renewed: period-1 exam still visible", seen.includes(`QA Period1 CAT ${RUN}`), seen.join(" | "));
check("renewed: skipped-period exam still hidden", !seen.includes(`QA Gap CAT ${RUN}`));
check("renewed: current exam visible", seen.includes(`QA Current CAT ${RUN}`));
const enterNow = await student.session.call("POST", `/api/student/exams/${examNow}/enter`);
check("renewed: current exam opens", enterNow.status === 200, enterNow.data?.message);
const enterGap = await student.session.call("POST", `/api/student/exams/${examGap}/enter`);
check("skipped-period exam can't be opened directly", enterGap.status === 403, enterGap.data?.message);
const after = (await admin.call("GET", "/api/admin/students/not-renewed")).data;
check("Not renewed: renewed student no longer listed", !after.lapsed?.some((r) => r.id === student.id));

// Announcements: one posted now (inside the current period) is visible.
await admin.call("POST", `/api/admin/classes/${classId}/announcements`, { title: `QA History note ${RUN}`, message: "Hi" });
const anns = JSON.stringify((await student.session.call("GET", `/api/student/classes/${classId}/announcements`)).data);
check("announcement from the current period visible", anns.includes(`QA History note ${RUN}`));

// Cohorts: can't delete one that has students.
const del = await admin.call("DELETE", `/api/admin/cohorts/${current.id}`);
check("cohort with students can't be deleted", del.status === 409, del.data?.message);

// "Move students" shifts everyone in the cohort by the same number of days.
await setMembership(addDays(today, -5), addDays(current.endDate, 2), "QA: custom end in current cohort");
const before = (await admin.call("GET", `/api/admin/classes/${classId}/members`)).data.find((m) => m.id === student.id)?.membershipEndDate;
const plus = await admin.call("PATCH", `/api/admin/cohorts/${current.id}`, { startDate: current.startDate, endDate: addDays(current.endDate, -1), reason: "QA shift -1", moveMembers: true });
const moved = (await admin.call("GET", `/api/admin/classes/${classId}/members`)).data.find((m) => m.id === student.id)?.membershipEndDate;
check("moving the cohort end by -1 day moves a custom end by -1 too", plus.status === 200 && moved === addDays(before, -1),
  `${plus.status} ${plus.data?.message ?? ""} ${before} -> ${moved}`);
const back = await admin.call("PATCH", `/api/admin/cohorts/${current.id}`, { startDate: current.startDate, endDate: current.endDate, reason: "QA shift back", moveMembers: true });
check("cohort restored", back.status === 200, back.data?.message);

console.log(`\n${failureCount() === 0 ? "ALL PASSED" : `${failureCount()} FAILED`} (run ${RUN}, class ${classId})`);
process.exit(failureCount() ? 1 : 0);
