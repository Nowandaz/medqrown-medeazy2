import nodemailer from "nodemailer";
import { pool } from "./db";
import { renderEmailHtml } from "./email-layout";

export type EmailVariables = Record<string, string | number | null | undefined>;
export type EmailResult = { status: "sent" | "failed"; error?: string };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char] as string));
}

function interpolate(text: string, variables: EmailVariables): string {
  return text.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key: string) =>
    String(variables[key] ?? ""));
}

type RenderedEmail = { subject: string; text: string; html: string; replyTo?: string };

async function recordEmail(recipient: string, templateKey: string, result: EmailResult, rendered?: RenderedEmail | null): Promise<void> {
  // A failed email keeps its rendered content so it can be resent from the Email Log.
  await pool.query(
    `INSERT INTO medqrown_email_log (recipient, template_key, status, error, payload, last_attempt_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, CURRENT_TIMESTAMP)`,
    [recipient, templateKey, result.status, result.error ?? null,
      result.status === "failed" && rendered ? JSON.stringify(rendered) : null],
  );
}

export async function logEmailFailure(recipient: string, templateKey: string, error: string): Promise<void> {
  await recordEmail(recipient, templateKey, { status: "failed", error });
}

async function renderEmail(input: {
  templateKey: string;
  variables: EmailVariables;
  subject?: string;
  body?: string;
  html?: string;
  replyTo?: string;
}): Promise<RenderedEmail> {
  let subjectTemplate = input.subject;
  let bodyTemplate = input.body;
  if (subjectTemplate === undefined || bodyTemplate === undefined) {
    const { rows } = await pool.query(
      "SELECT subject, body FROM medqrown_email_templates WHERE template_key = $1",
      [input.templateKey],
    );
    if (!rows[0]) throw new Error(`Email template '${input.templateKey}' was not found`);
    subjectTemplate ??= rows[0].subject;
    bodyTemplate ??= rows[0].body;
  }
  const subject = interpolate(subjectTemplate ?? "", input.variables);
  const text = interpolate(bodyTemplate ?? "", input.variables);
  return {
    subject,
    text,
    html: input.html === undefined
      ? renderEmailHtml(input.templateKey, subject, text, input.variables)
      : interpolate(input.html, input.variables),
    ...(input.replyTo ? { replyTo: input.replyTo } : {}),
  };
}

// One shared, pooled SMTP connection for the whole server. Opening a new
// connection and logging in for every email (and sending a whole class at
// once) makes Gmail refuse the rest with "421 4.3.0 Temporary System Problem".
let sharedTransport: { key: string; transporter: nodemailer.Transporter } | null = null;

function getTransport(user: string, pass: string): nodemailer.Transporter {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number.parseInt(process.env.SMTP_PORT || "587", 10);
  const key = `${host}:${port}:${user}:${pass}`;
  if (sharedTransport?.key !== key) {
    sharedTransport?.transporter.close();
    sharedTransport = {
      key,
      transporter: nodemailer.createTransport({
        pool: true,
        maxConnections: 2,
        maxMessages: 50,
        // At most 2 emails per second; extra sends wait in the queue.
        rateDelta: 1000,
        rateLimit: 2,
        host,
        port,
        secure: false,
        family: 4,
        auth: { user, pass },
        connectionTimeout: 15000,
        greetingTimeout: 10000,
        socketTimeout: 20000,
      } as any),
    };
  }
  return sharedTransport.transporter;
}

/** SMTP 4xx replies and dropped connections are temporary: worth retrying. */
function isTemporaryFailure(error: any): boolean {
  const code = Number(error?.responseCode);
  if (code >= 400 && code < 500) return true;
  return ["ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS", "ECONNRESET"].includes(error?.code);
}

const RETRY_DELAYS_MS = process.env.EMAIL_RETRY_DELAYS_MS
  ? process.env.EMAIL_RETRY_DELAYS_MS.split(",").map(Number)
  : [5_000, 15_000, 45_000];

