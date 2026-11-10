/**
 * Public demo: up to three real exam questions (picked by an admin from any exam), timed like
 * a normal exam and marked straight away. Answers are never stored: the attempt row keeps only
 * when it started, the score and where the visitor came from, so the funnel can be measured.
 * Short answers are AI-marked only by providers reserved for the demo (Settings → AI Providers);
 * when none can mark, the visitor is told to sign up to see those marks.
 */
import type { Express, RequestHandler } from "express";
import { createHash, randomBytes, randomInt } from "crypto";
import { pool } from "./db";
import { listCohorts } from "./stage3-storage";
import { markDemoItems } from "./ai-orchestrator";

export const DEMO_QUESTION_COUNT = 3;
const MAX_ANSWER_CHARS = 1000;
const LATE_GRACE_SECONDS = 90;
const DEVICE_COOKIE = "mq_demo_device";

/** Starts allowed per window. Campus Wi-Fi puts many students behind one IP, so the IP limit is generous. */
const LIMITS = {
  deviceShort: { count: 2, minutes: 30 },
  deviceDay: { count: 5, minutes: 24 * 60 },
  ip: { count: 40, minutes: 60 },
  global: { count: 400, minutes: 60 },
  /** Short-answer marking calls across everyone, to protect the demo AI keys. */
  aiPerHour: 150,
};

const DEFAULT_PERKS = [
  "A review session every Monday on the week's anatomy objectives",
  "A spot-like timed CAT + review session every Saturday",
  "At least 2 Anatomy Lab sessions per month",
];

export async function migrateDemo(): Promise<void> {
  await pool.query(`
    ALTER TABLE ai_providers ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'exams';
    CREATE TABLE IF NOT EXISTS medqrown_demo_questions (
      question_id INTEGER PRIMARY KEY REFERENCES questions(id) ON DELETE CASCADE,
      added_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      answered INTEGER NOT NULL DEFAULT 0,
      fully_correct INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS medqrown_demo_attempts (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      ip_hash TEXT NOT NULL,
      question_ids INTEGER[] NOT NULL,
      duration_seconds INTEGER NOT NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      submitted_at TIMESTAMPTZ,
      score NUMERIC,
      max_score INTEGER,
      ai_marked BOOLEAN,
      src TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_demo_attempts_device ON medqrown_demo_attempts (device_id, started_at);
    CREATE INDEX IF NOT EXISTS idx_demo_attempts_ip ON medqrown_demo_attempts (ip_hash, started_at);
    CREATE INDEX IF NOT EXISTS idx_demo_attempts_started ON medqrown_demo_attempts (started_at);
    ALTER TABLE medqrown_demo_attempts ADD COLUMN IF NOT EXISTS option_orders JSONB;
    ALTER TABLE medqrown_demo_attempts ADD COLUMN IF NOT EXISTS ranked_percent NUMERIC;
  `);
}

type DemoSettings = { durationMinutes: number; subject: string; perks: string[] };

async function getDemoSettings(): Promise<DemoSettings> {
  const { rows } = await pool.query(
    "SELECT key, value FROM site_settings WHERE key IN ('demoDurationMinutes', 'demoSubject', 'demoPerks')",
  );
  const map = Object.fromEntries(rows.map((r: any) => [r.key, r.value]));
  const minutes = Number(map.demoDurationMinutes);
  const perks = Array.isArray(map.demoPerks) ? map.demoPerks.filter((p: unknown) => typeof p === "string" && p.trim()) : [];
  return {
    durationMinutes: Number.isInteger(minutes) && minutes >= 1 && minutes <= 30 ? minutes : 5,
    subject: typeof map.demoSubject === "string" && map.demoSubject.trim() ? map.demoSubject.trim() : "Anatomy",
    perks: perks.length ? perks : DEFAULT_PERKS,
  };
}

