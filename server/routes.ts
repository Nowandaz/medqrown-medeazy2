import type { Express } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import { storage } from "./storage";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { markSAQResponses, markSingleResponse, markStudentSAQResponses } from "./ai-orchestrator";
import { enqueueMarking } from "./marking-queue";
import { getExamStructure, invalidateExamCache } from "./exam-cache";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";

function generatePassword(email: string): string {
  const prefix = email.split("@")[0].slice(0, 4).toLowerCase();
  const random = crypto.randomBytes(3).toString("hex");
  return `${prefix}${random}`;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const isProduction = process.env.NODE_ENV === "production";
  if (isProduction) {
    app.set("trust proxy", 1);
  }

  app.use(
    session({
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

  // Health check (used by Render deployment)
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", ts: Date.now() });
  });

  // Admin Auth
  app.post("/api/admin/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      const admin = await storage.getAdminByEmail(email);
      if (!admin) return res.status(401).json({ message: "Invalid credentials" });
      const valid = await bcrypt.compare(password, admin.passwordHash);
      if (!valid) return res.status(401).json({ message: "Invalid credentials" });
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
    const exam = await storage.createExam({ ...req.body, createdBy: (req as any).admin.id });
    await storage.createAuditLog({ adminId: (req as any).admin.id, action: "create_exam", details: exam.title });
    res.json(exam);
  });

  app.patch("/api/exams/:id", requireAdmin, async (req, res) => {
    const exam = await storage.updateExam(parseInt(req.params.id), req.body);
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
    const students = await storage.getStudentsByExam(parseInt(req.params.examId));
    const studentsWithAttempts = await Promise.all(students.map(async (es) => {
      const attempt = await storage.getAttemptByExamStudent(es.id);
      return { ...es, attempt };
    }));
    res.json(studentsWithAttempts);
  });

  app.post("/api/exams/:examId/students", requireAdmin, async (req, res) => {
    const examId = parseInt(req.params.examId);
    const { name, email } = req.body;
    let student = await storage.getStudentByEmail(email);
    if (!student) {
      student = await storage.createStudent({ name, email });
    }
    const existing = await storage.getExamStudentByExamAndStudent(examId, student.id);
    if (existing) return res.status(400).json({ message: "Student already added to this exam" });
    const password = generatePassword(email);
    const examStudent = await storage.createExamStudent({
      examId,
      studentId: student.id,
      password,
      attemptStatus: "not_started",
      resetCount: 0,
      emailSent: false,
    });
    res.json({ ...examStudent, student });
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
    const { type, content, marks, expectedAnswer, imageUrl, imageCaption, hasSubquestions, options, subquestions: subs } = req.body;
    const existingQs = await storage.getQuestionsByExam(examId);
    const orderIndex = existingQs.length;
    const question = await storage.createQuestion({
      examId, type, content, orderIndex, marks: marks || 1,
      expectedAnswer, imageUrl, imageCaption, hasSubquestions: hasSubquestions || false,
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
    const { content, marks, expectedAnswer, imageUrl, imageCaption, options, subquestions: subs } = req.body;
    await storage.updateQuestion(qId, { content, marks, expectedAnswer, imageUrl, imageCaption });
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

    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      return res.status(503).json({ message: "Email is not configured. Set SMTP_USER and SMTP_PASS environment variables." });
    }

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

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      connectionTimeout: 15000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });

    // Verify SMTP connection before looping — fail fast with clear error
    try {
      await transporter.verify();
    } catch (verifyErr: any) {
      return res.status(503).json({ message: `SMTP connection failed: ${verifyErr.message}` });
    }

    const subjectTemplate = customSubject || template?.subject || "MedQrown MedEazy {exam_name} - Your Access Credentials";
    const bodyTemplate = customBody || template?.body || getDefaultEmailBody();
    const customPlaceholders: Record<string, string> = (template as any)?.placeholders || {};

    const results = [];
    let successCount = 0;
    let failCount = 0;

    for (const es of targets) {
      let subject = subjectTemplate
        .replace(/{exam_name}/g, customPlaceholders.exam_name || exam.title)
        .replace(/{student_name}/g, customPlaceholders.student_name || es.student.name);

      let body = bodyTemplate
        .replace(/{student_name}/g, customPlaceholders.student_name || es.student.name)
        .replace(/{exam_name}/g, customPlaceholders.exam_name || exam.title)
        .replace(/{email}/g, customPlaceholders.email || es.student.email)
        .replace(/{password}/g, customPlaceholders.password || es.password)
        .replace(/{portal_link}/g, customPlaceholders.portal_link || req.headers.origin || "");

      for (const [key, val] of Object.entries(customPlaceholders)) {
        if (!["student_name", "exam_name", "email", "password", "portal_link"].includes(key)) {
          subject = subject.replace(new RegExp(`{${key}}`, "g"), val);
          body = body.replace(new RegExp(`{${key}}`, "g"), val);
        }
      }

      let status = "failed";
      try {
        await transporter.sendMail({
          from: `"${process.env.SMTP_FROM_NAME || "MedQrown MedEazy"}" <${process.env.SMTP_USER}>`,
          to: es.student.email,
          subject,
          text: body,
        });
        status = "sent";
        successCount++;
        await storage.updateExamStudent(es.id, { emailSent: true });
      } catch (err: any) {
        console.error(`Email to ${es.student.email} failed:`, err.message);
        status = "failed";
        failCount++;
      }

      await storage.createEmailLog({
        templateId: template?.id,
        recipientEmail: es.student.email,
        subject,
        status,
      });

      results.push({
        studentName: es.student.name,
        email: es.student.email,
        status,
      });
    }

    res.json({ total: results.length, sent: successCount, failed: failCount, emails: results });
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
    const { examId, email, password } = req.body;
    const es = await storage.getExamStudentByCredentials(parseInt(examId), email, password);
    if (!es) return res.status(401).json({ message: "Invalid credentials" });
    (req.session as any).examStudentId = es.id;
    (req.session as any).studentExamId = parseInt(examId);
    res.json({
      examStudentId: es.id,
      studentName: es.student.name,
      attemptStatus: es.attemptStatus,
    });
  });

  app.get("/api/student/session", async (req, res) => {
    const esId = (req.session as any)?.examStudentId;
    if (!esId) return res.status(401).json({ message: "Not authenticated" });
    const es = await storage.getExamStudent(esId);
    if (!es) return res.status(401).json({ message: "Not authenticated" });
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
    const exam = await storage.getExam(es.examId);
    if (!exam) return res.status(404).json({ message: "Exam not found" });
    const qs = await storage.getQuestionsByExam(exam.id);
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
    const es = await storage.getExamStudent(esId);
    if (!es) return res.status(401).json({ message: "Session expired" });

    if (es.attemptStatus === "submitted") {
      return res.status(400).json({ message: "Exam already submitted" });
    }

    let attempt = await storage.getAttemptByExamStudent(esId);
    const exam = await storage.getExam(es.examId);
    if (!attempt) {
      const now = new Date();
      attempt = await storage.createAttempt({
        examStudentId: esId,
        status: "in_progress",
        currentQuestionIndex: 0,
        remainingTime: null,
        questionStartedAt: now,
      });
      await storage.updateExamStudent(esId, { attemptStatus: "in_progress" });
    } else if (!attempt.questionStartedAt) {
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

    res.json({
      attemptId: attempt.id,
      currentQuestionIndex: attempt.currentQuestionIndex,
      totalQuestions: qs.length,
      timerMode: exam?.timerMode,
      perQuestionSeconds: exam?.perQuestionSeconds,
      fullExamSeconds: exam?.fullExamSeconds,
      questionStartedAt: attempt.questionStartedAt?.toISOString() ?? null,
      startedAt: attempt.startedAt?.toISOString() ?? null,
      question: questionData,
    });
  });

  app.post("/api/student/save-answer", async (req, res) => {
    const esId = (req.session as any)?.examStudentId;
    if (!esId) return res.status(401).json({ message: "Not authenticated" });
    const { attemptId, questionId, subquestionId, answer } = req.body;

    const attempt = await storage.getAttempt(attemptId);
    if (!attempt || attempt.status === "submitted") {
      return res.status(400).json({ message: "Invalid attempt" });
    }
    if (attempt.examStudentId !== esId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const question = await storage.getQuestion(questionId);
    if (!question) return res.status(404).json({ message: "Question not found" });

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
    const { attemptId } = req.body;
    const attempt = await storage.getAttempt(attemptId);
    if (!attempt) return res.status(404).json({ message: "Attempt not found" });
    if (attempt.examStudentId !== esId) return res.status(403).json({ message: "Forbidden" });
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

    res.json({
      currentQuestionIndex: nextIndex,
      totalQuestions: qs.length,
      questionStartedAt: questionStartedAt?.toISOString() ?? null,
      question: questionData,
    });
  });

  app.post("/api/student/update-timer", async (req, res) => {
    const esId = (req.session as any)?.examStudentId;
    if (!esId) return res.status(401).json({ message: "Not authenticated" });
    const { attemptId, remainingTime } = req.body;
    const attempt = await storage.getAttempt(attemptId);
    if (!attempt || attempt.examStudentId !== esId) return res.status(403).json({ message: "Forbidden" });
    await storage.updateAttempt(attemptId, { remainingTime });
    res.json({ ok: true });
  });

  app.post("/api/student/submit-exam", async (req, res) => {
    const esId = (req.session as any)?.examStudentId;
    if (!esId) return res.status(401).json({ message: "Not authenticated" });
    const { attemptId } = req.body;
    const attempt = await storage.getAttempt(attemptId);
    if (!attempt || attempt.examStudentId !== esId) return res.status(403).json({ message: "Forbidden" });
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
            console.log(`[Auto-Mark] Queuing auto-marking for exam ${es.examId} after student submission`);
            enqueueMarking(es.examId).catch(err =>
              console.error(`[Auto-Mark] Error:`, err.message)
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

    if (markingInProgress && attempt.status === "submitted") {
      return res.json({
        released: false,
        markingInProgress: true,
        totalSAQ: saqResponses.length,
        markedSAQ: saqResponses.length - unmarkedSAQ.length,
        message: "AI is marking your answers. Please wait..."
      });
    }

    if (!exam.resultsReleased) {
      return res.json({ released: false, markingInProgress: false, message: "Results have not been released yet." });
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

  return httpServer;
}

function getDefaultEmailBody(): string {
  return `MedQrown MedEazy {exam_name} - Your Access Credentials and Instructions

Dear {student_name},

This is a reminder for your MedQrown MedEazy {exam_name} examination access.

Your Login Credentials:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Email: {email}
Password: {password}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Portal Access Link:
{portal_link}

Important Instructions:
- Click the link above to access the portal
- Log in with your credentials
- Your answers are auto-saved
- You can only submit once
- Keep your credentials secure and private

If you have any questions, please contact your exam administrator.

Best regards,
MedQrown MedEazy

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
This is an automated message. Please do not reply.`;
}
