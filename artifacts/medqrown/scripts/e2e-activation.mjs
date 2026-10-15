// An invited student who sets their password via "Forgot password" (not the invite link)
// must show as Activated, and the unused invite link must stop working.
// Run like e2e-stage14.mjs (local server, EMAIL_OUTBOX_ONLY=true, staging DB).
import { Session, accounts, check, failureCount, today, RUN, mpesaCode, lastEmailTo, inviteTokenFor } from "./e2e-lib.mjs";

const admin = new Session();
check("admin login", (await admin.call("POST", "/api/admin/login", { email: accounts.QA_ADMIN_EMAIL, password: accounts.QA_ADMIN_PASSWORD })).status === 200);
const { current } = (await admin.call("GET", "/api/admin/cohorts")).data;
const classId = (await admin.call("POST", "/api/admin/classes", { name: `QA Activation Class ${RUN}`, description: "Activation QA" })).data.id;

// Import without activating: the student only receives an invite email.
const email = `qa-act-${RUN}@medeazy.test`;
await admin.call("POST", `/api/admin/classes/${classId}/members/import-confirm`, {
  csv: `full_name,email,phone,mpesa_code,plan\nQA Activation Student,${email},0718000003,${mpesaCode("AC")},Individual`, verified: true,
});
const memberRow = async () => ((await admin.call("GET", `/api/admin/classes/${classId}/members`)).data || []).find((m) => m.email === email);
const before = await memberRow();
await admin.call("PUT", `/api/admin/memberships/${before?.id}`, { cohortId: current.id, startDate: today, endDate: current.endDate, reason: "QA: activation" });
check("before: invited, not activated", before?.inviteStatus === "pending", before?.inviteStatus);
const inviteToken = inviteTokenFor(email);
check("invite email captured", !!inviteToken);

// Ahmed's path: Forgot password -> reset code -> new password.
const forgot = await new Session().call("POST", "/api/student/forgot-password", { email });
check("forgot password accepted", forgot.status === 200, `${forgot.status} ${forgot.data?.message ?? ""}`);
const code = lastEmailTo(email)?.match(/\b(\d{6})\b/)?.[1];
check("reset code captured", !!code);
const password = `Qa-${RUN}-act`;
const reset = await new Session().call("POST", "/api/student/reset-password", { email, code, newPassword: password });
check("reset password", reset.status === 200, `${reset.status} ${reset.data?.message ?? ""}`);
check("student can log in", (await new Session().call("POST", "/api/student/login", { email, password })).status === 200);

const after = await memberRow();
check("after: members table says Activated", after?.inviteStatus === "activated", after?.inviteStatus);
const stale = await new Session().call("POST", "/api/student/set-password", { token: inviteToken, password: "hijacked-pass" });
check("old invite link no longer works", stale.status === 400, `${stale.status} ${stale.data?.message ?? ""}`);
check("password unchanged by old link", (await new Session().call("POST", "/api/student/login", { email, password })).status === 200);
const resend = await admin.call("POST", `/api/admin/students/${after?.id}/resend-invite`);
check("resend invite refused for activated student", resend.status === 404, `${resend.status}`);

console.log(`\n${failureCount() ? `${failureCount()} FAILED` : "ALL PASSED"}`);
process.exit(failureCount() ? 1 : 0);