async function saveSetting(key: string, value: unknown) {
  await pool.query(
    `INSERT INTO site_settings (key, value) VALUES ($1, $2::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, JSON.stringify(value)],
  );
}

type QuestionRow = {
  id: number; type: string; content: string; imageUrl: string | null; imageCaption: string | null;
  marks: number; expectedAnswer: string | null; explanation: string | null; hasSubquestions: boolean;
  options: { content: string; isCorrect: boolean }[];
  subquestions: { id: number; content: string; marks: number; expectedAnswer: string | null }[];
};

async function loadQuestions(ids: number[]): Promise<QuestionRow[]> {
  if (!ids.length) return [];
  const { rows } = await pool.query(
    `SELECT q.id, q.type, q.content, q.image_url AS "imageUrl", q.image_caption AS "imageCaption", q.marks,
            q.expected_answer AS "expectedAnswer", q.explanation, q.has_subquestions AS "hasSubquestions",
            COALESCE((SELECT json_agg(json_build_object('content', o.content, 'isCorrect', o.is_correct) ORDER BY o.order_index, o.id)
                        FROM question_options o WHERE o.question_id = q.id), '[]') AS options,
            COALESCE((SELECT json_agg(json_build_object('id', s.id, 'content', s.content, 'marks', s.marks,
                                                        'expectedAnswer', s.expected_answer) ORDER BY s.order_index, s.id)
                        FROM subquestions s WHERE s.question_id = q.id), '[]') AS subquestions
       FROM questions q WHERE q.id = ANY($1::int[])`,
    [ids],
  );
  const byId = new Map(rows.map((r: QuestionRow) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter(Boolean) as QuestionRow[];
}

const usesParts = (q: QuestionRow) => q.type === "saq" && q.hasSubquestions && q.subquestions.length > 0;

/** Why a question can't be used in the demo, or null when it's ready. */
function notReadyReason(q: QuestionRow): string | null {
  if (q.type === "mcq") {
    if (q.options.length < 2) return "needs at least two options";
    if (!q.options.some((o) => o.isCorrect)) return "has no correct option marked";
    return null;
  }
  if (q.type !== "saq") return `type "${q.type}" isn't supported`;
  if (usesParts(q)) {
    return q.subquestions.every((s) => s.expectedAnswer?.trim()) ? null : "a sub-question has no expected answer";
  }
  return q.expectedAnswer?.trim() ? null : "has no expected answer";
}

const totalMarks = (q: QuestionRow) => (usesParts(q) ? q.subquestions.reduce((sum, s) => sum + s.marks, 0) : q.marks);

/** Fair (Fisher-Yates) shuffle using a cryptographic random source. */
function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * What the visitor sees while answering: no correct options, expected answers or explanations.
 * `order` is this attempt's shuffled option order (display position -> original option index).
 */
function publicQuestion(q: QuestionRow, order?: number[]) {
  const shown = order ?? q.options.map((_, i) => i);
  return {
    id: q.id, type: q.type, content: q.content, imageUrl: q.imageUrl, marks: totalMarks(q),
    options: q.type === "mcq" ? shown.map((i) => q.options[i].content) : [],
    parts: usesParts(q) ? q.subquestions.map((s) => ({ id: s.id, content: s.content, marks: s.marks })) : [],
  };
}

function readCookie(header: string | undefined, name: string): string | null {
  for (const part of (header || "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

function hashIp(ip: string) {
  return createHash("sha256").update(`${process.env.SESSION_SECRET || "medqrown"}:${ip}`).digest("hex").slice(0, 32);
}

const nice = (minutes: number) => (minutes >= 60 ? `${Math.round(minutes / 60)} hour${minutes >= 120 ? "s" : ""}` : `${minutes} minutes`);

async function rateLimitMessage(deviceId: string, ipHash: string): Promise<string | null> {
  const { rows: [c] } = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE device_id = $1 AND started_at > now() - make_interval(mins => $3))::int AS "deviceShort",
            COUNT(*) FILTER (WHERE device_id = $1 AND started_at > now() - make_interval(mins => $4))::int AS "deviceDay",
            COUNT(*) FILTER (WHERE ip_hash = $2 AND started_at > now() - make_interval(mins => $5))::int AS ip,
            COUNT(*) FILTER (WHERE started_at > now() - make_interval(mins => $6))::int AS global
       FROM medqrown_demo_attempts
      WHERE started_at > now() - interval '1 day'`,
    [deviceId, ipHash, LIMITS.deviceShort.minutes, LIMITS.deviceDay.minutes, LIMITS.ip.minutes, LIMITS.global.minutes],
  );
  if (c.deviceShort >= LIMITS.deviceShort.count) {
    return `You've just had ${LIMITS.deviceShort.count} goes. Take a breather and try again in ${nice(LIMITS.deviceShort.minutes)}, or sign up for the full question bank.`;
  }
  if (c.deviceDay >= LIMITS.deviceDay.count) {
    return "That's today's free demos used up. Come back tomorrow, or sign up for unlimited practice.";
  }
  if (c.ip >= LIMITS.ip.count || c.global >= LIMITS.global.count) {
    return "The demo is very busy right now. Please try again in a few minutes.";
  }
  return null;
}

type Answer = { option?: number; text?: string; parts?: Record<string, string> };

export function registerDemoRoutes(app: Express, requireAdmin: RequestHandler): void {
  /** What the landing page and the intro screen need. */
  app.get("/api/demo/info", async (_req, res) => {
    const settings = await getDemoSettings();
    const { rows } = await pool.query("SELECT question_id FROM medqrown_demo_questions");
    const ready = (await loadQuestions(rows.map((r: any) => r.question_id))).filter((q) => !notReadyReason(q));
    res.json({
      available: ready.length > 0,
      questionCount: Math.min(DEMO_QUESTION_COUNT, ready.length),
      durationMinutes: settings.durationMinutes,
      subject: settings.subject,
      perks: settings.perks,
      nextCohortStart: (await listCohorts()).next?.startDate ?? null,
    });
  });

  app.post("/api/demo/start", async (req, res) => {
    let deviceId = readCookie(req.headers.cookie, DEVICE_COOKIE);
    if (!deviceId || !/^[A-Za-z0-9_-]{16,64}$/.test(deviceId)) {
      deviceId = randomBytes(18).toString("base64url");
      res.cookie(DEVICE_COOKIE, deviceId, {
        httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 365 * 24 * 3600 * 1000,
      });
    }
    const ipHash = hashIp(String(req.ip || req.socket.remoteAddress || "unknown"));
    const limited = await rateLimitMessage(deviceId, ipHash);
    if (limited) return res.status(429).json({ message: limited });

    const { rows } = await pool.query("SELECT question_id FROM medqrown_demo_questions");
    const ready = (await loadQuestions(rows.map((r: any) => r.question_id))).filter((q) => !notReadyReason(q));
    if (!ready.length) return res.status(503).json({ message: "The demo isn't available right now. Please check back soon." });
    // A fresh random pick each attempt, preferring questions this browser hasn't had in its last few goes.
    const { rows: recent } = await pool.query(
      `SELECT DISTINCT unnest(question_ids) AS id FROM (
         SELECT question_ids FROM medqrown_demo_attempts WHERE device_id = $1 ORDER BY started_at DESC LIMIT 5) recent`,
      [deviceId],
    );
    const seen = new Set(recent.map((r: any) => r.id));
    const fresh = shuffle(ready.filter((q) => !seen.has(q.id)));
    const picked = shuffle([...fresh, ...shuffle(ready.filter((q) => seen.has(q.id)))].slice(0, DEMO_QUESTION_COUNT));
    // Options are shuffled per attempt too, so answers can't be passed around as "it's B".
    const optionOrders: Record<string, number[]> = {};
    for (const q of picked) if (q.type === "mcq") optionOrders[q.id] = shuffle(q.options.map((_, i) => i));

    const settings = await getDemoSettings();
    const id = randomBytes(24).toString("base64url");
    const durationSeconds = settings.durationMinutes * 60;
    const src = typeof req.body?.src === "string" ? req.body.src.replace(/[^a-z0-9_-]/gi, "").slice(0, 40) || null : null;
    const { rows: [attempt] } = await pool.query(
      `INSERT INTO medqrown_demo_attempts (id, device_id, ip_hash, question_ids, duration_seconds, src, option_orders)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING started_at AS "startedAt"`,
      [id, deviceId, ipHash, picked.map((q) => q.id), durationSeconds, src, JSON.stringify(optionOrders)],
    );
    // Housekeeping: attempts only matter for limits and the funnel.
    if (Math.random() < 0.02) void pool.query("DELETE FROM medqrown_demo_attempts WHERE started_at < now() - interval '90 days'").catch(() => undefined);

    res.json({
      attemptId: id,
      durationSeconds,
      endsAt: new Date(new Date(attempt.startedAt).getTime() + durationSeconds * 1000).toISOString(),
      subject: settings.subject,
      questions: picked.map((q) => publicQuestion(q, optionOrders[q.id])),
    });
  });

  app.post("/api/demo/submit", async (req, res) => {
    const attemptId = req.body?.attemptId;
    const answers = req.body?.answers;
    if (typeof attemptId !== "string" || !/^[A-Za-z0-9_-]{20,64}$/.test(attemptId)
        || !answers || typeof answers !== "object" || Array.isArray(answers)) {
      return res.status(400).json({ message: "Something went wrong with this attempt. Please start again." });
    }
    const deviceId = readCookie(req.headers.cookie, DEVICE_COOKIE);
    // Claim the attempt atomically so it can only ever be marked once.
    const { rows: [attempt] } = await pool.query(
      `UPDATE medqrown_demo_attempts SET submitted_at = now()
        WHERE id = $1 AND submitted_at IS NULL AND device_id = $2
          AND now() <= started_at + make_interval(secs => duration_seconds + $3)
        RETURNING question_ids AS "questionIds", option_orders AS "optionOrders"`,
      [attemptId, deviceId ?? "", LATE_GRACE_SECONDS],
    );
    if (!attempt) {
      return res.status(410).json({ message: "This attempt has already been marked or has expired. Start a new one to try again." });
    }

    const questions = await loadQuestions(attempt.questionIds);
    const answerFor = (id: number): Answer => {
      const a = (answers as Record<string, unknown>)[String(id)];
      return a && typeof a === "object" && !Array.isArray(a) ? (a as Answer) : {};
    };
    const clean = (value: unknown) => (typeof value === "string" ? value.trim().slice(0, MAX_ANSWER_CHARS) : "");

    // Gather every short answer (or sub-question part) for one AI call.
    type Item = { questionId: number; partId: number | null; partContent: string | null; question: string; expected: string; answer: string; marks: number; caption: string | null };
    const items: Item[] = [];
    for (const q of questions) {
      if (q.type !== "saq") continue;
      const a = answerFor(q.id);
      if (usesParts(q)) {
        const given = a.parts && typeof a.parts === "object" ? a.parts : {};
        for (const s of q.subquestions) {
          items.push({ questionId: q.id, partId: s.id, partContent: s.content, question: `${q.content}\n${s.content}`, expected: s.expectedAnswer || "",
            answer: clean((given as Record<string, unknown>)[String(s.id)]), marks: s.marks, caption: q.imageCaption });
        }
      } else {
        items.push({ questionId: q.id, partId: null, partContent: null, question: q.content, expected: q.expectedAnswer || "",
          answer: clean(a.text), marks: q.marks, caption: q.imageCaption });
      }
    }
    const toMark = items.filter((i) => i.answer);
    let marks: { isCorrect: boolean; feedback: string }[] | null = [];
    if (toMark.length) {
      const { rows: [{ recent }] } = await pool.query(
        "SELECT COUNT(*)::int AS recent FROM medqrown_demo_attempts WHERE ai_marked AND submitted_at > now() - interval '1 hour'",
      );
      marks = recent >= LIMITS.aiPerHour ? null : await markDemoItems(toMark.map((i) => ({
        question: i.question, expected: i.expected, answer: i.answer, imageCaption: i.caption,
      })));
    }
    const shortAnswersLocked = marks === null && items.length > 0;
    const verdict = new Map<Item, { isCorrect: boolean; feedback: string }>();
    toMark.forEach((item, idx) => { if (marks?.[idx]) verdict.set(item, marks[idx]); });

    let score = 0;
    let maxScore = 0;
    const results = questions.map((q) => {
      const a = answerFor(q.id);
      const marksAvailable = totalMarks(q);
      maxScore += marksAvailable;
      if (q.type === "mcq") {
        // Positions are as displayed; map them back through this attempt's shuffled order.
        const order: number[] = attempt.optionOrders?.[q.id] ?? q.options.map((_, i) => i);
        const chosen = Number.isInteger(a.option) && a.option! >= 0 && a.option! < order.length ? a.option! : null;
        const correct = chosen !== null && q.options[order[chosen]].isCorrect;
        const awarded = correct ? q.marks : 0;
        score += awarded;
        return {
          ...publicQuestion(q, order), awarded, correct, chosen, explanation: q.explanation,
          correctOptions: order.map((orig, pos) => (q.options[orig].isCorrect ? pos : -1)).filter((i) => i >= 0),
        };
      }
      const own = items.filter((i) => i.questionId === q.id);
      const parts = own.map((i) => {
        const v = verdict.get(i);
        const awarded = shortAnswersLocked ? null : v?.isCorrect ? i.marks : 0;
        if (awarded) score += awarded;
        return {
          id: i.partId, content: i.partContent, answer: i.answer, marks: i.marks, awarded,
          correct: shortAnswersLocked ? null : !!v?.isCorrect,
          feedback: shortAnswersLocked ? null : !i.answer ? "Not answered." : v?.feedback || "",
        };
      });
      const awarded = shortAnswersLocked ? null : parts.reduce((sum, p) => sum + (p.awarded ?? 0), 0);
      return { ...publicQuestion(q), awarded, correct: shortAnswersLocked ? null : awarded === marksAvailable, parts, explanation: null };
    });

    // Only fully marked attempts are ranked, so a locked short answer never counts as zero.
    const percent = !shortAnswersLocked && maxScore > 0 ? Math.round((score / maxScore) * 1000) / 10 : null;
    await pool.query(
      "UPDATE medqrown_demo_attempts SET score = $2, max_score = $3, ai_marked = $4, ranked_percent = $5 WHERE id = $1",
      [attemptId, score, maxScore, toMark.length > 0 && !shortAnswersLocked, percent],
    );
    let beatPercent: number | null = null;
    if (percent !== null) {
      const { rows: [rank] } = await pool.query(
        `SELECT COUNT(*)::int AS others, COUNT(*) FILTER (WHERE ranked_percent < $2)::int AS below
           FROM medqrown_demo_attempts
          WHERE id <> $1 AND ranked_percent IS NOT NULL AND submitted_at > now() - interval '90 days'`,
        [attemptId, percent],
      );
      // Too few attempts to compare against makes the number meaningless.
      if (rank.others >= 10) beatPercent = Math.round((rank.below / rank.others) * 100);
    }
    for (const r of results) {
      if (r.correct === null) continue;
      await pool.query(
        `UPDATE medqrown_demo_questions SET answered = answered + 1, fully_correct = fully_correct + $2 WHERE question_id = $1`,
        [r.id, r.correct ? 1 : 0],
      );
    }
    res.json({ score, maxScore, shortAnswersLocked, beatPercent, questions: results });
  });

  // ── Admin ────────────────────────────────────────────────────────────────
  app.get("/api/admin/demo", requireAdmin, async (_req, res) => {
    const settings = await getDemoSettings();
    const { rows: picked } = await pool.query(
      `SELECT d.question_id AS id, d.answered, d.fully_correct AS "fullyCorrect", e.id AS "examId", e.title AS "examTitle"
         FROM medqrown_demo_questions d
         JOIN questions q ON q.id = d.question_id
         JOIN exams e ON e.id = q.exam_id
        ORDER BY d.added_at`,
    );
    const details = new Map((await loadQuestions(picked.map((p: any) => p.id))).map((q) => [q.id, q]));
    const { rows: [stats] } = await pool.query(
      `SELECT COUNT(*)::int AS starts,
              COUNT(*) FILTER (WHERE submitted_at IS NOT NULL)::int AS finished,
              ROUND(AVG(score / NULLIF(max_score, 0)) * 100)::int AS "averagePercent"
         FROM medqrown_demo_attempts WHERE started_at > now() - interval '30 days'`,
    );
    const { rows: sources } = await pool.query(
      `SELECT COALESCE(src, 'direct') AS src, COUNT(*)::int AS starts,
              COUNT(*) FILTER (WHERE submitted_at IS NOT NULL)::int AS finished
         FROM medqrown_demo_attempts WHERE started_at > now() - interval '30 days'
        GROUP BY 1 ORDER BY 2 DESC LIMIT 10`,
    );
    const { rows: [providers] } = await pool.query(
      "SELECT COUNT(*) FILTER (WHERE is_active AND purpose = 'demo')::int AS demo FROM ai_providers",
    );
    res.json({
      settings,
      demoProviders: providers.demo,
      stats: { ...stats, sources },
      questions: picked.map((p: any) => {
        const q = details.get(p.id)!;
        return {
          id: p.id, examId: p.examId, examTitle: p.examTitle, type: q.type, content: q.content, imageUrl: q.imageUrl,
          parts: usesParts(q) ? q.subquestions.length : 0, marks: totalMarks(q),
          answered: p.answered, fullyCorrect: p.fullyCorrect, problem: notReadyReason(q),
        };
      }),
    });
  });

  app.put("/api/admin/demo/questions/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: "Invalid question" });
    const [q] = await loadQuestions([id]);
    if (!q) return res.status(404).json({ message: "Question not found" });
    const problem = notReadyReason(q);
    if (problem) return res.status(400).json({ message: `This question can't go in the demo: it ${problem}.` });
    await pool.query("INSERT INTO medqrown_demo_questions (question_id) VALUES ($1) ON CONFLICT DO NOTHING", [id]);
    res.json({ ok: true });
  });

  app.delete("/api/admin/demo/questions/:id", requireAdmin, async (req, res) => {
    await pool.query("DELETE FROM medqrown_demo_questions WHERE question_id = $1", [Number(req.params.id) || 0]);
    res.json({ ok: true });
  });

  app.patch("/api/admin/demo/settings", requireAdmin, async (req, res) => {
    const { durationMinutes, subject, perks } = req.body || {};
    if (durationMinutes !== undefined) {
      if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 30) {
        return res.status(400).json({ message: "The time limit must be between 1 and 30 minutes." });
      }
      await saveSetting("demoDurationMinutes", durationMinutes);
    }
    if (subject !== undefined) {
      if (typeof subject !== "string" || !subject.trim() || subject.length > 60) return res.status(400).json({ message: "Enter a subject name." });
      await saveSetting("demoSubject", subject.trim());
    }
    if (perks !== undefined) {
      if (!Array.isArray(perks) || perks.length > 6 || perks.some((p) => typeof p !== "string" || p.length > 160)) {
        return res.status(400).json({ message: "Up to 6 selling points, 160 characters each." });
      }
      await saveSetting("demoPerks", perks.map((p: string) => p.trim()).filter(Boolean));
    }
    res.json(await getDemoSettings());
  });
}