async function deliverEmail(recipient: string, templateKey: string, email: RenderedEmail,
  variables: EmailVariables = {}): Promise<EmailResult> {
  // EMAIL_OUTBOX_ONLY=true (local testing) never contacts SMTP, even if credentials are present.
  const outboxOnly = process.env.EMAIL_OUTBOX_ONLY === "true";
  const smtpUser = outboxOnly ? undefined : process.env.SMTP_USER;
  const smtpPass = outboxOnly ? undefined : process.env.SMTP_PASS;
  if (process.env.NODE_ENV === "test" || process.env.VITEST) {
    return { status: "failed", error: "Email delivery is disabled in test environments" };
  }
  if (!smtpUser || !smtpPass) {
    if (process.env.NODE_ENV === "development") {
      // Local development without SMTP: keep a copy so invite/reset links can be tested.
      const { appendFile, writeFile, mkdir } = await import("node:fs/promises");
      await mkdir("dev-outbox", { recursive: true });
      await writeFile(`dev-outbox/${templateKey.replace(/[^a-z0-9_-]/gi, "_")}.html`, email.html);
      await appendFile("dev-outbox.log",
        `\n=== ${new Date().toISOString()} ${templateKey} -> ${recipient}\nSubject: ${email.subject}\n${email.text}\n`);
    }
    return { status: "failed", error: "SMTP is not configured (SMTP_USER and SMTP_PASS are required)" };
  }
  const transporter = getTransport(smtpUser, smtpPass);
  for (let attempt = 0; ; attempt++) {
    try {
      const info = await transporter.sendMail({
        from: `"${process.env.SMTP_FROM_NAME || "MedQrown MedEazy"}" <${smtpUser}>`,
        to: recipient,
        ...(email.replyTo ? { replyTo: email.replyTo } : {}),
        subject: email.subject,
        text: email.text,
        html: email.html,
      } as any);
      if (Array.isArray(info.accepted) && info.accepted.length === 0) {
        return {
          status: "failed",
          error: `SMTP rejected recipient${info.rejected?.length === 1 ? "" : "s"}: ${(info.rejected || []).join(", ")}`.slice(0, 4000),
        };
      }
      return { status: "sent" };
    } catch (error: any) {
      if (attempt < RETRY_DELAYS_MS.length && isTemporaryFailure(error)) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
        continue;
      }
      const tries = attempt + 1;
      const message = String(error?.message || error || "Unknown email delivery error");
      return { status: "failed", error: (tries > 1 ? `${message} (after ${tries} tries)` : message).slice(0, 4000) };
    }
  }
}

export async function sendLoggedEmail(input: {
  to: string;
  templateKey: string;
  variables?: EmailVariables;
  subject?: string;
  body?: string;
  html?: string;
  replyTo?: string;
}): Promise<EmailResult> {
  const variables = input.variables ?? {};
  const recipient = typeof input.to === "string" ? input.to : String(input.to ?? "");
  let result: EmailResult;
  let rendered: RenderedEmail | null = null;
  try {
    rendered = await renderEmail({ ...input, variables });
    result = await deliverEmail(recipient, input.templateKey, rendered, variables);
  } catch (error: any) {
    result = { status: "failed", error: String(error?.message || error || "Unknown email delivery error").slice(0, 4000) };
  }
  // Logging is mandatory even when delivery/configuration fails. Let persistence
  // errors surface instead of falsely reporting a completed delivery.
  await recordEmail(recipient, input.templateKey, result, rendered);
  return result;
}

/**
 * Announcement emails logged before content was saved can be rebuilt: the
 * announcement is the latest one in the recipient's classes posted shortly
 * before the email was logged.
 */
async function rebuildAnnouncementEmail(logId: number): Promise<RenderedEmail | null> {
  const { rows } = await pool.query(
    `SELECT a.title, a.message, a.link, s.name
       FROM medqrown_email_log l
       JOIN students s ON LOWER(s.email) = LOWER(l.recipient)
       JOIN medqrown_class_students cs ON cs.student_id = s.id
       JOIN medqrown_class_announcements a ON a.class_id = cs.class_id
      WHERE l.id = $1
        AND a.created_at <= l.created_at + interval '1 minute'
        AND a.created_at >= l.created_at - interval '30 minutes'
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT 1`,
    [logId],
  );
  if (!rows[0]) return null;
  return renderEmail({
    templateKey: "announcement",
    variables: {
      student_name: rows[0].name,
      announcement_title: rows[0].title,
      announcement_message: rows[0].message,
      announcement_link: rows[0].link || "",
    },
  });
}

export type ResendResult = { id: number; recipient?: string; status: "sent" | "failed" | "skipped"; error?: string };

/** Resends a failed email from the log and updates that log entry with the outcome. */
export async function resendLoggedEmail(id: number): Promise<ResendResult> {
  const { rows } = await pool.query(
    `SELECT id, recipient, template_key AS "templateKey", status, payload
       FROM medqrown_email_log WHERE id = $1`,
    [id],
  );
  const entry = rows[0];
  if (!entry) return { id, status: "skipped", error: "Log entry not found" };
  if (entry.status === "sent") return { id, recipient: entry.recipient, status: "skipped", error: "Already sent" };
  let email: RenderedEmail | null = entry.payload ?? null;
  try {
    if (!email && entry.templateKey === "announcement") email = await rebuildAnnouncementEmail(id);
  } catch {
    email = null;
  }
  if (!email) {
    return { id, recipient: entry.recipient, status: "skipped",
      error: "This email's content wasn't saved (it failed before resending was added)" };
  }
  const result = await deliverEmail(entry.recipient, entry.templateKey, email);
  await pool.query(
    `UPDATE medqrown_email_log
        SET status = $2, error = $3, attempts = attempts + 1, last_attempt_at = CURRENT_TIMESTAMP,
            payload = CASE WHEN $2 = 'sent' THEN NULL ELSE $4::jsonb END
      WHERE id = $1`,
    [id, result.status, result.error ?? null, JSON.stringify(email)],
  );
  return { id, recipient: entry.recipient, status: result.status, error: result.error };
}

export async function getEmailTemplate(templateKey: string): Promise<{ subject: string; body: string } | null> {
  const { rows } = await pool.query(
    "SELECT subject, body FROM medqrown_email_templates WHERE template_key = $1",
    [templateKey],
  );
  return rows[0] ?? null;
}