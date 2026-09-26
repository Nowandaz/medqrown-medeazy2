// Stage 14 step 8: renewals and M-Pesa code matching (master prompt §5).
// Run like e2e-stage14.mjs: local server with EMAIL_OUTBOX_ONLY=true, staging database.
import {
  Session, check, failureCount, accounts, today, addDays, lastEmailTo, RUN, mpesaCode, onboard,
} from "./e2e-lib.mjs";

const PASSWORD = `Qa-${RUN}-pass`;
const admin = new Session();
await admin.call("POST", "/api/admin/login", { email: accounts.QA_ADMIN_EMAIL, password: accounts.QA_ADMIN_PASSWORD });
const { current, next } = (await admin.call("GET", "/api/admin/cohorts")).data;
const klass = await admin.call("POST", "/api/admin/classes", { name: `QA Renewals ${RUN}`, description: "Stage 14 renewals test" });
const classId = klass.data.id;

const person = (tag, i) => ({
  name: `QA ${tag}`, email: `qa-${tag.toLowerCase()}-${RUN}@medeazy.test`,
  phone: `07130000${String(i).padStart(2, "0")}`, code: mpesaCode(`S${String.fromCharCode(65 + i)}`), plan: "Individual",
});
const [ind, a, b, c, d, mixer, typo] = ["Ind", "GA", "GB", "GC", "GD", "Mixer", "Typo"].map(person);
await onboard(admin, classId, [ind, a, b, c, d, mixer, typo], PASSWORD);
check("7 renewal test students onboarded", [ind, a, b, c, d, mixer, typo].every((p) => p.id), [ind, a, b, c, d, mixer, typo].map((p) => p.id).join(","));

// Renew is offered only from 7 days before the end.
const early = await ind.session.call("POST", "/api/student/renewal", { code: mpesaCode("RX"), plan: "Individual" });
check("renewal refused more than 7 days before end", early.status === 403, early.data?.message);

// Move everyone to "membership ends in 5 days" (active, inside the renewal window).
const endSoon = addDays(today, 5);
for (const p of [ind, a, b, c, d, mixer, typo]) {
  await admin.call("PUT", `/api/admin/memberships/${p.id}`, { cohortId: current.id, startDate: today, endDate: endSoon, reason: "QA: renewal window" });
}
const details = await ind.session.call("GET", "/api/student/renewal/payment-details");
check("popup shows paybill/account/bank/prices",
  details.data?.paybill === "542542" && details.data?.accountNumber === "00106133326150" && details.data?.bankName === "I&M Bank"
  && details.data?.individualPrice === 700 && details.data?.groupPrice === 2500, JSON.stringify(details.data).slice(0, 120));

// Code validation
const badFormat = await ind.session.call("POST", "/api/student/renewal", { code: "abc12", plan: "Individual" });
check("invalid code format rejected", badFormat.status === 400, badFormat.data?.message);

// --- Individual renewal ---
const indCode = mpesaCode("RI");
const indRenew = await ind.session.call("POST", "/api/student/renewal", { code: ` ${indCode.toLowerCase().slice(0, 5)} ${indCode.toLowerCase().slice(5)} `, plan: "Individual" });
check("individual renewal submitted (spaces/lowercase normalised)", indRenew.status === 201 && indRenew.data?.code === indCode, `${indRenew.status} ${indRenew.data?.code}`);
const reuse = await a.session.call("POST", "/api/student/renewal", { code: indCode, plan: "Individual" });
check("individual code cannot be used by a second person", reuse.status === 400, reuse.data?.message);
const twice = await ind.session.call("POST", "/api/student/renewal", { code: indCode, plan: "Individual" });
check("same student cannot enter the same code twice", twice.status === 400, twice.data?.message);

// --- Group of 4 all in-app ---
const groupCode = mpesaCode("RG");
for (const p of [a, b, c, d]) {
  const r = await p.session.call("POST", "/api/student/renewal", { code: groupCode, plan: "Group" });
  check(`${p.name} enters group code`, r.status === 201, `${r.status} ${r.data?.message ?? ""}`);
}
const fifth = await mixer.session.call("POST", "/api/student/renewal", { code: groupCode, plan: "Group" });
check("5th person blocked from a full group code", fifth.status === 400 && /4 people/.test(fifth.data?.message), fifth.data?.message);

// --- Mixed group: 1 existing member in-app + 3 new people by CSV (unverified -> pending) ---
const mixCode = mpesaCode("RM");
const mixIn = await mixer.session.call("POST", "/api/student/renewal", { code: mixCode, plan: "Group" });
check("mixed group: existing member enters code in-app", mixIn.status === 201, mixIn.data?.message);
const friends = [1, 2].map((i) => ({ name: `QA Friend ${i}`, email: `qa-friend${i}-${RUN}@medeazy.test`, phone: `07140000${i}0` }));
const typoCode = mixCode.slice(0, 9) + (mixCode.endsWith("Z") ? "Y" : "Z");
const csv = ["full_name,email,phone,mpesa_code,plan",
  ...friends.map((f) => `${f.name},${f.email},${f.phone},${mixCode},Group`),
].join("\n");
const csvImport = await admin.call("POST", `/api/admin/classes/${classId}/members/import-confirm`, { csv, verified: false });
check("mixed group: 2 friends uploaded by CSV as pending", csvImport.status === 200 && csvImport.data?.imported?.length === 2
  && csvImport.data.imported.every((r) => r.paymentStatus === "pending"), JSON.stringify(csvImport.data?.imported));
