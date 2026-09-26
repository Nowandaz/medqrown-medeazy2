import type { Express, RequestHandler } from "express";
import { pool } from "./db";
import { sendLoggedEmail } from "./stage11-email";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const contactSubmissionHits = new Map<string, { count: number; windowStart: number }>();
const CONTACT_WINDOW_MS = 60 * 60 * 1000;
const CONTACT_MAX_PER_WINDOW = 5;

function validGoogleFormUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2000) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      && (url.hostname === "forms.gle" || url.hostname === "docs.google.com")
      && (url.hostname === "forms.gle" || url.pathname.startsWith("/forms/"));
  } catch {
    return false;
  }
}

async function sendCohortInvitation(email: string, name: string, formUrl: string): Promise<boolean> {
  const result = await sendLoggedEmail({
    to: email,
    templateKey: "waitlist_registration_open",
    variables: { student_name: name, renew_link: formUrl },
  });
  return result.status === "sent";
}

/** Persists Site settings and sends only first-open invitation emails. */
export async function updateStage9SiteSettings(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const currentResult = await pool.query("SELECT key, value FROM site_settings");
  const current = Object.fromEntries(currentResult.rows.map((row: any) => [row.key, row.value])) as Record<string, any>;
  const next = { ...current, ...input };
  if (Object.prototype.hasOwnProperty.call(input, "registrationOpen")
      && typeof input.registrationOpen !== "boolean") {
    throw Object.assign(new Error("registrationOpen must be a boolean"), { status: 400 });
  }
  if (Object.prototype.hasOwnProperty.call(input, "googleFormUrl")
      && input.googleFormUrl !== "" && !validGoogleFormUrl(input.googleFormUrl)) {
    throw Object.assign(new Error("googleFormUrl must be a valid HTTPS Google Forms link"), { status: 400 });
  }
  for (const key of ["registrationOpensAt", "registrationClosesAt"]) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
    const value = input[key];
    if (value === null || value === "") { input[key] = null; continue; }
    if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
      throw Object.assign(new Error("Scheduled open/close times must be valid dates"), { status: 400 });
    }
    input[key] = new Date(value).toISOString();
  }
  if (input.registrationOpensAt && input.registrationClosesAt
      && Date.parse(String(input.registrationClosesAt)) <= Date.parse(String(input.registrationOpensAt))) {
    throw Object.assign(new Error("The closing time must be after the opening time"), { status: 400 });
  }
  if (next.registrationOpen === true && !validGoogleFormUrl(next.googleFormUrl)) {
    throw Object.assign(new Error("A valid Google Form URL is required before opening registration"), { status: 400 });
  }

  for (const [key, value] of Object.entries(input)) {
    await pool.query(
      `INSERT INTO site_settings (key, value) VALUES ($1, $2::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, JSON.stringify(value)],
    );
  }

  const openedNow = current.registrationOpen !== true && next.registrationOpen === true;
  let delivery: Record<string, number | boolean> | undefined;
  if (openedNow) {
    const { rows } = await pool.query(
      `UPDATE medqrown_waitlist SET invitation_email_sent_at = CURRENT_TIMESTAMP
        WHERE invitation_email_sent_at IS NULL
        RETURNING id, name, email`,
    );
    let sent = 0;
    const failedIds: number[] = [];
    // Never send during startup: this function only runs from an explicit admin mutation.
    for (const recipient of rows) {
      if (await sendCohortInvitation(recipient.email, recipient.name, next.googleFormUrl)) sent++;
      else failedIds.push(Number(recipient.id));
    }
    delivery = {
      recipients: rows.length,
      emailSent: sent,
      emailFailed: rows.length - sent,
      emailPendingConfiguration: !process.env.SMTP_USER || !process.env.SMTP_PASS,
    };
    // Failed / unconfigured deliveries remain eligible for a later open transition.
    if (failedIds.length) {
      await pool.query(
        `UPDATE medqrown_waitlist SET invitation_email_sent_at = NULL WHERE id = ANY($1::bigint[])`,
        [failedIds],
      );
    }
  }
  const settingsResult = await pool.query("SELECT key, value FROM site_settings");
  const settings = Object.fromEntries(settingsResult.rows.map((row: any) => [row.key, row.value]));
  return delivery ? { ...settings, delivery } : settings;
}

export function registerStage9Routes(app: Express, requireAdmin: RequestHandler): void {
  app.post("/api/contact", async (req, res) => {
    const clientKey = req.ip || "unknown";
    const now = Date.now();
    const hit = contactSubmissionHits.get(clientKey);
    if (!hit || now - hit.windowStart > CONTACT_WINDOW_MS) {
      contactSubmissionHits.set(clientKey, { count: 1, windowStart: now });
    } else if (++hit.count > CONTACT_MAX_PER_WINDOW) {
      return res.status(429).json({ message: "Too many messages. Please try again later." });
    }
    if (contactSubmissionHits.size > 10000) contactSubmissionHits.clear();

    const { name, email, institution, context, subject, message, website } = req.body || {};
    // Preserve the existing contact form honeypot behavior without storing spam.
    if (typeof website === "string" && website.trim()) {
      return res.json({ ok: true, message: "Your message has been received." });
    }
    const senderName = typeof name === "string" ? name.trim() : "";
    const senderEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    const senderContextValue = context ?? subject ?? institution;
    const senderContext = typeof senderContextValue === "string" ? senderContextValue.trim() : "";
    const senderMessage = typeof message === "string" ? message.trim() : "";
    if (!senderName || senderName.length > 200 || /[\u0000-\u001f\u007f]/.test(senderName)
        || !emailPattern.test(senderEmail) || senderEmail.length > 254
        || senderContext.length > 300 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(senderContext)
        || !senderMessage || senderMessage.length > 5000) {
      return res.status(400).json({ message: "Enter a valid name, email address, and message (up to 5,000 characters)." });
    }

    try {
      const { rows } = await pool.query(
        `INSERT INTO medqrown_contact_messages (name, email, context, message)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [senderName, senderEmail, senderContext || null, senderMessage],
      );
      let notificationStatus = "pending";
      const contactTo = process.env.CONTACT_EMAIL || process.env.SMTP_USER;
      if (contactTo) {
        const result = await sendLoggedEmail({
          to: contactTo,
          templateKey: "custom:website_contact",
          subject: `Website contact message${senderContext ? ` — ${senderContext}` : ""}`,
          body: `Name: ${senderName}\nEmail: ${senderEmail}${senderContext ? `\nTopic: ${senderContext}` : ""}\n\n${senderMessage}`,
          replyTo: senderEmail,
        });
        notificationStatus = result.status;
        await pool.query(
          `UPDATE medqrown_contact_messages SET notification_status = $2,
              email_sent_at = CASE WHEN $2 = 'sent' THEN CURRENT_TIMESTAMP ELSE email_sent_at END
            WHERE id = $1`,
          [rows[0].id, result.status],
        );
      }
      res.status(201).json({ ok: true, message: "Your message has been received.", notificationStatus });
    } catch {
      res.status(500).json({ message: "We could not save your message. Please try again later." });
    }
  });

  app.post("/api/waitlist", async (req, res) => {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const phone = typeof req.body?.phone === "string" ? req.body.phone.trim() : "";
    const rawSource = typeof req.body?.source === "string" ? req.body.source : req.query.src;
    const source = typeof rawSource === "string" && /^[a-z0-9_-]{1,60}$/i.test(rawSource.trim())
      ? rawSource.trim().toLowerCase() : null;
    const sessionId = typeof req.body?.sessionId === "string" && /^[a-zA-Z0-9_-]{8,80}$/.test(req.body.sessionId)
      ? req.body.sessionId : null;
    if ((rawSource !== undefined && rawSource !== null
        && (typeof rawSource !== "string" || !/^[a-z0-9_-]{1,60}$/i.test(rawSource.trim())))
        || (req.body?.sessionId !== undefined && sessionId === null)) {
      return res.status(400).json({ message: "source must be a short tag and sessionId must be an anonymous session identifier" });
    }
    const { rows: settingRows } = await pool.query("SELECT value FROM site_settings WHERE key = 'registrationOpen'");
    if (settingRows[0]?.value === true) {
      return res.status(409).json({ message: "Registration is open; use the cohort signup form instead." });
    }
    if (!name || name.length > 250 || /[\u0000-\u001f\u007f]/.test(name)
        || !emailPattern.test(email) || email.length > 254
        || !/^\+?[0-9\s().-]{7,24}$/.test(phone)) {
      return res.status(400).json({ message: "Provide a valid name, email address and phone number." });
    }
    const { rows } = await pool.query(
      `INSERT INTO medqrown_waitlist (name, email, phone, source, session_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (LOWER(email)) DO NOTHING
       RETURNING id`,
      [name, email, phone, source, sessionId],
    );
    if (!rows[0]) {
      return res.json({ ok: true, alreadyRegistered: true });
    }
    res.status(201).json({ ok: true, alreadyRegistered: false });
  });

  app.get("/api/admin/waitlist", requireAdmin, async (req, res) => {
    const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 250) : "";
    const { rows } = await pool.query(
      `SELECT id, name, email, phone, source, invitation_email_sent_at AS "invitationEmailSentAt",
              created_at AS "createdAt"
         FROM medqrown_waitlist
        WHERE ($1::text = '' OR name ILIKE '%' || $1 || '%' OR email ILIKE '%' || $1 || '%' OR phone ILIKE '%' || $1 || '%')
        ORDER BY created_at DESC, id DESC`,
      [search],
    );
    res.json(rows);
  });

  app.get("/api/admin/waitlist/export.csv", requireAdmin, async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT name, email, phone, created_at AS "createdAt"
         FROM medqrown_waitlist ORDER BY created_at DESC, id DESC`,
    );
    const csvCell = (value: unknown) => {
      let cell = String(value ?? "");
      if (/^[\s]*[=+\-@]/.test(cell)) cell = `'${cell}`;
      return `"${cell.replace(/"/g, '""')}"`;
    };
    const lines = [
      ["Name", "Email", "Phone", "Joined at"].map(csvCell).join(","),
      ...rows.map((row: any) => [row.name, row.email, row.phone, row.createdAt].map(csvCell).join(",")),
    ];
    res.type("text/csv").attachment("medqrown-waitlist.csv").send(lines.join("\r\n"));
  });

  app.delete("/api/admin/waitlist/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: "Invalid waitlist id" });
    const { rowCount } = await pool.query("DELETE FROM medqrown_waitlist WHERE id = $1", [id]);
    if (!rowCount) return res.status(404).json({ message: "Waitlist entry not found" });
    res.json({ deleted: true });
  });

  app.get("/api/admin/waitlist/resend-count", requireAdmin, async (_req, res) => {
    const { rows } = await pool.query("SELECT COUNT(*)::int AS count FROM medqrown_waitlist");
    res.json({ count: rows[0]?.count ?? 0 });
  });

  app.post("/api/admin/waitlist/resend", requireAdmin, async (req, res) => {
    const { rows: settingRows } = await pool.query(
      "SELECT key, value FROM site_settings WHERE key IN ('googleFormUrl', 'registrationOpen')",
    );
    const resendSettings = Object.fromEntries(settingRows.map((setting: any) => [setting.key, setting.value]));
    const formUrl = resendSettings.googleFormUrl;
    if (resendSettings.registrationOpen !== true) {
      return res.status(409).json({ message: "Open registration before resending the cohort signup link." });
    }
    if (!validGoogleFormUrl(formUrl)) {
      return res.status(400).json({ message: "Save a valid Google Form URL before resending invitations." });
    }
    const { rows } = await pool.query("SELECT id, name, email FROM medqrown_waitlist ORDER BY id");
    if (!Number.isInteger(req.body?.confirmedCount) || req.body.confirmedCount !== rows.length) {
      return res.status(409).json({ message: "Waitlist count changed; confirm the current recipient count before resending.", count: rows.length });
    }
    let sent = 0;
    for (const recipient of rows) {
      if (await sendCohortInvitation(recipient.email, recipient.name, formUrl)) sent++;
    }
    res.json({
      recipients: rows.length,
      emailSent: sent,
      emailFailed: rows.length - sent,
      emailPendingConfiguration: !process.env.SMTP_USER || !process.env.SMTP_PASS,
    });
  });

  /** Custom message to everyone on the waitlist ({student_name} is replaced per person). */
  app.post("/api/admin/waitlist/email", requireAdmin, async (req, res) => {
    const subject = typeof req.body?.subject === "string" ? req.body.subject.trim() : "";
    const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
    if (!subject || subject.length > 300 || !body || body.length > 10000) {
      return res.status(400).json({ message: "Write a subject (up to 300 characters) and a message." });
    }
    const { rows } = await pool.query("SELECT id, name, email FROM medqrown_waitlist ORDER BY id");
    if (!Number.isInteger(req.body?.confirmedCount) || req.body.confirmedCount !== rows.length) {
      return res.status(409).json({ message: "The waitlist changed. Check the number of recipients and confirm again.", count: rows.length });
    }
    let sent = 0;
    for (const recipient of rows) {
      const result = await sendLoggedEmail({
        to: recipient.email, templateKey: "custom:waitlist_message",
        subject, body, variables: { student_name: recipient.name },
      });
      if (result.status === "sent") sent++;
    }
    res.json({ recipients: rows.length, emailSent: sent, emailFailed: rows.length - sent });
  });

  app.post("/api/demo/saq-submit", async (req, res) => {
    const examId = Number(req.body?.examId);
    const questionId = Number(req.body?.questionId);
    const sessionId = req.body?.sessionId;
    const response = req.body?.response;
    if (!Number.isInteger(examId) || examId < 1 || !Number.isInteger(questionId) || questionId < 1
        || typeof sessionId !== "string" || !/^[a-zA-Z0-9_-]{8,80}$/.test(sessionId)
        || typeof response !== "string" || !response.trim() || response.length > 10000) {
      return res.status(400).json({ message: "A valid demo question, session and short-answer response are required." });
    }
    const { rows } = await pool.query(
      `SELECT q.id, q.model_answer AS "modelAnswer", q.marking_points AS "markingPoints"
         FROM demo_questions q
         JOIN demo_exams e ON e.id = q.demo_exam_id
        WHERE q.id = $1 AND q.demo_exam_id = $2 AND q.type = 'saq' AND e.is_active = true`,
      [questionId, examId],
    );
    if (!rows[0]) return res.status(404).json({ message: "Demo short-answer question not found." });
    if (typeof rows[0].modelAnswer !== "string" || !rows[0].modelAnswer.trim()
        || typeof rows[0].markingPoints !== "string" || !rows[0].markingPoints.trim()) {
      return res.status(409).json({ message: "The model answer and marking points have not been authored for this demo question yet." });
    }
    await pool.query(
      `INSERT INTO demo_engagement_events
         (demo_exam_id, question_id, event_type, session_id, response_length)
       VALUES ($1, $2, 'saq_submitted', $3, $4)`,
      [examId, questionId, sessionId, response.trim().length],
    );
    res.json({
      modelAnswer: rows[0].modelAnswer || "",
      markingPoints: rows[0].markingPoints || "",
    });
  });
}

