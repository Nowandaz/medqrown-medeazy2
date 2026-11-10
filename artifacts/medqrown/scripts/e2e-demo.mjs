// Public demo: admin picks exam questions (MCQ with image, short answer, short answer with parts),
// a visitor gets them without answers, is marked on submit, can't resubmit, and is rate limited.
// Run like e2e-stage14.mjs (local server with EMAIL_OUTBOX_ONLY=true, staging database).
import { BASE, Session, check, failureCount, accounts, RUN, nairobi } from "./e2e-lib.mjs";

/** A visitor's browser: keeps every cookie the server sets. */
class Visitor {
  cookies = new Map();
  async call(method, path, body) {
    const res = await fetch(BASE + path, {
      method, headers: { "content-type": "application/json", cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ") },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      this.cookies.set(pair.slice(0, i), pair.slice(i + 1));
    }
    let data = null;
    try { data = await res.json(); } catch { /* empty */ }
    return { status: res.status, data };
  }
}

const admin = new Session();
await admin.call("POST", "/api/admin/login", { email: accounts.QA_ADMIN_EMAIL, password: accounts.QA_ADMIN_PASSWORD });

// Park whatever is in the demo pool now, so this run only sees its own questions.
const before = (await admin.call("GET", "/api/admin/demo")).data;
const parked = before.questions.map((q) => q.id);
for (const id of parked) await admin.call("DELETE", `/api/admin/demo/questions/${id}`);

const classId = (await admin.call("POST", "/api/admin/classes", { name: `QA Demo ${RUN}` })).data.id;
const exam = (await admin.call("POST", "/api/exams", { title: `QA Demo source ${RUN}`, classId, durationMinutes: 10, maxAttempts: 1,
  opensAt: nairobi(60 * 24 * 30), closesAt: nairobi(60 * 24 * 31), status: "draft" })).data;
check("test exam created", !!exam?.id, JSON.stringify(exam).slice(0, 200));
const add = async (q) => (await admin.call("POST", `/api/exams/${exam.id}/questions`, q)).data;
const mcq = await add({ type: "mcq", content: `QA demo MCQ ${RUN}: which nerve supplies biceps?`, marks: 1, explanation: "Musculocutaneous (C5-6).",
  imageUrl: "https://placehold.co/600x300.png",
  options: ["Radial", "Musculocutaneous", "Median", "Ulnar", "Axillary"].map((c, i) => ({ content: c, isCorrect: i === 1 })) });
const saq = await add({ type: "saq", content: `QA demo SAQ ${RUN}: name the largest artery.`, marks: 1, expectedAnswer: "Aorta" });
const parts = await add({ type: "saq", content: `QA demo parts ${RUN}: the brachial plexus.`, marks: 2, hasSubquestions: true,
  subquestions: [{ content: "Root values?", marks: 1, expectedAnswer: "C5-T1" }, { content: "Nerve to deltoid?", marks: 1, expectedAnswer: "Axillary" }] });
const broken = await add({ type: "saq", content: `QA demo no answer ${RUN}`, marks: 1 });

for (const q of [mcq, saq, parts]) {
  const r = await admin.call("PUT", `/api/admin/demo/questions/${q.id}`);
  check(`admin adds question ${q.id} to the demo`, r.status === 200, r.data?.message);
}
const refused = await admin.call("PUT", `/api/admin/demo/questions/${broken.id}`);
check("a short answer without an expected answer is refused", refused.status === 400, refused.data?.message);

const info = (await new Visitor().call("GET", "/api/demo/info")).data;
check("demo info: available with 3 questions and a time limit", info.available && info.questionCount === 3 && info.durationMinutes > 0, JSON.stringify(info));

const v = new Visitor();
const start = await v.call("POST", "/api/demo/start", { src: "e2e" });
check("visitor starts the demo", start.status === 200 && start.data.questions?.length === 3, start.data?.message);
const leaked = JSON.stringify(start.data);
check("questions arrive without answers", !/isCorrect|expectedAnswer|Aorta|C5-T1|explanation/.test(leaked));
const shownMcq = start.data.questions.find((q) => q.id === mcq.id);
const rightPos = shownMcq.options.indexOf("Musculocutaneous");
check("MCQ options arrive (in a shuffled order)", shownMcq.options.length === 5 && rightPos >= 0);
const pq = start.data.questions.find((q) => q.id === parts.id);
check("image and sub-question parts are included", shownMcq.imageUrl && pq?.parts?.length === 2);

const answers = {
  [mcq.id]: { option: rightPos },
  [saq.id]: { text: "The aorta" },
  [parts.id]: { parts: { [pq.parts[0].id]: "C5 to T1", [pq.parts[1].id]: "x".repeat(1500) } },
};
const res = await v.call("POST", "/api/demo/submit", { attemptId: start.data.attemptId, answers });
check("submit marks the attempt", res.status === 200 && typeof res.data.score === "number", res.data?.message);
const mcqResult = res.data.questions.find((q) => q.id === mcq.id);
check("MCQ marked correct with explanation", mcqResult.correct === true && mcqResult.awarded === 1 && mcqResult.explanation);
check("correct option reported at the position the visitor saw", mcqResult.correctOptions[0] === rightPos && mcqResult.chosen === rightPos);
const partsResult = res.data.questions.find((q) => q.id === parts.id);
check("overlong answer is cut to 1000 characters", partsResult.parts[1].answer.length === 1000);
if (res.data.shortAnswersLocked) {
  check("no demo AI key: short answers locked, MCQ still scored", res.data.score === 1 && partsResult.awarded === null);
} else {
  check("short answers marked by the demo AI", partsResult.parts.every((p) => typeof p.feedback === "string"));
}
const again = await v.call("POST", "/api/demo/submit", { attemptId: start.data.attemptId, answers });
check("the same attempt can't be marked twice", again.status === 410);

const stranger = new Visitor();
const stolen = await stranger.call("POST", "/api/demo/submit", { attemptId: start.data.attemptId, answers });
check("another browser can't submit someone's attempt", stolen.status === 410);

const second = await v.call("POST", "/api/demo/start", {});
check("second go in 30 minutes is allowed", second.status === 200);
const third = await v.call("POST", "/api/demo/start", {});
check("third go in 30 minutes is refused politely", third.status === 429 && /breather|try again/i.test(third.data?.message || ""), third.data?.message);

const stats = (await admin.call("GET", "/api/admin/demo")).data;
check("admin sees starts by source", stats.stats.sources.some((s) => s.src === "e2e"));

// Tidy up: restore the pool and remove this run's exam.
for (const q of [mcq, saq, parts]) await admin.call("DELETE", `/api/admin/demo/questions/${q.id}`);
for (const id of parked) await admin.call("PUT", `/api/admin/demo/questions/${id}`);
await admin.call("DELETE", `/api/exams/${exam.id}`);

console.log(`\n${failureCount() === 0 ? "ALL PASSED" : `${failureCount()} FAILED`} (run ${RUN})`);
process.exit(failureCount() ? 1 : 0);