// The 4th member mistypes the code in-app.
const typoIn = await typo.session.call("POST", "/api/student/renewal", { code: typoCode, plan: "Group" });
check("mistyped code accepted as its own 1/4 group", typoIn.status === 201, typoIn.data?.message);

let queue = (await admin.call("GET", "/api/admin/payments")).data;
const group = (code) => queue.find((g) => g.code === code);
check("queue: group code shows 4/4", group(groupCode)?.completeness?.count === 4 && group(groupCode)?.completeness?.required === 4,
  JSON.stringify(group(groupCode)?.completeness));
check("queue: mixed group shows 3/4 before fix", group(mixCode)?.completeness?.count === 3, JSON.stringify(group(mixCode)?.completeness));
check("queue: sources merged (in_app + csv)", ["in_app", "csv"].every((s) => group(mixCode)?.sources?.includes(s)), group(mixCode)?.sources?.join(","));
check("queue: entries show name/email/phone/membership status",
  group(groupCode)?.entries?.every((e) => e.studentName && e.studentEmail && e.phone && e.membershipStatus));

// Admin fixes the typo -> entry joins the mixed group.
const typoEntry = group(typoCode)?.entries?.[0];
const fix = await admin.call("PATCH", `/api/admin/payments/${typoEntry?.id}`, { code: mixCode });
check("admin edits mistyped code", fix.status === 200, `${fix.status} ${fix.data?.message ?? ""}`);
queue = (await admin.call("GET", "/api/admin/payments")).data;
check("mistyped entry re-matched: mixed group now 4/4", group(mixCode)?.completeness?.count === 4 && !group(typoCode),
  JSON.stringify(group(mixCode)?.completeness));

// Approve: 3 of 4 selected first, then the 4th.
const groupIds = group(groupCode).entries.map((e) => e.id);
const partial = await admin.call("POST", "/api/admin/payments/approve", { entryIds: groupIds.slice(0, 3) });
check("approve selected people (3 of 4)", partial.status === 200 && partial.data?.count === 3, `${partial.status} ${partial.data?.message ?? ""}`);
const rest = await admin.call("POST", "/api/admin/payments/approve", { entryIds: groupIds.slice(3) });
check("approve the 4th later", rest.status === 200);
const approveInd = await admin.call("POST", "/api/admin/payments/approve", { entryIds: group(indCode).entries.map((e) => e.id) });
check("approve individual", approveInd.status === 200);
const approveMix = await admin.call("POST", "/api/admin/payments/approve", { entryIds: group(mixCode).entries.map((e) => e.id) });
check("approve mixed group", approveMix.status === 200, `${approveMix.status} ${approveMix.data?.message ?? ""}`);

// Membership rule 5.6: active member -> end of the next cohort after their current end.
const memberships = (await admin.call("GET", `/api/admin/classes/${classId}/members`)).data;
const endOf = (p) => memberships.find((m) => m.id === p.id)?.membershipEndDate;
check("active member renewal -> end of next cohort", endOf(a) === next.endDate, `GA end ${endOf(a)} (current cohort ends ${current.endDate}, next ${next.endDate})`);
const newFriend = memberships.find((m) => String(m.email).toLowerCase() === friends[0].email);
check("new CSV friend -> current cohort", newFriend?.membershipEndDate === current.endDate, `friend end ${newFriend?.membershipEndDate}`);
check("approval email + in-app notification", !!lastEmailTo(a.email)?.includes("payment_approved")
  && JSON.stringify((await a.session.call("GET", "/api/student/notifications")).data).includes("Payment approved"));
check("friend (new, unverified CSV) gets invite only after approval", !!lastEmailTo(friends[0].email)?.includes("set-password"));

// Reject with reason; student can resubmit.
const rejCode = mpesaCode("RR");
const lateP = { name: "QA Late", email: `qa-late-${RUN}@medeazy.test`, phone: "0715000001", code: mpesaCode("SL"), plan: "Individual" };
await onboard(admin, classId, [lateP], PASSWORD);
await admin.call("PUT", `/api/admin/memberships/${lateP.id}`, { cohortId: current.id, startDate: today, endDate: endSoon, reason: "QA" });
await lateP.session.call("POST", "/api/student/renewal", { code: rejCode, plan: "Individual" });
queue = (await admin.call("GET", "/api/admin/payments")).data;
const noReason = await admin.call("POST", "/api/admin/payments/reject", { entryIds: group(rejCode).entries.map((e) => e.id) });
check("reject requires a reason", noReason.status === 400);
const rej = await admin.call("POST", "/api/admin/payments/reject", { entryIds: group(rejCode).entries.map((e) => e.id), reason: "QA: code not found on statement" });
check("reject with reason", rej.status === 200);
const notes = JSON.stringify((await lateP.session.call("GET", "/api/student/notifications")).data);
check("student sees rejection reason", notes.includes("code not found on statement"));
const resubmit = await lateP.session.call("POST", "/api/student/renewal", { code: rejCode, plan: "Individual" });
check("rejected student can submit again (same code)", resubmit.status === 201, `${resubmit.status} ${resubmit.data?.message ?? ""}`);

console.log(`\n${failureCount() === 0 ? "ALL PASSED" : `${failureCount()} FAILED`} (run ${RUN}, class ${classId})`);
process.exit(failureCount() ? 1 : 0);