/**
 * Scheduled registration: opens / closes registration at the times set in Admin → Site.
 * Opening goes through updateStage9SiteSettings, so the waitlist email is sent once as usual.
 * Each schedule entry is cleared once applied, so a manual change afterwards sticks.
 */
export async function applyRegistrationSchedule(): Promise<void> {
  const { rows } = await pool.query(
    "SELECT key, value FROM site_settings WHERE key IN ('registrationOpen', 'registrationOpensAt', 'registrationClosesAt', 'googleFormUrl')",
  );
  const settings = Object.fromEntries(rows.map((row: any) => [row.key, row.value])) as Record<string, any>;
  const now = Date.now();
  const opensAt = settings.registrationOpensAt ? Date.parse(settings.registrationOpensAt) : NaN;
  const closesAt = settings.registrationClosesAt ? Date.parse(settings.registrationClosesAt) : NaN;
  if (!Number.isNaN(closesAt) && closesAt <= now) {
    await updateStage9SiteSettings({ registrationOpen: false, registrationClosesAt: null,
      ...(!Number.isNaN(opensAt) && opensAt <= now ? { registrationOpensAt: null } : {}) });
    return;
  }
  if (!Number.isNaN(opensAt) && opensAt <= now) {
    if (settings.registrationOpen !== true && validGoogleFormUrl(settings.googleFormUrl)) {
      await updateStage9SiteSettings({ registrationOpen: true, registrationOpensAt: null });
    } else {
      await updateStage9SiteSettings({ registrationOpensAt: null });
    }
  }
}
