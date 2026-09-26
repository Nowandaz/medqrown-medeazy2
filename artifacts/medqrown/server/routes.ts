import type { Express } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { storage } from "./storage";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { generateSelfTestQuestions, generateLiveQuizQuestions, markSAQResponses, markSingleResponse, markStudentSAQResponses } from "./ai-orchestrator";
import { enqueueMarking } from "./marking-queue";
import { getExamStructure, invalidateExamCache } from "./exam-cache";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { listBucketObjects, deleteSupabaseStorageObjects, urlForObjectPath } from "./supabase-storage";
import { pool } from "./db";
import { normalizeMpesaCode, registerStage4Routes, validatePaymentCode } from "./stage4";
import { registerStage5Routes } from "./stage5";
import { registerStage6Routes, submitDueStage6Attempts } from "./stage6";
import { registerStage7Routes } from "./stage7";
import { registerStage8Routes } from "./stage8";
import { registerStage9Routes, updateStage9SiteSettings } from "./stage9";
import { registerStage10Routes } from "./stage10";
import { registerStage11Routes } from "./stage11";
import { registerTimetableRoutes } from "./timetable";
import { sendLoggedEmail } from "./stage11-email";
import { broadcastLiveQuiz, issueLiveQuizTicket } from "./live-quiz";
import { featureForPath, isFeatureEnabled } from "./feature-flags";
import {
  cohortEndDate,
  ensureCurrentAndNextCohorts,
  getMembership,
  isDate,
  listAdminMemberships,
  listCohorts,
} from "./stage3-storage";

const TEXT_LIMITS = {
  email: 254,
  password: 128,
  short: 250,
  long: 2000,
  selfTestFocus: 1000,
  answer: 4000,
  reportReason: 500,
} as const;

function getTextLimitForField(fieldName: string) {
  const key = fieldName.toLowerCase();
  if (key.includes("email")) return TEXT_LIMITS.email;
  if (key.includes("apikey") || key.includes("api_key") || key.includes("endpoint") || key.includes("url")) return TEXT_LIMITS.long;
  if (key.includes("password")) return TEXT_LIMITS.password;
  if (key === "answer" || key.includes("response") || key.includes("expectedanswer")) return TEXT_LIMITS.answer;
  if (key.includes("focus")) return TEXT_LIMITS.selfTestFocus;
  if (key.includes("report") || key.includes("reason")) return TEXT_LIMITS.reportReason;
  if (key.includes("subject") || /^(name|title|code|institution|category|slug|label|avatar|avatarkey)$/.test(key)) return TEXT_LIMITS.short;
  if (key.includes("content") || key.includes("question") || key.includes("explanation") || key.includes("feedback") || key.includes("description") || key.includes("message")) return TEXT_LIMITS.long;
  // Shared textareas allow up to 2,000 characters. Treat unfamiliar fields as
  // long-form to avoid rejecting valid existing content such as email bodies.
  return TEXT_LIMITS.long;
}

function findOversizedText(value: unknown, fieldName = "text"): string | null {
  if (typeof value === "string") {
    return value.length > getTextLimitForField(fieldName) ? fieldName : null;
  }
  if (Array.isArray(value)) {
    return value.map((item) => findOversizedText(item, fieldName)).find(Boolean) || null;
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => findOversizedText(item, key))
      .find(Boolean) || null;
  }
  return null;
}

