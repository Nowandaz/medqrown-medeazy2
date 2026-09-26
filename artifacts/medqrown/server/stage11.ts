import type { Express, RequestHandler } from "express";
import { pool } from "./db";
import { logEmailFailure, sendLoggedEmail } from "./stage11-email";
import { STAGE11_TEMPLATES } from "./stage11-migration";

const validTemplateKeys = new Set<string>(STAGE11_TEMPLATES.map((template) => template.key));
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function registerStage11Routes(app: Express, requireAdmin: RequestHandler): void {
  app.get("/api/admin/settings/email-templates", requireAdmin, async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT template_key AS "templateKey", name, subject, body,
              updated_at AS "updatedAt"
         FROM medqrown_email_templates ORDER BY id`,
    );
    res.json(rows);
  });

  app.patch("/api/admin/settings/email-templates/:templateKey", requireAdmin, async (req, res) => {
    const key = String(req.params.templateKey);
    const { subject, body } = req.body ?? {};
    if (!validTemplateKeys.has(key)) return res.status(404).json({ message: "Email template not found" });
    if (typeof subject !== "string" || !subject.trim() || subject.length > 500
        || typeof body !== "string" || !body.trim() || body.length > 20000) {
      return res.status(400).json({ message: "subject (1–500 characters) and body (1–20,000 characters) are required" });
    }
    const { rows } = await pool.query(
      `UPDATE medqrown_email_templates SET subject = $2, body = $3, updated_at = CURRENT_TIMESTAMP
        WHERE template_key = $1
        RETURNING template_key AS "templateKey", name, subject, body, updated_at AS "updatedAt"`,
      [key, subject.trim(), body.trim()],
    );
    if (!rows[0]) return res.status(404).json({ message: "Email template not found" });
    res.json(rows[0]);
  });

  app.get("/api/admin/settings/email-log", requireAdmin, async (req, res) => {
    const page = req.query.page === undefined ? 1 : Number(req.query.page);
    const pageSize = req.query.pageSize === undefined ? 25 : Number(req.query.pageSize);
    const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 254) : "";
    const templateKey = typeof req.query.templateKey === "string" ? req.query.templateKey.trim() : "";
    const status = typeof req.query.status === "string" ? req.query.status : "";
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100
        || (status && !["sent", "failed"].includes(status))) {
      return res.status(400).json({ message: "page must be positive, pageSize 1–100, and status sent or failed" });
    }
    const offset = (page - 1) * pageSize;
    const filterValues = [search, templateKey, status];
    const count = await pool.query(
      `SELECT COUNT(*)::int AS total FROM medqrown_email_log
        WHERE ($1 = '' OR recipient ILIKE '%' || $1 || '%' OR template_key ILIKE '%' || $1 || '%')
          AND ($2 = '' OR template_key = $2)
          AND ($3 = '' OR status = $3)`,
      filterValues,
    );
    const { rows } = await pool.query(
      `SELECT id, recipient, template_key AS "templateKey", status, error,
              created_at AS "createdAt"
         FROM medqrown_email_log
        WHERE ($1 = '' OR recipient ILIKE '%' || $1 || '%' OR template_key ILIKE '%' || $1 || '%')
          AND ($2 = '' OR template_key = $2)
          AND ($3 = '' OR status = $3)
        ORDER BY created_at DESC, id DESC LIMIT $4 OFFSET $5`,
      [...filterValues, pageSize, offset],
    );
    res.json({ items: rows, page, pageSize, total: count.rows[0]?.total ?? 0 });
  });

  app.delete("/api/admin/settings/email-log/:id", requireAdmin, async (req, res) => {
    const { rowCount } = await pool.query("DELETE FROM medqrown_email_log WHERE id = $1", [Number(req.params.id)]);
    if (!rowCount) return res.status(404).json({ message: "Log entry not found" });
    res.json({ deleted: rowCount });
  });

  /** Deletes every log entry matching the same filters as the list (all entries when none are given). */
  app.delete("/api/admin/settings/email-log", requireAdmin, async (req: any, res) => {
    const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 254) : "";
    const templateKey = typeof req.query.templateKey === "string" ? req.query.templateKey.trim() : "";
    const status = typeof req.query.status === "string" ? req.query.status : "";
    if (status && !["sent", "failed"].includes(status)) return res.status(400).json({ message: "status must be sent or failed" });
    const { rowCount } = await pool.query(
      `DELETE FROM medqrown_email_log
        WHERE ($1 = '' OR recipient ILIKE '%' || $1 || '%' OR template_key ILIKE '%' || $1 || '%')
          AND ($2 = '' OR template_key = $2 OR ($2 = 'custom' AND template_key LIKE 'custom:%'))
          AND ($3 = '' OR status = $3)`,
      [search, templateKey, status],
    );
    await pool.query("INSERT INTO audit_logs (admin_id, action, details) VALUES ($1, $2, $3)",
      [req.admin.id, "email_log_deleted", `Deleted ${rowCount} email log entries`]);
    res.json({ deleted: rowCount });
  });

  app.post("/api/admin/classes/:classId/emails", requireAdmin, async (req: any, res) => {
    const classId = Number(req.params.classId);
    const studentIds = req.body?.studentIds;
    const templateKey = typeof req.body?.templateKey === "string" ? req.body.templateKey : "";
    const customSubject = req.body?.subject;
    const customBody = req.body?.body;
    if (!Number.isInteger(classId) || classId < 1
        || (studentIds !== undefined && (!Array.isArray(studentIds)
          || studentIds.length === 0
          || studentIds.some((id: unknown) => !Number.isInteger(id) || Number(id) < 1)))
        || !Number.isInteger(req.body?.confirmedCount) || req.body.confirmedCount < 1) {
      return res.status(400).json({ message: "Provide a valid class, optional non-empty studentIds, and confirmedCount" });
    }
    const usingCustom = customSubject !== undefined || customBody !== undefined;
    if ((usingCustom && (typeof customSubject !== "string" || !customSubject.trim() || customSubject.length > 500
        || typeof customBody !== "string" || !customBody.trim() || customBody.length > 20000))
        || (!usingCustom && !validTemplateKeys.has(templateKey))) {
      return res.status(400).json({ message: "Provide a valid templateKey or custom subject and body" });
    }
    const klass = await pool.query("SELECT id FROM medqrown_classes WHERE id = $1", [classId]);
    if (!klass.rows[0]) return res.status(404).json({ message: "Class not found" });

    const requestedIds = studentIds === undefined ? null : [...new Set<number>(studentIds)];
    const recipientQuery = await pool.query(
      `SELECT s.id, s.name, s.email, m.end_date::text AS "cohortEnd",
              settings.paybill, settings.account_number AS "accountNumber"
         FROM medqrown_class_students cs
         JOIN students s ON s.id = cs.student_id
         LEFT JOIN medqrown_memberships m ON m.student_id = s.id
         CROSS JOIN medqrown_settings settings
        WHERE cs.class_id = $1 AND ($2::int[] IS NULL OR s.id = ANY($2::int[]))
        ORDER BY s.id`,
      [classId, requestedIds],
    );
    if (requestedIds && recipientQuery.rows.length !== requestedIds.length) {
      return res.status(400).json({ message: "One or more selected students are not members of this class" });
    }
    const recipients = recipientQuery.rows;
    if (!recipients.length || req.body.confirmedCount !== recipients.length) {
      return res.status(409).json({
        message: "Class recipient count changed or is empty; confirm the current recipient count before sending.",
        count: recipients.length,
      });
    }
    const templateKeyForLog = usingCustom ? "class_custom" : templateKey;
    const results = [];
    for (const recipient of recipients) {
      if (!emailPattern.test(String(recipient.email || ""))) {
        const error = "Student does not have a valid email address";
        await logEmailFailure(String(recipient.email || ""), templateKeyForLog, error);
        results.push({
          studentId: Number(recipient.id), email: recipient.email, status: "failed", error,
        });
        continue;
      }
      const delivery = await sendLoggedEmail({
        to: recipient.email,
        templateKey: templateKeyForLog,
        ...(usingCustom ? { subject: customSubject, body: customBody } : {}),
        variables: {
          student_name: recipient.name,
          cohort_end: recipient.cohortEnd ?? "",
          paybill: recipient.paybill ?? "",
          account_number: recipient.accountNumber ?? "",
          class_name: "",
        },
      });
      results.push({ studentId: Number(recipient.id), email: recipient.email, ...delivery });
    }
    res.json({
      classId,
      total: recipients.length,
      sent: results.filter((item) => item.status === "sent").length,
      failed: results.filter((item) => item.status === "failed").length,
      results,
    });
  });
}