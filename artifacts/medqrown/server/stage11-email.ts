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

async function recordEmail(recipient: string, templateKey: string, result: EmailResult): Promise<void> {
  await pool.query(
    `INSERT INTO medqrown_email_log (recipient, template_key, status, error)
     VALUES ($1, $2, $3, $4)`,
    [recipient, templateKey, result.status, result.error ?? null],
  );
}

export async function logEmailFailure(recipient: string, templateKey: string, error: string): Promise<void> {
  await recordEmail(recipient, templateKey, { status: "failed", error });
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
  let result: EmailResult;
  const recipient = typeof input.to === "string" ? input.to : String(input.to ?? "");
  try {
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
    const subject = interpolate(subjectTemplate ?? "", variables);
    const text = interpolate(bodyTemplate ?? "", variables);
    // EMAIL_OUTBOX_ONLY=true (local testing) never contacts SMTP, even if credentials are present.
    const outboxOnly = process.env.EMAIL_OUTBOX_ONLY === "true";
    const smtpUser = outboxOnly ? undefined : process.env.SMTP_USER;
    const smtpPass = outboxOnly ? undefined : process.env.SMTP_PASS;
    if (process.env.NODE_ENV === "test" || process.env.VITEST) {
      result = { status: "failed", error: "Email delivery is disabled in test environments" };
    } else if (!smtpUser || !smtpPass) {
      if (process.env.NODE_ENV === "development") {
        // Local development without SMTP: keep a copy so invite/reset links can be tested.
        const { appendFile, writeFile, mkdir } = await import("node:fs/promises");
        await mkdir("dev-outbox", { recursive: true });
        await writeFile(`dev-outbox/${input.templateKey.replace(/[^a-z0-9_-]/gi, "_")}.html`,
          renderEmailHtml(input.templateKey, subject, text, variables));
        await appendFile("dev-outbox.log",
          `\n=== ${new Date().toISOString()} ${input.templateKey} -> ${recipient}\nSubject: ${subject}\n${text}\n`);
      }
      result = { status: "failed", error: "SMTP is not configured (SMTP_USER and SMTP_PASS are required)" };
    } else {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        port: Number.parseInt(process.env.SMTP_PORT || "587", 10),
        secure: false,
        family: 4,
        auth: { user: smtpUser, pass: smtpPass },
        connectionTimeout: 15000,
        greetingTimeout: 10000,
        socketTimeout: 20000,
      } as any);
      const info = await transporter.sendMail({
        from: `"${process.env.SMTP_FROM_NAME || "MedQrown MedEazy"}" <${smtpUser}>`,
        to: recipient,
        ...(input.replyTo ? { replyTo: input.replyTo } : {}),
        subject,
        text,
        html: input.html === undefined
          ? renderEmailHtml(input.templateKey, subject, text, variables)
          : interpolate(input.html, variables),
      } as any);
      if (Array.isArray(info.accepted) && info.accepted.length === 0) {
        result = {
          status: "failed",
          error: `SMTP rejected recipient${info.rejected?.length === 1 ? "" : "s"}: ${(info.rejected || []).join(", ")}`.slice(0, 4000),
        };
      } else {
        result = { status: "sent" };
      }
    }
  } catch (error: any) {
    result = { status: "failed", error: String(error?.message || error || "Unknown email delivery error").slice(0, 4000) };
  }
  // Logging is mandatory even when delivery/configuration fails. Let persistence
  // errors surface instead of falsely reporting a completed delivery.
  await recordEmail(recipient, input.templateKey, result);
  return result;
}

export async function getEmailTemplate(templateKey: string): Promise<{ subject: string; body: string } | null> {
  const { rows } = await pool.query(
    "SELECT subject, body FROM medqrown_email_templates WHERE template_key = $1",
    [templateKey],
  );
  return rows[0] ?? null;
}