function parseNairobiExamTime(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const input = value.trim();
  const hasZone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(input);
  const parsed = new Date(hasZone ? input : `${input}+03:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function generateUnavailableExamCredentialHash(): Promise<string> {
  // The exam_students legacy column is required, but exam access now uses the
  // student's bcrypt-backed portal account. Store only an unusable hash there.
  return bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10);
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const isProduction = process.env.NODE_ENV === "production";
  if (isProduction) {
    app.set("trust proxy", 1);
  }

  // Sessions live in Postgres so logins (and in-progress exams) survive restarts and redeploys.
  // The "session" table is created by migrateStage3().
  const PgSessionStore = connectPgSimple(session);
  app.use(
    session({
      store: new PgSessionStore({ pool, tableName: "session", createTableIfMissing: false, pruneSessionInterval: 60 * 60 }),
      secret: process.env.SESSION_SECRET || "medqrown-secret-key",
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: isProduction,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: isProduction ? "lax" : undefined,
      },
    })
  );

  registerObjectStorageRoutes(app);
  app.use((req, res, next) => {
    const feature = featureForPath(req.path);
    if (feature && !isFeatureEnabled(feature)) {
      return res.status(403).json({ message: "This feature is currently disabled." });
    }
    if (
      req.path.startsWith("/api/admin/self-test-question-reports") &&
      (!isFeatureEnabled("selfTests") || !isFeatureEnabled("adminReports"))
    ) {
      return res.status(403).json({ message: "This feature is currently disabled." });
    }
    if (
      req.path === "/api/admin/site-settings" &&
      req.method === "PUT" &&
      Object.prototype.hasOwnProperty.call(req.body || {}, "demoVideoUrl") &&
      req.body.demoVideoUrl !== "" &&
      req.body.demoVideoUrl != null &&
      !isFeatureEnabled("demoVideoMedia")
    ) {
      return res.status(403).json({ message: "Demo video media is currently disabled." });
    }
    next();
  });
  app.use((req, res, next) => {
    if (!req.path.startsWith("/api/") || !req.body) return next();
    const oversizedField = findOversizedText(req.body);
    if (oversizedField) {
      return res.status(400).json({ message: `The ${oversizedField} field is too long. Please shorten it and try again.` });
    }
    next();
  });

  // Health check (used by Render deployment)
  // ── Demo tables migration (runs once at startup) ──────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS demo_exams (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        display_order INTEGER NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT true,
        timer_seconds INTEGER NOT NULL DEFAULT 60,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
      CREATE TABLE IF NOT EXISTS demo_questions (
        id SERIAL PRIMARY KEY,
        demo_exam_id INTEGER NOT NULL REFERENCES demo_exams(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        image_url TEXT,
        options JSONB,
        explanation TEXT,
        order_index INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS demo_engagement_events (
        id SERIAL PRIMARY KEY,
        demo_exam_id INTEGER NOT NULL REFERENCES demo_exams(id) ON DELETE CASCADE,
        question_id INTEGER REFERENCES demo_questions(id) ON DELETE SET NULL,
        event_type TEXT NOT NULL,
        session_id TEXT NOT NULL,
        is_correct BOOLEAN,
        response_length INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
      CREATE TABLE IF NOT EXISTS site_settings (
        key TEXT PRIMARY KEY,
        value JSONB
      );
      CREATE TABLE IF NOT EXISTS content_pages (
        slug TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
      CREATE TABLE IF NOT EXISTS faq_items (
        id SERIAL PRIMARY KEY,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        order_index INTEGER NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT true
      );
      CREATE TABLE IF NOT EXISTS institution_inquiries (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        institution TEXT NOT NULL,
        message TEXT,
        is_read BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
      CREATE TABLE IF NOT EXISTS live_quiz_rooms (
        id SERIAL PRIMARY KEY,
        room_code VARCHAR(12) NOT NULL UNIQUE,
        host_student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        unit_id INTEGER REFERENCES units(id) ON DELETE SET NULL,
        topic TEXT NOT NULL,
        difficulty TEXT NOT NULL DEFAULT 'mixed',
        content_style TEXT NOT NULL DEFAULT 'clinical',
        question_count INTEGER NOT NULL DEFAULT 5,
        per_question_seconds INTEGER NOT NULL DEFAULT 30,
        status TEXT NOT NULL DEFAULT 'generating',
        generation_error TEXT,
        current_question_index INTEGER NOT NULL DEFAULT -1,
        question_started_at TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        started_at TIMESTAMP,
        finished_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
      ALTER TABLE live_quiz_rooms ADD COLUMN IF NOT EXISTS invite_token VARCHAR(96);
      ALTER TABLE live_quiz_rooms ALTER COLUMN room_code TYPE VARCHAR(12);
      CREATE UNIQUE INDEX IF NOT EXISTS live_quiz_rooms_invite_token_unique
        ON live_quiz_rooms(invite_token) WHERE invite_token IS NOT NULL;
      CREATE TABLE IF NOT EXISTS live_quiz_members (
        id SERIAL PRIMARY KEY,
        room_id INTEGER NOT NULL REFERENCES live_quiz_rooms(id) ON DELETE CASCADE,
        student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        role TEXT NOT NULL DEFAULT 'player',
        status TEXT NOT NULL DEFAULT 'joined',
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        left_at TIMESTAMP,
        UNIQUE(room_id, student_id)
      );
      CREATE TABLE IF NOT EXISTS live_quiz_questions (
        id SERIAL PRIMARY KEY,
        room_id INTEGER NOT NULL REFERENCES live_quiz_rooms(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        options JSONB NOT NULL,
        correct_option_index INTEGER NOT NULL CHECK (correct_option_index BETWEEN 0 AND 4),
        explanation TEXT,
        order_index INTEGER NOT NULL,
        UNIQUE(room_id, order_index)
      );
      CREATE TABLE IF NOT EXISTS live_quiz_answers (
        id SERIAL PRIMARY KEY,
        room_id INTEGER NOT NULL REFERENCES live_quiz_rooms(id) ON DELETE CASCADE,
        member_id INTEGER NOT NULL REFERENCES live_quiz_members(id) ON DELETE CASCADE,
        question_id INTEGER NOT NULL REFERENCES live_quiz_questions(id) ON DELETE CASCADE,
        selected_option_index INTEGER,
        is_correct BOOLEAN NOT NULL,
        points INTEGER NOT NULL DEFAULT 0,
        response_ms INTEGER,
        answered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        UNIQUE(member_id, question_id)
      );
      CREATE TABLE IF NOT EXISTS live_quiz_events (
        id SERIAL PRIMARY KEY,
        room_id INTEGER NOT NULL REFERENCES live_quiz_rooms(id) ON DELETE CASCADE,
        member_id INTEGER REFERENCES live_quiz_members(id) ON DELETE SET NULL,
        event_type TEXT NOT NULL,
        payload JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
      CREATE TABLE IF NOT EXISTS live_quiz_leaderboard (
        id SERIAL PRIMARY KEY,
        room_id INTEGER NOT NULL REFERENCES live_quiz_rooms(id) ON DELETE CASCADE,
        member_id INTEGER NOT NULL REFERENCES live_quiz_members(id) ON DELETE CASCADE,
        score INTEGER NOT NULL DEFAULT 0,
        correct_count INTEGER NOT NULL DEFAULT 0,
        answer_count INTEGER NOT NULL DEFAULT 0,
        rank INTEGER,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        UNIQUE(room_id, member_id)
      );
      CREATE TABLE IF NOT EXISTS live_quiz_shares (
        id SERIAL PRIMARY KEY,
        room_id INTEGER NOT NULL REFERENCES live_quiz_rooms(id) ON DELETE CASCADE,
        member_id INTEGER REFERENCES live_quiz_members(id) ON DELETE SET NULL,
        token VARCHAR(96) NOT NULL UNIQUE,
        kind TEXT NOT NULL DEFAULT 'score',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        expires_at TIMESTAMP NOT NULL
      );
      CREATE TABLE IF NOT EXISTS live_quiz_matches (
        id SERIAL PRIMARY KEY,
        room_id INTEGER NOT NULL UNIQUE REFERENCES live_quiz_rooms(id) ON DELETE CASCADE,
        unit_id INTEGER REFERENCES units(id) ON DELETE SET NULL,
        participant_count INTEGER NOT NULL DEFAULT 0,
        winner_student_id INTEGER REFERENCES students(id) ON DELETE SET NULL,
        finished_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
    `);
  } catch (err: any) {
    console.error("Demo table migration error:", err.message);
  }

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", ts: Date.now() });
  });

  // ── SEO: robots.txt + sitemap.xml ─────────────────────────────────────────
  const siteBaseUrl = (req: any) =>
    process.env.SITE_URL || `${req.protocol}://${req.get("host")}`;

  app.get("/robots.txt", (req, res) => {
    res.type("text/plain").send(
      [
        "User-agent: *",
        "Allow: /",
        "Disallow: /admin",
        "Disallow: /api/",
        `Sitemap: ${siteBaseUrl(req)}/sitemap.xml`,
      ].join("\n"),
    );
  });

  app.get("/sitemap.xml", (req, res) => {
    const base = siteBaseUrl(req);
    const pages = ["/", "/faq", "/terms", "/privacy", "/institutions", "/portal", "/student/signup"];
    const urls = pages
      .map(
        (p) =>
          `  <url><loc>${base}${p}</loc><changefreq>weekly</changefreq><priority>${p === "/" ? "1.0" : "0.6"}</priority></url>`,
      )
      .join("\n");
    res
      .type("application/xml")
      .send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`);
  });

  // Version marker — change BUILD_MARKER on every meaningful push so we can verify what's live
  const BUILD_MARKER = "2026-04-25-subtle-advancing-dim-v3";
  const SERVER_STARTED_AT = new Date().toISOString();
  app.get("/api/version", (_req, res) => {
    res.json({
      buildMarker: BUILD_MARKER,
      startedAt: SERVER_STARTED_AT,
      uptimeSec: Math.round(process.uptime()),
      hasSupabaseKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      hasSmtpUser: !!process.env.SMTP_USER,
      uploadFlow: "supabase-direct",
    });
  });

  // Admin Auth
  app.post("/api/admin/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (typeof email !== "string" || typeof password !== "string" || email.length > TEXT_LIMITS.email || password.length > TEXT_LIMITS.password) {
        return res.status(400).json({ message: "Enter a valid email and password" });
      }
      const normalizedEmail = (email || "").trim().toLowerCase();
      const admin = await storage.getAdminByEmail(normalizedEmail);
      if (!admin) return res.status(401).json({ message: "Incorrect email or password." });
      const valid = await bcrypt.compare(password, admin.passwordHash);
      if (!valid) return res.status(401).json({ message: "Incorrect email or password." });
      (req.session as any).adminId = admin.id;
      res.json({ id: admin.id, email: admin.email, name: admin.name, role: admin.role });
    } catch (error) {
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.post("/api/admin/logout", (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
  });

  app.get("/api/admin/me", async (req, res) => {
    const adminId = (req.session as any)?.adminId;
    if (!adminId) return res.status(401).json({ message: "Not authenticated" });
    const admin = await storage.getAdmin(adminId);
    if (!admin) return res.status(401).json({ message: "Not authenticated" });
    res.json({ id: admin.id, email: admin.email, name: admin.name, role: admin.role });
  });

  app.post("/api/admin/change-password", async (req, res) => {
    const adminId = (req.session as any)?.adminId;
    if (!adminId) return res.status(401).json({ message: "Not authenticated" });
    const { currentPassword, newPassword } = req.body;
    const admin = await storage.getAdmin(adminId);
    if (!admin) return res.status(404).json({ message: "Admin not found" });
    const valid = await bcrypt.compare(currentPassword, admin.passwordHash);
    if (!valid) return res.status(400).json({ message: "Current password is incorrect" });
    const hash = await bcrypt.hash(newPassword, 10);
    await storage.updateAdminPassword(adminId, hash);
    res.json({ ok: true });
  });

  // Admin middleware
  const requireAdmin = async (req: any, res: any, next: any) => {
    const adminId = req.session?.adminId;
    if (!adminId) return res.status(401).json({ message: "Not authenticated" });
    const admin = await storage.getAdmin(adminId);
    if (!admin) return res.status(401).json({ message: "Not authenticated" });
    req.admin = admin;
    next();
  };

  const requireStudent = async (req: any, res: any, next: any) => {
    let studentId = req.session?.studentId;
    if (!studentId && req.session?.examStudentId) {
      const examStudent = await storage.getExamStudent(req.session.examStudentId);
      studentId = examStudent?.studentId;
      if (studentId) req.session.studentId = studentId;
    }
    if (!studentId) return res.status(401).json({ message: "Please sign in to continue" });
    const student = await storage.getStudent(studentId);
    if (!student) return res.status(401).json({ message: "Student account not found" });
    req.student = student;
    next();
  };

  registerStage5Routes(app, requireAdmin, requireStudent);
  registerStage6Routes(app, requireAdmin, requireStudent);
  registerStage7Routes(app, requireAdmin, requireStudent);
  registerStage8Routes(app, requireStudent);
  registerStage9Routes(app, requireAdmin);
  registerStage10Routes(app, requireAdmin);
  registerStage11Routes(app, requireAdmin);
  registerTimetableRoutes(app, requireAdmin, requireStudent);
  registerStage4Routes(app, requireAdmin);

  // ── Stage 3: global cohorts, membership, classes, pricing and payments ─────
  app.get("/api/admin/cohorts", requireAdmin, async (_req, res) => {
    res.json(await listCohorts());
  });

  app.patch("/api/admin/cohorts/:id", requireAdmin, async (req: any, res) => {
    const id = Number(req.params.id);
    const startDate = req.body?.startDate;
    const endDate = req.body?.endDate;
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (!Number.isInteger(id) || id < 1 || !isDate(startDate) || !isDate(endDate) || !reason) {
      return res.status(400).json({ message: "id, valid startDate/endDate, and reason are required" });
    }
    if (endDate !== cohortEndDate(startDate)) {
      return res.status(400).json({ message: "endDate must equal startDate plus one calendar month minus one day" });
    }
    const { current, next } = await listCohorts();
    if (![current?.id, next?.id].includes(id)) {
      return res.status(403).json({ message: "Only current and next cohort dates can be edited" });
    }
    try {
      const updated = await pool.query(
        `UPDATE medqrown_cohorts SET start_date = $2, end_date = $3, updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
          RETURNING id, start_date::text AS "startDate", end_date::text AS "endDate",
                    created_at AS "createdAt", updated_at AS "updatedAt"`,
        [id, startDate, endDate],
      );
      if (!updated.rows[0]) return res.status(404).json({ message: "Cohort not found" });
      await storage.createAuditLog({
        adminId: req.admin.id,
        action: "edit_cohort_dates",
        details: `Cohort ${id}: ${startDate} to ${endDate}; ${reason}`,
      });
      res.json(updated.rows[0]);
    } catch (error: any) {
      if (error?.code === "23505") return res.status(409).json({ message: "A cohort already uses that startDate" });
      throw error;
    }
  });

  app.get("/api/admin/classes", requireAdmin, async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT c.id, c.name, c.description, c.status, c.created_at AS "createdAt",
              c.updated_at AS "updatedAt",
              COALESCE(array_agg(cs.student_id ORDER BY cs.student_id)
                FILTER (WHERE cs.student_id IS NOT NULL), ARRAY[]::integer[]) AS "studentIds",
              COUNT(cs.student_id)::int AS "studentCount",
              (SELECT json_build_object('id', e.id, 'title', e.title, 'opensAt', e.opens_at, 'closesAt', e.closes_at)
                 FROM exams e WHERE e.class_id = c.id AND e.status = 'active'
                   AND (e.closes_at IS NULL OR e.closes_at >= CURRENT_TIMESTAMP)
                ORDER BY e.opens_at NULLS LAST, e.id LIMIT 1) AS "nextExam"
         FROM medqrown_classes c
         LEFT JOIN medqrown_class_students cs ON cs.class_id = c.id
        GROUP BY c.id ORDER BY c.name, c.id`,
    );
    res.json(rows);
  });

  app.post("/api/admin/classes", requireAdmin, async (req, res) => {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const description = typeof req.body?.description === "string" ? req.body.description.trim() : null;
    const status = req.body?.status ?? "active";
    if (!name || name.length > 250 || !["active", "archived"].includes(status)) {
      return res.status(400).json({ message: "name is required and status must be active or archived" });
    }
    const { rows } = await pool.query(
      `INSERT INTO medqrown_classes (name, description, status) VALUES ($1, $2, $3)
       RETURNING id, name, description, status, created_at AS "createdAt", updated_at AS "updatedAt"`,
      [name, description, status],
    );
    res.status(201).json({ ...rows[0], studentIds: [], studentCount: 0 });
  });

  app.patch("/api/admin/classes/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: "Invalid class id" });
    const { name, description, status } = req.body || {};
    if (name !== undefined && (typeof name !== "string" || !name.trim() || name.trim().length > 250)) {
      return res.status(400).json({ message: "name must be a non-empty string of at most 250 characters" });
    }
    if (description !== undefined && description !== null && typeof description !== "string") {
      return res.status(400).json({ message: "description must be a string or null" });
    }
    if (status !== undefined && !["active", "archived"].includes(status)) {
      return res.status(400).json({ message: "status must be active or archived" });
    }
    const { rows } = await pool.query(
      `UPDATE medqrown_classes
          SET name = COALESCE($2, name), description = CASE WHEN $3 THEN $4 ELSE description END,
              status = COALESCE($5, status), updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING id, name, description, status, created_at AS "createdAt", updated_at AS "updatedAt"`,
      [id, name === undefined ? null : name.trim(), description !== undefined, description ?? null, status ?? null],
    );
    if (!rows[0]) return res.status(404).json({ message: "Class not found" });
    res.json(rows[0]);
  });

  // Classes are archived, never destructively deleted, to preserve membership history.
  app.delete("/api/admin/classes/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: "Invalid class id" });
    const { rows } = await pool.query(
      `UPDATE medqrown_classes SET status = 'archived', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 RETURNING id, name, description, status, updated_at AS "updatedAt"`,
      [id],
    );
    if (!rows[0]) return res.status(404).json({ message: "Class not found" });
    res.json(rows[0]);
  });

  app.put("/api/admin/classes/:id/students", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const studentIds = req.body?.studentIds;
    if (!Number.isInteger(id) || id < 1 || !Array.isArray(studentIds)
        || studentIds.some((studentId: unknown) => !Number.isInteger(studentId) || Number(studentId) < 1)) {
      return res.status(400).json({ message: "A class id and an array of positive integer studentIds are required" });
    }
    const uniqueIds = [...new Set(studentIds as number[])];
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const classResult = await client.query("SELECT id FROM medqrown_classes WHERE id = $1 FOR UPDATE", [id]);
      if (!classResult.rows[0]) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Class not found" });
      }
      if (uniqueIds.length) {
        const students = await client.query("SELECT id FROM students WHERE id = ANY($1::int[])", [uniqueIds]);
        if (students.rows.length !== uniqueIds.length) {
          await client.query("ROLLBACK");
          return res.status(400).json({ message: "One or more studentIds do not exist" });
        }
      }
      await client.query("DELETE FROM medqrown_class_students WHERE class_id = $1", [id]);
      if (uniqueIds.length) {
        await client.query(
          `INSERT INTO medqrown_class_students (class_id, student_id)
           SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING`,
          [id, uniqueIds],
        );
      }
      await client.query("COMMIT");
      res.json({ classId: id, studentIds: uniqueIds });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  app.get("/api/admin/memberships", requireAdmin, async (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    if (status && !["invited", "active", "grace", "expired"].includes(status)) {
      return res.status(400).json({ message: "status must be invited, active, grace, or expired" });
    }
    let memberships = await listAdminMemberships(status);
    const search = typeof req.query.search === "string" ? req.query.search.trim().toLowerCase() : "";
    if (search) {
      memberships = memberships.filter((item: any) =>
        item.studentName.toLowerCase().includes(search) || item.studentEmail.toLowerCase().includes(search));
    }
    res.json(memberships);
  });

  app.get("/api/admin/memberships/:studentId/audit", requireAdmin, async (req, res) => {
    const studentId = Number(req.params.studentId);
    if (!Number.isInteger(studentId) || studentId < 1) return res.status(400).json({ message: "Invalid student id" });
    const { rows } = await pool.query(
      `SELECT a.id, a.student_id AS "studentId", a.admin_id AS "adminId",
              admins.name AS "adminName", a.reason, a.previous_values AS "previousValues",
              a.new_values AS "newValues", a.created_at AS "createdAt"
         FROM medqrown_membership_audit a
         LEFT JOIN admins ON admins.id = a.admin_id
        WHERE a.student_id = $1 ORDER BY a.created_at DESC, a.id DESC`,
      [studentId],
    );
    res.json(rows);
  });

  app.put("/api/admin/memberships/:studentId", requireAdmin, async (req: any, res) => {
    const studentId = Number(req.params.studentId);
    const cohortId = Number(req.body?.cohortId);
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (!Number.isInteger(studentId) || studentId < 1 || !Number.isInteger(cohortId) || cohortId < 1 || !reason) {
      return res.status(400).json({ message: "studentId, cohortId, and a non-empty reason are required" });
    }
    const cohort = await pool.query(
      `SELECT id, start_date::text AS "startDate", end_date::text AS "endDate"
         FROM medqrown_cohorts WHERE id = $1`,
      [cohortId],
    );
    if (!cohort.rows[0]) return res.status(404).json({ message: "Cohort not found" });
    const startDate = req.body.startDate ?? cohort.rows[0].startDate;
    const endDate = req.body.endDate ?? cohort.rows[0].endDate;
    if (!isDate(startDate) || !isDate(endDate) || endDate < startDate) {
      return res.status(400).json({ message: "startDate/endDate must be valid dates with endDate on or after startDate" });
    }
    const student = await storage.getStudent(studentId);
    if (!student) return res.status(404).json({ message: "Student not found" });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const previous = await client.query(
        `SELECT cohort_id AS "cohortId", start_date::text AS "startDate", end_date::text AS "endDate"
           FROM medqrown_memberships WHERE student_id = $1 FOR UPDATE`,
        [studentId],
      );
      await client.query(
        `INSERT INTO medqrown_memberships (student_id, cohort_id, start_date, end_date)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (student_id) DO UPDATE
           SET cohort_id = EXCLUDED.cohort_id, start_date = EXCLUDED.start_date,
               end_date = EXCLUDED.end_date, updated_at = CURRENT_TIMESTAMP`,
        [studentId, cohortId, startDate, endDate],
      );
      await client.query(
        `INSERT INTO medqrown_membership_audit (student_id, admin_id, reason, previous_values, new_values)
         VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)`,
        [
          studentId, req.admin.id, reason,
          previous.rows[0] ? JSON.stringify(previous.rows[0]) : null,
          JSON.stringify({ cohortId, startDate, endDate }),
        ],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    res.json(await getMembership(studentId));
  });

  app.get("/api/admin/settings", requireAdmin, async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT individual_price AS "individualPrice", group_price AS "groupPrice",
              paybill, account_number AS "accountNumber", bank_name AS "bankName",
              grace_days AS "graceDays", updated_at AS "updatedAt"
         FROM medqrown_settings WHERE id = 1`,
    );
    res.json(rows[0]);
  });

  app.patch("/api/admin/settings", requireAdmin, async (req, res) => {
    const { individualPrice, groupPrice, paybill, accountNumber, bankName, graceDays } = req.body || {};
    for (const [key, value] of Object.entries({ individualPrice, groupPrice })) {
      if (value !== undefined && (!Number.isInteger(Number(value)) || Number(value) < 0)) {
        return res.status(400).json({ message: `${key} must be a non-negative integer` });
      }
    }
    if (graceDays !== undefined && (!Number.isInteger(Number(graceDays)) || Number(graceDays) < 0 || Number(graceDays) > 90)) {
      return res.status(400).json({ message: "graceDays must be an integer from 0 to 90" });
    }
    for (const [key, value] of Object.entries({ paybill, accountNumber, bankName })) {
      if (value !== undefined && (typeof value !== "string" || !value.trim() || value.length > 250)) {
        return res.status(400).json({ message: `${key} must be a non-empty string of at most 250 characters` });
      }
    }
    const { rows } = await pool.query(
      `UPDATE medqrown_settings
          SET individual_price = COALESCE($1, individual_price),
              group_price = COALESCE($2, group_price),
              paybill = COALESCE($3, paybill),
              account_number = COALESCE($4, account_number),
              bank_name = COALESCE($5, bank_name),
              grace_days = COALESCE($6, grace_days),
              updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
        RETURNING individual_price AS "individualPrice", group_price AS "groupPrice",
                  paybill, account_number AS "accountNumber", bank_name AS "bankName",
                  grace_days AS "graceDays", updated_at AS "updatedAt"`,
      [
        individualPrice === undefined ? null : Number(individualPrice),
        groupPrice === undefined ? null : Number(groupPrice),
        paybill ?? null, accountNumber ?? null, bankName ?? null,
        graceDays === undefined ? null : Number(graceDays),
      ],
    );
    res.json(rows[0]);
  });

  app.get("/api/admin/payments", requireAdmin, async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT UPPER(REGEXP_REPLACE(p.code, '[[:space:]]', '', 'g')) AS code,
              json_agg(json_build_object(
                'id', p.id, 'studentId', p.student_id, 'studentName', s.name,
                'studentEmail', s.email, 'plan', p.plan, 'amount', p.amount,
                'source', p.source, 'status', p.status, 'reviewerId', p.reviewer_id,
                'reviewerName', a.name, 'reason', p.reason, 'createdAt', p.created_at,
                'reviewedAt', p.reviewed_at
              ) ORDER BY p.created_at DESC) AS entries
         FROM medqrown_payment_entries p
         JOIN students s ON s.id = p.student_id
         LEFT JOIN admins a ON a.id = p.reviewer_id
         GROUP BY UPPER(REGEXP_REPLACE(p.code, '[[:space:]]', '', 'g'))
         ORDER BY MAX(p.created_at) DESC`,
    );
    res.json(rows);
  });

  app.post("/api/admin/payments", requireAdmin, async (req, res) => {
    const { studentId, code, plan, amount, source } = req.body || {};
    const normalizedCode = normalizeMpesaCode(code);
    if (!Number.isInteger(Number(studentId)) || Number(studentId) < 1
        || !normalizedCode
        || !["Individual", "Group"].includes(plan)
        || !Number.isInteger(Number(amount)) || Number(amount) < 0
        || typeof source !== "string" || !source.trim() || source.length > 250) {
      return res.status(400).json({ message: "studentId, code, plan, non-negative integer amount, and source are required" });
    }
    const client = await pool.connect();
    let rows: any[];
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`code:${normalizedCode}`]);
      const student = await client.query("SELECT id FROM students WHERE id = $1", [Number(studentId)]);
      if (!student.rows[0]) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Student not found" });
      }
      const validationErrors = await validatePaymentCode(client, Number(studentId), normalizedCode, plan);
      if (validationErrors.length) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: validationErrors[0], errors: validationErrors });
      }
      const result = await client.query(
        `INSERT INTO medqrown_payment_entries (student_id, code, plan, amount, source)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, student_id AS "studentId", code, plan, amount, source, status,
                    reviewer_id AS "reviewerId", reason, created_at AS "createdAt", reviewed_at AS "reviewedAt"`,
        [Number(studentId), normalizedCode, plan, Number(amount), source.trim()],
      );
      rows = result.rows;
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    res.status(201).json(rows[0]);
  });

  app.get("/api/student/membership", requireStudent, async (req: any, res) => {
    await ensureCurrentAndNextCohorts();
    res.json(await getMembership(req.student.id));
  });

  app.get("/api/student/classes", requireStudent, async (req: any, res) => {
    const { rows } = await pool.query(
      `SELECT c.id, c.name, c.description, c.status,
              cs.created_at AS "joinedAt"
         FROM medqrown_class_students cs
         JOIN medqrown_classes c ON c.id = cs.class_id
        WHERE cs.student_id = $1 ORDER BY c.name, c.id`,
      [req.student.id],
    );
    res.json(rows);
  });

  const getAttemptEntitlement = async (examId: number, studentId: number) => {
    const { rows } = await pool.query(
      `SELECT COALESCE(e.max_attempts, 1)::int AS "maxAttempts",
              (SELECT COUNT(*)::int
                 FROM attempts a JOIN exam_students es ON es.id = a.exam_student_id
                WHERE es.exam_id = e.id AND es.student_id = $2 AND a.status = 'submitted') AS "submittedAttempts",
              EXISTS(
                SELECT 1 FROM attempts a JOIN exam_students es ON es.id = a.exam_student_id
                 WHERE es.exam_id = e.id AND es.student_id = $2 AND a.status = 'in_progress'
              ) AS "hasInProgressAttempt",
              (SELECT rr.id FROM exam_reattempt_requests rr
                WHERE rr.exam_id = e.id AND rr.student_id = $2
                  AND rr.status = 'approved' AND rr.consumed_at IS NULL
                ORDER BY rr.reviewed_at DESC NULLS LAST, rr.created_at DESC LIMIT 1) AS "approvedRequestId",
              (SELECT COUNT(*)::int FROM exam_reattempt_requests rr
                WHERE rr.exam_id = e.id AND rr.student_id = $2 AND rr.status = 'approved') AS "approvedReattempts",
              (SELECT rr.status FROM exam_reattempt_requests rr
                WHERE rr.exam_id = e.id AND rr.student_id = $2 AND rr.status = 'pending'
                ORDER BY rr.created_at DESC LIMIT 1) AS "pendingRequestStatus"
         FROM exams e WHERE e.id = $1`,
      [examId, studentId],
    );
    return rows[0] as {
      maxAttempts: number;
      submittedAttempts: number;
      hasInProgressAttempt: boolean;
      approvedRequestId: number | null;
      approvedReattempts: number;
      pendingRequestStatus: string | null;
    } | undefined;
  };

  const studentExamAccess = async (examId: number, studentId: number) => {
    const { rows } = await pool.query(
      `SELECT id, class_id AS "classId", opens_at AS "opensAt", closes_at AS "closesAt",
              duration_minutes AS "durationMinutes", timer_mode AS "timerMode",
              per_question_seconds AS "perQuestionSeconds", status
         FROM exams WHERE id = $1`,
      [examId],
    );
    const exam = rows[0];
    if (!exam) return { allowed: false, status: 404, message: "Exam not found" };
    if (exam.classId == null) return { allowed: true, exam };
    if (exam.status !== "active") return { allowed: false, status: 403, message: "This exam is not available" };
    const { rows: classMembership } = await pool.query(
      "SELECT 1 FROM medqrown_class_students WHERE class_id = $1 AND student_id = $2",
      [exam.classId, studentId],
    );
    if (!classMembership[0]) return { allowed: false, status: 403, message: "You are not a member of this exam's class" };
    const membership = await getMembership(studentId);
    if (!membership || !["active", "grace"].includes(membership.status)) {
      return { allowed: false, status: 403, message: "Renew to access this exam", code: "MEMBERSHIP_EXPIRED" };
    }
    const now = Date.now();
    // Timed either for the whole exam (duration) or per question.
    const timed = exam.timerMode === "per_question" ? Number(exam.perQuestionSeconds) > 0 : Number(exam.durationMinutes) > 0;
    if (!exam.opensAt || !exam.closesAt || !timed) {
      return { allowed: false, status: 403, message: "The exam schedule is incomplete" };
    }
    if (new Date(exam.opensAt).getTime() > now) {
      return { allowed: false, status: 403, message: "This exam has not opened yet", code: "EXAM_NOT_OPEN" };
    }
    if (new Date(exam.closesAt).getTime() <= now) {
      return { allowed: false, status: 403, message: "This exam is closed", code: "EXAM_CLOSED" };
    }
    return { allowed: true, exam, membership };
  };

  const ensureExamStudentLink = async (examId: number, studentId: number) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock($1::int, $2::int)", [examId, studentId]);
      const { rows: existing } = await client.query(
        `SELECT id, exam_id AS "examId", student_id AS "studentId", password,
                attempt_status AS "attemptStatus", reset_count AS "resetCount", email_sent AS "emailSent",
                created_at AS "createdAt"
           FROM exam_students WHERE exam_id = $1 AND student_id = $2
          ORDER BY id LIMIT 1 FOR UPDATE`,
        [examId, studentId],
      );
      if (existing[0]) {
        await client.query("COMMIT");
        return existing[0];
      }
      const password = await generateUnavailableExamCredentialHash();
      const { rows } = await client.query(
        `INSERT INTO exam_students (exam_id, student_id, password, attempt_status, reset_count, email_sent)
         VALUES ($1, $2, $3, 'not_started', 0, false)
         RETURNING id, exam_id AS "examId", student_id AS "studentId", password,
                   attempt_status AS "attemptStatus", reset_count AS "resetCount",
                   email_sent AS "emailSent", created_at AS "createdAt"`,
        [examId, studentId, password],
      );
      await client.query("COMMIT");
      return rows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  };

  // Exams
  app.get("/api/exams", requireAdmin, async (req, res) => {
    const exams = await storage.getAllExams();
    res.json(exams);
  });

  app.get("/api/exams/:id", requireAdmin, async (req, res) => {
    const exam = await storage.getExam(parseInt(req.params.id));
    if (!exam) return res.status(404).json({ message: "Exam not found" });
    const stats = await storage.getExamStats(exam.id);
    res.json({ ...exam, stats });
  });

  app.post("/api/exams", requireAdmin, async (req, res) => {
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const classId = Number(req.body?.classId);
    const opensAt = parseNairobiExamTime(req.body?.opensAt);
    const closesAt = parseNairobiExamTime(req.body?.closesAt);
    const timerMode = req.body?.timerMode === "per_question" ? "per_question" : "full_exam";
    const perQuestionSeconds = timerMode === "per_question" ? Number(req.body?.perQuestionSeconds) : null;
    const durationMinutes = timerMode === "full_exam" ? Number(req.body?.durationMinutes) : null;
    const maxAttempts = req.body?.maxAttempts === undefined ? 1 : Number(req.body.maxAttempts);
    if (timerMode === "per_question" && (!Number.isInteger(perQuestionSeconds) || perQuestionSeconds! < 10 || perQuestionSeconds! > 3600)) {
      return res.status(400).json({ message: "Time per question must be between 10 and 3600 seconds" });
    }
    if (!title || title.length > 250 || !Number.isInteger(classId) || classId < 1
        || !opensAt || !closesAt || opensAt >= closesAt
        || (timerMode === "full_exam" && (!Number.isInteger(durationMinutes) || durationMinutes! < 1 || durationMinutes! > 1440))
        || !Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 100
        || (req.body?.status !== undefined && !["draft", "active", "archived"].includes(req.body.status))
        || (req.body?.instructions !== undefined && req.body.instructions !== null && typeof req.body.instructions !== "string")
        || (req.body?.autoMarkEnabled !== undefined && typeof req.body.autoMarkEnabled !== "boolean")) {
      return res.status(400).json({
        message: "title, classId, valid Nairobi opensAt/closesAt, durationMinutes, and maxAttempts (1-100) are required",
      });
    }
    const { rows: classes } = await pool.query(
      "SELECT id FROM medqrown_classes WHERE id = $1 AND status = 'active'",
      [classId],
    );
    if (!classes[0]) return res.status(400).json({ message: "Choose an active class for this exam" });
    const exam = await storage.createExam({
      title,
      classId,
      opensAt,
      closesAt,
      durationMinutes,
      maxAttempts,
      // Per-question exams are limited by the per-question timer and the close time only.
      fullExamSeconds: durationMinutes ? durationMinutes * 60 : null,
      perQuestionSeconds,
      timerMode,
      instructions: typeof req.body?.instructions === "string" ? req.body.instructions.trim() || null : null,
      autoMarkEnabled: req.body?.autoMarkEnabled ?? true,
      status: req.body?.status ?? "draft",
      createdBy: (req as any).admin.id,
    } as any);
    await storage.createAuditLog({ adminId: (req as any).admin.id, action: "create_exam", details: exam.title });
    res.json(exam);
  });

  app.patch("/api/exams/:id", requireAdmin, async (req, res) => {
    const updates = { ...req.body };
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: "Invalid exam id" });
    const current = await storage.getExam(id);
    if (!current) return res.status(404).json({ message: "Exam not found" });
    if (updates.title !== undefined && (typeof updates.title !== "string" || !updates.title.trim() || updates.title.trim().length > 250)) {
      return res.status(400).json({ message: "title must be a non-empty string of at most 250 characters" });
    }
    if (updates.title !== undefined) updates.title = updates.title.trim();
    if (updates.classId !== undefined) {
      updates.classId = Number(updates.classId);
      if (!Number.isInteger(updates.classId) || updates.classId < 1) {
        return res.status(400).json({ message: "classId must identify an active class" });
      }
      const { rows: classes } = await pool.query(
        "SELECT id FROM medqrown_classes WHERE id = $1 AND status = 'active'",
        [updates.classId],
      );
      if (!classes[0]) return res.status(400).json({ message: "Choose an active class for this exam" });
    }
    for (const field of ["opensAt", "closesAt"] as const) {
      if (updates[field] !== undefined) {
        const parsed = parseNairobiExamTime(updates[field]);
        if (!parsed) return res.status(400).json({ message: `${field} must be a valid Nairobi date and time` });
        updates[field] = parsed;
      }
    }
    const finalOpensAt = updates.opensAt ?? current.opensAt;
    const finalClosesAt = updates.closesAt ?? current.closesAt;
    if ((updates.opensAt !== undefined || updates.closesAt !== undefined) &&
        (!finalOpensAt || !finalClosesAt || new Date(finalOpensAt).getTime() >= new Date(finalClosesAt).getTime())) {
      return res.status(400).json({ message: "closesAt must be after opensAt" });
    }
    if (updates.timerMode !== undefined && !["full_exam", "per_question"].includes(updates.timerMode)) {
      return res.status(400).json({ message: "timerMode must be full_exam or per_question" });
    }
    const nextTimerMode = updates.timerMode ?? current.timerMode;
    if (nextTimerMode === "per_question") {
      const seconds = Number(updates.perQuestionSeconds ?? current.perQuestionSeconds);
      if (!Number.isInteger(seconds) || seconds < 10 || seconds > 3600) {
        return res.status(400).json({ message: "Time per question must be between 10 and 3600 seconds" });
      }
      updates.timerMode = "per_question";
      updates.perQuestionSeconds = seconds;
      updates.durationMinutes = null;
      updates.fullExamSeconds = null;
    } else if (updates.durationMinutes !== undefined || updates.timerMode === "full_exam") {
      updates.durationMinutes = Number(updates.durationMinutes ?? current.durationMinutes);
      if (!Number.isInteger(updates.durationMinutes) || updates.durationMinutes < 1 || updates.durationMinutes > 1440) {
        return res.status(400).json({ message: "Duration must be a whole number of minutes from 1 to 1440" });
      }
      updates.fullExamSeconds = updates.durationMinutes * 60;
      updates.timerMode = "full_exam";
      delete updates.perQuestionSeconds;
    }
    if (updates.instructions !== undefined && updates.instructions !== null && typeof updates.instructions !== "string") {
      return res.status(400).json({ message: "instructions must be a string or null" });
    }
    if (updates.autoMarkEnabled !== undefined && typeof updates.autoMarkEnabled !== "boolean") {
      return res.status(400).json({ message: "autoMarkEnabled must be a boolean" });
    }
    if (updates.status !== undefined && !["draft", "active", "archived"].includes(updates.status)) {
      return res.status(400).json({ message: "status must be draft, active, or archived" });
    }
    if (updates.maxAttempts !== undefined) {
      const maxAttempts = Number(updates.maxAttempts);
      if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 100) {
        return res.status(400).json({ message: "Maximum attempts must be a whole number between 1 and 100" });
      }
      updates.maxAttempts = maxAttempts;
    }
    const exam = await storage.updateExam(id, updates);
    res.json(exam);
  });

  app.delete("/api/exams/:id", requireAdmin, async (req, res) => {
    try {
      const examId = parseInt(req.params.id);
      const exam = await storage.getExam(examId);
      if (!exam) return res.status(404).json({ message: "Exam not found" });
      await storage.deleteExam(examId);
      res.json({ ok: true });
    } catch (error: any) {
      console.error("Delete exam error:", error);
      res.status(500).json({ message: "Failed to delete exam", error: error?.message });
    }
  });

  // Exam Students
  app.get("/api/exams/:examId/students", requireAdmin, async (req, res) => {
    const examIdNum = parseInt(req.params.examId);
    const studentsList = await storage.getStudentsByExam(examIdNum);
    const qs = await storage.getQuestionsByExam(examIdNum);
    const studentsWithAttempts = await Promise.all(studentsList.map(async (es) => {
      const attempt = await storage.getAttemptByExamStudent(es.id);
      const currentQuestionType = (attempt && qs[attempt.currentQuestionIndex])
        ? qs[attempt.currentQuestionIndex].type : null;
      const { password: _legacyPassword, ...safeExamStudent } = es;
      return { ...safeExamStudent, attempt, totalQuestions: qs.length, currentQuestionType };
    }));
    res.json(studentsWithAttempts);
  });

  app.post("/api/exams/:examId/students", requireAdmin, async (req, res) => {
    const examId = parseInt(req.params.examId);
    const { name } = req.body;
    const email = (req.body.email || "").trim().toLowerCase();
    let student = await storage.getStudentByEmail(email);
    if (!student) {
      student = await storage.createStudent({ name, email });
    } else if (name && student.name !== name) {
      // Re-adding an existing student with a different name → update it
      student = await storage.updateStudent(student.id, { name });
    }
    const existing = await storage.getExamStudentByExamAndStudent(examId, student.id);
    if (existing) return res.status(400).json({ message: "Student already added to this exam" });
    const examStudent = await storage.createExamStudent({
      examId,
      studentId: student.id,
      password: await generateUnavailableExamCredentialHash(),
      attemptStatus: "not_started",
      resetCount: 0,
      emailSent: false,
    });
    const { password: _legacyPassword, ...safeExamStudent } = examStudent;
    res.json({ ...safeExamStudent, student });
  });

  app.delete("/api/exams/:examId/students/:esId", requireAdmin, async (req, res) => {
    try {
      await storage.deleteExamStudent(parseInt(req.params.esId));
      res.json({ ok: true });
    } catch (error: any) {
      console.error("Delete exam student error:", error);
      res.status(500).json({ message: "Failed to remove student", error: error?.message });
    }
  });

  // Permanently delete a student record (and all their exam history via cascade)
  app.delete("/api/students/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const student = await storage.getStudent(id);
      await storage.deleteStudent(id);
      if (student?.email) await storage.deleteStudentSignupsByEmail(student.email);
      res.json({ ok: true });
    } catch (error: any) {
      console.error("Delete student error:", error);
      res.status(500).json({ message: "Failed to delete student", error: error?.message });
    }
  });

  // Scan Supabase bucket for files not referenced by any question, optionally delete them
  app.post("/api/admin/cleanup-storage", requireAdmin, async (req, res) => {
    try {
      const dryRun = req.body?.dryRun !== false; // default true — preview only
      const bucketObjects = await listBucketObjects("questions");
      const allQs = await storage.getAllExams();
      const usedUrls = new Set<string>();
      for (const exam of allQs) {
        const qs = await storage.getQuestionsByExam(exam.id);
        qs.forEach(q => { if (q.imageUrl) usedUrls.add(q.imageUrl); });
      }
      const orphans = bucketObjects.filter(p => !usedUrls.has(urlForObjectPath(p)));
      if (dryRun) {
        return res.json({ dryRun: true, totalInBucket: bucketObjects.length, used: usedUrls.size, orphanCount: orphans.length, orphans: orphans.slice(0, 50) });
      }
      const result = await deleteSupabaseStorageObjects(orphans.map(p => urlForObjectPath(p)));
      res.json({ dryRun: false, totalInBucket: bucketObjects.length, used: usedUrls.size, orphanCount: orphans.length, ...result });
    } catch (error: any) {
      console.error("Cleanup storage error:", error);
      res.status(500).json({ message: "Cleanup failed", error: error?.message });
    }
  });

  app.post("/api/exams/:examId/students/:esId/reset", requireAdmin, async (req, res) => {
    await storage.resetAttempt(parseInt(req.params.esId));
    await storage.createAuditLog({ adminId: (req as any).admin.id, action: "reset_attempt", details: `ExamStudent ${req.params.esId}` });
    res.json({ ok: true });
  });

  // Questions
  app.get("/api/exams/:examId/questions", requireAdmin, async (req, res) => {
    const qs = await storage.getQuestionsByExam(parseInt(req.params.examId));
    const withDetails = await Promise.all(qs.map(async (q) => {
      const options = q.type === "mcq" ? await storage.getQuestionOptions(q.id) : [];
      const subs = q.hasSubquestions ? await storage.getSubquestions(q.id) : [];
      return { ...q, options, subquestions: subs };
    }));
    res.json(withDetails);
  });

  app.post("/api/exams/:examId/questions", requireAdmin, async (req, res) => {
    const examId = parseInt(req.params.examId);
    const { type, content, marks, expectedAnswer, explanation, imageUrl, imageCaption, hasSubquestions, options, subquestions: subs } = req.body;
    // Historical four-choice records remain valid; only newly authored MCQs are
    // constrained to five choices.
    if (type === "mcq" && (!Array.isArray(options) || options.length !== 5 ||
      options.some((option: any) => !String(option?.content || "").trim()) ||
      options.filter((option: any) => option?.isCorrect).length !== 1)) {
      return res.status(400).json({ message: "New MCQs must have exactly five non-empty choices and one correct answer" });
    }
    const existingQs = await storage.getQuestionsByExam(examId);
    const orderIndex = existingQs.length;
    const question = await storage.createQuestion({
      examId, type, content, orderIndex, marks: marks || 1,
      expectedAnswer, explanation: explanation || null, imageUrl, imageCaption, hasSubquestions: hasSubquestions || false,
    });

    if (type === "mcq" && options) {
      for (let i = 0; i < options.length; i++) {
        await storage.createQuestionOption({
          questionId: question.id, content: options[i].content,
          isCorrect: options[i].isCorrect || false, orderIndex: i,
        });
      }
    }

    if (hasSubquestions && subs) {
      for (let i = 0; i < subs.length; i++) {
        await storage.createSubquestion({
          questionId: question.id, content: subs[i].content,
          marks: subs[i].marks || 1, expectedAnswer: subs[i].expectedAnswer, orderIndex: i,
        });
      }
    }

    invalidateExamCache(examId);
    const created = {
      ...question,
      options: type === "mcq" ? await storage.getQuestionOptions(question.id) : [],
      subquestions: hasSubquestions ? await storage.getSubquestions(question.id) : [],
    };
    res.json(created);
  });

  app.post("/api/exams/:examId/questions/bulk", requireAdmin, async (req, res) => {
    try {
      const examId = parseInt(req.params.examId);
      const { questions: bulk } = req.body;
      if (!Array.isArray(bulk) || bulk.length === 0) {
        return res.status(400).json({ message: "questions must be a non-empty array" });
      }

      const existingQs = await storage.getQuestionsByExam(examId);
      let nextIndex = existingQs.length;
      const created: any[] = [];

      for (const item of bulk) {
        const num = item.number ?? "?";
        if (!item.question || typeof item.question !== "string") {
          return res.status(400).json({ message: `Question ${num}: missing or invalid "question" field` });
        }
        const itemType = ((item.type as string) || "mcq").toLowerCase();
        if (itemType !== "mcq" && itemType !== "saq") {
          return res.status(400).json({ message: `Question ${num}: "type" must be "mcq" or "saq"` });
        }
        const imageCaption = item.imageDescription ? String(item.imageDescription).trim() : null;

        if (itemType === "mcq") {
          if (!item.options || typeof item.options !== "object" || Array.isArray(item.options)) {
            return res.status(400).json({ message: `Question ${num}: MCQ "options" must be an object e.g. { "A": "...", "B": "..." }` });
          }
          const optionKeys = Object.keys(item.options);
          if (optionKeys.length !== 5) {
            return res.status(400).json({ message: `Question ${num}: new MCQs must have exactly 5 options` });
          }
          const answerKey = String(item.answer ?? "").trim().toUpperCase();
          if (!answerKey || !item.options[answerKey]) {
            return res.status(400).json({ message: `Question ${num}: "answer" must match one of the option keys (${optionKeys.join(", ")})` });
          }
          const question = await storage.createQuestion({
            examId, type: "mcq",
            content: String(item.question).trim(),
            orderIndex: nextIndex++,
            marks: parseInt(item.marks) || 1,
            hasSubquestions: false,
            explanation: item.explanation ? String(item.explanation).trim() : null,
            imageCaption,
          });
          for (let i = 0; i < optionKeys.length; i++) {
            const key = optionKeys[i];
            await storage.createQuestionOption({
              questionId: question.id,
              content: String(item.options[key]).trim(),
              isCorrect: key.toUpperCase() === answerKey,
              orderIndex: i,
            });
          }
          created.push({ ...question, options: await storage.getQuestionOptions(question.id) });
        } else {
          const hasSubs = !!item.hasSubquestions && Array.isArray(item.subquestions) && item.subquestions.length > 0;
          const totalMarks = hasSubs
            ? item.subquestions.reduce((s: number, sq: any) => s + (parseInt(sq.marks) || 1), 0)
            : (parseInt(item.marks) || 1);
          const question = await storage.createQuestion({
            examId, type: "saq",
            content: String(item.question).trim(),
            orderIndex: nextIndex++,
            marks: totalMarks,
            hasSubquestions: hasSubs,
            expectedAnswer: !hasSubs && item.expectedAnswer ? String(item.expectedAnswer).trim() : null,
            imageCaption,
          });
          if (hasSubs) {
            for (let i = 0; i < item.subquestions.length; i++) {
              const sq = item.subquestions[i];
              await storage.createSubquestion({
                questionId: question.id,
                content: String(sq.question || sq.content || "").trim(),
                marks: parseInt(sq.marks) || 1,
                expectedAnswer: sq.expectedAnswer ? String(sq.expectedAnswer).trim() : null,
                orderIndex: i,
              });
            }
          }
          created.push({
            ...question,
            subquestions: hasSubs ? await storage.getSubquestions(question.id) : [],
          });
        }
      }

      invalidateExamCache(examId);
      res.json({ imported: created.length, questions: created });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Bulk import failed" });
    }
  });

  app.delete("/api/exams/:examId/questions/:qId", requireAdmin, async (req, res) => {
    try {
      const examId = parseInt(req.params.examId);
      const qId = parseInt(req.params.qId);
      invalidateExamCache(examId);
      await storage.deleteQuestionCascade(qId);
      res.json({ ok: true });
    } catch (error: any) {
      console.error("Delete question error:", error);
      res.status(500).json({ message: "Failed to delete question", error: error?.message });
    }
  });

  app.patch("/api/exams/:examId/questions/:qId", requireAdmin, async (req, res) => {
    const qId = parseInt(req.params.qId);
    const { content, marks, expectedAnswer, explanation, imageUrl, imageCaption, options, subquestions: subs } = req.body;
    await storage.updateQuestion(qId, { content, marks, expectedAnswer, explanation: explanation ?? null, imageUrl, imageCaption });
    if (options) {
      await storage.deleteQuestionOptions(qId);
      for (let i = 0; i < options.length; i++) {
        await storage.createQuestionOption({ questionId: qId, content: options[i].content, isCorrect: options[i].isCorrect, orderIndex: i });
      }
    }
    if (subs) {
      const { db } = await import("./db");
      const { subquestions: sqTable, responses: responsesTable } = await import("@shared/schema");
      const { eq, inArray } = await import("drizzle-orm");

      // IDs present in the incoming payload (existing subquestions being kept)
      const keptIds = subs.filter((s: any) => s.id).map((s: any) => s.id as number);

      // Find subquestions in DB that are NOT in the incoming list — these are being removed
      const existingSubs = await db.select({ id: sqTable.id }).from(sqTable).where(eq(sqTable.questionId, qId));
      const removedIds = existingSubs.map(s => s.id).filter(id => !keptIds.includes(id));

      if (removedIds.length > 0) {
        // Only delete responses for subquestions that are actually being removed
        await db.delete(responsesTable).where(inArray(responsesTable.subquestionId, removedIds));
        await db.delete(sqTable).where(inArray(sqTable.id, removedIds));
      }

      // Update existing subquestions in place and create new ones
      for (let i = 0; i < subs.length; i++) {
        const sub = subs[i];
        if (sub.id) {
          await db.update(sqTable).set({ content: sub.content, marks: sub.marks, expectedAnswer: sub.expectedAnswer, orderIndex: i }).where(eq(sqTable.id, sub.id));
        } else {
          await storage.createSubquestion({ questionId: qId, content: sub.content, marks: sub.marks, expectedAnswer: sub.expectedAnswer, orderIndex: i });
        }
      }
    }
    invalidateExamCache(parseInt(req.params.examId));
    const updated = await storage.getQuestion(qId);
    res.json(updated);
  });

  // Rankings
  app.get("/api/exams/:examId/rankings", requireAdmin, async (req, res) => {
    const rankings = await storage.getExamRankings(parseInt(req.params.examId));
    res.json(rankings);
  });

  // Analytics
  app.get("/api/exams/:examId/analytics", requireAdmin, async (req, res) => {
    const analytics = await storage.getQuestionAnalytics(parseInt(req.params.examId));
    res.json(analytics);
  });

  // Feedback
  app.get("/api/exams/:examId/feedback", requireAdmin, async (req, res) => {
    const feedback = await storage.getStudentFeedback(parseInt(req.params.examId));
    res.json(feedback);
  });

  app.delete("/api/exams/:examId/feedback/:feedbackId", requireAdmin, async (req, res) => {
    await storage.deleteStudentFeedback(parseInt(req.params.feedbackId));
    res.json({ ok: true });
  });

  app.post("/api/exams/:examId/feedback/:feedbackId/ai-draft", requireAdmin, async (req, res) => {
    const examId = parseInt(req.params.examId);
    const feedbackId = parseInt(req.params.feedbackId);
    const feedbacks = await storage.getStudentFeedback(examId);
    const fb = feedbacks.find(f => f.id === feedbackId);
    if (!fb) return res.status(404).json({ message: "Feedback not found" });
    const exam = await storage.getExam(examId);
    const providers = (await storage.getAiProviders()).filter(p => p.isActive);
    if (providers.length === 0) return res.status(400).json({ message: "No active AI provider configured. Set one up in Settings → AI Providers." });
    const provider = providers[0];
    const apiKey = provider.apiKeyDirect || (provider.apiKeyEnv ? process.env[provider.apiKeyEnv] || "" : "");
    const endpoint = provider.endpoint || (provider.baseUrlEnv ? process.env[provider.baseUrlEnv] : undefined);
    const model = provider.model || (provider.type === "gemini" ? "gemini-2.0-flash" : provider.type === "anthropic" ? "claude-sonnet-4-5" : "gpt-4o");
    const prompt = `You are a medical education administrator at MedQrown MedEazy. A student submitted feedback about their exam experience. Write a professional, warm, and helpful reply email body to the student.\n\nStudent Name: ${(fb as any).studentName || "Student"}\nExam: ${exam?.title || "the exam"}\nRating: ${(fb as any).rating ? `${(fb as any).rating}/5 stars` : "not rated"}\nFeedback: "${fb.content}"\n\nWrite a reply that thanks the student, addresses their specific points, is encouraging, and ends with "The MedQrown Team". Keep it to 3-4 sentences. Output only the email body, no subject line.`;
    try {
      let draft = "";
      if (provider.type === "anthropic") {
        const { default: Anthropic } = await import("@anthropic-ai/sdk");
        const client = new Anthropic({ apiKey: apiKey || "dummy", baseURL: endpoint });
        const resp = await client.messages.create({ model, max_tokens: 400, messages: [{ role: "user", content: prompt }] });
        draft = resp.content[0]?.type === "text" ? resp.content[0].text : "";
      } else {
        const { default: OpenAI } = await import("openai");
        const client = new OpenAI({ apiKey: apiKey || "dummy", baseURL: endpoint });
        const resp = await client.chat.completions.create({ model, max_tokens: 400, messages: [{ role: "user", content: prompt }] });
        draft = resp.choices[0]?.message?.content || "";
      }
      res.json({ draft });
    } catch (e: any) {
      res.status(500).json({ message: `AI error: ${e.message}` });
    }
  });

  app.post("/api/exams/:examId/feedback/:feedbackId/send-reply", requireAdmin, async (req, res) => {
    const { replyContent } = req.body;
    if (!replyContent?.trim()) return res.status(400).json({ message: "Reply content is required" });
    const examId = parseInt(req.params.examId);
    const feedbackId = parseInt(req.params.feedbackId);
    const feedbacks = await storage.getStudentFeedback(examId);
    const fb = feedbacks.find(f => f.id === feedbackId);
    if (!fb) return res.status(404).json({ message: "Feedback not found" });
    if (!(fb as any).studentEmail) return res.status(400).json({ message: "No email address for this student" });
    const exam = await storage.getExam(examId);
    const delivery = await sendLoggedEmail({
      to: (fb as any).studentEmail,
      templateKey: "custom:exam_feedback_reply",
      subject: `Re: Your feedback on ${exam?.title || "your exam"} — MedQrown`,
      body: replyContent,
    });
    if (delivery.status === "failed") return res.status(503).json({ message: delivery.error });
    res.json({ ok: true, status: delivery.status });
  });

  // All students (master database)
  app.get("/api/admin/all-students", requireAdmin, async (req, res) => {
    const allStudents = await storage.getAllStudentsWithExams();
    res.json(allStudents);
  });

  // Delete student from master database
  app.delete("/api/admin/students/:id", requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid student id" });
    const student = await storage.getStudent(id);
    await storage.deleteStudent(id);
    if (student?.email) await storage.deleteStudentSignupsByEmail(student.email);
    res.json({ ok: true });
  });

  // Update student university
  app.patch("/api/admin/students/:id", requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid student id" });
    const { university } = req.body;
    await storage.updateStudent(id, { ...(university !== undefined ? { university } : {}) });
    res.json({ ok: true });
  });

  // Add student to exam from master database
  app.post("/api/admin/students/:id/add-to-exam", requireAdmin, async (req, res) => {
    const studentId = parseInt(req.params.id);
    if (isNaN(studentId)) return res.status(400).json({ message: "Invalid student id" });
    const { examId } = req.body;
    if (!examId) return res.status(400).json({ message: "examId required" });
    const existing = await storage.getExamStudentByExamAndStudent(examId, studentId);
    if (existing) return res.status(409).json({ message: "Student already enrolled in this exam" });
    await storage.createExamStudent({
      examId, studentId, password: await generateUnavailableExamCredentialHash(),
      attemptStatus: "not_started", resetCount: 0, emailSent: false,
    });
    res.json({ ok: true });
  });

  // Universities management
  app.get("/api/admin/universities", async (_req, res) => {
    const list = await storage.getUniversities();
    res.json(list);
  });

  app.post("/api/admin/universities", requireAdmin, async (req, res) => {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: "University name required" });
    try {
      const uni = await storage.createUniversity(name);
      res.status(201).json(uni);
    } catch (e: any) {
      if (e.code === "23505") return res.status(409).json({ message: "University already exists" });
      throw e;
    }
  });

  app.delete("/api/admin/universities/:id", requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });
    await storage.deleteUniversity(id);
    res.json({ ok: true });
  });

  // AI Marking
  app.post("/api/exams/:examId/mark", requireAdmin, async (req, res) => {
    const examId = parseInt(req.params.examId);
    const { prompt } = req.body;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    try {
      const { jobId, results, errors } = await markSAQResponses(examId, prompt, (event) => {
        res.write(`data: ${JSON.stringify({ type: "progress", completed: event.completed, total: event.total, studentName: event.studentName, studentEmail: event.studentEmail, examStudentId: event.examStudentId, error: event.error })}\n\n`);
      });
      res.write(`data: ${JSON.stringify({ type: "complete", jobId, totalMarked: results.length, totalErrors: errors.length })}\n\n`);
      res.end();
    } catch (error: any) {
      res.write(`data: ${JSON.stringify({ type: "error", message: error.message })}\n\n`);
      res.end();
    }
  });

  // Debug: test batch marking with 2 dummy questions — does NOT write to DB
  app.post("/api/debug/batch-test", requireAdmin, async (req, res) => {
    try {
      let providers = (await storage.getAiProviders()).filter(p => p.isActive);
      if (providers.length === 0) return res.status(400).json({ error: "No active providers" });
      const OpenAI = (await import("openai")).default;
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const results: any[] = [];
      const BATCH_PROMPT = `You are marking a medical exam. For each numbered student answer, compare it to the expected answer and respond ONLY with a JSON object:\n{"results": [{"id": 1, "isCorrect": true, "feedback": "..."}, {"id": 2, "isCorrect": false, "feedback": "..."}]}`;
      const TEST_INPUT = `Answer 1:\nQuestion: What is the normal adult resting heart rate?\nExpected Answer: 60-100 bpm\nStudent Answer: around 70 beats per minute\n\n---\n\nAnswer 2:\nQuestion: What is the largest organ in the human body?\nExpected Answer: Skin\nStudent Answer: liver`;
      for (const p of providers) {
        const apiKey = p.apiKeyDirect || (p.apiKeyEnv ? process.env[p.apiKeyEnv] : "");
        const endpoint = p.endpoint || (p.baseUrlEnv ? process.env[p.baseUrlEnv] : undefined);
        const model = p.model || (p.type === "gemini" ? "gemini-2.0-flash" : p.type === "anthropic" ? "claude-sonnet-4-5" : "gpt-4o");

        // Key diagnostics (never expose the full key)
        const keyLen = apiKey ? apiKey.trim().length : 0;
        const keyPreview = apiKey ? apiKey.trim().slice(0, 6) + "…" + apiKey.trim().slice(-4) : "(none)";
        const keySource = p.apiKeyDirect ? "direct (DB)" : p.apiKeyEnv ? `env:${p.apiKeyEnv}` : "missing";

        if (!apiKey || apiKey.trim().length < 8) {
          results.push({ provider: p.name, model, success: false, keySource, keyPreview, keyLen,
            error: "No API key found. Paste your key in Edit Provider → API Key field." });
          continue;
        }

        try {
          let raw: string;
          if (p.type === "anthropic") {
            const client = new Anthropic({ apiKey: apiKey.trim(), baseURL: endpoint });
            const resp = await client.messages.create({
              model, max_tokens: 600, system: BATCH_PROMPT,
              messages: [{ role: "user", content: TEST_INPUT }],
            });
            raw = resp.content[0]?.type === "text" ? resp.content[0].text : "";
          } else {
            const client = new OpenAI({ apiKey: apiKey.trim(), baseURL: endpoint });
            const resp = await client.chat.completions.create({
              model, messages: [{ role: "system", content: BATCH_PROMPT }, { role: "user", content: TEST_INPUT }],
              max_tokens: 600,
            });
            raw = resp.choices[0]?.message?.content || "";
          }
          let parsed: any = null;
          try {
            let clean = raw.trim();
            const fence = clean.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (fence) clean = fence[1].trim();
            // try full JSON first, then extract first {...} block
            try { parsed = JSON.parse(clean); } catch {
              const match = clean.match(/\{[\s\S]*\}/);
              if (match) parsed = JSON.parse(match[0]);
            }
          } catch {}
          results.push({ provider: p.name, model, success: !!parsed?.results, keySource, keyPreview, keyLen, raw: raw.slice(0, 300), parsed });
        } catch (err: any) {
          // Extract HTTP status and body if available (openai SDK wraps it)
          const status = (err as any).status || (err as any).statusCode;
          const body = (err as any).error || (err as any).body;
          const errMsg = status
            ? `HTTP ${status}: ${body?.error?.message || body?.message || err.message}`
            : err.message;
          results.push({ provider: p.name, model, success: false, keySource, keyPreview, keyLen, error: errMsg });
        }
      }
      res.json({ results });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/exams/:examId/students/:esId/remark", requireAdmin, async (req, res) => {
    const examId = parseInt(req.params.examId);
    const esId = parseInt(req.params.esId);
    const { prompt } = req.body;
    try {
      const { results, errors } = await markStudentSAQResponses(examId, esId, prompt);
      res.json({ marked: results.length, errors: errors.length, details: errors });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/exams/:examId/marking-jobs", requireAdmin, async (req, res) => {
    const jobs = await storage.getAiMarkingJobsByExam(parseInt(req.params.examId));
    res.json(jobs);
  });

  // AI Providers
  app.get("/api/ai-providers", requireAdmin, async (req, res) => {
    const providers = await storage.getAiProviders();
    res.json(providers);
  });

  app.post("/api/ai-providers", requireAdmin, async (req, res) => {
    const { apiKeyValue, ...providerData } = req.body;
    if (apiKeyValue) {
      providerData.apiKeyDirect = apiKeyValue;
    }
    const provider = await storage.createAiProvider(providerData);
    res.json(provider);
  });

  app.patch("/api/ai-providers/:id", requireAdmin, async (req, res) => {
    const { apiKeyValue, ...updateData } = req.body;
    if (apiKeyValue) {
      updateData.apiKeyDirect = apiKeyValue;
    }
    await storage.updateAiProvider(parseInt(req.params.id), updateData);
    res.json({ ok: true });
  });

  app.delete("/api/ai-providers/:id", requireAdmin, async (req, res) => {
    await storage.deleteAiProvider(parseInt(req.params.id));
    res.json({ ok: true });
  });

  // Email Templates
  app.get("/api/email-templates", requireAdmin, async (req, res) => {
    const templates = await storage.getEmailTemplates();
    res.json(templates);
  });

  app.post("/api/email-templates", requireAdmin, async (req, res) => {
    const template = await storage.createEmailTemplate({ ...req.body, createdBy: (req as any).admin.id });
    res.json(template);
  });

  app.patch("/api/email-templates/:id", requireAdmin, async (req, res) => {
    await storage.updateEmailTemplate(parseInt(req.params.id), req.body);
    res.json({ ok: true });
  });

  // Send email (mass or single) via Gmail SMTP
  app.post("/api/exams/:examId/send-emails", requireAdmin, async (req, res) => {
    const examId = parseInt(req.params.examId);
    const { templateId, studentIds, customSubject, customBody, onlySendNew } = req.body;

    const exam = await storage.getExam(examId);
    if (!exam) return res.status(404).json({ message: "Exam not found" });

    const template = templateId ? await storage.getEmailTemplate(templateId) : null;
    const allStudents = await storage.getStudentsByExam(examId);
    let targets = studentIds
      ? allStudents.filter((s: any) => studentIds.includes(s.id))
      : allStudents;
    if (onlySendNew) {
      targets = targets.filter((s: any) => !s.emailSent);
    }

    const subjectTemplate = customSubject || template?.subject || "MedQrown MedEazy {exam_name} - Your Access Credentials";
    const bodyTemplate = customBody || template?.body || getDefaultEmailBody();
    const customPlaceholders: Record<string, string> = (template as any)?.placeholders || {};
    if (/password/i.test(`${subjectTemplate}\n${bodyTemplate}`)) {
      return res.status(400).json({ message: "Exam access passwords cannot be included in email templates." });
    }

    const results = [];
    let successCount = 0;
    let failCount = 0;
    let smtpAcceptedCount = 0;
    let smtpRejectedCount = 0;

    for (const es of targets) {
      let subject = subjectTemplate
        .replace(/{exam_name}/g, customPlaceholders.exam_name || exam.title)
        .replace(/{student_name}/g, customPlaceholders.student_name || es.student.name);

      let body = bodyTemplate
        .replace(/{student_name}/g, customPlaceholders.student_name || es.student.name)
        .replace(/{exam_name}/g, customPlaceholders.exam_name || exam.title)
        .replace(/{email}/g, customPlaceholders.email || es.student.email)
        .replace(/{portal_link}/g, customPlaceholders.portal_link || req.headers.origin || "");

      for (const [key, val] of Object.entries(customPlaceholders)) {
        if (!["student_name", "exam_name", "email", "password", "portal_link"].includes(key)) {
          subject = subject.replace(new RegExp(`{${key}}`, "g"), val);
          body = body.replace(new RegExp(`{${key}}`, "g"), val);
        }
      }

      const delivery = await sendLoggedEmail({
        to: es.student.email,
        templateKey: `exam_template:${template?.id ?? "default"}`,
        subject,
        body,
      });
      const status = delivery.status;
      if (status === "sent") {
        successCount++;
        smtpAcceptedCount++;
        await storage.updateExamStudent(es.id, { emailSent: true });
      } else {
        failCount++;
        smtpRejectedCount++;
      }
      await storage.createEmailLog({
        templateId: template?.id,
        recipientEmail: es.student.email,
        subject,
        status,
        ...(status === "sent" ? { sentAt: new Date() } : {}),
      });

      results.push({
        studentName: es.student.name,
        email: es.student.email,
        status,
        ...(delivery.error ? { error: delivery.error } : {}),
      });
    }

    res.json({
      total: results.length,
      sent: successCount,
      failed: failCount,
      smtpAccepted: smtpAcceptedCount,
      smtpRejected: smtpRejectedCount,
      deliveryNote: "Accepted by the configured mail server; inbox delivery can still be affected by spam filters or recipient-side rules.",
      emails: results,
    });
  });

  // Get exam responses for marking view
  app.get("/api/exams/:examId/responses", requireAdmin, async (req, res) => {
    const examId = parseInt(req.params.examId);
    const examStudentsList = await storage.getStudentsByExam(examId);
    const allResponses: any[] = [];

    for (const es of examStudentsList) {
      if (es.attemptStatus !== "submitted") continue;
      const attempt = await storage.getAttemptByExamStudent(es.id);
      if (!attempt) continue;
      const responses = await storage.getResponsesByAttempt(attempt.id);
      for (const r of responses) {
        const question = await storage.getQuestion(r.questionId);
        let subqContent = null;
        if (r.subquestionId) {
          const { db } = await import("./db");
          const { subquestions: sqTable } = await import("@shared/schema");
          const { eq } = await import("drizzle-orm");
          const [sq] = await db.select().from(sqTable).where(eq(sqTable.id, r.subquestionId));
          subqContent = sq?.content;
        }
        allResponses.push({
          ...r,
          examStudentId: es.id,
          studentName: es.student.name,
          studentEmail: es.student.email,
          questionContent: question?.content,
          questionType: question?.type,
          subquestionContent: subqContent,
        });
      }
    }

    res.json(allResponses);
  });

  // Mark individual response
  app.post("/api/responses/:responseId/mark", requireAdmin, async (req, res) => {
    try {
      const result = await markSingleResponse(parseInt(req.params.responseId), req.body.prompt);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ── Verified student dashboard and access APIs ────────────────────────────
  app.get("/api/student/allowed-domains", async (_req, res) => {
    const { rows } = await pool.query(
      "SELECT id, domain, label FROM allowed_email_domains WHERE is_active = true ORDER BY domain",
    );
    res.json(rows);
  });

  app.get("/api/student/me", requireStudent, async (req: any, res) => {
    const { rows } = await pool.query(
      `SELECT id, name, email, university, avatar_key AS "avatarKey", onboarded_at AS "onboardedAt"
         FROM students WHERE id = $1`,
      [req.student.id],
    );
    res.json(rows[0]);
  });

  // First-login walkthrough: shown until the student finishes (or skips) it once.
  app.post("/api/student/onboarding/complete", requireStudent, async (req: any, res) => {
    await pool.query("UPDATE students SET onboarded_at = COALESCE(onboarded_at, CURRENT_TIMESTAMP) WHERE id = $1", [req.student.id]);
    res.json({ ok: true });
  });

  app.get("/api/student/dashboard", requireStudent, async (req: any, res) => {
    const studentId = req.student.id;
    const [{ rows: unitRows }, { rows: historyRows }] = await Promise.all([
      pool.query(
        `SELECT u.id, u.code, u.name, u.description, u.is_active AS "isActive", true AS enrolled,
                (SELECT COUNT(*)::int FROM exams e WHERE e.unit_id = u.id AND e.status = 'active') AS "activeExamCount",
                (SELECT COUNT(DISTINCT a.id)::int
                   FROM exam_students es JOIN attempts a ON a.exam_student_id = es.id
                   WHERE es.student_id = $1 AND es.exam_id IN (SELECT id FROM exams WHERE unit_id = u.id) AND a.status = 'submitted') AS "completedAttempts"
           FROM units u JOIN unit_memberships um ON um.unit_id = u.id
          WHERE um.student_id = $1 AND um.status = 'enrolled' AND u.is_active = true
          ORDER BY u.code`,
        [studentId],
      ),
      pool.query(
        `SELECT es.id AS "examStudentId", e.id AS "examId", e.title, u.name AS "unitName",
                a.submitted_at AS "submittedAt",
                COALESCE(SUM(r.marks_awarded), 0)::float AS "earnedMarks",
              COALESCE(SUM(CASE WHEN r.subquestion_id IS NOT NULL THEN sq.marks ELSE q.marks END), 0)::float AS "totalMarks"
           FROM exam_students es
           JOIN exams e ON e.id = es.exam_id
           LEFT JOIN units u ON u.id = e.unit_id
           JOIN attempts a ON a.exam_student_id = es.id AND a.status = 'submitted'
           LEFT JOIN responses r ON r.attempt_id = a.id
           LEFT JOIN questions q ON q.id = r.question_id
            LEFT JOIN subquestions sq ON sq.id = r.subquestion_id
          WHERE es.student_id = $1 AND e.results_released = true
          GROUP BY es.id, e.id, e.title, u.name, a.submitted_at
          ORDER BY a.submitted_at DESC LIMIT 4`,
        [studentId],
      ),
    ]);
    const recent = historyRows.map((row) => ({
      ...row,
      scorePercent: row.totalMarks ? Math.round((row.earnedMarks / row.totalMarks) * 100) : 0,
    }));
    res.json({ enrolledUnits: unitRows, recentActivity: recent, totalExamsCompleted: recent.length });
  });

  app.get("/api/student/units", requireStudent, async (req: any, res) => {
    const { rows } = await pool.query(
      `SELECT u.id, u.code, u.name, u.description, u.is_active AS "isActive",
              EXISTS(SELECT 1 FROM unit_memberships um WHERE um.unit_id = u.id AND um.student_id = $1 AND um.status = 'enrolled') AS enrolled,
              (SELECT COUNT(*)::int FROM exams e WHERE e.unit_id = u.id AND e.status = 'active') AS "activeExamCount",
              (SELECT COUNT(DISTINCT a.id)::int
                 FROM exam_students es JOIN attempts a ON a.exam_student_id = es.id
                WHERE es.student_id = $1 AND es.exam_id IN (SELECT id FROM exams WHERE unit_id = u.id) AND a.status = 'submitted') AS "completedAttempts"
         FROM units u WHERE u.is_active = true ORDER BY u.code, u.name`,
      [req.student.id],
    );
    res.json(rows);
  });

  app.post("/api/student/units/:id/enrol", requireStudent, async (req: any, res) => {
    const unitId = Number(req.params.id);
    const { rows: units } = await pool.query("SELECT id FROM units WHERE id = $1 AND is_active = true", [unitId]);
    if (!units[0]) return res.status(404).json({ message: "Unit not found" });
    await pool.query(
      `INSERT INTO unit_memberships (unit_id, student_id, status) VALUES ($1, $2, 'enrolled')
       ON CONFLICT (unit_id, student_id) DO UPDATE SET status = 'enrolled'`,
      [unitId, req.student.id],
    );
    res.json({ ok: true });
  });

  app.get("/api/student/units/:id", requireStudent, async (req: any, res) => {
    const unitId = Number(req.params.id);
    const { rows: memberships } = await pool.query(
      "SELECT 1 FROM unit_memberships WHERE unit_id = $1 AND student_id = $2 AND status = 'enrolled'",
      [unitId, req.student.id],
    );
    if (!memberships[0]) return res.status(403).json({ message: "Enrol in this unit to view its official exams" });
    const { rows: units } = await pool.query(
      `SELECT u.id, u.code, u.name, u.description,
              (SELECT COUNT(*)::int FROM exams e WHERE e.unit_id = u.id AND e.status = 'active') AS "activeExamCount",
              (SELECT COUNT(DISTINCT a.id)::int
                 FROM exam_students es JOIN attempts a ON a.exam_student_id = es.id
                WHERE es.student_id = $2 AND es.exam_id IN (SELECT id FROM exams WHERE unit_id = u.id) AND a.status = 'submitted') AS "completedAttempts"
         FROM units u WHERE u.id = $1 AND u.is_active = true`,
      [unitId, req.student.id],
    );
    if (!units[0]) return res.status(404).json({ message: "Unit not found" });
    const { rows: exams } = await pool.query(
      `SELECT e.id, e.title, e.timer_mode AS "timerMode", COALESCE(e.max_attempts, 1)::int AS "maxAttempts",
              COUNT(q.id)::int AS "totalQuestions",
              CASE WHEN es.id IS NOT NULL THEN 'approved'
                   WHEN ear.status IS NOT NULL THEN ear.status ELSE 'not_requested' END AS "accessStatus"
              ,COALESCE((SELECT COUNT(*)::int
                  FROM attempts a JOIN exam_students counted_es ON counted_es.id = a.exam_student_id
                 WHERE counted_es.exam_id = e.id AND counted_es.student_id = $2 AND a.status = 'submitted'), 0) AS "attemptsUsed"
              ,CASE WHEN es.id IS NULL THEN false
                    WHEN EXISTS(SELECT 1 FROM attempts a WHERE a.exam_student_id = es.id AND a.status = 'in_progress') THEN true
                    WHEN (SELECT COUNT(*) FROM attempts a WHERE a.exam_student_id = es.id AND a.status = 'submitted') < COALESCE(e.max_attempts, 1) THEN true
                    WHEN EXISTS(SELECT 1 FROM exam_reattempt_requests rr WHERE rr.exam_id = e.id AND rr.student_id = $2 AND rr.status = 'approved' AND rr.consumed_at IS NULL) THEN true
                    ELSE false END AS "canEnter"
              ,COALESCE(
                (SELECT rr.status FROM exam_reattempt_requests rr
                  WHERE rr.exam_id = e.id AND rr.student_id = $2 AND (
                    rr.status = 'pending' OR (rr.status = 'approved' AND rr.consumed_at IS NULL) OR rr.status = 'rejected'
                  )
                 ORDER BY rr.created_at DESC LIMIT 1),
                'not_requested'
               ) AS "reattemptStatus"
         FROM exams e
         LEFT JOIN questions q ON q.exam_id = e.id
         LEFT JOIN exam_students es ON es.exam_id = e.id AND es.student_id = $2
         LEFT JOIN exam_access_requests ear ON ear.exam_id = e.id AND ear.student_id = $2
        WHERE e.unit_id = $1 AND e.status = 'active'
         GROUP BY e.id, e.title, e.timer_mode, e.max_attempts, es.id, ear.status ORDER BY e.created_at DESC`,
      [unitId, req.student.id],
    );
    res.json({ ...units[0], exams });
  });

  app.post("/api/student/exams/:id/request-access", requireStudent, async (req: any, res) => {
    const examId = Number(req.params.id);
    const { rows: exams } = await pool.query(
      "SELECT e.id, e.unit_id FROM exams e WHERE e.id = $1 AND e.status = 'active'",
      [examId],
    );
    const exam = exams[0];
    if (!exam?.unit_id) return res.status(404).json({ message: "This official exam is not available for requests" });
    const { rows: membership } = await pool.query(
      "SELECT 1 FROM unit_memberships WHERE unit_id = $1 AND student_id = $2 AND status = 'enrolled'",
      [exam.unit_id, req.student.id],
    );
    if (!membership[0]) return res.status(403).json({ message: "Enrol in the exam unit before requesting access" });
    const existing = await storage.getExamStudentByExamAndStudent(examId, req.student.id);
    if (existing) return res.json({ ok: true, status: "approved" });
    await pool.query(
      `INSERT INTO exam_access_requests (exam_id, student_id, status, reason)
       VALUES ($1, $2, 'pending', $3)
       ON CONFLICT (exam_id, student_id) DO UPDATE SET status = 'pending', reason = EXCLUDED.reason, reviewed_by = NULL, review_reason = NULL, reviewed_at = NULL`,
      [examId, req.student.id, typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 500) : null],
    );
    res.json({ ok: true, status: "pending" });
  });

  app.post("/api/student/exams/:id/enter", requireStudent, async (req: any, res) => {
    const examId = Number(req.params.id);
    const access = await studentExamAccess(examId, req.student.id);
    if (!access.allowed) return res.status(access.status || 403).json({ message: access.message, code: (access as any).code });
    let examStudent = await storage.getExamStudentByExamAndStudent(examId, req.student.id);
    if (!examStudent && access.exam?.classId != null) {
      examStudent = await ensureExamStudentLink(examId, req.student.id);
    }
    if (!examStudent) return res.status(403).json({ message: "Your exam access has not been approved" });
    const entitlement = await getAttemptEntitlement(examId, req.student.id);
    if (!entitlement) return res.status(404).json({ message: "Exam not found" });

    if (!entitlement.hasInProgressAttempt) {
      if (entitlement.submittedAttempts < entitlement.maxAttempts) {
        // A normal configured retry is available. Clear the submitted session state
        // so the exam page proceeds from instructions into a fresh attempt.
        await storage.updateExamStudent(examStudent.id, { attemptStatus: "not_started" });
      } else if (entitlement.approvedRequestId) {
        // The approval is deliberately not consumed here. Entering an exam only
        // opens its instructions; the single-use entitlement is consumed atomically
        // when a fresh attempt is actually created in start-exam.
        await storage.updateExamStudent(examStudent.id, { attemptStatus: "not_started" });
      } else {
        return res.status(403).json({
          message: entitlement.pendingRequestStatus
            ? "Your reattempt request is awaiting an administrator decision"
            : "You have used all allowed attempts for this exam. Request a reattempt to continue.",
          code: entitlement.pendingRequestStatus ? "REATEMPT_PENDING" : "ATTEMPT_LIMIT_REACHED",
        });
      }
    }
    (req.session as any).examStudentId = examStudent.id;
    (req.session as any).studentExamId = examStudent.examId;
    res.json({ ok: true, attemptStatus: entitlement.hasInProgressAttempt ? "in_progress" : "not_started" });
  });

  app.post("/api/student/exams/:id/request-reattempt", requireStudent, async (req: any, res) => {
    const examId = Number(req.params.id);
    const access = await studentExamAccess(examId, req.student.id);
    if (!access.allowed) return res.status(access.status || 403).json({ message: access.message, code: (access as any).code });
    let examStudent = await storage.getExamStudentByExamAndStudent(examId, req.student.id);
    if (!examStudent && access.exam?.classId != null) {
      examStudent = await ensureExamStudentLink(examId, req.student.id);
    }
    if (!examStudent) return res.status(403).json({ message: "Your exam access has not been approved" });
    const entitlement = await getAttemptEntitlement(examId, req.student.id);
    if (!entitlement) return res.status(404).json({ message: "Exam not found" });
    if (entitlement.hasInProgressAttempt || entitlement.submittedAttempts < entitlement.maxAttempts) {
      return res.status(400).json({ message: "You still have an available attempt for this exam" });
    }
    if (entitlement.approvedRequestId) {
      return res.status(409).json({ message: "You already have an approved reattempt available" });
    }
    if (entitlement.pendingRequestStatus) {
      return res.status(409).json({ message: "You already have a reattempt request awaiting review" });
    }
    const { rows: recentRequests } = await pool.query(
      `SELECT id FROM exam_reattempt_requests
        WHERE exam_id = $1 AND student_id = $2
          AND created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'
        ORDER BY created_at DESC LIMIT 1`,
      [examId, req.student.id],
    );
    if (recentRequests[0]) {
      return res.status(429).json({ message: "Please wait before submitting another reattempt request" });
    }
    try {
      await pool.query(
        `INSERT INTO exam_reattempt_requests (exam_id, student_id, reason)
         VALUES ($1, $2, $3)`,
        [examId, req.student.id, String(req.body?.reason || "").trim().slice(0, 500) || null],
      );
      res.json({ ok: true, status: "pending" });
    } catch (error: any) {
      if (error?.code === "23505") {
        return res.status(409).json({ message: "You already have a reattempt request awaiting review" });
      }
      throw error;
    }
  });

  app.get("/api/student/stats", requireStudent, async (req: any, res) => {
    const { rows } = await pool.query(
      `SELECT a.id AS "attemptId", e.id AS "examId", e.title, COALESCE(u.name, 'Independent exam') AS "unitName",
              a.submitted_at AS "submittedAt", COALESCE(SUM(r.marks_awarded), 0)::float AS "earnedMarks",
              COALESCE(SUM(CASE WHEN r.subquestion_id IS NOT NULL THEN sq.marks ELSE q.marks END), 0)::float AS "totalMarks"
         FROM attempts a
         JOIN exam_students es ON es.id = a.exam_student_id
         JOIN exams e ON e.id = es.exam_id
         LEFT JOIN units u ON u.id = e.unit_id
         LEFT JOIN responses r ON r.attempt_id = a.id
         LEFT JOIN questions q ON q.id = r.question_id
          LEFT JOIN subquestions sq ON sq.id = r.subquestion_id
        WHERE es.student_id = $1 AND a.status = 'submitted' AND e.results_released = true
        GROUP BY a.id, e.id, e.title, u.name, a.submitted_at
        ORDER BY a.submitted_at DESC`,
      [req.student.id],
    );
    const attempts = rows.map((row) => ({
      ...row,
      scorePercent: row.totalMarks ? Math.round((row.earnedMarks / row.totalMarks) * 100) : 0,
    }));
    const totalAttempts = attempts.length;
    const bestScore = totalAttempts ? Math.max(...attempts.map((attempt) => attempt.scorePercent)) : 0;
    const passRate = totalAttempts
      ? Math.round((attempts.filter((attempt) => attempt.scorePercent >= 50).length / totalAttempts) * 100)
      : 0;
    res.json({
      totalAttempts,
      bestScore,
      passRate,
      recentScores: attempts.slice(0, 8).reverse(),
    });
  });

  // ── Live AI quiz rooms ─────────────────────────────────────────────────────
  const liveRoomCode = () => {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    return Array.from(crypto.randomBytes(12), (byte) => alphabet[byte & 31]).join("");
  };
  const liveShareCode = () => crypto.randomBytes(5).toString("hex").toUpperCase();

  const refreshLiveRanks = async (roomId: number, client: any = pool) => {
    await client.query(
      `WITH ranked AS (
        SELECT id, RANK() OVER (ORDER BY score DESC, correct_count DESC) AS new_rank
          FROM live_quiz_leaderboard WHERE room_id = $1
      ) UPDATE live_quiz_leaderboard l SET rank = ranked.new_rank, updated_at = CURRENT_TIMESTAMP
        FROM ranked WHERE l.id = ranked.id`,
      [roomId],
    );
  };

  const finishLiveRoom = async (roomId: number, client: any = pool) => {
    await refreshLiveRanks(roomId, client);
    const { rows: leaderRows } = await client.query(
      `SELECT m.student_id FROM live_quiz_leaderboard l
         JOIN live_quiz_members m ON m.id = l.member_id
        WHERE l.room_id = $1 ORDER BY l.rank NULLS LAST, l.id LIMIT 1`,
      [roomId],
    );
    const { rows: memberRows } = await client.query(
      "SELECT COUNT(*)::int AS count FROM live_quiz_members WHERE room_id = $1 AND status = 'joined'",
      [roomId],
    );
    const { rows: roomRows } = await client.query(
      `UPDATE live_quiz_rooms SET status = 'finished', finished_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND status = 'running' RETURNING unit_id`,
      [roomId],
    );
    if (roomRows[0]) {
      await client.query(
        `INSERT INTO live_quiz_matches (room_id, unit_id, participant_count, winner_student_id)
         VALUES ($1, $2, $3, $4) ON CONFLICT (room_id) DO NOTHING`,
        [roomId, roomRows[0].unit_id, memberRows[0]?.count || 0, leaderRows[0]?.student_id || null],
      );
      await client.query(
        "INSERT INTO live_quiz_events (room_id, event_type, payload) VALUES ($1, 'finished', '{}'::jsonb)",
        [roomId],
      );
    }
    return Boolean(roomRows[0]);
  };

  const advanceLiveRoomIfNeeded = async (roomId: number) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows: rooms } = await client.query("SELECT * FROM live_quiz_rooms WHERE id = $1 FOR UPDATE", [roomId]);
      const room = rooms[0];
      if (!room || room.status !== "running") {
        await client.query("COMMIT");
        return false;
      }
      const { rows: questions } = await client.query(
        "SELECT id FROM live_quiz_questions WHERE room_id = $1 AND order_index = $2",
        [roomId, room.current_question_index],
      );
      const question = questions[0];
      if (!question) {
        const finished = await finishLiveRoom(roomId, client);
        await client.query("COMMIT");
        return finished;
      }
      const [{ rows: memberRows }, { rows: answerRows }] = await Promise.all([
        client.query("SELECT COUNT(*)::int AS count FROM live_quiz_members WHERE room_id = $1 AND status = 'joined'", [roomId]),
        client.query("SELECT COUNT(*)::int AS count FROM live_quiz_answers WHERE question_id = $1", [question.id]),
      ]);
      const elapsed = room.question_started_at
        ? Date.now() - new Date(room.question_started_at).getTime()
        : 0;
      const shouldAdvance = elapsed >= room.per_question_seconds * 1000 ||
        (memberRows[0]?.count > 0 && answerRows[0]?.count >= memberRows[0].count);
      if (!shouldAdvance) {
        await client.query("COMMIT");
        return false;
      }
      if (room.current_question_index + 1 >= room.question_count) {
        const finished = await finishLiveRoom(roomId, client);
        await client.query("COMMIT");
        return finished;
      }
      await client.query(
        `UPDATE live_quiz_rooms SET current_question_index = current_question_index + 1,
          question_started_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [roomId],
      );
      await client.query(
        "INSERT INTO live_quiz_events (room_id, event_type, payload) VALUES ($1, 'question_advanced', '{}'::jsonb)",
        [roomId],
      );
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  };

  const expireLiveRoomIfNeeded = async (roomId: number) => {
    const { rowCount } = await pool.query(
      `UPDATE live_quiz_rooms SET status = 'expired'
        WHERE id = $1 AND status IN ('generating', 'ready') AND expires_at <= CURRENT_TIMESTAMP`,
      [roomId],
    );
    return Boolean(rowCount);
  };

  const buildLiveRoomPayload = async (roomId: number, studentId: number) => {
    // A host who simply closes their browser should not leave a live room
    // running indefinitely. Their normal room poll refreshes last_seen_at, so
    // active hosts are unaffected; players see a clear closed state instead.
    const { rowCount: abandonedHost } = await pool.query(
      `UPDATE live_quiz_rooms r SET status = 'closed', finished_at = CURRENT_TIMESTAMP
        WHERE r.id = $1 AND r.status IN ('ready', 'running') AND EXISTS (
          SELECT 1 FROM live_quiz_members m
           WHERE m.room_id = r.id AND m.student_id = r.host_student_id
             AND m.last_seen_at < CURRENT_TIMESTAMP - INTERVAL '2 minutes'
        )`,
      [roomId],
    );
    if (abandonedHost) broadcastLiveQuiz(roomId, { type: "room_updated" });
    await expireLiveRoomIfNeeded(roomId);
    const advanced = await advanceLiveRoomIfNeeded(roomId);
    if (advanced) broadcastLiveQuiz(roomId, { type: "room_updated" });
    const { rows: rooms } = await pool.query(
      `SELECT r.*, u.name AS "unitName", u.code AS "unitCode", s.name AS "hostName"
         FROM live_quiz_rooms r
         LEFT JOIN units u ON u.id = r.unit_id JOIN students s ON s.id = r.host_student_id
        WHERE r.id = $1`,
      [roomId],
    );
    const room = rooms[0];
    if (!room) return null;
    const { rows: membershipRows } = await pool.query(
      "SELECT * FROM live_quiz_members WHERE room_id = $1 AND student_id = $2",
      [roomId, studentId],
    );
    const membership = membershipRows[0];
    if (!membership) return { forbidden: true };
    await pool.query("UPDATE live_quiz_members SET last_seen_at = CURRENT_TIMESTAMP WHERE id = $1", [membership.id]);
    const [{ rows: members }, { rows: leaderboardRows }] = await Promise.all([
      pool.query(
        `SELECT m.id, m.student_id AS "studentId", s.name, s.avatar_key AS "avatarKey", m.role, m.status,
                m.joined_at AS "joinedAt", m.last_seen_at AS "lastSeenAt"
           FROM live_quiz_members m JOIN students s ON s.id = m.student_id
          WHERE m.room_id = $1 ORDER BY m.role DESC, m.joined_at`,
        [roomId],
      ),
      pool.query(
        `SELECT l.score, l.correct_count AS "correctCount", l.answer_count AS "answerCount", l.rank,
                m.student_id AS "studentId", s.name, s.avatar_key AS "avatarKey"
           FROM live_quiz_leaderboard l JOIN live_quiz_members m ON m.id = l.member_id
           JOIN students s ON s.id = m.student_id
          WHERE l.room_id = $1 ORDER BY l.rank NULLS LAST, l.score DESC, s.name`,
        [roomId],
      ),
    ]);
    let question: any = null;
    if (room.status === "running" && room.current_question_index >= 0) {
      const { rows } = await pool.query(
        `SELECT id, content, options, order_index AS "orderIndex"
           FROM live_quiz_questions WHERE room_id = $1 AND order_index = $2`,
        [roomId, room.current_question_index],
      );
      question = rows[0] || null;
      if (question) {
        const { rows: answered } = await pool.query(
          "SELECT selected_option_index AS \"selectedOptionIndex\" FROM live_quiz_answers WHERE member_id = $1 AND question_id = $2",
          [membership.id, question.id],
        );
        question.selectedOptionIndex = answered[0]?.selectedOptionIndex ?? null;
      }
    }
    let results: any[] | undefined;
    if (room.status === "finished") {
      const { rows } = await pool.query(
        `SELECT q.id, q.content, q.options, q.correct_option_index AS "correctOptionIndex",
                q.explanation, q.order_index AS "orderIndex", a.selected_option_index AS "selectedOptionIndex",
                a.is_correct AS "isCorrect", a.points
           FROM live_quiz_questions q LEFT JOIN live_quiz_answers a
             ON a.question_id = q.id AND a.member_id = $2
          WHERE q.room_id = $1 ORDER BY q.order_index`,
        [roomId, membership.id],
      );
      const { rows: selections } = await pool.query(
        `SELECT a.question_id AS "questionId", a.selected_option_index AS "selectedOptionIndex",
                m.student_id AS "studentId", s.name, s.avatar_key AS "avatarKey"
           FROM live_quiz_answers a JOIN live_quiz_members m ON m.id = a.member_id
           JOIN students s ON s.id = m.student_id
          WHERE a.room_id = $1
          ORDER BY a.answered_at`,
        [roomId],
      );
      const selectionsByQuestion = new Map<number, any[]>();
      for (const selection of selections) {
        const entries = selectionsByQuestion.get(selection.questionId) || [];
        entries.push(selection);
        selectionsByQuestion.set(selection.questionId, entries);
      }
      results = rows.map((result) => ({ ...result, selections: selectionsByQuestion.get(result.id) || [] }));
    }
    const questionDeadlineAt = room.question_started_at
      ? new Date(new Date(room.question_started_at).getTime() + room.per_question_seconds * 1000).toISOString()
      : null;
    return {
      room: {
        id: room.id, roomCode: room.room_code, inviteToken: membership.role === "host" ? room.invite_token : null,
        topic: room.topic, unitName: room.unitName || "Independent study",
        unitCode: room.unitCode, hostName: room.hostName, hostStudentId: room.host_student_id, difficulty: room.difficulty,
        contentStyle: room.content_style, questionCount: room.question_count, perQuestionSeconds: room.per_question_seconds,
        status: room.status, generationError: room.generation_error, currentQuestionIndex: room.current_question_index,
        questionStartedAt: room.question_started_at, questionDeadlineAt, serverNow: Date.now(),
        expiresAt: room.expires_at, startedAt: room.started_at, finishedAt: room.finished_at,
      },
      me: { memberId: membership.id, role: membership.role, isHost: membership.role === "host" },
      members,
      leaderboard: leaderboardRows,
      question,
      results,
    };
  };

  const runLiveGeneration = async (roomId: number, input: { unitName: string; topic: string; difficulty: string; contentStyle: string; count: number }) => {
    try {
      const generated = await generateLiveQuizQuestions(input);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const { rows: activeRooms } = await client.query(
          "SELECT id FROM live_quiz_rooms WHERE id = $1 AND status = 'generating' AND expires_at > CURRENT_TIMESTAMP FOR UPDATE",
          [roomId],
        );
        if (!activeRooms[0]) {
          await client.query("COMMIT");
          return;
        }
        for (let index = 0; index < generated.length; index++) {
          const question = generated[index];
          await client.query(
            `INSERT INTO live_quiz_questions
              (room_id, content, options, correct_option_index, explanation, order_index)
             VALUES ($1, $2, $3::jsonb, $4, $5, $6)`,
            [roomId, question.content, JSON.stringify(question.options), question.correctOptionIndex, question.explanation, index],
          );
        }
        const { rowCount } = await client.query(
          "UPDATE live_quiz_rooms SET status = 'ready', generation_error = NULL WHERE id = $1 AND status = 'generating' AND expires_at > CURRENT_TIMESTAMP",
          [roomId],
        );
        if (!rowCount) {
          await client.query("COMMIT");
          return;
        }
        await client.query("INSERT INTO live_quiz_events (room_id, event_type, payload) VALUES ($1, 'ready', '{}'::jsonb)", [roomId]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
      broadcastLiveQuiz(roomId, { type: "room_updated" });
    } catch (error: any) {
      await pool.query(
        "UPDATE live_quiz_rooms SET status = 'generation_failed', generation_error = $2 WHERE id = $1 AND status = 'generating'",
        [roomId, String(error.message || "Question generation failed").slice(0, 1000)],
      );
      broadcastLiveQuiz(roomId, { type: "room_updated" });
    }
  };

  app.post("/api/student/live-rooms", requireStudent, async (req: any, res) => {
    const unitId = Number(req.body?.unitId);
    const topic = String(req.body?.topic || "").trim();
    const difficulty = String(req.body?.difficulty || "mixed");
    const contentStyle = String(req.body?.contentStyle || "clinical");
    const questionCount = Number(req.body?.questionCount);
    const perQuestionSeconds = Number(req.body?.perQuestionSeconds);
    if (!Number.isInteger(unitId) || !topic || topic.length > TEXT_LIMITS.selfTestFocus ||
      !["easy", "mixed", "hard"].includes(difficulty) || !["direct", "clinical", "mixed"].includes(contentStyle) ||
      !Number.isInteger(questionCount) || questionCount < 3 || questionCount > 20 ||
      !Number.isInteger(perQuestionSeconds) || perQuestionSeconds < 10 || perQuestionSeconds > 120) {
      return res.status(400).json({ message: "Check the unit, topic, difficulty, question count (3–20), and timer (10–120 seconds)." });
    }
    const { rows: units } = await pool.query(
      `SELECT u.id, u.name FROM units u JOIN unit_memberships um ON um.unit_id = u.id
        WHERE u.id = $1 AND u.is_active = true AND um.student_id = $2 AND um.status = 'enrolled'`,
      [unitId, req.student.id],
    );
    const unit = units[0];
    if (!unit) return res.status(400).json({ message: "Choose an active unit" });
    let room: any;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const { rows } = await pool.query(
          `INSERT INTO live_quiz_rooms
            (room_code, invite_token, host_student_id, unit_id, topic, difficulty, content_style, question_count, per_question_seconds, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP + INTERVAL '2 hours') RETURNING *`,
          [liveRoomCode(), crypto.randomBytes(24).toString("base64url"), req.student.id, unitId, topic, difficulty, contentStyle, questionCount, perQuestionSeconds],
        );
        room = rows[0];
        break;
      } catch (error: any) {
        if (error.code !== "23505") throw error;
      }
    }
    if (!room) return res.status(503).json({ message: "Could not reserve a room code. Please try again." });
    const { rows: members } = await pool.query(
      `INSERT INTO live_quiz_members (room_id, student_id, role) VALUES ($1, $2, 'host') RETURNING id`,
      [room.id, req.student.id],
    );
    await pool.query("INSERT INTO live_quiz_leaderboard (room_id, member_id) VALUES ($1, $2)", [room.id, members[0].id]);
    res.status(201).json({ roomId: room.id, roomCode: room.room_code, inviteToken: room.invite_token, status: room.status });
    runLiveGeneration(room.id, { unitName: unit.name, topic, difficulty, contentStyle, count: questionCount });
  });

  app.get("/api/student/live-rooms/code/:code", requireStudent, async (req: any, res) => {
    const { rows } = await pool.query(
      "SELECT id, room_code AS \"roomCode\" FROM live_quiz_rooms WHERE room_code = $1",
      [String(req.params.code).toUpperCase()],
    );
    if (!rows[0]) return res.status(404).json({ message: "Room code not found" });
    res.json({ roomId: rows[0].id, roomCode: rows[0].roomCode });
  });

  app.post("/api/student/live-rooms/:roomId/join", requireStudent, async (req: any, res) => {
    const roomId = Number(req.params.roomId);
    const roomCode = String(req.body?.roomCode || "").trim().toUpperCase();
    const inviteToken = String(req.body?.inviteToken || "").trim();
    if (!/^[A-Z2-9]{12}$/.test(roomCode) && !/^[A-Za-z0-9_-]{24,96}$/.test(inviteToken)) {
      return res.status(400).json({ message: "Use a valid room code or invite link" });
    }
    const { rows: rooms } = await pool.query("SELECT * FROM live_quiz_rooms WHERE id = $1", [roomId]);
    const room = rooms[0];
    if (!room || (room.room_code !== roomCode && room.invite_token !== inviteToken)) return res.status(404).json({ message: "Room not found" });
    if (new Date(room.expires_at) <= new Date() || ["closed", "expired"].includes(room.status)) {
      return res.status(410).json({ message: "This room is no longer available" });
    }
    const { rows: members } = await pool.query(
      `INSERT INTO live_quiz_members (room_id, student_id, role, status, left_at)
       VALUES ($1, $2, 'player', 'joined', NULL)
       ON CONFLICT (room_id, student_id) DO UPDATE SET status = 'joined', left_at = NULL, last_seen_at = CURRENT_TIMESTAMP
       RETURNING id`,
      [roomId, req.student.id],
    );
    await pool.query(
      "INSERT INTO live_quiz_leaderboard (room_id, member_id) VALUES ($1, $2) ON CONFLICT (room_id, member_id) DO NOTHING",
      [roomId, members[0].id],
    );
    await pool.query("INSERT INTO live_quiz_events (room_id, member_id, event_type, payload) VALUES ($1, $2, 'joined', '{}'::jsonb)", [roomId, members[0].id]);
    broadcastLiveQuiz(roomId, { type: "room_updated" });
    res.json({ roomId });
  });

  app.get("/api/student/live-rooms/:roomId", requireStudent, async (req: any, res) => {
    const payload = await buildLiveRoomPayload(Number(req.params.roomId), req.student.id);
    if (!payload) return res.status(404).json({ message: "Room not found" });
    if ("forbidden" in payload) return res.status(403).json({ message: "Join this room to view it" });
    res.json(payload);
  });

  app.post("/api/student/live-rooms/:roomId/ws-ticket", requireStudent, async (req: any, res) => {
    const roomId = Number(req.params.roomId);
    const { rows } = await pool.query(
      "SELECT id FROM live_quiz_members WHERE room_id = $1 AND student_id = $2 AND status = 'joined'",
      [roomId, req.student.id],
    );
    if (!rows[0]) return res.status(403).json({ message: "Join this room first" });
    res.json({ ticket: issueLiveQuizTicket(req.student.id, roomId) });
  });

  app.post("/api/student/live-rooms/:roomId/start", requireStudent, async (req: any, res) => {
    const roomId = Number(req.params.roomId);
    const { rowCount } = await pool.query(
      `UPDATE live_quiz_rooms SET status = 'running', current_question_index = 0, started_at = CURRENT_TIMESTAMP,
        question_started_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND host_student_id = $2 AND status = 'ready' AND expires_at > CURRENT_TIMESTAMP`,
      [roomId, req.student.id],
    );
    if (!rowCount) return res.status(409).json({ message: "Only the host can start a ready, unexpired room" });
    await pool.query("INSERT INTO live_quiz_events (room_id, event_type, payload) VALUES ($1, 'started', '{}'::jsonb)", [roomId]);
    broadcastLiveQuiz(roomId, { type: "room_updated" });
    res.json({ ok: true });
  });

  app.post("/api/student/live-rooms/:roomId/close", requireStudent, async (req: any, res) => {
    const roomId = Number(req.params.roomId);
    const { rowCount } = await pool.query(
      `UPDATE live_quiz_rooms SET status = 'closed', finished_at = COALESCE(finished_at, CURRENT_TIMESTAMP)
        WHERE id = $1 AND host_student_id = $2 AND status NOT IN ('finished', 'closed', 'expired')`,
      [roomId, req.student.id],
    );
    if (!rowCount) return res.status(409).json({ message: "Only the host can close this active room" });
    await pool.query("UPDATE live_quiz_members SET status = 'left', left_at = CURRENT_TIMESTAMP WHERE room_id = $1 AND student_id = $2", [roomId, req.student.id]);
    await pool.query("INSERT INTO live_quiz_events (room_id, event_type, payload) VALUES ($1, 'closed', '{}'::jsonb)", [roomId]);
    broadcastLiveQuiz(roomId, { type: "room_updated" });
    res.json({ ok: true });
  });

  app.post("/api/student/live-rooms/:roomId/answer", requireStudent, async (req: any, res) => {
    const roomId = Number(req.params.roomId);
    const questionId = Number(req.body?.questionId);
    const selectedOptionIndex = Number(req.body?.selectedOptionIndex);
    if (!Number.isInteger(selectedOptionIndex) || selectedOptionIndex < 0 || selectedOptionIndex > 4) {
      return res.status(400).json({ message: "Select one of the five choices" });
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows: rooms } = await client.query("SELECT * FROM live_quiz_rooms WHERE id = $1 FOR UPDATE", [roomId]);
      const room = rooms[0];
      if (!room || room.status !== "running") {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: "This room is not accepting answers" });
      }
      const deadline = room.question_started_at
        ? new Date(room.question_started_at).getTime() + room.per_question_seconds * 1000
        : 0;
      if (!deadline || Date.now() >= deadline) {
        await client.query("COMMIT");
        const advanced = await advanceLiveRoomIfNeeded(roomId);
        broadcastLiveQuiz(roomId, { type: advanced ? "room_updated" : "timer_elapsed" });
        return res.status(409).json({ message: "Time is up for that question" });
      }
      const { rows: members } = await client.query(
        "SELECT * FROM live_quiz_members WHERE room_id = $1 AND student_id = $2 AND status = 'joined' FOR UPDATE",
        [roomId, req.student.id],
      );
      const member = members[0];
      const { rows: questions } = await client.query(
        "SELECT * FROM live_quiz_questions WHERE id = $1 AND room_id = $2 AND order_index = $3",
        [questionId, roomId, room.current_question_index],
      );
      const question = questions[0];
      if (!member || !question) {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: "That question is no longer active" });
      }
      const { rows: existing } = await client.query(
        "SELECT * FROM live_quiz_answers WHERE member_id = $1 AND question_id = $2",
        [member.id, questionId],
      );
      if (existing[0]) {
        await client.query("COMMIT");
        return res.json({ locked: true, duplicate: true, isCorrect: existing[0].is_correct, points: existing[0].points });
      }
      const responseMs = Math.max(0, Math.min(room.per_question_seconds * 1000,
        Date.now() - new Date(room.question_started_at).getTime()));
      const isCorrect = selectedOptionIndex === question.correct_option_index;
      // Score in full-second bands so two students who answer at effectively the
      // same time are not separated by normal device/network jitter.
      const points = isCorrect ? Math.max(200, 1000 - Math.floor(responseMs / 1000) * 50) : 0;
      await client.query(
        `INSERT INTO live_quiz_answers (room_id, member_id, question_id, selected_option_index, is_correct, points, response_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [roomId, member.id, questionId, selectedOptionIndex, isCorrect, points, responseMs],
      );
      await client.query(
        `UPDATE live_quiz_leaderboard SET score = score + $3, correct_count = correct_count + $4,
          answer_count = answer_count + 1, updated_at = CURRENT_TIMESTAMP WHERE room_id = $1 AND member_id = $2`,
        [roomId, member.id, points, isCorrect ? 1 : 0],
      );
      await refreshLiveRanks(roomId, client);
      const { rows: rankRows } = await client.query(
        "SELECT rank FROM live_quiz_leaderboard WHERE room_id = $1 AND member_id = $2",
        [roomId, member.id],
      );
      await client.query("UPDATE live_quiz_members SET last_seen_at = CURRENT_TIMESTAMP WHERE id = $1", [member.id]);
      await client.query(
        "INSERT INTO live_quiz_events (room_id, member_id, event_type, payload) VALUES ($1, $2, 'answered', '{}'::jsonb)",
        [roomId, member.id],
      );
      await client.query("COMMIT");
      const advanced = await advanceLiveRoomIfNeeded(roomId);
      broadcastLiveQuiz(roomId, { type: advanced ? "room_updated" : "leaderboard_updated" });
      res.json({ locked: true, isCorrect, points, rank: rankRows[0]?.rank || null, advanced });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  });

  app.post("/api/student/live-rooms/:roomId/share", requireStudent, async (req: any, res) => {
    const roomId = Number(req.params.roomId);
    const { rows: members } = await pool.query(
      `SELECT m.id FROM live_quiz_members m JOIN live_quiz_rooms r ON r.id = m.room_id
        WHERE m.room_id = $1 AND m.student_id = $2 AND r.status = 'finished'`,
      [roomId, req.student.id],
    );
    if (!members[0]) return res.status(409).json({ message: "Finish the room before creating a share card" });
    const { rows: existing } = await pool.query(
      `SELECT id, token FROM live_quiz_shares WHERE room_id = $1 AND member_id = $2 AND expires_at > CURRENT_TIMESTAMP
       ORDER BY created_at DESC LIMIT 1`,
      [roomId, members[0].id],
    );
    const existingToken = String(existing[0]?.token || "");
    const token = /^[A-F0-9]{10}$/.test(existingToken) ? existingToken : liveShareCode();
    if (!existing[0]) {
      await pool.query(
        `INSERT INTO live_quiz_shares (room_id, member_id, token, expires_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP + INTERVAL '30 days')`,
        [roomId, members[0].id, token],
      );
    } else if (existingToken !== token) {
      await pool.query("UPDATE live_quiz_shares SET token = $1 WHERE id = $2", [token, existing[0].id]);
    }
    res.json({ token, url: `${req.protocol}://${req.get("host")}/share/quiz/${token}` });
  });

  app.get("/api/student/live-leaderboards/:unitId", requireStudent, async (req, res) => {
    const unitId = Number(req.params.unitId);
    const { rows: memberships } = await pool.query(
      "SELECT 1 FROM unit_memberships WHERE unit_id = $1 AND student_id = $2 AND status = 'enrolled'",
      [unitId, (req as any).student.id],
    );
    if (!memberships[0]) return res.status(403).json({ message: "Enrol in this unit to view its standings" });
    const { rows } = await pool.query(
      `SELECT s.name, SUM(l.score)::int AS score, SUM(l.correct_count)::int AS "correctCount",
              COUNT(DISTINCT l.room_id)::int AS "matchesPlayed"
         FROM live_quiz_leaderboard l JOIN live_quiz_members m ON m.id = l.member_id
         JOIN students s ON s.id = m.student_id JOIN live_quiz_rooms r ON r.id = l.room_id
        WHERE r.unit_id = $1 AND r.status = 'finished'
        GROUP BY s.id, s.name ORDER BY score DESC, "correctCount" DESC LIMIT 20`,
      [unitId],
    );
    res.json(rows);
  });

  app.get("/api/student/live-matches", requireStudent, async (req: any, res) => {
    const { rows } = await pool.query(
      `SELECT r.id, r.room_code AS "roomCode", r.topic, r.finished_at AS "finishedAt", u.name AS "unitName",
              l.score, l.rank, l.correct_count AS "correctCount"
         FROM live_quiz_members m JOIN live_quiz_rooms r ON r.id = m.room_id
         JOIN live_quiz_leaderboard l ON l.member_id = m.id LEFT JOIN units u ON u.id = r.unit_id
        WHERE m.student_id = $1 AND r.status = 'finished' ORDER BY r.finished_at DESC LIMIT 20`,
      [req.student.id],
    );
    res.json(rows);
  });

  app.get("/api/live-share/:token", async (req, res) => {
    const { rows } = await pool.query(
      `SELECT sh.token, sh.expires_at AS "expiresAt", r.id AS "roomId", r.room_code AS "roomCode", r.topic, r.finished_at AS "finishedAt",
              u.name AS "unitName", l.score, l.rank, l.correct_count AS "correctCount"
         FROM live_quiz_shares sh JOIN live_quiz_rooms r ON r.id = sh.room_id
         LEFT JOIN units u ON u.id = r.unit_id LEFT JOIN live_quiz_members m ON m.id = sh.member_id
         LEFT JOIN live_quiz_leaderboard l ON l.member_id = m.id
        WHERE sh.token = $1 AND sh.expires_at > CURRENT_TIMESTAMP AND r.status = 'finished'`,
      [req.params.token],
    );
    if (!rows[0]) return res.status(404).json({ message: "This share card has expired or is unavailable" });
    res.json({ ...rows[0], challenge: `I'm on a roll in ${rows[0].unitName || "clinical practice"} — think you can beat me?` });
  });

  app.get("/share/quiz/:token", async (req, res) => {
    const { rows } = await pool.query(
      `SELECT r.topic, u.name AS "unitName", l.score, l.rank
         FROM live_quiz_shares sh JOIN live_quiz_rooms r ON r.id = sh.room_id
         LEFT JOIN units u ON u.id = r.unit_id LEFT JOIN live_quiz_leaderboard l ON l.member_id = sh.member_id
        WHERE sh.token = $1 AND sh.expires_at > CURRENT_TIMESTAMP AND r.status = 'finished'`,
      [req.params.token],
    );
    if (!rows[0]) return res.status(404).send("This MedQrown quiz share has expired.");
    const card = rows[0];
    const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
    }[character] || character));
    const title = `Can you beat ${card.score} points in ${card.unitName || "clinical practice"}?`;
    const description = `I'm on a roll in ${card.unitName || "clinical practice"} — think you can beat me?`;
    const imageUrl = `${req.protocol}://${req.get("host")}/share/quiz/${encodeURIComponent(req.params.token)}/card.svg`;
    const appCardUrl = `/student/live-rooms/share/${encodeURIComponent(req.params.token)}`;
    res.type("html").send(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:type" content="website"><meta property="og:image" content="${escapeHtml(imageUrl)}"><script>window.location.replace(${JSON.stringify(appCardUrl)});</script></head><body style="margin:0;font-family:ui-sans-serif,system-ui;background:#f4fbfa;color:#102a2a"><main style="max-width:560px;margin:12vh auto;padding:28px"><section style="overflow:hidden;border-radius:24px;background:#fff;box-shadow:0 20px 50px #0f766e22"><div style="padding:42px 30px;background:linear-gradient(135deg,#0f766e,#4338ca);color:white"><p style="margin:0;font-size:12px;font-weight:700;letter-spacing:.16em">MEDQROWN LIVE ROOM</p><h1 style="margin:14px 0 0;font-size:30px">${escapeHtml(title)}</h1></div><div style="padding:28px"><p style="font-size:18px;font-weight:650">${escapeHtml(description)}</p><p style="color:#527070">Opening the interactive score card…</p><a style="display:inline-block;margin-top:10px;padding:12px 18px;border-radius:10px;background:#0f766e;color:white;text-decoration:none;font-weight:700" href="${appCardUrl}">Open challenge card</a></div></section></main></body></html>`);
  });

  app.get("/share/quiz/:token/card.svg", async (req, res) => {
    const { rows } = await pool.query(
      `SELECT r.topic, u.name AS "unitName", l.score, l.rank
         FROM live_quiz_shares sh JOIN live_quiz_rooms r ON r.id = sh.room_id
         LEFT JOIN units u ON u.id = r.unit_id LEFT JOIN live_quiz_leaderboard l ON l.member_id = sh.member_id
        WHERE sh.token = $1 AND sh.expires_at > CURRENT_TIMESTAMP AND r.status = 'finished'`,
      [req.params.token],
    );
    if (!rows[0]) return res.status(404).send("Unavailable");
    const card = rows[0];
    const escapeXml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
    }[character] || character));
    const unit = escapeXml(card.unitName || "Clinical practice").slice(0, 45);
    const topic = escapeXml(card.topic).slice(0, 62);
    res.type("image/svg+xml").send(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0f766e"/><stop offset="1" stop-color="#4338ca"/></linearGradient></defs>
      <rect width="1200" height="630" fill="url(#g)"/><circle cx="1080" cy="110" r="190" fill="#fff" opacity=".08"/><circle cx="1030" cy="550" r="270" fill="#fff" opacity=".06"/>
      <g transform="translate(86 95)"><rect width="170" height="55" rx="27" fill="#fff" opacity=".18"/><text x="85" y="36" text-anchor="middle" fill="#fff" font-family="Arial, sans-serif" font-size="23" font-weight="700">MEDQROWN</text>
      <text y="158" fill="#fff" font-family="Arial, sans-serif" font-size="42" font-weight="600">${unit}</text><text y="222" fill="#dffaf6" font-family="Arial, sans-serif" font-size="30">${topic}</text>
      <text y="365" fill="#fff" font-family="Arial, sans-serif" font-size="112" font-weight="800">${Number(card.score) || 0}</text><text x="320" y="365" fill="#dffaf6" font-family="Arial, sans-serif" font-size="36" font-weight="600">POINTS</text>
      <text y="445" fill="#fff" font-family="Arial, sans-serif" font-size="31">Live room finish · leaderboard #${Number(card.rank) || "—"}</text></g>
      <path d="M1010 235l27 66 71 5-55 45 18 70-61-38-61 38 18-70-55-45 71-5z" fill="#fcd34d"/>
    </svg>`);
  });

  // ── Student self-tests ─────────────────────────────────────────────────────
  const loadSelfTestForStudent = async (testId: number, studentId: number) => {
    const { rows } = await pool.query(
      `SELECT st.*, st.question_type AS "questionType", st.content_style AS "contentStyle",
              st.question_count AS "questionCount", st.timer_seconds AS "timerSeconds",
              st.generation_error AS "generationError",
              u.name AS "unitName", u.code AS "unitCode"
         FROM self_tests st JOIN units u ON u.id = st.unit_id
        WHERE st.id = $1 AND st.student_id = $2`,
      [testId, studentId],
    );
    return rows[0];
  };

  const generateSelfTest = async (test: any) => {
    await pool.query(
      "UPDATE self_tests SET status = 'generating', generation_error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [test.id],
    );
    try {
      let generated = await generateSelfTestQuestions({
        unitName: test.unitName,
        focus: test.focus,
        questionType: test.questionType,
        contentStyle: test.contentStyle,
        count: test.questionCount,
      });
      const matchesRequestedMix = (questions: typeof generated) => {
        const hasMcq = questions.some((question) => question.type === "mcq");
        const hasSaq = questions.some((question) => question.type === "saq");
        return (
          (test.questionType === "mcq" && questions.every((question) => question.type === "mcq")) ||
          (test.questionType === "saq" && questions.every((question) => question.type === "saq")) ||
          (test.questionType === "mixed" && hasMcq && hasSaq)
        );
      };
      // Models occasionally follow the content format but miss one type in the
      // requested mix. Retry the same provider response before surfacing a
      // failure to the student; never persist a mismatched test.
      for (let retry = 0; retry < 2 && !matchesRequestedMix(generated); retry++) {
        generated = await generateSelfTestQuestions({
          unitName: test.unitName,
          focus: test.focus,
          questionType: test.questionType,
          contentStyle: test.contentStyle,
          count: test.questionCount,
        });
      }
      if (!matchesRequestedMix(generated)) {
        throw new Error("The generated question mix did not match your requested format. Please retry.");
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("DELETE FROM self_test_questions WHERE self_test_id = $1", [test.id]);
        for (let index = 0; index < generated.length; index++) {
          const item = generated[index];
          if (!["mcq", "saq"].includes(item.type) || !item.content) {
            throw new Error(`Question ${index + 1} has an invalid format`);
          }
          if (item.type === "mcq") {
            if (!item.options || item.options.length !== 5 || item.options.some((option) => !option)) {
              throw new Error(`Question ${index + 1} needs exactly five answer options`);
            }
            if (!Number.isInteger(item.correctOptionIndex) || item.correctOptionIndex! < 0 || item.correctOptionIndex! >= item.options.length) {
              throw new Error(`Question ${index + 1} does not identify a correct option`);
            }
          } else if (!item.expectedAnswer) {
            throw new Error(`Question ${index + 1} needs a model answer`);
          }
          const { rows: createdQuestions } = await client.query(
            `INSERT INTO self_test_questions
               (self_test_id, type, content, expected_answer, explanation, marks, order_index)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id`,
            [test.id, item.type, item.content, item.expectedAnswer || null, item.explanation || null, item.marks || 1, index],
          );
          if (item.type === "mcq") {
            for (let optionIndex = 0; optionIndex < item.options!.length; optionIndex++) {
              await client.query(
                `INSERT INTO self_test_question_options (question_id, content, is_correct, order_index)
                 VALUES ($1, $2, $3, $4)`,
                [createdQuestions[0].id, item.options![optionIndex], optionIndex === item.correctOptionIndex, optionIndex],
              );
            }
          }
        }
        await client.query(
          "UPDATE self_tests SET status = 'ready', generation_error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
          [test.id],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    } catch (error: any) {
      await pool.query(
        "UPDATE self_tests SET status = 'generation_failed', generation_error = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
        [test.id, String(error?.message || "Question generation failed").slice(0, 600)],
      );
      throw error;
    }
  };

  const selfTestQuestionPayload = async (attempt: any) => {
    const { rows: attemptRows } = await pool.query(
      `SELECT sta.id AS "attemptId", sta.self_test_id AS "selfTestId",
              sta.current_question_index AS "currentQuestionIndex", sta.started_at AS "startedAt",
              st.title, st.timer_seconds AS "timerSeconds", st.question_count AS "questionCount"
         FROM self_test_attempts sta JOIN self_tests st ON st.id = sta.self_test_id
        WHERE sta.id = $1`,
      [attempt.id],
    );
    const meta = attemptRows[0];
    const { rows: questions } = await pool.query(
      "SELECT id, type, content, marks, order_index AS \"orderIndex\" FROM self_test_questions WHERE self_test_id = $1 ORDER BY order_index",
      [meta.selfTestId],
    );
    const question = questions[meta.currentQuestionIndex];
    if (!question) return { ...meta, totalQuestions: questions.length, question: null };
    const { rows: options } = question.type === "mcq"
      ? await pool.query(
          "SELECT id, content, order_index AS \"orderIndex\" FROM self_test_question_options WHERE question_id = $1 ORDER BY order_index",
          [question.id],
        )
      : { rows: [] };
    const { rows: saved } = await pool.query(
      "SELECT answer FROM self_test_responses WHERE attempt_id = $1 AND question_id = $2",
      [attempt.id, question.id],
    );
    return {
      ...meta,
      totalQuestions: questions.length,
      question: { ...question, options, savedAnswer: saved[0]?.answer || null },
    };
  };

  const selfTestTimerExpired = (attempt: { timerSeconds?: number | null; started_at?: string | Date; startedAt?: string | Date }) => {
    if (!attempt.timerSeconds) return false;
    const startedAt = attempt.startedAt || attempt.started_at;
    return !!startedAt && Date.now() >= new Date(startedAt).getTime() + attempt.timerSeconds * 1000;
  };

  app.get("/api/student/self-tests", requireStudent, async (req: any, res) => {
    const { rows } = await pool.query(
      `SELECT st.id, st.title, st.focus, st.question_type AS "questionType",
              st.content_style AS "contentStyle", st.question_count AS "questionCount",
              st.timer_seconds AS "timerSeconds", st.status, st.generation_error AS "generationError",
              st.created_at AS "createdAt", st.updated_at AS "updatedAt", u.name AS "unitName",
              latest.id AS "latestAttemptId", latest.status AS "latestAttemptStatus",
              latest.submitted_at AS "submittedAt",
              COALESCE((SELECT SUM(q.marks) FROM self_test_questions q WHERE q.self_test_id = st.id), 0)::float AS "totalMarks",
              COALESCE((SELECT SUM(r.marks_awarded) FROM self_test_responses r WHERE r.attempt_id = latest.id), 0)::float AS "earnedMarks"
         FROM self_tests st
         JOIN units u ON u.id = st.unit_id
         LEFT JOIN LATERAL (
           SELECT id, status, submitted_at FROM self_test_attempts
            WHERE self_test_id = st.id AND student_id = $1
            ORDER BY started_at DESC, id DESC LIMIT 1
         ) latest ON true
        WHERE st.student_id = $1
        ORDER BY st.updated_at DESC`,
      [req.student.id],
    );
    const withAttemptHistory = await Promise.all(rows.map(async (row) => {
      const { rows: attempts } = await pool.query(
        `SELECT a.id AS "attemptId", a.status, a.started_at AS "startedAt", a.submitted_at AS "submittedAt",
                COALESCE((SELECT SUM(q.marks) FROM self_test_questions q WHERE q.self_test_id = a.self_test_id), 0)::float AS "totalMarks",
                COALESCE((SELECT SUM(r.marks_awarded) FROM self_test_responses r WHERE r.attempt_id = a.id), 0)::float AS "earnedMarks"
           FROM self_test_attempts a
          WHERE a.self_test_id = $1 AND a.student_id = $2
          ORDER BY a.started_at DESC, a.id DESC`,
        [row.id, req.student.id],
      );
      return {
        ...row,
        scorePercent: row.latestAttemptStatus === "submitted" && row.totalMarks
          ? Math.round((row.earnedMarks / row.totalMarks) * 100)
          : null,
        attempts: attempts.map((attempt) => ({
          ...attempt,
          scorePercent: attempt.status === "submitted" && attempt.totalMarks
            ? Math.round((attempt.earnedMarks / attempt.totalMarks) * 100)
            : null,
        })),
      };
    }));
    res.json(withAttemptHistory);
  });

  app.post("/api/student/self-tests", requireStudent, async (req: any, res) => {
    const unitId = Number(req.body?.unitId);
    const questionCount = Number(req.body?.questionCount);
    const timerSeconds = req.body?.timerSeconds == null || req.body.timerSeconds === "" ? null : Number(req.body.timerSeconds);
    const questionType = String(req.body?.questionType || "mixed");
    const contentStyle = String(req.body?.contentStyle || "mixed");
    const focus = String(req.body?.focus || "").trim();
    if (focus.length > TEXT_LIMITS.selfTestFocus) {
      return res.status(400).json({ message: `Focus area must be ${TEXT_LIMITS.selfTestFocus} characters or fewer` });
    }
    if (!Number.isInteger(unitId) || !Number.isInteger(questionCount) || questionCount < 3 || questionCount > 20) {
      return res.status(400).json({ message: "Choose an enrolled unit and between 3 and 20 questions" });
    }
    if (!["mcq", "saq", "mixed"].includes(questionType) || !["direct", "clinical", "mixed"].includes(contentStyle)) {
      return res.status(400).json({ message: "Choose valid question and content styles" });
    }
    if (timerSeconds !== null && (!Number.isInteger(timerSeconds) || timerSeconds < 30 || timerSeconds > 3600)) {
      return res.status(400).json({ message: "Timer must be between 30 seconds and 60 minutes" });
    }
    const { rows: units } = await pool.query(
      `SELECT u.name, u.code FROM units u JOIN unit_memberships um ON um.unit_id = u.id
        WHERE u.id = $1 AND um.student_id = $2 AND um.status = 'enrolled'`,
      [unitId, req.student.id],
    );
    if (!units[0]) return res.status(403).json({ message: "Choose one of your enrolled units" });
    const title = String(req.body?.title || `${units[0].code} practice`).trim();
    if (title.length > 120) return res.status(400).json({ message: "Title must be 120 characters or fewer" });
    const isDraft = req.body?.saveOnly === true;
    const { rows: created } = await pool.query(
      `INSERT INTO self_tests
        (student_id, unit_id, title, focus, question_type, content_style, question_count, timer_seconds, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
       [req.student.id, unitId, title || `${units[0].code} practice`, focus || null, questionType, contentStyle, questionCount, timerSeconds, isDraft ? "draft" : "generating"],
    );
    const test = { ...created[0], studentId: req.student.id, unitName: units[0].name, ...{
      focus: focus || null, questionType, contentStyle, questionCount,
    } };
    if (isDraft) return res.status(201).json({ ...test, status: "draft" });
    try {
      await generateSelfTest(test);
      res.status(201).json(await loadSelfTestForStudent(test.id, req.student.id));
    } catch (error: any) {
      res.status(502).json({ message: "We could not generate this self-test. Your setup was saved so you can retry.", testId: test.id });
    }
  });

  app.post("/api/student/self-tests/:id/generate", requireStudent, async (req: any, res) => {
    const test = await loadSelfTestForStudent(Number(req.params.id), req.student.id);
    if (!test) return res.status(404).json({ message: "Self-test not found" });
    if (test.status === "ready") return res.json(test);
    try {
      await generateSelfTest(test);
      res.json(await loadSelfTestForStudent(test.id, req.student.id));
    } catch {
      res.status(502).json({ message: "We could not generate this self-test. Please try again shortly.", testId: test.id });
    }
  });

  app.delete("/api/student/self-tests/:id", requireStudent, async (req: any, res) => {
    const { rowCount } = await pool.query(
      "DELETE FROM self_tests WHERE id = $1 AND student_id = $2",
      [Number(req.params.id), req.student.id],
    );
    if (!rowCount) return res.status(404).json({ message: "Self-test not found" });
    res.json({ ok: true });
  });

  app.get("/api/student/self-tests/:id", requireStudent, async (req: any, res) => {
    const test = await loadSelfTestForStudent(Number(req.params.id), req.student.id);
    if (!test) return res.status(404).json({ message: "Self-test not found" });
    const { rows: questions } = await pool.query(
      "SELECT id, type, content, marks, order_index AS \"orderIndex\" FROM self_test_questions WHERE self_test_id = $1 ORDER BY order_index",
      [test.id],
    );
    res.json({ ...test, questions });
  });

  app.post("/api/student/self-tests/:id/start", requireStudent, async (req: any, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows: tests } = await client.query(
        `SELECT st.* FROM self_tests st WHERE st.id = $1 AND st.student_id = $2 FOR UPDATE`,
        [Number(req.params.id), req.student.id],
      );
      const test = tests[0];
      if (!test) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Self-test not found" });
      }
      if (test.status !== "ready") {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Generate this self-test before starting it" });
      }
      const { rows: questionCount } = await client.query(
        "SELECT COUNT(*)::int AS count FROM self_test_questions WHERE self_test_id = $1",
        [test.id],
      );
      if (!questionCount[0]?.count) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "This self-test has no questions yet" });
      }
      const { rows: existing } = await client.query(
        `SELECT * FROM self_test_attempts
          WHERE self_test_id = $1 AND student_id = $2 AND status = 'in_progress'
          ORDER BY started_at DESC LIMIT 1`,
        [test.id, req.student.id],
      );
      let attempt = existing[0];
      if (!attempt) {
        const { rows } = await client.query(
          `INSERT INTO self_test_attempts (self_test_id, student_id, status)
           VALUES ($1, $2, 'in_progress') RETURNING *`,
          [test.id, req.student.id],
        );
        attempt = rows[0];
      }
      await client.query("COMMIT");
      res.json(await selfTestQuestionPayload(attempt));
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  });

  app.get("/api/student/self-test-attempts/:attemptId", requireStudent, async (req: any, res) => {
    const { rows } = await pool.query(
      "SELECT * FROM self_test_attempts WHERE id = $1 AND student_id = $2 AND status = 'in_progress'",
      [Number(req.params.attemptId), req.student.id],
    );
    if (!rows[0]) return res.status(404).json({ message: "Active self-test attempt not found" });
    res.json(await selfTestQuestionPayload(rows[0]));
  });

  app.post("/api/student/self-test-attempts/:attemptId/answer", requireStudent, async (req: any, res) => {
    const attemptId = Number(req.params.attemptId);
    const questionId = Number(req.body?.questionId);
    const answer = String(req.body?.answer || "").trim();
    if (answer.length > TEXT_LIMITS.answer) {
      return res.status(400).json({ message: `Answers must be ${TEXT_LIMITS.answer} characters or fewer` });
    }
    const { rows: attempts } = await pool.query(
      `SELECT sta.*, st.timer_seconds AS "timerSeconds"
         FROM self_test_attempts sta JOIN self_tests st ON st.id = sta.self_test_id
        WHERE sta.id = $1 AND sta.student_id = $2 AND sta.status = 'in_progress'`,
      [attemptId, req.student.id],
    );
    const attempt = attempts[0];
    if (!attempt) return res.status(404).json({ message: "Active self-test attempt not found" });
    if (selfTestTimerExpired(attempt)) {
      return res.status(409).json({ message: "The time limit has expired.", code: "TIME_LIMIT_EXPIRED" });
    }
    const { rows: questions } = await pool.query(
      "SELECT * FROM self_test_questions WHERE id = $1 AND self_test_id = $2",
      [questionId, attempt.self_test_id],
    );
    const question = questions[0];
    if (!question) return res.status(400).json({ message: "Question does not belong to this self-test" });
    let isCorrect: boolean | null = null;
    let marksAwarded: number | null = null;
    let feedback: string | null = null;
    if (question.type === "mcq") {
      const { rows: options } = await pool.query(
        "SELECT is_correct AS \"isCorrect\" FROM self_test_question_options WHERE id = $1 AND question_id = $2",
        [Number(answer), question.id],
      );
      if (!options[0]) return res.status(400).json({ message: "Choose a valid answer option" });
      isCorrect = options[0].isCorrect;
      marksAwarded = isCorrect ? question.marks : 0;
    } else if (answer) {
      const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
      const submitted = normalise(answer);
      const expected = normalise(question.expected_answer || "");
      isCorrect = !!expected && (submitted === expected || (expected.length > 4 && submitted.includes(expected)));
      marksAwarded = isCorrect ? question.marks : 0;
      feedback = null;
    }
    await pool.query(
      `INSERT INTO self_test_responses (attempt_id, question_id, answer, is_correct, marks_awarded, ai_feedback)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (attempt_id, question_id) DO UPDATE
       SET answer = EXCLUDED.answer, is_correct = EXCLUDED.is_correct,
           marks_awarded = EXCLUDED.marks_awarded, ai_feedback = EXCLUDED.ai_feedback`,
      [attemptId, question.id, answer || null, isCorrect, marksAwarded, feedback],
    );
    res.json({ ok: true });
  });

  app.post("/api/student/self-test-attempts/:attemptId/next", requireStudent, async (req: any, res) => {
    const attemptId = Number(req.params.attemptId);
    const expectedIndex = Number(req.body?.expectedCurrentQuestionIndex);
    const { rows } = await pool.query(
      `SELECT sta.*, st.timer_seconds AS "timerSeconds"
         FROM self_test_attempts sta JOIN self_tests st ON st.id = sta.self_test_id
        WHERE sta.id = $1 AND sta.student_id = $2 AND sta.status = 'in_progress'`,
      [attemptId, req.student.id],
    );
    const attempt = rows[0];
    if (!attempt) return res.status(404).json({ message: "Active self-test attempt not found" });
    if (selfTestTimerExpired(attempt)) {
      return res.status(409).json({ message: "The time limit has expired.", code: "TIME_LIMIT_EXPIRED" });
    }
    if (!Number.isInteger(expectedIndex) || expectedIndex !== attempt.current_question_index) {
      return res.status(409).json({ message: "This self-test has already moved forward", staleRequest: true });
    }
    const { rows: questionCount } = await pool.query(
      "SELECT COUNT(*)::int AS count FROM self_test_questions WHERE self_test_id = $1",
      [attempt.self_test_id],
    );
    if (attempt.current_question_index + 1 >= questionCount[0].count) {
      return res.status(400).json({ message: "No more questions", isLastQuestion: true });
    }
    await pool.query(
      "UPDATE self_test_attempts SET current_question_index = current_question_index + 1 WHERE id = $1",
      [attemptId],
    );
    res.json(await selfTestQuestionPayload({ id: attemptId }));
  });

  app.post("/api/student/self-test-attempts/:attemptId/submit", requireStudent, async (req: any, res) => {
    const attemptId = Number(req.params.attemptId);
    const { rows: activeAttempts } = await pool.query(
      `SELECT sta.*, st.timer_seconds AS "timerSeconds"
         FROM self_test_attempts sta JOIN self_tests st ON st.id = sta.self_test_id
        WHERE sta.id = $1 AND sta.student_id = $2 AND sta.status = 'in_progress'`,
      [attemptId, req.student.id],
    );
    const activeAttempt = activeAttempts[0];
    if (!activeAttempt) return res.status(404).json({ message: "Active self-test attempt not found" });
    const timedOut = selfTestTimerExpired(activeAttempt);
    const { rowCount } = await pool.query(
      `UPDATE self_test_attempts SET status = 'submitted', submitted_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND student_id = $2 AND status = 'in_progress'`,
      [attemptId, req.student.id],
    );
    if (!rowCount) return res.status(404).json({ message: "Active self-test attempt not found" });
    res.json({ ok: true, timedOut });
  });

  app.get("/api/student/self-test-attempts/:attemptId/results", requireStudent, async (req: any, res) => {
    const { rows: attempts } = await pool.query(
      `SELECT sta.*, st.title, st.focus, u.name AS "unitName"
         FROM self_test_attempts sta
         JOIN self_tests st ON st.id = sta.self_test_id JOIN units u ON u.id = st.unit_id
        WHERE sta.id = $1 AND sta.student_id = $2 AND sta.status = 'submitted'`,
      [Number(req.params.attemptId), req.student.id],
    );
    const attempt = attempts[0];
    if (!attempt) return res.status(404).json({ message: "Completed self-test not found" });
    const { rows: questions } = await pool.query(
      `SELECT q.id, q.type, q.content, q.explanation, q.marks,
              q.order_index AS "orderIndex", r.answer AS "studentAnswer",
              r.is_correct AS "isCorrect", r.marks_awarded AS "marksAwarded", r.ai_feedback AS "aiFeedback"
         FROM self_test_questions q LEFT JOIN self_test_responses r ON r.question_id = q.id AND r.attempt_id = $2
        WHERE q.self_test_id = $1 ORDER BY q.order_index`,
      [attempt.self_test_id, attempt.id],
    );
    const enriched = await Promise.all(questions.map(async (question) => {
      const { rows: options } = question.type === "mcq"
        ? await pool.query(
            "SELECT id, content, is_correct AS \"isCorrect\", order_index AS \"orderIndex\" FROM self_test_question_options WHERE question_id = $1 ORDER BY order_index",
            [question.id],
          )
        : { rows: [] };
      return { ...question, options };
    }));
    const totalMarks = enriched.reduce((sum, question) => sum + question.marks, 0);
    const earnedMarks = enriched.reduce((sum, question) => sum + (question.marksAwarded || 0), 0);
    res.json({
      attemptId: attempt.id, title: attempt.title, testTitle: attempt.title, focus: attempt.focus, unitName: attempt.unitName,
      submittedAt: attempt.submitted_at, totalMarks, earnedMarks, totalScore: earnedMarks, maxScore: totalMarks,
      scorePercent: totalMarks ? Math.round((earnedMarks / totalMarks) * 100) : 0,
      percentage: totalMarks ? Math.round((earnedMarks / totalMarks) * 100) : 0,
      questions: enriched,
    });
  });

  app.post("/api/student/self-test-questions/:questionId/report", requireStudent, async (req: any, res) => {
    const reason = String(req.body?.reason || "").trim();
    if (!reason || reason.length > 500) return res.status(400).json({ message: "Provide a report reason of up to 500 characters" });
    const { rows: questions } = await pool.query(
      `SELECT q.id FROM self_test_questions q JOIN self_tests st ON st.id = q.self_test_id
        WHERE q.id = $1 AND st.student_id = $2`,
      [Number(req.params.questionId), req.student.id],
    );
    if (!questions[0]) return res.status(404).json({ message: "Question not found" });
    await pool.query(
      `INSERT INTO self_test_question_reports (question_id, student_id, reason)
       VALUES ($1, $2, $3)
       ON CONFLICT (question_id, student_id) DO UPDATE SET reason = EXCLUDED.reason, status = 'pending', created_at = CURRENT_TIMESTAMP`,
      [questions[0].id, req.student.id, reason],
    );
    res.json({ ok: true });
  });

  app.get("/api/admin/self-test-question-reports", requireAdmin, async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT r.id, r.reason, r.status, r.created_at AS "createdAt",
              s.name AS "studentName", s.email AS "studentEmail",
              q.id AS "questionId", q.type, q.content, q.expected_answer AS "modelAnswer",
              st.title AS "selfTestTitle", u.name AS "unitName"
         FROM self_test_question_reports r
         JOIN students s ON s.id = r.student_id
         JOIN self_test_questions q ON q.id = r.question_id
         JOIN self_tests st ON st.id = q.self_test_id
         JOIN units u ON u.id = st.unit_id
        ORDER BY CASE WHEN r.status = 'pending' THEN 0 ELSE 1 END, r.created_at DESC`,
    );
    res.json(rows);
  });

  app.patch("/api/admin/self-test-question-reports/:id", requireAdmin, async (req, res) => {
    const status = String(req.body?.status || "");
    if (!["reviewed", "dismissed"].includes(status)) {
      return res.status(400).json({ message: "Set the report to reviewed or dismissed" });
    }
    const { rowCount } = await pool.query(
      "UPDATE self_test_question_reports SET status = $1 WHERE id = $2",
      [status, Number(req.params.id)],
    );
    if (!rowCount) return res.status(404).json({ message: "Report not found" });
    res.json({ ok: true });
  });

  app.get("/api/student/past-exams", requireStudent, async (req: any, res) => {
    const { rows } = await pool.query(
      `SELECT a.id AS "attemptId", es.id AS "examStudentId", e.id AS "examId", e.title, u.name AS "unitName",
              a.submitted_at AS "submittedAt",
              COALESCE(SUM(r.marks_awarded), 0)::float AS "earnedMarks",
               COALESCE(SUM(CASE WHEN r.subquestion_id IS NOT NULL THEN sq.marks ELSE q.marks END), 0)::float AS "totalMarks"
         FROM exam_students es
         JOIN exams e ON e.id = es.exam_id
         LEFT JOIN units u ON u.id = e.unit_id
         JOIN attempts a ON a.exam_student_id = es.id AND a.status = 'submitted'
         LEFT JOIN responses r ON r.attempt_id = a.id
         LEFT JOIN questions q ON q.id = r.question_id
           LEFT JOIN subquestions sq ON sq.id = r.subquestion_id
         WHERE es.student_id = $1 AND e.results_released = true
         GROUP BY a.id, es.id, e.id, e.title, u.name, a.submitted_at
        ORDER BY a.submitted_at DESC`,
      [req.student.id],
    );
    res.json(rows.map((row) => ({ ...row, scorePercent: row.totalMarks ? Math.round((row.earnedMarks / row.totalMarks) * 100) : 0 })));
  });

  app.get("/api/student/past-exams/:attemptId", requireStudent, async (req: any, res) => {
    const attemptId = Number(req.params.attemptId);
    const { rows: access } = await pool.query(
      `SELECT a.id FROM attempts a JOIN exam_students es ON es.id = a.exam_student_id
        JOIN exams e ON e.id = es.exam_id
        WHERE a.id = $1 AND es.student_id = $2 AND a.status = 'submitted' AND e.results_released = true`,
      [attemptId, req.student.id],
    );
    if (!access[0]) return res.status(404).json({ message: "Past exam not found" });
    const { rows: details } = await pool.query(
      `SELECT a.id AS "attemptId", es.id AS "examStudentId", e.id AS "examId", e.title, u.name AS "unitName",
              a.submitted_at AS "submittedAt",
              COALESCE(SUM(r.marks_awarded), 0)::float AS "earnedMarks",
              COALESCE(SUM(CASE WHEN r.subquestion_id IS NOT NULL THEN sq.marks ELSE q.marks END), 0)::float AS "totalMarks"
         FROM exam_students es JOIN exams e ON e.id = es.exam_id
         LEFT JOIN units u ON u.id = e.unit_id
         JOIN attempts a ON a.exam_student_id = es.id AND a.status = 'submitted'
         LEFT JOIN responses r ON r.attempt_id = a.id LEFT JOIN questions q ON q.id = r.question_id
         LEFT JOIN subquestions sq ON sq.id = r.subquestion_id
         WHERE a.id = $1 GROUP BY a.id, es.id, e.id, e.title, u.name, a.submitted_at`,
      [attemptId],
    );
    if (!details[0]) return res.status(404).json({ message: "Submitted attempt not found" });
    const { rows: responses } = await pool.query(
      `SELECT CASE WHEN r.subquestion_id IS NOT NULL THEN sq.content ELSE q.content END AS question,
               q.explanation,
               CASE WHEN r.subquestion_id IS NOT NULL THEN sq.marks ELSE q.marks END AS marks,
               r.subquestion_id AS "subquestionId", r.answer, r.is_correct AS "isCorrect",
               r.marks_awarded AS "marksAwarded", r.ai_feedback AS "aiFeedback",
               selected_option.content AS "answerDisplay"
         FROM attempts a JOIN responses r ON r.attempt_id = a.id JOIN questions q ON q.id = r.question_id
          LEFT JOIN subquestions sq ON sq.id = r.subquestion_id
          LEFT JOIN question_options selected_option
            ON selected_option.question_id = q.id
           AND selected_option.id = CASE
             WHEN r.answer ~ '^[0-9]+$' THEN r.answer::integer
             ELSE NULL
           END
          WHERE a.id = $1 ORDER BY q.order_index, sq.order_index NULLS FIRST`,
      [attemptId],
    );
    const detail = details[0];
    res.json({ ...detail, scorePercent: detail.totalMarks ? Math.round((detail.earnedMarks / detail.totalMarks) * 100) : 0, responses });
  });

  app.get("/api/student/profile/requests", requireStudent, async (req: any, res) => {
    const { rows } = await pool.query(
      `SELECT id, field_name AS "fieldName", requested_value AS "requestedValue", reason, status,
              review_reason AS "reviewReason", created_at AS "createdAt"
         FROM profile_change_requests WHERE student_id = $1 ORDER BY created_at DESC`,
      [req.student.id],
    );
    res.json(rows);
  });

  app.post("/api/student/profile/avatar", requireStudent, async (req: any, res) => {
    const avatarKey = req.body?.avatarKey;
    const legacyAvatarKeys = ["teal", "navy", "violet", "amber", "rose", "forest"];
    const isGalleryAvatar = typeof avatarKey === "string"
      && /^(adventurer|lorelei|notionists|big-smile|avataaars|micah|personas|open-peeps|fun-emoji|pixel-art|bottts|thumbs):[A-Za-z0-9_-]+$/.test(avatarKey);
    if (!legacyAvatarKeys.includes(avatarKey) && !isGalleryAvatar) {
      return res.status(400).json({ message: "Choose an avatar from the available collection" });
    }
    await pool.query("UPDATE students SET avatar_key = $1 WHERE id = $2", [avatarKey, req.student.id]);
    res.json({ ok: true, avatarKey });
  });

  app.post("/api/student/profile/requests", requireStudent, async (req: any, res) => {
    const fieldMap: Record<string, string> = { name: "name", university: "university" };
    const fieldName = fieldMap[String(req.body?.fieldName || "")];
    const requestedValue = String(req.body?.requestedValue || "").trim();
    const reason = String(req.body?.reason || "").trim();
    if (!fieldName || !requestedValue || requestedValue.length > 120 || reason.length > TEXT_LIMITS.reportReason) {
      return res.status(400).json({ message: "Provide a valid profile change request" });
    }
    await pool.query(
      "INSERT INTO profile_change_requests (student_id, field_name, requested_value, reason) VALUES ($1, $2, $3, $4)",
      [req.student.id, fieldName, requestedValue, reason || null],
    );
    res.json({ ok: true });
  });

  // Student Portal APIs
  app.get("/api/student/active-exams", async (req, res) => {
    const { db } = await import("./db");
    const { exams: examsTable } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    const activeExams = await db.select({ id: examsTable.id, title: examsTable.title })
      .from(examsTable).where(eq(examsTable.status, "active"));
    res.json(activeExams);
  });

  app.post("/api/student/login", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }
    if (typeof email !== "string" || typeof password !== "string" || email.length > TEXT_LIMITS.email || password.length > TEXT_LIMITS.password) {
      return res.status(400).json({ message: "Enter a valid email and password" });
    }
    const normalizedEmail = String(email).trim().toLowerCase();

    const { rows } = await pool.query(
      `SELECT sa.password_hash AS "passwordHash", sa.is_active AS "isActive", s.id AS "studentId"
         FROM student_accounts sa JOIN students s ON s.id = sa.student_id
        WHERE LOWER(s.email) = $1`,
      [normalizedEmail],
    );
    const account = rows[0];
    if (!account) {
      // Invite-only accounts: say whether the email is unknown or just not activated yet.
      const { rows: pending } = await pool.query("SELECT 1 FROM students WHERE LOWER(email) = $1", [normalizedEmail]);
      return res.status(401).json({
        code: pending[0] ? "NOT_ACTIVATED" : "NO_ACCOUNT",
        message: pending[0]
          ? "Your account isn't activated yet. Use the set-password link in your invite email (check Spam), or ask us to resend it."
          : "We couldn't find an account with that email. Check the spelling, or use the email you registered with.",
      });
    }
    if (!account.isActive) {
      return res.status(403).json({ code: "DISABLED", message: "This account has been disabled. Please contact us on WhatsApp or email." });
    }
    if (!(await bcrypt.compare(password, account.passwordHash))) {
      return res.status(401).json({ code: "WRONG_PASSWORD", message: "Incorrect password. Try again, or tap \"Forgot password?\" to reset it." });
    }
    (req.session as any).studentId = account.studentId;
    delete (req.session as any).examStudentId;
    delete (req.session as any).studentExamId;
    res.json({ studentId: account.studentId, accountType: "dashboard" });
  });

  app.get("/api/student/session", async (req, res) => {
    const studentId = (req.session as any)?.studentId;
    if (studentId && !(req.session as any)?.examStudentId) {
      const student = await storage.getStudent(studentId);
      if (!student) return res.status(401).json({ message: "Not authenticated" });
      return res.json({ studentId: student.id, studentName: student.name, accountType: "dashboard" });
    }
    const esId = (req.session as any)?.examStudentId;
    if (!esId) return res.status(401).json({ message: "Not authenticated" });
    const es = await storage.getExamStudent(esId);
    if (!es) return res.status(401).json({ message: "Not authenticated" });
    const authenticatedStudentId = (req.session as any)?.studentId;
    if (authenticatedStudentId && Number(authenticatedStudentId) !== es.studentId) {
      return res.status(403).json({ message: "This exam session belongs to another student" });
    }
    const student = await storage.getStudent(es.studentId);
    res.json({
      examStudentId: es.id,
      examId: es.examId,
      studentName: student?.name,
      attemptStatus: es.attemptStatus,
    });
  });

  app.post("/api/student/logout", (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
  });

  app.get("/api/student/exam-info", async (req, res) => {
    const esId = (req.session as any)?.examStudentId;
    if (!esId) return res.status(401).json({ message: "Not authenticated" });
    const es = await storage.getExamStudent(esId);
    if (!es) return res.status(401).json({ message: "Not authenticated" });
    const authenticatedStudentId = (req.session as any)?.studentId;
    if (authenticatedStudentId && Number(authenticatedStudentId) !== es.studentId) {
      return res.status(403).json({ message: "This exam session belongs to another student" });
    }
    const access = await studentExamAccess(es.examId, es.studentId);
    if (!access.allowed) return res.status(access.status || 403).json({ message: access.message, code: (access as any).code });
    const exam = await storage.getExam(es.examId);
    if (!exam) return res.status(404).json({ message: "Exam not found" });
    const qs = await storage.getQuestionsByExam(exam.id);
    const entitlement = await getAttemptEntitlement(exam.id, es.studentId);
    const mcqCount = qs.filter(q => q.type === "mcq").length;
    const saqCount = qs.filter(q => q.type === "saq").length;
    res.json({
      examId: exam.id,
      title: exam.title,
      timerMode: exam.timerMode,
      perQuestionSeconds: exam.perQuestionSeconds,
      fullExamSeconds: exam.fullExamSeconds,
      totalQuestions: qs.length,
      mcqCount,
      saqCount,
      attemptStatus: es.attemptStatus,
      // Approved reattempts extend the allowance, so "Attempt N of M" never exceeds M.
      maxAttempts: (entitlement?.maxAttempts ?? exam.maxAttempts ?? 1) + (entitlement?.approvedReattempts ?? 0),
      attemptsUsed: entitlement?.submittedAttempts ?? 0,
      instructions: exam.instructions ?? null,
    });
  });

  app.patch("/api/exams/:id/instructions", requireAdmin, async (req, res) => {
    const examId = parseInt(req.params.id);
    const { instructions } = req.body;
    await storage.updateExam(examId, { instructions: instructions ?? null } as any);
    res.json({ ok: true });
  });

  app.post("/api/student/start-exam", async (req, res) => {
    const esId = (req.session as any)?.examStudentId;
    if (!esId) return res.status(401).json({ message: "Not authenticated" });
    const initialExamStudent = await storage.getExamStudent(esId);
    if (!initialExamStudent) return res.status(401).json({ message: "Session expired" });
    const authenticatedStudentId = (req.session as any)?.studentId;
    if (authenticatedStudentId && Number(authenticatedStudentId) !== initialExamStudent.studentId) {
      return res.status(403).json({ message: "This exam session belongs to another student" });
    }
    const access = await studentExamAccess(initialExamStudent.examId, initialExamStudent.studentId);
    if (!access.allowed) return res.status(access.status || 403).json({ message: access.message, code: (access as any).code });
    await submitDueStage6Attempts();
    let es: { id: number; examId: number; studentId: number } | undefined;
    let attempt: any;
    const transaction = await pool.connect();
    try {
      await transaction.query("BEGIN");
      await transaction.query(
        "SELECT pg_advisory_xact_lock($1::int, $2::int)",
        [initialExamStudent.examId, initialExamStudent.studentId],
      );
      const { rows: examStudents } = await transaction.query(
        `SELECT id, exam_id AS "examId", student_id AS "studentId"
           FROM exam_students WHERE id = $1 FOR UPDATE`,
        [esId],
      );
      es = examStudents[0];
      if (!es) {
        await transaction.query("ROLLBACK");
        return res.status(401).json({ message: "Session expired" });
      }

      const { rows: existingAttempts } = await transaction.query(
        `SELECT a.id, a.exam_student_id AS "examStudentId", a.status,
                a.current_question_index AS "currentQuestionIndex", a.remaining_time AS "remainingTime",
                a.started_at AS "startedAt", a.question_started_at AS "questionStartedAt",
                a.submitted_at AS "submittedAt"
           FROM attempts a JOIN exam_students owner_es ON owner_es.id = a.exam_student_id
          WHERE owner_es.exam_id = $1 AND owner_es.student_id = $2
          ORDER BY a.started_at DESC, a.id DESC LIMIT 1`,
        [es.examId, es.studentId],
      );
      attempt = existingAttempts[0];

      if (attempt?.status !== "in_progress") {
        const { rows: examRows } = await transaction.query(
          `SELECT COALESCE(max_attempts, 1)::int AS "maxAttempts",
                  duration_minutes AS "durationMinutes", closes_at AS "closesAt"
             FROM exams WHERE id = $1`,
          [es.examId],
        );
        if (!examRows[0]) {
          await transaction.query("ROLLBACK");
          return res.status(404).json({ message: "Exam not found" });
        }
        const { rows: counts } = await transaction.query(
          `SELECT COUNT(*)::int AS count FROM attempts a
            JOIN exam_students owner_es ON owner_es.id = a.exam_student_id
           WHERE owner_es.exam_id = $1 AND owner_es.student_id = $2 AND a.status = 'submitted'`,
          [es.examId, es.studentId],
        );
        const submittedAttempts = counts[0].count;
        let approvedRequestId: number | null = null;
        if (submittedAttempts >= examRows[0].maxAttempts) {
          const { rows: approvals } = await transaction.query(
            `SELECT id FROM exam_reattempt_requests
              WHERE exam_id = $1 AND student_id = $2
                AND status = 'approved' AND consumed_at IS NULL
              ORDER BY reviewed_at DESC NULLS LAST, created_at DESC
              LIMIT 1 FOR UPDATE`,
            [es.examId, es.studentId],
          );
          approvedRequestId = approvals[0]?.id ?? null;
          if (!approvedRequestId) {
            await transaction.query("ROLLBACK");
            return res.status(403).json({
              message: "You have used all allowed attempts for this exam. Request a reattempt from your unit page.",
              code: "ATTEMPT_LIMIT_REACHED",
            });
          }
        }

        const { rows: newAttempts } = await transaction.query(
          `INSERT INTO attempts (exam_student_id, status, current_question_index, remaining_time, question_started_at)
           VALUES ($1, 'in_progress', 0, $2, CURRENT_TIMESTAMP)
           RETURNING id, exam_student_id AS "examStudentId", status,
                     current_question_index AS "currentQuestionIndex", remaining_time AS "remainingTime",
                     started_at AS "startedAt", question_started_at AS "questionStartedAt",
                     submitted_at AS "submittedAt"`,
          [es.id, examRows[0].durationMinutes ? Number(examRows[0].durationMinutes) * 60 : null],
        );
        attempt = newAttempts[0];
        if (approvedRequestId) {
          await transaction.query(
            `UPDATE exam_reattempt_requests SET consumed_at = CURRENT_TIMESTAMP
              WHERE id = $1 AND status = 'approved' AND consumed_at IS NULL`,
            [approvedRequestId],
          );
        }
        await transaction.query("UPDATE exam_students SET attempt_status = 'in_progress' WHERE id = $1", [es.id]);
      }
      await transaction.query("COMMIT");
    } catch (error) {
      await transaction.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      transaction.release();
    }

    const exam = await storage.getExam(es.examId);
    (req.session as any).examStudentId = attempt.examStudentId;
    if (!attempt.questionStartedAt) {
      const now = new Date();
      await storage.updateAttempt(attempt.id, { questionStartedAt: now });
      attempt = { ...attempt, questionStartedAt: now };
    }
    const qs = await storage.getQuestionsByExam(es.examId);
    const currentQ = qs[attempt.currentQuestionIndex];
    let questionData: any = null;
    if (currentQ) {
      const options = currentQ.type === "mcq" ? await storage.getQuestionOptions(currentQ.id) : [];
      const subs = currentQ.hasSubquestions ? await storage.getSubquestions(currentQ.id) : [];
      const existingResponse = await storage.getResponse(attempt.id, currentQ.id);
      questionData = {
        ...currentQ,
        expectedAnswer: undefined,
        explanation: undefined, // never reveal explanations before results are released
        options: options.map(o => ({ id: o.id, content: o.content, orderIndex: o.orderIndex })),
        subquestions: subs.map(s => ({ id: s.id, content: s.content, marks: s.marks, orderIndex: s.orderIndex })),
        savedAnswer: existingResponse?.answer || null,
      };

      if (currentQ.hasSubquestions) {
        const subResponses: Record<number, string> = {};
        for (const s of subs) {
          const sr = await storage.getResponse(attempt.id, currentQ.id, s.id);
          if (sr?.answer) subResponses[s.id] = sr.answer;
        }
        questionData.savedSubAnswers = subResponses;
      }
    }

    const upcomingImageUrl = qs[attempt.currentQuestionIndex + 1]?.imageUrl || null;
    const durationDeadline = exam?.durationMinutes
      ? new Date(new Date(attempt.startedAt).getTime() + Number(exam.durationMinutes) * 60_000)
      : null;
    const closeDeadline = exam?.closesAt ? new Date(exam.closesAt) : null;
    const deadlineAt = durationDeadline && closeDeadline
      ? (durationDeadline < closeDeadline ? durationDeadline : closeDeadline)
      : durationDeadline || closeDeadline;

    res.json({
      attemptId: attempt.id,
      currentQuestionIndex: attempt.currentQuestionIndex,
      totalQuestions: qs.length,
      timerMode: exam?.timerMode,
      perQuestionSeconds: exam?.perQuestionSeconds,
      fullExamSeconds: exam?.fullExamSeconds,
      questionStartedAt: attempt.questionStartedAt?.toISOString() ?? null,
      startedAt: attempt.startedAt?.toISOString() ?? null,
      deadlineAt: deadlineAt?.toISOString() ?? null,
      // Lets the client correct for a wrong device clock when counting down to deadlineAt.
      serverNow: new Date().toISOString(),
      question: questionData,
      upcomingImageUrl,
    });
  });

  app.post("/api/student/save-answer", async (req, res) => {
    const esId = (req.session as any)?.examStudentId;
    if (!esId) return res.status(401).json({ message: "Not authenticated" });
    await submitDueStage6Attempts();
    const { attemptId, questionId, subquestionId, answer } = req.body;

    const attempt = await storage.getAttempt(attemptId);
    if (!attempt || attempt.status !== "in_progress") {
      return res.status(400).json({ message: "Invalid attempt" });
    }
    if (attempt.examStudentId !== esId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const examStudent = await storage.getExamStudent(esId);
    if (!examStudent) return res.status(401).json({ message: "Session expired" });
    const authenticatedStudentId = (req.session as any)?.studentId;
    if (authenticatedStudentId && Number(authenticatedStudentId) !== examStudent.studentId) {
      return res.status(403).json({ message: "This exam session belongs to another student" });
    }
    const access = await studentExamAccess(examStudent.examId, examStudent.studentId);
    if (!access.allowed) return res.status(access.status || 403).json({ message: access.message, code: (access as any).code });
    const question = await storage.getQuestion(questionId);
    if (!question) return res.status(404).json({ message: "Question not found" });
    const questionsForAttempt = await storage.getQuestionsByExam(examStudent.examId);
    if (question.examId !== examStudent.examId
        || questionsForAttempt[attempt.currentQuestionIndex]?.id !== question.id) {
      return res.status(403).json({ message: "Answers can only be saved for the current question" });
    }
    if (subquestionId != null) {
      const validSubquestions = question.hasSubquestions ? await storage.getSubquestions(question.id) : [];
      if (question.type !== "saq" || !validSubquestions.some((item) => item.id === Number(subquestionId))) {
        return res.status(400).json({ message: "subquestionId must belong to the current SAQ" });
      }
    }

    if (question.type === "mcq" && !subquestionId) {
      const options = await storage.getQuestionOptions(questionId);
      const selectedOption = options.find(o => o.id === parseInt(answer));
      const isCorrect = selectedOption?.isCorrect || false;
      await storage.upsertResponse({
        attemptId, questionId, subquestionId: null,
        answer, isCorrect, marksAwarded: isCorrect ? question.marks : 0,
        aiFeedback: null,
      });
    } else {
      await storage.upsertResponse({
        attemptId, questionId, subquestionId: subquestionId || null,
        answer, isCorrect: null, marksAwarded: null, aiFeedback: null,
      });
    }

    res.json({ ok: true });
  });

  app.post("/api/student/next-question", async (req, res) => {
    const esId = (req.session as any)?.examStudentId;
    if (!esId) return res.status(401).json({ message: "Not authenticated" });
    await submitDueStage6Attempts();
    const { attemptId, expectedCurrentQuestionIndex } = req.body;
    const attempt = await storage.getAttempt(attemptId);
    if (!attempt || attempt.status !== "in_progress") return res.status(404).json({ message: "Attempt not found or already submitted" });
    if (attempt.examStudentId !== esId) return res.status(403).json({ message: "Forbidden" });
    const examStudent = await storage.getExamStudent(esId);
    if (!examStudent) return res.status(401).json({ message: "Session expired" });
    const authenticatedStudentId = (req.session as any)?.studentId;
    if (authenticatedStudentId && Number(authenticatedStudentId) !== examStudent.studentId) {
      return res.status(403).json({ message: "This exam session belongs to another student" });
    }
    const access = await studentExamAccess(examStudent.examId, examStudent.studentId);
    if (!access.allowed) return res.status(access.status || 403).json({ message: access.message, code: (access as any).code });

    // Optimistic concurrency: if the client tells us which index it thinks it's on
    // and that doesn't match the server, this is a stale/duplicate request
    // (e.g. accidental double-click after the first request already advanced us).
    // Reject as a no-op rather than skipping a question.
    if (
      typeof expectedCurrentQuestionIndex === "number" &&
      expectedCurrentQuestionIndex !== attempt.currentQuestionIndex
    ) {
      return res.status(409).json({
        message: "Stale next-question request — already advanced",
        staleRequest: true,
        currentQuestionIndex: attempt.currentQuestionIndex,
      });
    }

    const es = await storage.getExamStudent(attempt.examStudentId);
    if (!es) return res.status(404).json({ message: "Exam student not found" });
    const exam = await storage.getExam(es.examId);
    const qs = await storage.getQuestionsByExam(es.examId);
    const nextIndex = attempt.currentQuestionIndex + 1;

    if (nextIndex >= qs.length) {
      return res.status(400).json({ message: "No more questions", isLastQuestion: true });
    }

    const questionStartedAt = exam?.timerMode === "per_question" ? new Date() : null;
    const updateData: any = { currentQuestionIndex: nextIndex };
    if (questionStartedAt) updateData.questionStartedAt = questionStartedAt;
    await storage.updateAttempt(attemptId, updateData);

    const nextQ = qs[nextIndex];
    const options = nextQ.type === "mcq" ? await storage.getQuestionOptions(nextQ.id) : [];
    const subs = nextQ.hasSubquestions ? await storage.getSubquestions(nextQ.id) : [];
    const existingResponse = await storage.getResponse(attemptId, nextQ.id);

    const questionData: any = {
      ...nextQ,
      expectedAnswer: undefined,
      explanation: undefined, // never reveal explanations before results are released
      options: options.map(o => ({ id: o.id, content: o.content, orderIndex: o.orderIndex })),
      subquestions: subs.map(s => ({ id: s.id, content: s.content, marks: s.marks, orderIndex: s.orderIndex })),
      savedAnswer: existingResponse?.answer || null,
    };

    if (nextQ.hasSubquestions) {
      const subResponses: Record<number, string> = {};
      for (const s of subs) {
        const sr = await storage.getResponse(attemptId, nextQ.id, s.id);
        if (sr?.answer) subResponses[s.id] = sr.answer;
      }
      questionData.savedSubAnswers = subResponses;
    }

    // Hint the client about the question after this one so it can preload its image
    const upcomingImageUrl = qs[nextIndex + 1]?.imageUrl || null;

    res.json({
      currentQuestionIndex: nextIndex,
      totalQuestions: qs.length,
      questionStartedAt: questionStartedAt?.toISOString() ?? null,
      question: questionData,
      upcomingImageUrl,
    });
  });

  app.post("/api/student/update-timer", async (req, res) => {
    const esId = (req.session as any)?.examStudentId;
    if (!esId) return res.status(401).json({ message: "Not authenticated" });
    await submitDueStage6Attempts();
    const { attemptId, remainingTime } = req.body;
    const attempt = await storage.getAttempt(attemptId);
    if (!attempt || attempt.status !== "in_progress" || attempt.examStudentId !== esId) return res.status(403).json({ message: "Forbidden" });
    if (!Number.isInteger(remainingTime) || remainingTime < 0) return res.status(400).json({ message: "remainingTime must be a non-negative integer" });
    const examStudent = await storage.getExamStudent(esId);
    if (!examStudent) return res.status(401).json({ message: "Session expired" });
    const authenticatedStudentId = (req.session as any)?.studentId;
    if (authenticatedStudentId && Number(authenticatedStudentId) !== examStudent.studentId) {
      return res.status(403).json({ message: "This exam session belongs to another student" });
    }
    const access = await studentExamAccess(examStudent.examId, examStudent.studentId);
    if (!access.allowed) return res.status(access.status || 403).json({ message: access.message, code: (access as any).code });
    await storage.updateAttempt(attemptId, { remainingTime });
    res.json({ ok: true });
  });

  app.post("/api/student/submit-exam", async (req, res) => {
    const esId = (req.session as any)?.examStudentId;
    if (!esId) return res.status(401).json({ message: "Not authenticated" });
    await submitDueStage6Attempts();
    const { attemptId } = req.body;
    const attempt = await storage.getAttempt(attemptId);
    if (!attempt || attempt.examStudentId !== esId) return res.status(403).json({ message: "Forbidden" });
    const examStudent = await storage.getExamStudent(esId);
    if (!examStudent) return res.status(401).json({ message: "Session expired" });
    const authenticatedStudentId = (req.session as any)?.studentId;
    if (authenticatedStudentId && Number(authenticatedStudentId) !== examStudent.studentId) {
      return res.status(403).json({ message: "This exam session belongs to another student" });
    }
    if (attempt.status === "submitted") return res.json({ ok: true, autoSubmitted: true });
    const access = await studentExamAccess(examStudent.examId, examStudent.studentId);
    if (!access.allowed) return res.status(access.status || 403).json({ message: access.message, code: (access as any).code });
    await storage.updateAttempt(attemptId, { status: "submitted", submittedAt: new Date() });
    await storage.updateExamStudent(esId, { attemptStatus: "submitted" });
    res.json({ ok: true });

    const es = await storage.getExamStudent(esId);
    if (es) {
      const exam = await storage.getExam(es.examId);
      if (exam?.autoMarkEnabled) {
        try {
          const providers = (await storage.getAiProviders()).filter(p => p.isActive);
          if (providers.length > 0) {
            // Mark ONLY the submitting student — not the whole exam.
            // Marking the whole exam caused other in-progress students' unanswered
            // questions to be permanently stamped "not answered", then skipped on
            // their own submission because isCorrect was already set.
            console.log(`[Auto-Mark] Marking student ${esId} after submission (exam ${es.examId})`);
            markStudentSAQResponses(es.examId, esId).catch(err =>
              console.error(`[Auto-Mark] Error for student ${esId}:`, err.message)
            );
          }
        } catch (err: any) {
          console.error(`[Auto-Mark] Error checking providers:`, err.message);
        }
      }
    }
  });

  app.get("/api/student/results", async (req, res) => {
    const esId = (req.session as any)?.examStudentId;
    if (!esId) return res.status(401).json({ message: "Not authenticated" });
    const es = await storage.getExamStudent(esId);
    if (!es) return res.status(404).json({ message: "Not found" });
    const authenticatedStudentId = (req.session as any)?.studentId;
    if (authenticatedStudentId && Number(authenticatedStudentId) !== es.studentId) {
      return res.status(403).json({ message: "This exam session belongs to another student" });
    }
    const exam = await storage.getExam(es.examId);
    if (!exam) return res.status(404).json({ message: "Exam not found" });

    const attempt = await storage.getAttemptByExamStudent(esId);
    if (!attempt) return res.status(404).json({ message: "No attempt found" });

    const resps = await storage.getResponsesByAttempt(attempt.id);
    const examStructure = await getExamStructure(es.examId);
    const { questions: qs, optionsByQuestion, subsByQuestion, maxScore } = examStructure;

    const hasSAQ = qs.some(q => q.type === "saq");
    const saqResponses = resps.filter(r => {
      const q = qs.find(q => q.id === r.questionId);
      return q?.type === "saq";
    });
    const unmarkedSAQ = saqResponses.filter(r => r.isCorrect === null);
    const markingInProgress = hasSAQ && unmarkedSAQ.length > 0;

    if (!exam.resultsReleased) {
      return res.json({ released: false, markingInProgress: false, message: "Results have not been released yet." });
    }

    if (markingInProgress && attempt.status === "submitted") {
      return res.json({
        released: false,
        markingInProgress: true,
        totalSAQ: saqResponses.length,
        markedSAQ: saqResponses.length - unmarkedSAQ.length,
        message: "AI is marking your answers. Please wait..."
      });
    }

    const totalScore = resps.reduce((sum, r) => sum + (r.marksAwarded || 0), 0);

    const questionResults = qs.map((q) => {
      const options = optionsByQuestion.get(q.id) || [];
      const subs = subsByQuestion.get(q.id) || [];
      const qResps = resps.filter(r => r.questionId === q.id);
      let augmentedResps: any[] = [...qResps];

      if (q.type === "mcq") {
        if (qResps.length === 0) {
          const correctOption = options.find((o: any) => o.isCorrect);
          augmentedResps.push({
            id: `synth-${q.id}`,
            attemptId: attempt.id,
            questionId: q.id,
            subquestionId: null,
            answer: null,
            isCorrect: false,
            marksAwarded: 0,
            aiFeedback: null,
          });
        }
      } else if (q.type === "saq") {
        if (q.hasSubquestions && subs.length > 0) {
          for (const sq of subs) {
            const hasResp = qResps.some((r: any) => r.subquestionId === sq.id);
            if (!hasResp) {
              augmentedResps.push({
                id: `synth-${q.id}-${sq.id}`,
                attemptId: attempt.id,
                questionId: q.id,
                subquestionId: sq.id,
                answer: null,
                isCorrect: false,
                marksAwarded: 0,
                aiFeedback: sq.expectedAnswer ? `Not answered. The correct answer is: ${sq.expectedAnswer}` : "Not answered.",
              });
            }
          }
        } else if (!q.hasSubquestions && qResps.length === 0) {
          augmentedResps.push({
            id: `synth-${q.id}`,
            attemptId: attempt.id,
            questionId: q.id,
            subquestionId: null,
            answer: null,
            isCorrect: false,
            marksAwarded: 0,
            aiFeedback: q.expectedAnswer ? `Not answered. The correct answer is: ${q.expectedAnswer}` : "Not answered.",
          });
        }
      }

      return {
        ...q,
        options,
        subquestions: subs,
        responses: augmentedResps,
      };
    });

    res.json({
      released: true,
      markingInProgress: false,
      examTitle: exam.title,
      totalScore,
      maxScore,
      percentage: maxScore > 0 ? (totalScore / maxScore) * 100 : 0,
      questions: questionResults,
    });
  });

  app.post("/api/student/feedback", async (req, res) => {
    const esId = (req.session as any)?.examStudentId;
    if (!esId) return res.status(401).json({ message: "Not authenticated" });
    const es = await storage.getExamStudent(esId);
    if (!es) return res.status(404).json({ message: "Not found" });
    const { content, rating } = req.body;
    const student = await storage.getStudent(es.studentId);
    const fb = await storage.createStudentFeedback({
      examId: es.examId,
      studentId: es.studentId,
      content,
      rating,
    });
    res.json(fb);
  });

  // Admin management
  app.get("/api/admins", requireAdmin, async (req, res) => {
    const allAdmins = await storage.getAllAdmins();
    res.json(allAdmins.map(a => ({ id: a.id, email: a.email, name: a.name, role: a.role, isActive: a.isActive })));
  });

  app.post("/api/admins", requireAdmin, async (req, res) => {
    if ((req as any).admin.role !== "super_admin") {
      return res.status(403).json({ message: "Only super admins can create admins" });
    }
    const { email, name, role, password } = req.body;
    const hash = await bcrypt.hash(password, 10);
    const admin = await storage.createAdmin({ email, name, role, passwordHash: hash, isActive: true });
    res.json({ id: admin.id, email: admin.email, name: admin.name, role: admin.role });
  });

  // ── Student Self-Signup ──────────────────────────────────────────────────

  // In-memory rate limiter: max 3 code sends per 30 minutes per key
  const codeSendLog = new Map<string, { count: number; windowStart: number }>();
  const CODE_SEND_LIMIT = 3;
  const CODE_SEND_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

  function checkCodeRateLimit(key: string): { allowed: boolean; remaining: number; resetInMins: number } {
    const now = Date.now();
    const entry = codeSendLog.get(key);
    if (!entry || now - entry.windowStart > CODE_SEND_WINDOW_MS) {
      codeSendLog.set(key, { count: 1, windowStart: now });
      return { allowed: true, remaining: CODE_SEND_LIMIT - 1, resetInMins: 30 };
    }
    if (entry.count >= CODE_SEND_LIMIT) {
      const resetInMins = Math.ceil((CODE_SEND_WINDOW_MS - (now - entry.windowStart)) / 60000);
      return { allowed: false, remaining: 0, resetInMins };
    }
    entry.count += 1;
    return { allowed: true, remaining: CODE_SEND_LIMIT - entry.count, resetInMins: 30 };
  }

  app.post("/api/student/signup", async (req, res) => {
    try {
      const { name, email, university, password } = req.body;
      if (!name || !email || !university || !password) {
        return res.status(400).json({ message: "Name, email, university and password are required" });
      }
      if (typeof name !== "string" || typeof email !== "string" || typeof university !== "string" || typeof password !== "string"
        || name.length > TEXT_LIMITS.short || email.length > TEXT_LIMITS.email || university.length > TEXT_LIMITS.short || password.length > TEXT_LIMITS.password) {
        return res.status(400).json({ message: "One or more signup fields are too long" });
      }
      const normalizedEmail = (email || "").trim().toLowerCase();
      const emailDomain = normalizedEmail.split("@")[1];
      const { rows: allowedDomains } = await pool.query(
        "SELECT 1 FROM allowed_email_domains WHERE domain = $1 AND is_active = true",
        [emailDomain],
      );
      if (!emailDomain || !allowedDomains[0]) {
        return res.status(400).json({ message: "Use an email address from a school approved by MedQrown." });
      }

      // Existing exam-only students may activate the new portal through verified email.
      const existingStudent = await storage.getStudentByEmail(normalizedEmail);
      if (existingStudent) {
        const { rows: accounts } = await pool.query(
          "SELECT id FROM student_accounts WHERE student_id = $1 AND is_active = true",
          [existingStudent.id],
        );
        if (accounts[0]) {
          return res.status(409).json({ message: "An account with this email already exists. Please sign in instead.", hasAccount: true });
        }
      }

      const existing = await storage.getStudentSignupByEmail(normalizedEmail);
      if (existing && existing.status !== "rejected") {
        return res.status(409).json({ message: "An application with this email is already being processed.", token: existing.token });
      }

      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      const token = crypto.randomBytes(24).toString("hex");

      const signup = await storage.createStudentSignup({
        name: name.trim(),
        email: normalizedEmail,
        university: university.trim(),
        password: await bcrypt.hash(password, 10),
        verificationCode: code,
        verificationExpiresAt: expiresAt,
        token,
      });

      const mailResult = await sendLoggedEmail({
        to: normalizedEmail,
        templateKey: "custom:student_signup_verification",
        subject: "Verify your MedQrown MedEazy account",
        body: `Hello ${name.trim()},\n\nWe received a request to verify your account.\n\nYour verification code is: ${code}\n\nThis code will expire in 15 minutes. If you did not request this code, please ignore this email.\n\nThank you,\nMedQrown MedEazy`,
      });
      res.json({
        token: signup.token,
        message: mailResult.status === "sent" ? "Verification code sent to your email" : "Signup saved, but the verification email could not be sent.",
        emailStatus: mailResult.status,
        ...(mailResult.error ? { emailError: mailResult.error } : {}),
      });
    } catch (error: any) {
      console.error("Signup error:", error);
      res.status(500).json({ message: "Signup failed. Please try again." });
    }
  });

  app.post("/api/student/verify-email", async (req, res) => {
    try {
      const { token, code } = req.body;
      if (!token || !code) return res.status(400).json({ message: "Token and code are required" });

      const signup = await storage.getStudentSignupByToken(token);
      if (!signup) return res.status(404).json({ message: "Invalid or expired link" });
      if (signup.emailVerified) return res.json({ message: "Already verified", status: signup.status });
      if (signup.verificationCode !== code.trim()) return res.status(400).json({ message: "Incorrect code. Please try again." });
      if (new Date() > new Date(signup.verificationExpiresAt)) {
        return res.status(400).json({ message: "Code has expired. Please request a new one." });
      }

      let student = await storage.getStudentByEmail(signup.email);
      if (!student) {
        student = await storage.createStudent({
          name: signup.name,
          email: signup.email,
          university: signup.university,
        });
      }
      const { rows: accounts } = await pool.query("SELECT id FROM student_accounts WHERE student_id = $1", [student.id]);
      const signupPasswordHash = signup.password
        ? (/^\$2[aby]\$/.test(signup.password) ? signup.password : await bcrypt.hash(signup.password, 10))
        : null;
      if (!accounts[0]) {
        if (!signupPasswordHash) return res.status(400).json({ message: "A password is required to activate this account. Please sign up again." });
        await pool.query(
          "INSERT INTO student_accounts (student_id, password_hash) VALUES ($1, $2)",
          [student.id, signupPasswordHash],
        );
      }
      await storage.updateStudentSignup(signup.id, {
        ...(signupPasswordHash ? { password: signupPasswordHash } : {}),
        emailVerified: true,
        status: "active",
      });
      (req.session as any).studentId = student.id;
      delete (req.session as any).examStudentId;
      delete (req.session as any).studentExamId;
      res.json({ message: "Email verified. Your student account is ready.", status: "active" });
    } catch (error: any) {
      console.error("Verify error:", error);
      res.status(500).json({ message: "Verification failed. Please try again." });
    }
  });

  app.post("/api/student/signup/resend-code", async (req, res) => {
    try {
      const { token } = req.body;
      const signup = await storage.getStudentSignupByToken(token);
      if (!signup) return res.status(404).json({ message: "Invalid link" });
      if (signup.emailVerified) return res.status(400).json({ message: "Email already verified" });

      const rateKey = `verify:${token}`;
      const limit = checkCodeRateLimit(rateKey);
      if (!limit.allowed) {
        return res.status(429).json({ message: `Too many resend attempts. Please try again in ${limit.resetInMins} minute${limit.resetInMins === 1 ? "" : "s"}.`, resetInMins: limit.resetInMins });
      }

      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      await storage.updateStudentSignup(signup.id, { verificationCode: code, verificationExpiresAt: expiresAt });

      const delivery = await sendLoggedEmail({
        to: signup.email,
        templateKey: "custom:student_signup_verification",
        subject: "Your new verification code – MedQrown MedEazy",
        body: `Hello ${signup.name},\n\nYour new verification code is: ${code}\n\nExpires in 15 minutes.\n\nMedQrown MedEazy`,
      });
      res.json({
        message: delivery.status === "sent" ? "New code sent to your email" : "The new verification code could not be sent.",
        emailStatus: delivery.status,
        ...(delivery.error ? { emailError: delivery.error } : {}),
      });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to resend code" });
    }
  });

  app.get("/api/student/signup-status/:token", async (req, res) => {
    const signup = await storage.getStudentSignupByToken(req.params.token);
    if (!signup) return res.status(404).json({ message: "Not found" });
    res.json({
      name: signup.name,
      email: signup.email,
      university: signup.university,
      status: signup.status,
      emailVerified: signup.emailVerified,
      rejectionReason: signup.rejectionReason,
    });
  });

  app.post("/api/student/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ message: "Email is required" });
      if (typeof email !== "string" || email.length > TEXT_LIMITS.email) return res.status(400).json({ message: "Enter a valid email address" });
      const normalizedEmail = email.trim().toLowerCase();

      const rateKey = `reset:${normalizedEmail}`;
      const limit = checkCodeRateLimit(rateKey);
      if (!limit.allowed) {
        return res.status(429).json({ message: `Too many attempts. Please try again in ${limit.resetInMins} minute${limit.resetInMins === 1 ? "" : "s"}.`, resetInMins: limit.resetInMins });
      }

      const student = await storage.getStudentByEmail(normalizedEmail);
      if (!student) {
        return res.status(404).json({ message: "This email does not exist in our system." });
      }

      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      await storage.updateStudent(student.id, { resetCode: code, resetExpiresAt: expiresAt });

      const mailResult = await sendLoggedEmail({
        to: normalizedEmail,
        templateKey: "password_reset",
        variables: { student_name: student.name, reset_code: code },
      });
      res.json({
        message: mailResult.status === "sent" ? "Reset code sent to your email" : "Reset code created, but the email could not be sent.",
        emailStatus: mailResult.status,
        ...(mailResult.error ? { emailError: mailResult.error } : {}),
      });
    } catch (error: any) {
      console.error("Forgot password error:", error);
      res.status(500).json({ message: "Something went wrong. Please try again." });
    }
  });

  app.post("/api/student/reset-password", async (req, res) => {
    try {
      const { email, code, newPassword } = req.body;
      if (!email || !code || !newPassword) {
        return res.status(400).json({ message: "Email, code and new password are required" });
      }
      if (typeof email !== "string" || typeof code !== "string" || typeof newPassword !== "string"
        || email.length > TEXT_LIMITS.email || code.length > TEXT_LIMITS.short || newPassword.length > TEXT_LIMITS.password) {
        return res.status(400).json({ message: "One or more reset fields are too long" });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }

      const normalizedEmail = email.trim().toLowerCase();
      const student = await storage.getStudentByEmail(normalizedEmail);
      if (!student) return res.status(404).json({ message: "No account found for this email" });

      if (!student.resetCode || !student.resetExpiresAt) {
        return res.status(400).json({ message: "No reset request found. Please request a new code." });
      }
      if (student.resetCode !== code.trim()) {
        return res.status(400).json({ message: "Incorrect code. Please try again." });
      }
      if (new Date() > new Date(student.resetExpiresAt)) {
        return res.status(400).json({ message: "Code has expired. Please request a new one." });
      }

      // Keep bcrypt-backed account login authoritative; never copy the reset
      // password into the legacy plaintext exam_students credential column.
      await pool.query(
        `INSERT INTO student_accounts (student_id, password_hash)
         VALUES ($1, $2)
         ON CONFLICT (student_id) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
        [student.id, await bcrypt.hash(newPassword, 10)],
      );
      // Clear the reset code
      await storage.updateStudent(student.id, { resetCode: null, resetExpiresAt: null });

      res.json({ message: "Password reset successfully" });
    } catch (error: any) {
      console.error("Reset password error:", error);
      res.status(500).json({ message: "Password reset failed. Please try again." });
    }
  });

  // ── Admin student access management ──────────────────────────────────────
  app.get("/api/admin/allowed-domains", requireAdmin, async (_req, res) => {
    const { rows } = await pool.query(
      "SELECT id, domain, label, is_active AS \"isActive\", created_at AS \"createdAt\" FROM allowed_email_domains ORDER BY domain",
    );
    res.json(rows);
  });

  app.post("/api/admin/allowed-domains", requireAdmin, async (req, res) => {
    const domain = String(req.body?.domain || "").trim().toLowerCase().replace(/^@/, "");
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) return res.status(400).json({ message: "Enter a valid school email domain" });
    try {
      const { rows } = await pool.query(
        `INSERT INTO allowed_email_domains (domain, label) VALUES ($1, $2)
         ON CONFLICT (domain) DO UPDATE SET label = EXCLUDED.label, is_active = true
         RETURNING id, domain, label, is_active AS "isActive"`,
        [domain, String(req.body?.label || "").trim() || null],
      );
      await storage.createAuditLog({ adminId: (req as any).admin.id, action: "add_allowed_domain", details: domain });
      res.json(rows[0]);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Could not save domain" });
    }
  });

  app.patch("/api/admin/allowed-domains/:id", requireAdmin, async (req, res) => {
    const { rows } = await pool.query(
      `UPDATE allowed_email_domains SET is_active = $1 WHERE id = $2
       RETURNING id, domain, label, is_active AS "isActive"`,
      [Boolean(req.body?.isActive), Number(req.params.id)],
    );
    if (!rows[0]) return res.status(404).json({ message: "Domain not found" });
    res.json(rows[0]);
  });

  app.delete("/api/admin/allowed-domains/:id", requireAdmin, async (req, res) => {
    await pool.query("DELETE FROM allowed_email_domains WHERE id = $1", [Number(req.params.id)]);
    res.json({ ok: true });
  });

  app.get("/api/admin/units", requireAdmin, async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT u.id, u.code, u.name, u.description, u.university, u.is_active AS "isActive",
              COUNT(DISTINCT um.student_id)::int AS "enrolmentCount",
              COUNT(DISTINCT e.id)::int AS "examCount"
         FROM units u LEFT JOIN unit_memberships um ON um.unit_id = u.id AND um.status = 'enrolled'
         LEFT JOIN exams e ON e.unit_id = u.id
        GROUP BY u.id ORDER BY u.code, u.name`,
    );
    res.json(rows);
  });

  app.post("/api/admin/units", requireAdmin, async (req, res) => {
    const code = String(req.body?.code || "").trim().toUpperCase();
    const name = String(req.body?.name || "").trim();
    if (!code || !name) return res.status(400).json({ message: "Unit code and name are required" });
    try {
      const { rows } = await pool.query(
        `INSERT INTO units (code, name, description, university) VALUES ($1, $2, $3, $4)
         RETURNING id, code, name, description, university, is_active AS "isActive"`,
        [code, name, String(req.body?.description || "").trim() || null, String(req.body?.university || "").trim() || null],
      );
      res.json(rows[0]);
    } catch (error: any) {
      res.status(409).json({ message: error.message?.includes("unique") ? "That unit code already exists" : "Could not create unit" });
    }
  });

  app.patch("/api/admin/units/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const { rows } = await pool.query(
      `UPDATE units SET code = COALESCE($1, code), name = COALESCE($2, name), description = $3,
              university = $4, is_active = COALESCE($5, is_active)
         WHERE id = $6
       RETURNING id, code, name, description, university, is_active AS "isActive"`,
      [
        req.body?.code ? String(req.body.code).trim().toUpperCase() : null,
        req.body?.name ? String(req.body.name).trim() : null,
        req.body?.description === undefined ? null : String(req.body.description).trim() || null,
        req.body?.university === undefined ? null : String(req.body.university).trim() || null,
        typeof req.body?.isActive === "boolean" ? req.body.isActive : null,
        id,
      ],
    );
    if (!rows[0]) return res.status(404).json({ message: "Unit not found" });
    res.json(rows[0]);
  });

  app.delete("/api/admin/units/:id", requireAdmin, async (req, res) => {
    await pool.query("DELETE FROM units WHERE id = $1", [Number(req.params.id)]);
    res.json({ ok: true });
  });

  app.patch("/api/admin/exams/:id/unit", requireAdmin, async (req, res) => {
    const unitId = req.body?.unitId ? Number(req.body.unitId) : null;
    if (unitId) {
      const { rows: units } = await pool.query("SELECT id FROM units WHERE id = $1", [unitId]);
      if (!units[0]) return res.status(400).json({ message: "Unit not found" });
    }
    await pool.query("UPDATE exams SET unit_id = $1 WHERE id = $2", [unitId, Number(req.params.id)]);
    res.json({ ok: true });
  });

  app.get("/api/admin/exam-access-requests", requireAdmin, async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT ear.id, ear.status, ear.reason, ear.review_reason AS "reviewReason", ear.created_at AS "createdAt",
              e.id AS "examId", e.title AS "examTitle", u.code AS "unitCode",
              s.id AS "studentId", s.name AS "studentName", s.email AS "studentEmail", s.university
         FROM exam_access_requests ear JOIN exams e ON e.id = ear.exam_id
         LEFT JOIN units u ON u.id = e.unit_id JOIN students s ON s.id = ear.student_id
        ORDER BY CASE WHEN ear.status = 'pending' THEN 0 ELSE 1 END, ear.created_at DESC`,
    );
    res.json(rows);
  });

  app.post("/api/admin/exam-access-requests/:id/approve", requireAdmin, async (req, res) => {
    const requestId = Number(req.params.id);
    const { rows } = await pool.query(
      "SELECT exam_id, student_id FROM exam_access_requests WHERE id = $1 AND status = 'pending'",
      [requestId],
    );
    const request = rows[0];
    if (!request) return res.status(404).json({ message: "Pending access request not found" });
    const existing = await storage.getExamStudentByExamAndStudent(request.exam_id, request.student_id);
    if (!existing) {
      await storage.createExamStudent({
        examId: request.exam_id,
        studentId: request.student_id,
        password: await generateUnavailableExamCredentialHash(),
        attemptStatus: "not_started",
        resetCount: 0,
        emailSent: false,
      });
    }
    await pool.query(
      "UPDATE exam_access_requests SET status = 'approved', reviewed_by = $1, review_reason = $2, reviewed_at = CURRENT_TIMESTAMP WHERE id = $3",
      [(req as any).admin.id, String(req.body?.reviewReason || "").trim() || null, requestId],
    );
    res.json({ ok: true });
  });

  app.post("/api/admin/exam-access-requests/:id/reject", requireAdmin, async (req, res) => {
    const result = await pool.query(
      "UPDATE exam_access_requests SET status = 'rejected', reviewed_by = $1, review_reason = $2, reviewed_at = CURRENT_TIMESTAMP WHERE id = $3 AND status = 'pending'",
      [(req as any).admin.id, String(req.body?.reviewReason || "").trim() || null, Number(req.params.id)],
    );
    if (!result.rowCount) return res.status(404).json({ message: "Pending access request not found" });
    res.json({ ok: true });
  });

  app.get("/api/exams/:examId/reattempt-requests", requireAdmin, async (req, res) => {
    const { rows } = await pool.query(
      `SELECT rr.id, rr.status, rr.reason, rr.review_reason AS "reviewReason", rr.created_at AS "createdAt",
              rr.reviewed_at AS "reviewedAt", rr.consumed_at AS "consumedAt",
              s.id AS "studentId", s.name AS "studentName", s.email AS "studentEmail"
         FROM exam_reattempt_requests rr JOIN students s ON s.id = rr.student_id
        WHERE rr.exam_id = $1
        ORDER BY CASE WHEN rr.status = 'pending' THEN 0 ELSE 1 END, rr.created_at DESC`,
      [Number(req.params.examId)],
    );
    res.json(rows);
  });

  app.post("/api/exams/:examId/reattempt-requests/:id/:decision", requireAdmin, async (req, res) => {
    const decision = req.params.decision;
    if (!["approve", "reject"].includes(decision)) return res.status(400).json({ message: "Invalid decision" });
    const result = await pool.query(
      `UPDATE exam_reattempt_requests
          SET status = $1, reviewed_by = $2, review_reason = $3, reviewed_at = CURRENT_TIMESTAMP
        WHERE id = $4 AND exam_id = $5 AND status = 'pending'
        RETURNING id`,
      [
        decision === "approve" ? "approved" : "rejected",
        (req as any).admin.id,
        String(req.body?.reviewReason || "").trim() || null,
        Number(req.params.id),
        Number(req.params.examId),
      ],
    );
    if (!result.rows[0]) return res.status(404).json({ message: "Pending reattempt request not found" });
    await storage.createAuditLog({
      adminId: (req as any).admin.id,
      action: decision === "approve" ? "approve_reattempt" : "reject_reattempt",
      details: `Reattempt request ${req.params.id} for exam ${req.params.examId}`,
    });
    res.json({ ok: true });
  });

  app.get("/api/admin/profile-change-requests", requireAdmin, async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT pcr.id, pcr.field_name AS "fieldName", pcr.requested_value AS "requestedValue", pcr.reason, pcr.status,
              pcr.review_reason AS "reviewReason", pcr.created_at AS "createdAt",
              s.id AS "studentId", s.name AS "studentName", s.email AS "studentEmail"
         FROM profile_change_requests pcr JOIN students s ON s.id = pcr.student_id
        ORDER BY CASE WHEN pcr.status = 'pending' THEN 0 ELSE 1 END, pcr.created_at DESC`,
    );
    res.json(rows);
  });

  app.post("/api/admin/profile-change-requests/:id/:decision", requireAdmin, async (req, res) => {
    const decision = req.params.decision;
    if (!["approve", "reject"].includes(decision)) return res.status(400).json({ message: "Invalid decision" });
    const { rows } = await pool.query(
      "SELECT id, student_id, field_name, requested_value FROM profile_change_requests WHERE id = $1 AND status = 'pending'",
      [Number(req.params.id)],
    );
    const request = rows[0];
    if (!request) return res.status(404).json({ message: "Pending profile request not found" });
    if (decision === "approve") {
      const columnByField: Record<string, string> = { name: "name", university: "university" };
      const column = columnByField[request.field_name];
      if (!column) return res.status(400).json({ message: "Unsupported profile field" });
      await pool.query(`UPDATE students SET ${column} = $1 WHERE id = $2`, [request.requested_value, request.student_id]);
    }
    await pool.query(
      "UPDATE profile_change_requests SET status = $1, reviewed_by = $2, review_reason = $3, reviewed_at = CURRENT_TIMESTAMP WHERE id = $4",
      [decision === "approve" ? "approved" : "rejected", (req as any).admin.id, String(req.body?.reviewReason || "").trim() || null, request.id],
    );
    res.json({ ok: true });
  });

  // ── Admin Signup Management ──────────────────────────────────────────────

  app.get("/api/admin/signups", requireAdmin, async (_req, res) => {
    const signups = await storage.getAllStudentSignups();
    res.json(signups.map(({ password: _password, verificationCode: _verificationCode, ...signup }) => signup));
  });

  app.post("/api/admin/signups/:id/approve", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { examId } = req.body;
      if (!examId) return res.status(400).json({ message: "examId is required" });

      const signup = await storage.getStudentSignupById(id);
      if (!signup) return res.status(404).json({ message: "Signup not found" });
      if (signup.status !== "pending_approval") {
        return res.status(400).json({ message: "Only pending signups can be approved" });
      }

      const normalizedEmail = signup.email.trim().toLowerCase();
      let student = await storage.getStudentByEmail(normalizedEmail);
      if (!student) {
        student = await storage.createStudent({
          name: signup.name,
          email: normalizedEmail,
          university: signup.university || null,
          yearOfStudy: signup.yearOfStudy || null,
        });
      } else {
        // Backfill missing profile fields from signup data
        const updates: Record<string, string | null> = {};
        if (!student.university && signup.university) updates.university = signup.university;
        if (!student.yearOfStudy && signup.yearOfStudy) updates.yearOfStudy = signup.yearOfStudy;
        if (Object.keys(updates).length) {
          student = await storage.updateStudent(student.id, updates) ?? student;
        }
      }

      const existing = await storage.getExamStudentByExamAndStudent(examId, student.id);
      if (!existing) {
        await storage.createExamStudent({
          examId, studentId: student.id, password: await generateUnavailableExamCredentialHash(),
          attemptStatus: "not_started", resetCount: 0, emailSent: false,
        });
      }

      await storage.updateStudentSignup(id, { status: "approved", approvedExamId: examId });
      await storage.createAuditLog({ adminId: (req as any).admin.id, action: "approve_signup", details: `${signup.name} (${signup.email}) → exam ${examId}` });
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ message: "Approval failed: " + error.message });
    }
  });

  app.post("/api/admin/signups/:id/reject", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { reason } = req.body;
      const signup = await storage.getStudentSignupById(id);
      if (!signup) return res.status(404).json({ message: "Signup not found" });

      await storage.updateStudentSignup(id, { status: "rejected", rejectionReason: reason || null });
      await storage.createAuditLog({ adminId: (req as any).admin.id, action: "reject_signup", details: `${signup.name} (${signup.email})` });
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ message: "Rejection failed: " + error.message });
    }
  });

  app.delete("/api/admin/signups/processed", requireAdmin, async (req, res) => {
    try {
      const count = await storage.deleteProcessedStudentSignups();
      await storage.createAuditLog({ adminId: (req as any).admin.id, action: "bulk_delete_signups", details: `Deleted ${count} processed signup records` });
      res.json({ ok: true, count });
    } catch (error: any) {
      res.status(500).json({ message: "Bulk delete failed: " + error.message });
    }
  });

  app.delete("/api/admin/signups/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const signup = await storage.getStudentSignupById(id);
      if (!signup) return res.status(404).json({ message: "Signup not found" });
      await storage.deleteStudentSignup(id);
      await storage.createAuditLog({ adminId: (req as any).admin.id, action: "delete_signup", details: `${signup.name} (${signup.email})` });
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ message: "Delete failed: " + error.message });
    }
  });

  // Manual enrol: admin picks any student (existing or new) + exam
  // ── Demo exam public routes ───────────────────────────────────────────────
  app.get("/api/demo/exams", async (_req, res) => {
    try {
      const exams = await storage.getDemoExams();
      res.json(exams);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/demo/exams/:id/questions", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const exam = await storage.getDemoExam(id);
      if (!exam || !exam.isActive) return res.status(404).json({ message: "Demo exam not found" });
      const all = await storage.getDemoQuestions(id);
      // Pick one random MCQ + one random SAQ from the bank each time
      const pickRandom = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
      const mcqs = all.filter((q) => q.type === "mcq");
      const saqs = all.filter((q) => q.type === "saq");
      const picked = [];
      if (mcqs.length) picked.push(pickRandom(mcqs));
      if (saqs.length) {
        const saq = pickRandom(saqs);
        const { modelAnswer: _modelAnswer, markingPoints: _markingPoints, ...publicSaq } = saq;
        picked.push(publicSaq);
      }
      res.json(picked);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  const engagementHits = new Map<string, { count: number; windowStart: number }>();
  app.post("/api/demo/engagement", async (req, res) => {
    try {
      const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown";
      const now = Date.now();
      const hit = engagementHits.get(ip);
      if (!hit || now - hit.windowStart > 60 * 60 * 1000) {
        engagementHits.set(ip, { count: 1, windowStart: now });
      } else if (++hit.count > 120) {
        return res.status(429).json({ message: "Too many events" });
      }
      if (engagementHits.size > 10000) engagementHits.clear();

      const { examId, questionId, eventType, sessionId, optionIndex, responseLength } = req.body || {};
      const allowedEvents = new Set(["started", "mcq_answered", "saq_started", "saq_submitted", "completed"]);
      const exam = Number(examId);
      if (!Number.isInteger(exam) || !allowedEvents.has(eventType) || typeof sessionId !== "string" || !/^[a-zA-Z0-9_-]{8,80}$/.test(sessionId)) {
        return res.status(400).json({ message: "Invalid engagement event" });
      }
      const demoExam = await storage.getDemoExam(exam);
      if (!demoExam?.isActive) return res.status(404).json({ message: "Demo exam not found" });

      let validQuestionId: number | null = null;
      let isCorrect: boolean | null = null;
      if (questionId !== undefined && questionId !== null) {
        const parsedQuestionId = Number(questionId);
        if (!Number.isInteger(parsedQuestionId)) return res.status(400).json({ message: "Invalid question" });
        const question = (await storage.getDemoQuestions(exam)).find((q) => q.id === parsedQuestionId);
        if (!question) return res.status(400).json({ message: "Invalid question" });
        validQuestionId = question.id;
        if (eventType === "mcq_answered") {
          const selected = Number(optionIndex);
          isCorrect = Number.isInteger(selected) && !!question.options?.[selected]?.isCorrect;
        }
      }
      const safeLength = responseLength === undefined ? null : Math.max(0, Math.min(10000, Number(responseLength) || 0));
      await storage.recordDemoEngagement({
        demoExamId: exam,
        questionId: validQuestionId,
        eventType,
        sessionId,
        isCorrect,
        responseLength: safeLength,
      });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Site content: public routes ───────────────────────────────────────────
  app.get("/api/site-content", async (_req, res) => {
    try {
      const [storedSettings, faq] = await Promise.all([
        storage.getSiteSettings(),
        storage.getFaqItems(true),
      ]);
      const settings = { ...storedSettings };
      if (!isFeatureEnabled("demoVideoMedia")) delete settings.demoVideoUrl;
      res.json({
        settings: {
          ...settings,
          registrationOpen: settings.registrationOpen === true,
          ...(settings.registrationOpen === true && typeof settings.googleFormUrl === "string"
            ? { googleFormUrl: settings.googleFormUrl }
            : { googleFormUrl: undefined }),
        },
        faq,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/pages/:slug", async (req, res) => {
    try {
      const slug = req.params.slug;
      if (!["terms", "privacy"].includes(slug)) return res.status(404).json({ message: "Not found" });
      const page = await storage.getContentPage(slug);
      if (!page) return res.status(404).json({ message: "Not found" });
      res.json(page);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Simple in-memory IP rate limiter for the public inquiry endpoint
  const inquiryHits = new Map<string, { count: number; windowStart: number }>();
  const INQUIRY_WINDOW_MS = 60 * 60 * 1000; // 1 hour
  const INQUIRY_MAX_PER_WINDOW = 5;

  app.post("/api/inquiries", async (req, res) => {
    try {
      const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown";
      const now = Date.now();
      const hit = inquiryHits.get(ip);
      if (!hit || now - hit.windowStart > INQUIRY_WINDOW_MS) {
        inquiryHits.set(ip, { count: 1, windowStart: now });
      } else {
        hit.count++;
        if (hit.count > INQUIRY_MAX_PER_WINDOW) {
          return res.status(429).json({ message: "Too many inquiries. Please try again later." });
        }
      }
      if (inquiryHits.size > 10000) inquiryHits.clear(); // prevent unbounded growth

      const { name, email, institution, message, website } = req.body || {};
      // Honeypot: real users never fill this hidden field — silently accept bots
      if (website) return res.json({ ok: true });
      if (!name?.trim() || !email?.trim() || !institution?.trim()) {
        return res.status(400).json({ message: "Name, email and institution are required." });
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ message: "Please enter a valid email address." });
      }
      const row = await storage.createInquiry({
        name: String(name).trim().slice(0, 200),
        email: String(email).trim().slice(0, 200),
        institution: String(institution).trim().slice(0, 300),
        message: message ? String(message).trim().slice(0, 5000) : null,
      });
      // Email a copy to the site owner (non-blocking; inquiry is stored regardless)
      const contactTo = process.env.CONTACT_EMAIL || process.env.SMTP_USER;
      if (contactTo) {
        await sendLoggedEmail({
          to: contactTo,
          templateKey: "custom:institution_inquiry",
          subject: `New institution inquiry — ${row.institution}`,
          body: `Name: ${row.name}\nEmail: ${row.email}\nInstitution: ${row.institution}\n\n${row.message || "(no message)"}\n\nView all inquiries in your admin dashboard → Site Content → Inquiries.`,
          replyTo: row.email,
        });
      }
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Site content: admin routes ────────────────────────────────────────────
  app.get("/api/admin/site-settings", requireAdmin, async (_req, res) => {
    try {
      const settings = await storage.getSiteSettings();
      if (!isFeatureEnabled("demoVideoMedia")) delete settings.demoVideoUrl;
      res.json(settings);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/admin/site-settings", requireAdmin, async (req, res) => {
    try {
      const entries = Object.entries(req.body || {}).filter(([key]) =>
        key !== "demoVideoUrl" || isFeatureEnabled("demoVideoMedia"));
      const changes = Object.fromEntries(entries);
      const settings = await updateStage9SiteSettings(changes);
      if (!isFeatureEnabled("demoVideoMedia")) delete settings.demoVideoUrl;
      res.json(settings);
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });

  app.get("/api/admin/pages/:slug", requireAdmin, async (req, res) => {
    try {
      const page = await storage.getContentPage(req.params.slug);
      res.json(page || null);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/admin/pages/:slug", requireAdmin, async (req, res) => {
    try {
      const { title, content } = req.body || {};
      if (!title?.trim() || !content?.trim()) {
        return res.status(400).json({ message: "Title and content are required." });
      }
      res.json(await storage.upsertContentPage(req.params.slug, title, content));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/faq", requireAdmin, async (_req, res) => {
    try {
      res.json(await storage.getFaqItems(false));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/faq", requireAdmin, async (req, res) => {
    try {
      const { question, answer, orderIndex, isActive } = req.body || {};
      if (!question?.trim() || !answer?.trim()) {
        return res.status(400).json({ message: "Question and answer are required." });
      }
      res.json(await storage.createFaqItem({ question, answer, orderIndex, isActive }));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/admin/faq/:id", requireAdmin, async (req, res) => {
    try {
      res.json(await storage.updateFaqItem(parseInt(req.params.id), req.body || {}));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/faq/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteFaqItem(parseInt(req.params.id));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/inquiries", requireAdmin, async (_req, res) => {
    try {
      res.json(await storage.getInquiries());
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/admin/inquiries/:id", requireAdmin, async (req, res) => {
    try {
      res.json(await storage.updateInquiry(parseInt(req.params.id), req.body || {}));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/inquiries/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteInquiry(parseInt(req.params.id));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Demo exam admin routes ────────────────────────────────────────────────
  app.get("/api/admin/demo-exams", requireAdmin, async (_req, res) => {
    try {
      res.json(await storage.getAllDemoExams());
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/demo-exams", requireAdmin, async (req, res) => {
    try {
      const { title, displayOrder, timerSeconds } = req.body;
      if (!title) return res.status(400).json({ message: "Title required" });
      const exam = await storage.createDemoExam({ title, displayOrder: displayOrder ?? 0, timerSeconds: timerSeconds ?? 60 });
      res.json(exam);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/admin/demo-exams/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updated = await storage.updateDemoExam(id, req.body);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/demo-exams/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteDemoExam(parseInt(req.params.id));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/demo-exams/:id/questions", requireAdmin, async (req, res) => {
    try {
      res.json(await storage.getDemoQuestions(parseInt(req.params.id)));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/demo-engagement", requireAdmin, async (_req, res) => {
    try {
      res.json(await storage.getDemoEngagementSummary());
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/demo-engagement", requireAdmin, async (req, res) => {
    try {
      // CSRF guard: destructive action must come from our own origin.
      const origin = req.headers.origin || req.headers.referer;
      if (origin) {
        const originHost = new URL(origin).host;
        if (originHost !== req.headers.host) {
          return res.status(403).json({ message: "Cross-origin request rejected" });
        }
      }
      await storage.clearDemoEngagement();
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/demo-exams/:id/questions", requireAdmin, async (req, res) => {
    try {
      const demoExamId = parseInt(req.params.id);
      const { type, content, imageUrl, options, explanation, modelAnswer, markingPoints, orderIndex } = req.body;
      if (!type || !content) return res.status(400).json({ message: "type and content required" });
      if (!["mcq", "saq"].includes(type)) return res.status(400).json({ message: "type must be mcq or saq" });
      const q = await storage.createDemoQuestion({
        demoExamId, type, content, imageUrl: imageUrl || null, options: options || null,
        explanation: explanation || null, modelAnswer: modelAnswer || null,
        markingPoints: markingPoints || null, orderIndex: orderIndex ?? 0,
      });
      res.json(q);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/admin/demo-questions/:id", requireAdmin, async (req, res) => {
    try {
      const updated = await storage.updateDemoQuestion(parseInt(req.params.id), req.body);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/demo-questions/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteDemoQuestion(parseInt(req.params.id));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/students/enrol", requireAdmin, async (req, res) => {
    try {
      const { name, email, examId } = req.body;
      if (!email || !examId) return res.status(400).json({ message: "Email and examId are required" });
      const normalizedEmail = (email || "").trim().toLowerCase();

      let student = await storage.getStudentByEmail(normalizedEmail);
      if (!student) {
        if (!name) return res.status(400).json({ message: "Name is required for a new student" });
        student = await storage.createStudent({ name: name.trim(), email: normalizedEmail });
      } else if (name && student.name !== name.trim()) {
        student = await storage.updateStudent(student.id, { name: name.trim() });
      }

      const existing = await storage.getExamStudentByExamAndStudent(examId, student.id);
      if (existing) return res.status(400).json({ message: "Student is already enrolled in this exam" });

      await storage.createExamStudent({
        examId, studentId: student.id, password: await generateUnavailableExamCredentialHash(),
        attemptStatus: "not_started", resetCount: 0, emailSent: false,
      });
      await storage.createAuditLog({ adminId: (req as any).admin.id, action: "manual_enrol", details: `${student.name} (${normalizedEmail}) → exam ${examId}` });
      res.json({ ok: true, student });
    } catch (error: any) {
      res.status(500).json({ message: "Enrolment failed: " + error.message });
    }
  });

  // Background auto-submit: every 30 s, submit expired exams for students who left
  const autoSubmitCheck = setInterval(async () => {
    try {
      const inProgress = await storage.getInProgressAttempts();
      const now = Date.now();
      for (const a of inProgress) {
        if (a.timerMode === "full_exam" && a.fullExamSeconds && a.startedAt) {
          const elapsed = (now - new Date(a.startedAt).getTime()) / 1000;
          if (elapsed >= a.fullExamSeconds) {
            await storage.updateAttempt(a.attemptId, { status: "submitted", submittedAt: new Date() });
            await storage.updateExamStudent(a.examStudentId, { attemptStatus: "submitted" });
            if (a.autoMarkEnabled) enqueueMarking(a.examId);
          }
        } else if (a.timerMode === "per_question" && a.perQuestionSeconds && a.questionStartedAt) {
          const elapsed = (now - new Date(a.questionStartedAt).getTime()) / 1000;
          if (elapsed >= a.perQuestionSeconds + 5) {
            const qs = await storage.getQuestionsByExam(a.examId);
            if (a.currentQuestionIndex >= qs.length - 1) {
              await storage.updateAttempt(a.attemptId, { status: "submitted", submittedAt: new Date() });
              await storage.updateExamStudent(a.examStudentId, { attemptStatus: "submitted" });
              if (a.autoMarkEnabled) enqueueMarking(a.examId);
            } else {
              await storage.updateAttempt(a.attemptId, {
                currentQuestionIndex: a.currentQuestionIndex + 1,
                questionStartedAt: new Date(),
              });
            }
          }
        }
      }
    } catch (err: any) {
      console.error("Auto-submit check error:", err.message);
    }
  }, 10000);
  httpServer.on("close", () => clearInterval(autoSubmitCheck));

  return httpServer;
}

function getDefaultEmailBody(): string {
  return `MedQrown MedEazy {exam_name} - Exam Access Instructions

Dear {student_name},

You have been enrolled in the {exam_name} examination. Sign in to your student portal
using your verified student account to access your exam:
{portal_link}

Important Instructions:
- Sign in using your student portal account
- Your answers are auto-saved
- You can only submit once

If you have any questions, please contact your exam administrator.

Best regards,
MedQrown MedEazy

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
This is an automated message. Please do not reply.`;
}
