import type { Express, RequestHandler } from "express";
import { createCipheriv, createECDH, createPrivateKey, hkdfSync, randomBytes, sign as cryptoSign } from "crypto";
import { pool } from "./db";
import { nairobiDate } from "./stage3-storage";
import { sendLoggedEmail } from "./stage11-email";

type Subscription = { endpoint: string; p256dh: string; auth: string };
type PushPayload = { title: string; body: string; url?: string };

const b64url = (value: Buffer | string) => Buffer.from(value).toString("base64url");
const fromB64url = (value: string) => Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");

function vapidConfig() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
}

function deriveVapidPrivateKey(encodedPrivate: string) {
  const d = fromB64url(encodedPrivate);
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(d);
  const publicPoint = ecdh.getPublicKey();
  return createPrivateKey({
    key: { kty: "EC", crv: "P-256", d: b64url(d), x: b64url(publicPoint.subarray(1, 33)), y: b64url(publicPoint.subarray(33, 65)) },
    format: "jwk",
  });
}

function vapidToken(endpoint: string, config: NonNullable<ReturnType<typeof vapidConfig>>) {
  const audience = new URL(endpoint).origin;
  const head = b64url(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const body = b64url(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60, sub: config.subject }));
  const unsigned = `${head}.${body}`;
  const signature = cryptoSign("sha256", Buffer.from(unsigned), {
    key: deriveVapidPrivateKey(config.privateKey),
    dsaEncoding: "ieee-p1363",
  });
  return `${unsigned}.${b64url(signature)}`;
}

function encryptPush(subscription: Subscription, payload: PushPayload): Buffer {
  const clientPublic = fromB64url(subscription.p256dh);
  if (clientPublic.length !== 65 || clientPublic[0] !== 4) throw new Error("Invalid subscription public key");
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const serverPublic = ecdh.getPublicKey();
  const sharedSecret = ecdh.computeSecret(clientPublic);
  const authSecret = fromB64url(subscription.auth);
  const info = Buffer.concat([
    Buffer.from("WebPush: info\0"),
    clientPublic,
    serverPublic,
  ]);
  const inputKeyMaterial = Buffer.from(hkdfSync("sha256", sharedSecret, authSecret, info, 32));
  const salt = randomBytes(16);
  const contentKey = Buffer.from(hkdfSync("sha256", inputKeyMaterial, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", inputKeyMaterial, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const plaintext = Buffer.concat([Buffer.from(JSON.stringify(payload)), Buffer.from([2])]);
  const cipher = createCipheriv("aes-128-gcm", contentKey, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  const recordSize = Buffer.alloc(4);
  recordSize.writeUInt32BE(4096);
  return Buffer.concat([salt, recordSize, Buffer.from([serverPublic.length]), serverPublic, ciphertext]);
}

async function sendPush(subscription: Subscription, payload: PushPayload): Promise<boolean> {
  const config = vapidConfig();
  if (!config) return false;
  try {
    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        Authorization: `vapid t=${vapidToken(subscription.endpoint, config)}, k=${config.publicKey}`,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: "86400",
      },
      body: encryptPush(subscription, payload),
    });
    if (response.status === 404 || response.status === 410) {
      await pool.query("DELETE FROM medqrown_push_subscriptions WHERE endpoint = $1", [subscription.endpoint]);
      return false;
    }
    return response.ok;
  } catch (error) {
    console.error("Stage 7 browser push delivery failed", error);
    return false;
  }
}

export async function dispatchPushToStudents(studentIds: number[], payload: PushPayload): Promise<number> {
  if (!vapidConfig() || !studentIds.length) return 0;
  const { rows } = await pool.query(
    `SELECT endpoint, p256dh, auth FROM medqrown_push_subscriptions
      WHERE student_id = ANY($1::int[])`,
    [studentIds],
  );
  const results = await Promise.all(rows.map((subscription: Subscription) => sendPush(subscription, payload)));
  return results.filter(Boolean).length;
}

