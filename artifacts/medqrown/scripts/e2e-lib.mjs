// Shared helpers for the local end-to-end scripts (see e2e-stage14.mjs).
import fs from "node:fs";

export const BASE = process.env.E2E_BASE || "http://localhost:5000";
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) throw new Error("E2E only runs against a local server");

export const accounts = Object.fromEntries(
  fs.readFileSync(".env.test-accounts", "utf8").trim().split(/\r?\n/).map((line) => line.split("=")),
);

let failures = 0;
export const failureCount = () => failures;
export function check(label, ok, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
}

export class Session {
  cookie = "";
  async call(method, path, body, retried = false) {
    let res;
    try {
      res = await fetch(BASE + path, {
        method,
        headers: { "content-type": "application/json", ...(this.cookie ? { cookie: this.cookie } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      // A pooled keep-alive socket can be closed by the server while the script is blocked.
      if (!retried && error?.cause?.code === "ECONNRESET") return this.call(method, path, body, true);
      throw error;
    }
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) this.cookie = setCookie.split(";")[0];
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data };
  }
}

/** Local Nairobi time `offsetMinutes` from now, as YYYY-MM-DDTHH:mm (server parses it as +03:00). */
export const nairobi = (offsetMinutes) =>
  new Date(Date.now() + offsetMinutes * 60000 + 3 * 3600000).toISOString().slice(0, 16);
export const today = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
export const addDays = (date, n) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Latest email written to dev-outbox.log for a recipient (server must run with EMAIL_OUTBOX_ONLY=true). */
export function lastEmailTo(email) {
  const log = fs.existsSync("dev-outbox.log") ? fs.readFileSync("dev-outbox.log", "utf8") : "";
  return log.split("\n=== ").filter((block) => block.includes(`-> ${email}`)).at(-1) || null;
}
export function inviteTokenFor(email) {
  const match = lastEmailTo(email)?.match(/\/student\/set-password\/([^\s]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export const RUN = Date.now().toString(36).slice(-5);
export const mpesaCode = (prefix) => (prefix + RUN.toUpperCase() + "0000000000").replace(/[^A-Z0-9]/g, "").slice(0, 10);

/** Create students in a class via verified CSV, activate their invites and log them in. */
export async function onboard(admin, classId, people, password) {
  const csv = ["full_name,email,phone,mpesa_code,plan",
    ...people.map((p) => `${p.name},${p.email},${p.phone},${p.code},${p.plan}`)].join("\n");
  const imported = await admin.call("POST", `/api/admin/classes/${classId}/members/import-confirm`, { csv, verified: true });
  const members = (await admin.call("GET", `/api/admin/classes/${classId}/members`)).data || [];
  for (const p of people) {
    p.id = members.find((m) => String(m.email).toLowerCase() === p.email)?.id;
    const token = inviteTokenFor(p.email);
    if (token) await new Session().call("POST", "/api/student/set-password", { token, password });
    p.session = new Session();
    await p.session.call("POST", "/api/student/login", { email: p.email, password });
  }
  return imported;
}