function validLink(value: unknown): value is string | null {
  if (value === undefined || value === null || value === "") return true;
  if (typeof value !== "string" || value.length > 2000) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function registerStage7Routes(app: Express, requireAdmin: RequestHandler, requireStudent: RequestHandler): void {
  app.get("/api/student/notifications/unread-count", requireStudent, async (req: any, res) => {
    const { rows } = await pool.query(
      "SELECT COUNT(*)::int AS count FROM medqrown_notifications WHERE student_id = $1 AND read_at IS NULL",
      [req.student.id],
    );
    res.json({ count: rows[0]?.count ?? 0 });
  });

  app.patch("/api/student/notifications/:id/read", requireStudent, async (req: any, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: "Invalid notification id" });
    const { rows } = await pool.query(
      `UPDATE medqrown_notifications SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
        WHERE id = $1 AND student_id = $2 RETURNING id, read_at AS "readAt"`,
      [id, req.student.id],
    );
    if (!rows[0]) return res.status(404).json({ message: "Notification not found" });
    res.json(rows[0]);
  });

  app.patch("/api/student/notifications/read-all", requireStudent, async (req: any, res) => {
    const { rowCount } = await pool.query(
      "UPDATE medqrown_notifications SET read_at = CURRENT_TIMESTAMP WHERE student_id = $1 AND read_at IS NULL",
      [req.student.id],
    );
    res.json({ updated: rowCount ?? 0 });
  });

  app.get("/api/student/push/config", requireStudent, (_req, res) => {
    const config = vapidConfig();
    res.json({ enabled: !!config, publicKey: config?.publicKey ?? null });
  });

  app.put("/api/student/push/subscription", requireStudent, async (req: any, res) => {
    if (!vapidConfig()) return res.status(503).json({ message: "Browser push is disabled pending VAPID configuration" });
    const raw = req.body?.subscription;
    const endpoint = raw?.endpoint;
    const p256dh = raw?.keys?.p256dh;
    const auth = raw?.keys?.auth;
    let parsed: URL;
    try {
      parsed = new URL(endpoint);
    } catch {
      return res.status(400).json({ message: "A valid W3C PushSubscription is required" });
    }
    if (parsed.protocol !== "https:" || parsed.username || parsed.password
        || typeof p256dh !== "string" || typeof auth !== "string"
        || p256dh.length > 256 || auth.length > 256
        || fromB64url(p256dh).length !== 65 || fromB64url(p256dh)[0] !== 4
        || fromB64url(auth).length !== 16) {
      return res.status(400).json({ message: "A valid W3C PushSubscription is required" });
    }
    const saved = await pool.query(
      `INSERT INTO medqrown_push_subscriptions (student_id, endpoint, p256dh, auth)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (endpoint) DO UPDATE SET student_id = EXCLUDED.student_id,
         p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, updated_at = CURRENT_TIMESTAMP
       WHERE medqrown_push_subscriptions.student_id = EXCLUDED.student_id
       RETURNING id`,
      [req.student.id, endpoint, p256dh, auth],
    );
    if (!saved.rows[0]) return res.status(409).json({ message: "Push subscription is already linked to another account" });
    res.status(204).end();
  });

  app.delete("/api/student/push/subscription", requireStudent, async (req: any, res) => {
    const endpoint = req.body?.endpoint;
    if (typeof endpoint !== "string" || !endpoint) return res.status(400).json({ message: "endpoint is required" });
    const { rowCount } = await pool.query(
      "DELETE FROM medqrown_push_subscriptions WHERE student_id = $1 AND endpoint = $2",
      [req.student.id, endpoint],
    );
    res.json({ deleted: rowCount ?? 0 });
  });

  app.post("/api/admin/classes/:classId/announcements", requireAdmin, async (req: any, res) => {
    const classId = Number(req.params.classId);
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    const link = req.body?.link === undefined ? null : req.body.link;
    if (!Number.isInteger(classId) || classId < 1 || !title || title.length > 250 || /[\u0000-\u001f\u007f]/.test(title)
        || !message || message.length > 10000 || !validLink(link)) {
      return res.status(400).json({ message: "Valid classId, title (1–250 characters), message (1–10000 characters), and optional HTTP(S) link are required" });
    }
    const classResult = await pool.query("SELECT id FROM medqrown_classes WHERE id = $1", [classId]);
    if (!classResult.rows[0]) return res.status(404).json({ message: "Class not found" });
    const client = await pool.connect();
    let announcement: any;
    let recipients: any[] = [];
    try {
      await client.query("BEGIN");
      const inserted = await client.query(
        `INSERT INTO medqrown_class_announcements (class_id, admin_id, title, message, link)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, class_id AS "classId", title, message, link, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [classId, req.admin.id, title, message, link || null],
      );
      announcement = inserted.rows[0];
      const memberResult = await client.query(
        `SELECT s.id, s.name, s.email FROM medqrown_class_students cs
         JOIN students s ON s.id = cs.student_id
         JOIN medqrown_memberships m ON m.student_id = s.id
         CROSS JOIN medqrown_settings settings
         WHERE cs.class_id = $1 AND $2::date >= m.start_date
           AND $2::date <= m.end_date + settings.grace_days`,
        [classId, nairobiDate()],
      );
      recipients = memberResult.rows;
      for (const recipient of recipients) {
        await client.query(
          `INSERT INTO medqrown_notifications (student_id, kind, title, body, payload)
           VALUES ($1, 'class_announcement', $2, $3, $4::jsonb)`,
          [recipient.id, title, message, JSON.stringify({
            type: "class_announcement", classId, announcementId: Number(announcement.id),
            link: link || null, route: `/student/classes/${classId}/announcements`,
            pushReady: { title, body: message, url: `/student/classes/${classId}/announcements` },
          })],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    const emailResults = await Promise.all(recipients.map((recipient) =>
      sendLoggedEmail({
        to: recipient.email,
        templateKey: "announcement",
        variables: {
          student_name: recipient.name,
          announcement_title: title,
          announcement_message: message,
          announcement_link: link || "",
        },
      })));
    const pushSent = await dispatchPushToStudents(recipients.map((r) => Number(r.id)), {
      title, body: message, url: `/student/classes/${classId}/announcements`,
    });
    res.status(201).json({
      ...announcement,
      delivery: {
        recipients: recipients.length,
        inAppSent: recipients.length,
        emailSent: emailResults.filter((result) => result.status === "sent").length,
        emailFailed: emailResults.filter((result) => result.status === "failed").length,
        emailPendingConfiguration: !process.env.SMTP_USER || !process.env.SMTP_PASS,
        pushSent,
        pushPendingConfiguration: !vapidConfig(),
      },
    });
  });

  app.get("/api/admin/classes/:classId/announcements", requireAdmin, async (req: any, res) => {
    const classId = Number(req.params.classId);
    if (!Number.isInteger(classId) || classId < 1) return res.status(400).json({ message: "Invalid class id" });
    const { rows } = await pool.query(
      `SELECT id, class_id AS "classId", title, message, link, created_at AS "createdAt",
              updated_at AS "updatedAt"
         FROM medqrown_class_announcements WHERE class_id = $1 ORDER BY created_at DESC, id DESC`,
      [classId],
    );
    res.json(rows);
  });

  app.patch("/api/admin/classes/:classId/announcements/:id", requireAdmin, async (req: any, res) => {
    const classId = Number(req.params.classId);
    const id = Number(req.params.id);
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    const link = req.body?.link === undefined ? null : req.body.link;
    if (!Number.isInteger(classId) || !Number.isInteger(id) || !title || title.length > 250 || /[\u0000-\u001f\u007f]/.test(title)
        || !message || message.length > 10000 || !validLink(link)) {
      return res.status(400).json({ message: "Provide valid title, message and optional HTTP(S) link" });
    }
    const { rows } = await pool.query(
      `UPDATE medqrown_class_announcements SET title = $3, message = $4, link = $5,
          updated_at = CURRENT_TIMESTAMP WHERE class_id = $1 AND id = $2
       RETURNING id, class_id AS "classId", title, message, link, created_at AS "createdAt", updated_at AS "updatedAt"`,
      [classId, id, title, message, link || null],
    );
    if (!rows[0]) return res.status(404).json({ message: "Announcement not found" });
    res.json(rows[0]);
  });

  app.delete("/api/admin/classes/:classId/announcements/:id", requireAdmin, async (req: any, res) => {
    const classId = Number(req.params.classId);
    const id = Number(req.params.id);
    if (!Number.isInteger(classId) || !Number.isInteger(id)) return res.status(400).json({ message: "Invalid class or announcement id" });
    const { rowCount } = await pool.query("DELETE FROM medqrown_class_announcements WHERE class_id = $1 AND id = $2", [classId, id]);
    if (!rowCount) return res.status(404).json({ message: "Announcement not found" });
    res.json({ deleted: true });
  });

  app.get("/api/student/classes/:classId/announcements", requireStudent, async (req: any, res) => {
    const classId = Number(req.params.classId);
    if (!Number.isInteger(classId) || classId < 1) return res.status(400).json({ message: "Invalid class id" });
    const { rows: membership } = await pool.query(
      "SELECT 1 FROM medqrown_class_students WHERE class_id = $1 AND student_id = $2",
      [classId, req.student.id],
    );
    if (!membership[0]) return res.status(403).json({ message: "You are not enrolled in this class" });
    const { rows } = await pool.query(
      `SELECT id, class_id AS "classId", title, message, link, created_at AS "createdAt"
         FROM medqrown_class_announcements WHERE class_id = $1 ORDER BY created_at DESC, id DESC`,
      [classId],
    );
    res.json(rows);
  });

  app.post("/api/student/classes/:classId/feedback", requireStudent, async (req: any, res) => {
    const classId = Number(req.params.classId);
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    const examId = req.body?.examId == null || req.body?.examId === "" ? null : Number(req.body.examId);
    if (!Number.isInteger(classId) || classId < 1 || !message || message.length > 10000
        || (examId !== null && (!Number.isInteger(examId) || examId < 1))) {
      return res.status(400).json({ message: "Provide a valid class, message, and optional examId" });
    }
    const { rows: membership } = await pool.query(
      "SELECT 1 FROM medqrown_class_students WHERE class_id = $1 AND student_id = $2",
      [classId, req.student.id],
    );
    if (!membership[0]) return res.status(403).json({ message: "You are not enrolled in this class" });
    if (examId !== null) {
      const { rows: exams } = await pool.query("SELECT id FROM exams WHERE id = $1 AND class_id = $2", [examId, classId]);
      if (!exams[0]) return res.status(400).json({ message: "Exam does not belong to this class" });
    }
    const { rows } = await pool.query(
      `INSERT INTO medqrown_class_feedback (class_id, student_id, exam_id, message)
       VALUES ($1, $2, $3, $4)
       RETURNING id, class_id AS "classId", student_id AS "studentId", exam_id AS "examId",
                 message, created_at AS "createdAt"`,
      [classId, req.student.id, examId, message],
    );
    res.status(201).json(rows[0]);
  });

  app.get("/api/admin/classes/:classId/feedback", requireAdmin, async (req: any, res) => {
    const classId = Number(req.params.classId);
    const type = req.query.type;
    const examId = req.query.examId === undefined ? undefined : Number(req.query.examId);
    const from = typeof req.query.from === "string" ? req.query.from : undefined;
    const to = typeof req.query.to === "string" ? req.query.to : undefined;
    if (!Number.isInteger(classId) || classId < 1 || (type && !["general", "exam"].includes(type))
        || (examId !== undefined && (!Number.isInteger(examId) || examId < 1))
        || (from && Number.isNaN(Date.parse(from))) || (to && Number.isNaN(Date.parse(to)))) {
      return res.status(400).json({ message: "Invalid class, type, examId, from, or to filter" });
    }
    const { rows } = await pool.query(
      `SELECT f.id, f.class_id AS "classId", f.student_id AS "studentId", s.name AS "studentName",
              f.exam_id AS "examId", e.title AS "examTitle", f.message, f.created_at AS "createdAt",
              CASE WHEN f.exam_id IS NULL THEN 'general' ELSE 'exam' END AS type
         FROM medqrown_class_feedback f JOIN students s ON s.id = f.student_id
         LEFT JOIN exams e ON e.id = f.exam_id
        WHERE f.class_id = $1
          AND ($2::text IS NULL OR ($2 = 'general' AND f.exam_id IS NULL) OR ($2 = 'exam' AND f.exam_id IS NOT NULL))
          AND ($3::int IS NULL OR f.exam_id = $3)
          AND ($4::date IS NULL OR f.created_at::date >= $4::date)
          AND ($5::date IS NULL OR f.created_at::date <= $5::date)
        ORDER BY f.created_at DESC, f.id DESC`,
      [classId, type || null, examId ?? null, from || null, to || null],
    );
    res.json(rows);
  });

  app.get("/api/admin/feedback/latest", requireAdmin, async (req: any, res) => {
    const limit = req.query.limit === undefined ? 10 : Number(req.query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) return res.status(400).json({ message: "limit must be between 1 and 100" });
    const { rows } = await pool.query(
      `SELECT f.id, f.class_id AS "classId", c.name AS "className", f.student_id AS "studentId",
              s.name AS "studentName", f.exam_id AS "examId", e.title AS "examTitle", f.message,
              f.created_at AS "createdAt",
              CASE WHEN f.exam_id IS NULL THEN 'general' ELSE 'exam' END AS type
         FROM medqrown_class_feedback f JOIN medqrown_classes c ON c.id = f.class_id
         JOIN students s ON s.id = f.student_id LEFT JOIN exams e ON e.id = f.exam_id
        ORDER BY f.created_at DESC, f.id DESC LIMIT $1`,
      [limit],
    );
    res.json(rows);
  });
}