import type { Express, RequestHandler } from "express";
import { pool } from "./db";
import { analyzeExamQuestions } from "./ai-orchestrator";
import { listCohorts, nairobiDate } from "./stage3-storage";
import { groupedQueue } from "./stage5";

const allowedPublicEvents = new Set(["page_view", "demo_start", "demo_complete", "signup_click"]);
const allowedPages = new Set(["home", "demo", "signup", "waitlist", "classes", "other"]);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function dateRange(req: any): { from: string; to: string } | null {
  const from = typeof req.query.from === "string" ? req.query.from : undefined;
  const to = typeof req.query.to === "string" ? req.query.to : undefined;
  const valid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
  if ((from && !valid(from)) || (to && !valid(to)) || (from && to && from > to)) return null;
  return { from: from || "1900-01-01", to: to || nairobiDate() };
}

function safeCsvCell(value: unknown): string {
  let text = String(value ?? "");
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function validSource(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const source = value.trim().toLowerCase();
  return /^[a-z0-9_-]{1,60}$/.test(source) ? source : null;
}

async function masterMembers(classId?: number) {
  const { rows } = await pool.query(
    `WITH max_scores AS (
       SELECT q.exam_id,
              SUM(CASE WHEN q.has_subquestions THEN COALESCE(subs.total_marks, 0) ELSE q.marks END)::float AS max_score
         FROM questions q
         LEFT JOIN (SELECT question_id, SUM(marks)::float AS total_marks
                      FROM subquestions GROUP BY question_id) subs ON subs.question_id = q.id
        GROUP BY q.exam_id
     ), attempt_scores AS (
       SELECT es.student_id, es.exam_id, a.id AS attempt_id,
              (COALESCE(SUM(r.marks_awarded), 0)::float / NULLIF(ms.max_score, 0)) * 100 AS percent_score
         FROM exam_students es
         JOIN attempts a ON a.exam_student_id = es.id AND a.status = 'submitted'
         LEFT JOIN responses r ON r.attempt_id = a.id
         LEFT JOIN max_scores ms ON ms.exam_id = es.exam_id
        GROUP BY es.student_id, es.exam_id, a.id, ms.max_score
     )
     SELECT s.id, s.name, s.email, s.phone, s.avatar_key AS "avatarKey",
            m.cohort_id AS "cohortId", m.start_date::text AS "membershipStartDate",
            m.end_date::text AS "membershipEndDate",
            (SELECT grace_days FROM medqrown_settings WHERE id = 1) AS "graceDays",
            mi.used_at AS "inviteUsedAt", mi.expires_at AS "inviteExpiresAt",
            sa.is_active AS "accountActive",
            (SELECT p.plan FROM medqrown_payment_entries p WHERE p.student_id = s.id
              ORDER BY p.created_at DESC, p.id DESC LIMIT 1) AS "latestPlan",
            COALESCE((SELECT COUNT(DISTINCT ats.exam_id)::int FROM attempt_scores ats
                       WHERE ats.student_id = s.id), 0) AS "examsTaken",
            (SELECT AVG(ats.percent_score)::float FROM attempt_scores ats
              WHERE ats.student_id = s.id AND ats.percent_score IS NOT NULL) AS "averageScore",
            COALESCE((SELECT json_agg(json_build_object('id', c.id, 'name', c.name, 'status', c.status)
                                      ORDER BY c.name, c.id)
                        FROM medqrown_class_students cs JOIN medqrown_classes c ON c.id = cs.class_id
                       WHERE cs.student_id = s.id), '[]'::json) AS classes
       FROM students s
       LEFT JOIN medqrown_memberships m ON m.student_id = s.id
       LEFT JOIN medqrown_invites mi ON mi.student_id = s.id
       LEFT JOIN student_accounts sa ON sa.student_id = s.id
      WHERE ($1::int IS NULL OR EXISTS (
        SELECT 1 FROM medqrown_class_students filter_cs
         WHERE filter_cs.student_id = s.id AND filter_cs.class_id = $1
      ))
      ORDER BY s.name, s.id`,
    [classId ?? null],
  );
  const today = nairobiDate();
  return rows.map((row: any) => {
    let status = "unassigned";
    if (row.membershipEndDate) {
      const graceEnd = new Date(`${row.membershipEndDate}T00:00:00.000Z`);
      graceEnd.setUTCDate(graceEnd.getUTCDate() + Number(row.graceDays ?? 3));
      status = today < row.membershipStartDate ? "invited"
        : today <= row.membershipEndDate ? "active"
          : today <= graceEnd.toISOString().slice(0, 10) ? "grace" : "expired";
    }
    const inviteStatus = row.inviteUsedAt ? "activated"
      : row.inviteExpiresAt && new Date(row.inviteExpiresAt).getTime() <= Date.now() ? "expired"
        : row.inviteExpiresAt ? "pending" : row.accountActive ? "activated" : "not_invited";
    return { ...row, status, inviteStatus, averageScore: row.averageScore == null ? null : Number(row.averageScore) };
  });
}

function filterMembers(rows: any[], req: any) {
  const search = typeof req.query.search === "string" ? req.query.search.trim().toLowerCase().slice(0, 250) : "";
  const status = typeof req.query.status === "string" ? req.query.status : "";
  if (status && !["active", "grace", "invited", "expired", "unassigned"].includes(status)) {
    throw Object.assign(new Error("Invalid membership status filter"), { status: 400 });
  }
  const sort = typeof req.query.sort === "string" ? req.query.sort : "name";
  const direction = req.query.direction === "desc" ? -1 : 1;
  const validSorts = new Set(["name", "email", "phone", "latestPlan", "status", "membershipEndDate", "inviteStatus", "examsTaken", "averageScore"]);
  if (!validSorts.has(sort)) throw Object.assign(new Error("Invalid sort field"), { status: 400 });
  const filtered = rows.filter((row) =>
    (!status || row.status === status)
    && (!search || [row.name, row.email, row.phone, row.latestPlan].some((value) => String(value ?? "").toLowerCase().includes(search))),
  );
  filtered.sort((a, b) => {
    const av = a[sort], bv = b[sort];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return (typeof av === "number" && typeof bv === "number"
      ? av - bv
      : String(av).localeCompare(String(bv), undefined, { sensitivity: "base" })) * direction;
  });
  return filtered;
}

export async function getStage10ClassMembers(classId: number, query: any): Promise<any[]> {
  return filterMembers(await masterMembers(classId), { query });
}

async function questionAnalytics(examId: number) {
  const { rows: questionRows } = await pool.query(
    `SELECT q.id, q.type, q.content, q.marks, q.expected_answer AS "expectedAnswer",
            q.has_subquestions AS "hasSubquestions",
            COALESCE((SELECT json_agg(json_build_object('id', qo.id, 'content', qo.content,
              'isCorrect', qo.is_correct, 'orderIndex', qo.order_index) ORDER BY qo.order_index)
              FROM question_options qo WHERE qo.question_id = q.id), '[]'::json) AS options,
            COALESCE((SELECT json_agg(json_build_object('id', sq.id, 'content', sq.content,
              'marks', sq.marks, 'expectedAnswer', sq.expected_answer, 'orderIndex', sq.order_index)
              ORDER BY sq.order_index) FROM subquestions sq WHERE sq.question_id = q.id), '[]'::json) AS subquestions
       FROM questions q WHERE q.exam_id = $1 ORDER BY q.order_index, q.id`,
    [examId],
  );
  const { rows: responseRows } = await pool.query(
    `SELECT q.id AS "questionId", q.type, a.id AS "attemptId", es.student_id AS "studentId",
            s.name AS "studentName", r.id AS "responseId", r.answer, r.is_correct AS "isCorrect",
            r.marks_awarded AS "marksAwarded", r.subquestion_id AS "subquestionId",
            sq.content AS "subquestionContent", sq.expected_answer AS "subquestionModelAnswer"
       FROM questions q
       JOIN exam_students es ON es.exam_id = q.exam_id
       JOIN students s ON s.id = es.student_id
       JOIN attempts a ON a.exam_student_id = es.id AND a.status = 'submitted'
       LEFT JOIN responses r ON r.attempt_id = a.id AND r.question_id = q.id
       LEFT JOIN subquestions sq ON sq.id = r.subquestion_id
      WHERE q.exam_id = $1
      ORDER BY q.order_index, a.submitted_at, a.id, r.id`,
    [examId],
  );
  const byQuestion = new Map<number, any[]>();
  for (const row of responseRows) {
    const list = byQuestion.get(Number(row.questionId)) || [];
    list.push(row);
    byQuestion.set(Number(row.questionId), list);
  }
  return questionRows.map((question: any) => {
    const records = byQuestion.get(Number(question.id)) || [];
    const perAttempt = new Map<number, any[]>();
    for (const record of records) {
      const list = perAttempt.get(Number(record.attemptId)) || [];
      list.push(record);
      perAttempt.set(Number(record.attemptId), list);
    }
    const answeredAttempts = [...perAttempt.entries()].filter(([, answers]) => answers.some((answer) => answer.responseId != null));
    const correctAttempts = answeredAttempts.filter(([, answers]) => {
      const recorded = answers.filter((answer) => answer.responseId != null);
      return recorded.length > 0 && recorded.every((answer) => answer.isCorrect === true);
    }).length;
    const marks = answeredAttempts.map(([, answers]) => answers.reduce((sum, answer) => sum + Number(answer.marksAwarded || 0), 0));
    const answered = answeredAttempts.length;
    let options: any[] = question.options || [];
    if (question.type === "mcq") {
      options = options.map((option: any) => {
        const count = answeredAttempts.filter(([, answers]) =>
          answers.some((answer) => String(answer.answer ?? "") === String(option.id)),
        ).length;
        return { ...option, count, percent: answered ? count * 100 / answered : 0, flagged: !option.isCorrect && answered > 0 && count * 100 / answered > 30 };
      });
    }
    const studentAnswers = question.type === "saq"
      ? answeredAttempts.flatMap(([, answers]) => {
        const submitted = answers.filter((answer) => answer.responseId != null);
        if (!submitted.length) return [];
        const head = submitted[0];
        return [{
          studentId: Number(head.studentId), studentName: head.studentName,
          attemptId: Number(head.attemptId),
          answers: submitted.map((answer) => ({
            subquestionId: answer.subquestionId == null ? null : Number(answer.subquestionId),
            subquestion: answer.subquestionContent,
            answer: answer.answer,
            marksAwarded: answer.marksAwarded == null ? null : Number(answer.marksAwarded),
            isCorrect: answer.isCorrect,
            modelAnswer: answer.subquestionModelAnswer || question.expectedAnswer,
          })),
          marksAwarded: submitted.reduce((sum, answer) => sum + Number(answer.marksAwarded || 0), 0),
        }];
      })
      : [];
    const wrongAnswerSamples = records
      .filter((answer) => answer.responseId != null && answer.isCorrect === false)
      .slice(0, 10)
      .map((answer) => ({
        studentName: answer.studentName,
        answer: answer.answer,
        marksAwarded: answer.marksAwarded == null ? null : Number(answer.marksAwarded),
        subquestion: answer.subquestionContent || null,
      }));
    return {
      id: Number(question.id), type: question.type, content: question.content, marks: Number(question.marks),
      expectedAnswer: question.expectedAnswer, subquestions: question.subquestions || [],
      submittedAttemptCount: perAttempt.size, answeredCount: answered,
      percentCorrect: answered ? correctAttempts * 100 / answered : null,
      averageMark: marks.length ? marks.reduce((sum, mark) => sum + mark, 0) / marks.length : null,
      options, studentAnswers, wrongAnswerSamples,
    };
  });
}

export function registerStage10Routes(app: Express, requireAdmin: RequestHandler): void {
  app.post("/api/engagement/events", async (req: any, res) => {
    const { sessionId, eventType } = req.body || {};
    const page = typeof req.body?.page === "string" ? req.body.page : null;
    const rawSource = req.body?.source ?? req.query.src;
    const source = validSource(rawSource);
    if (typeof sessionId !== "string" || !/^[a-zA-Z0-9_-]{8,80}$/.test(sessionId)
        || !allowedPublicEvents.has(eventType)
        || (rawSource !== undefined && rawSource !== null && source === null)
        || (eventType === "page_view" && (!page || !allowedPages.has(page)))) {
      return res.status(400).json({ message: "Provide a valid anonymous sessionId, eventType, and page for page_view events." });
    }
    await pool.query(
      `INSERT INTO medqrown_engagement_events (session_id, event_type, page_key, source)
       VALUES ($1, $2, $3, $4)`,
      [sessionId, eventType, page, source],
    );
    res.status(202).json({ recorded: true });
  });

  app.get("/api/admin/dashboard", requireAdmin, async (_req, res) => {
    const cohorts = await listCohorts();
    const current = cohorts.current;
    // Every membership counts, whichever cohort it was issued for (grace members belong to the previous one).
    const memberships = await pool.query(
      `SELECT m.student_id AS "studentId", m.start_date::text AS "startDate", m.end_date::text AS "endDate",
              (SELECT grace_days FROM medqrown_settings WHERE id = 1) AS "graceDays"
         FROM medqrown_memberships m`,
    );
    const today = nairobiDate();
    const activeMembers = memberships.rows.filter((m: any) => m.startDate <= today && m.endDate >= today).length;
    const graceMembers = memberships.rows.filter((m: any) => {
      const end = new Date(`${m.endDate}T00:00:00Z`);
      end.setUTCDate(end.getUTCDate() + Number(m.graceDays ?? 3));
      return m.endDate < today && end.toISOString().slice(0, 10) >= today;
    }).length;
    const [queue, exams, feedback, nextPayments] = await Promise.all([
      groupedQueue(),
      pool.query(`SELECT id, title, class_id AS "classId", opens_at AS "opensAt", closes_at AS "closesAt"
                    FROM exams WHERE status = 'active' AND opens_at >= CURRENT_TIMESTAMP
                    ORDER BY opens_at, id LIMIT 10`),
      pool.query(`SELECT f.id, f.class_id AS "classId", c.name AS "className", s.name AS "studentName",
                         f.exam_id AS "examId", e.title AS "examTitle", f.message, f.created_at AS "createdAt"
                    FROM medqrown_class_feedback f JOIN medqrown_classes c ON c.id = f.class_id
                    JOIN students s ON s.id = f.student_id LEFT JOIN exams e ON e.id = f.exam_id
                   ORDER BY f.created_at DESC, f.id DESC LIMIT 10`),
      pool.query(`SELECT COUNT(*)::int AS count FROM medqrown_payment_entries WHERE status = 'pending'`),
    ]);
    res.json({
      currentCohort: current,
      activeMembers, graceMembers,
      pendingPayments: Number(nextPayments.rows[0]?.count || 0),
      // Same rule as Admin → Payments → Flagged: groups awaiting review that raised a flag.
      flaggedPayments: queue.filter((group: any) => group.status === "Flagged").length,
      upcomingExams: exams.rows,
      latestFeedback: feedback.rows,
    });
  });

  app.get("/api/admin/classes/overview", requireAdmin, async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT c.id, c.name, c.description, c.status, c.created_at AS "createdAt",
              COUNT(DISTINCT cs.student_id)::int AS "memberCount",
              (SELECT json_build_object('id', e.id, 'title', e.title, 'opensAt', e.opens_at, 'closesAt', e.closes_at)
                 FROM exams e WHERE e.class_id = c.id AND e.status = 'active'
                   AND (e.closes_at IS NULL OR e.closes_at >= CURRENT_TIMESTAMP)
                ORDER BY e.opens_at NULLS LAST, e.id LIMIT 1) AS "nextExam"
         FROM medqrown_classes c LEFT JOIN medqrown_class_students cs ON cs.class_id = c.id
        GROUP BY c.id ORDER BY c.name, c.id`,
    );
    res.json(rows);
  });

  app.get("/api/admin/classes/:classId/overview", requireAdmin, async (req: any, res) => {
    const classId = Number(req.params.classId);
    if (!Number.isInteger(classId) || classId < 1) return res.status(400).json({ message: "Invalid class id" });
    const { rows: classes } = await pool.query(
      `SELECT id, name, description, status FROM medqrown_classes WHERE id = $1`,
      [classId],
    );
    if (!classes[0]) return res.status(404).json({ message: "Class not found" });
    const members = await masterMembers(classId);
    const counts = members.reduce((acc: any, member: any) => {
      acc[member.status] = (acc[member.status] || 0) + 1;
      return acc;
    }, { active: 0, grace: 0, invited: 0, expired: 0, unassigned: 0 });
    const [exams, announcements] = await Promise.all([
      pool.query(`SELECT id, title, status, opens_at AS "opensAt", closes_at AS "closesAt"
                    FROM exams WHERE class_id = $1 ORDER BY opens_at NULLS LAST, id`, [classId]),
      pool.query(`SELECT id, title, message, link, created_at AS "createdAt", updated_at AS "updatedAt"
                    FROM medqrown_class_announcements WHERE class_id = $1 ORDER BY created_at DESC, id DESC LIMIT 10`, [classId]),
    ]);
    res.json({ class: classes[0], memberCounts: counts, upcomingExams: exams.rows.filter((e: any) => !e.closesAt || new Date(e.closesAt).getTime() >= Date.now()), recentAnnouncements: announcements.rows });
  });

  app.get("/api/admin/classes/:classId/members/export.csv", requireAdmin, async (req: any, res) => {
    const classId = Number(req.params.classId);
    if (!Number.isInteger(classId) || classId < 1) return res.status(400).json({ message: "Invalid class id" });
    const rows = filterMembers(await masterMembers(classId), req);
    const data = [
      ["Name", "Email", "Phone", "Latest plan", "Membership status", "Membership end date", "Invite status", "Exams taken", "Average score"],
      ...rows.map((m) => [m.name, m.email, m.phone, m.latestPlan, m.status, m.membershipEndDate, m.inviteStatus, m.examsTaken, m.averageScore]),
    ];
    res.type("text/csv").attachment(`class-${classId}-members.csv`).send(data.map((row) => row.map(safeCsvCell).join(",")).join("\r\n"));
  });

  app.get("/api/admin/students", requireAdmin, async (req: any, res) => {
    res.json(filterMembers(await masterMembers(), req));
  });

  app.get("/api/admin/students/change-requests", requireAdmin, async (req: any, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : "pending";
    if (!["pending", "approved", "declined"].includes(status)) return res.status(400).json({ message: "Invalid request status" });
    const { rows } = await pool.query(
      `SELECT r.id, r.student_id AS "studentId", s.name AS "studentName", s.email AS "studentEmail",
              r.field_name AS "fieldName", r.requested_value AS "requestedValue", r.reason,
              r.status, r.review_reason AS "reviewReason", r.created_at AS "createdAt", r.reviewed_at AS "reviewedAt"
         FROM profile_change_requests r JOIN students s ON s.id = r.student_id
        WHERE r.status = $1 ORDER BY r.created_at DESC, r.id DESC`,
      [status],
    );
    res.json(rows);
  });

  app.patch("/api/admin/students/change-requests/:id", requireAdmin, async (req: any, res) => {
    const id = Number(req.params.id);
    const decision = req.body?.decision;
    const reviewReason = typeof req.body?.reviewReason === "string" ? req.body.reviewReason.trim() : null;
    if (!Number.isInteger(id) || id < 1 || !["approved", "declined"].includes(decision)) {
      return res.status(400).json({ message: "A valid request id and approved/declined decision are required" });
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const found = await client.query(
        `SELECT id, student_id AS "studentId", field_name AS "fieldName", requested_value AS "requestedValue", status
           FROM profile_change_requests WHERE id = $1 FOR UPDATE`, [id],
      );
      const request = found.rows[0];
      if (!request) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Change request not found" });
      }
      if (request.status !== "pending") {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: "Change request has already been reviewed" });
      }
      if (decision === "approved") {
        if (request.fieldName === "name") {
          await client.query("UPDATE students SET name = $2 WHERE id = $1", [request.studentId, request.requestedValue]);
        } else if (request.fieldName === "email") {
          if (!emailPattern.test(request.requestedValue) || request.requestedValue.length > 254) {
            await client.query("ROLLBACK");
            return res.status(409).json({ message: "Requested email address is invalid" });
          }
          await client.query("UPDATE students SET email = $2 WHERE id = $1", [request.studentId, request.requestedValue.toLowerCase()]);
        } else if (request.fieldName === "phone") {
          await client.query("UPDATE students SET phone = $2 WHERE id = $1", [request.studentId, request.requestedValue]);
        } else {
          await client.query("ROLLBACK");
          return res.status(409).json({ message: "This requested field cannot be updated automatically" });
        }
      }
      const updated = await client.query(
        `UPDATE profile_change_requests SET status = $2, review_reason = $3,
                reviewed_by = $4, reviewed_at = CURRENT_TIMESTAMP
          WHERE id = $1 RETURNING id, student_id AS "studentId", field_name AS "fieldName",
                requested_value AS "requestedValue", status, review_reason AS "reviewReason",
                reviewed_at AS "reviewedAt"`,
        [id, decision, reviewReason, req.admin.id],
      );
      await client.query("COMMIT");
      res.json(updated.rows[0]);
    } catch (error: any) {
      await client.query("ROLLBACK");
      if (error?.code === "23505") return res.status(409).json({ message: "That identity value is already in use" });
      throw error;
    } finally {
      client.release();
    }
  });

  app.get("/api/admin/exams/:examId/analytics", requireAdmin, async (req: any, res) => {
    const examId = Number(req.params.examId);
    const minMark = req.query.minMark === undefined ? null : Number(req.query.minMark);
    const maxMark = req.query.maxMark === undefined ? null : Number(req.query.maxMark);
    if (!Number.isInteger(examId) || examId < 1 || (minMark !== null && !Number.isFinite(minMark))
        || (maxMark !== null && !Number.isFinite(maxMark)) || (minMark !== null && maxMark !== null && minMark > maxMark)) {
      return res.status(400).json({ message: "Provide a valid exam id and optional mark range" });
    }
    const { rows: exams } = await pool.query("SELECT id, title FROM exams WHERE id = $1", [examId]);
    if (!exams[0]) return res.status(404).json({ message: "Exam not found" });
    const questions = await questionAnalytics(examId);
    const filteredQuestions = questions.map((question: any) => ({
      ...question,
      studentAnswers: question.studentAnswers.filter((answer: any) =>
        answer.marksAwarded >= (minMark ?? -Infinity) && answer.marksAwarded <= (maxMark ?? Infinity)),
    }));
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(DISTINCT a.id)::int AS count
         FROM attempts a JOIN exam_students es ON es.id = a.exam_student_id
        WHERE es.exam_id = $1 AND a.status = 'submitted'`,
      [examId],
    );
    res.json({ exam: exams[0], submittedAttemptCount: Number(countRows[0]?.count || 0), questions: filteredQuestions });
  });

  app.get("/api/admin/exams/:examId/ai-analysis", requireAdmin, async (req: any, res) => {
    const examId = Number(req.params.examId);
    if (!Number.isInteger(examId) || examId < 1) return res.status(400).json({ message: "Invalid exam id" });
    const { rows } = await pool.query(
      `SELECT id, question_ids AS "questionIds", analysis, admin_id AS "adminId", created_at AS "createdAt"
         FROM medqrown_exam_ai_analyses WHERE exam_id = $1 ORDER BY created_at DESC, id DESC`,
      [examId],
    );
    res.json(rows);
  });

  app.post("/api/admin/exams/:examId/ai-analysis", requireAdmin, async (req: any, res) => {
    const examId = Number(req.params.examId);
    const ids = req.body?.questionIds;
    if (!Number.isInteger(examId) || examId < 1 || !Array.isArray(ids) || !ids.length
        || ids.length > 50 || ids.some((id: unknown) => !Number.isInteger(id) || Number(id) < 1)) {
      return res.status(400).json({ message: "Provide an exam id and one or more valid questionIds" });
    }
    const questionIds = [...new Set(ids as number[])];
    const { rows: exams } = await pool.query("SELECT id, title FROM exams WHERE id = $1", [examId]);
    if (!exams[0]) return res.status(404).json({ message: "Exam not found" });
    const analytics = await questionAnalytics(examId);
    const selected = analytics.filter((q: any) => questionIds.includes(q.id));
    if (selected.length !== questionIds.length) return res.status(400).json({ message: "One or more selected questions do not belong to this exam" });
    const analyses = await analyzeExamQuestions({
      examTitle: exams[0].title,
      questions: selected.map(({ studentAnswers, wrongAnswerSamples, ...question }: any) => ({
        ...question,
        anonymizedWrongAnswerSamples: (wrongAnswerSamples || []).map(({ answer, marksAwarded, subquestion }: any) => ({
          answer, marksAwarded, subquestion,
        })),
      })),
    }).catch((error: any) => {
      throw Object.assign(new Error(error?.message || "AI examiner analysis is unavailable"), { status: 503 });
    });
    const { rows } = await pool.query(
      `INSERT INTO medqrown_exam_ai_analyses (exam_id, question_ids, analysis, admin_id)
       VALUES ($1, $2::int[], $3::jsonb, $4)
       RETURNING id, question_ids AS "questionIds", analysis, admin_id AS "adminId", created_at AS "createdAt"`,
      [examId, questionIds, JSON.stringify(analyses), req.admin.id],
    );
    res.status(201).json(rows[0]);
  });

  app.get("/api/admin/exams/:examId/revision-pack", requireAdmin, async (req: any, res) => {
    const examId = Number(req.params.examId);
    if (!Number.isInteger(examId) || examId < 1) return res.status(400).json({ message: "Invalid exam id" });
    const { rows: exams } = await pool.query("SELECT id, title FROM exams WHERE id = $1", [examId]);
    if (!exams[0]) return res.status(404).json({ message: "Exam not found" });
    const questions = await questionAnalytics(examId);
    const { rows: savedRows } = await pool.query(
      `SELECT id, question_ids AS "questionIds", analysis, created_at AS "createdAt"
         FROM medqrown_exam_ai_analyses WHERE exam_id = $1 ORDER BY created_at DESC, id DESC`,
      [examId],
    );
    const analysesByQuestion = new Map<number, any[]>();
    for (const saved of savedRows) {
      for (const analysis of (saved.analysis || [])) {
        const list = analysesByQuestion.get(Number(analysis.questionId)) || [];
        list.push({ ...analysis, savedAt: saved.createdAt });
        analysesByQuestion.set(Number(analysis.questionId), list);
      }
    }
    const revisionQuestions = questions.map((question: any) => {
      const wrongAnswers = question.studentAnswers.flatMap((student: any) =>
        student.answers.filter((answer: any) => answer.isCorrect === false).map((answer: any) => ({
          studentName: student.studentName,
          answer: answer.answer,
          marksAwarded: answer.marksAwarded,
          subquestion: answer.subquestion,
        })),
      );
      return {
        id: question.id, type: question.type, content: question.content,
        percentCorrect: question.percentCorrect, answeredCount: question.answeredCount,
        options: question.options, wrongAnswerSamples: [...question.wrongAnswerSamples, ...wrongAnswers].slice(0, 10),
        savedAiAnalysis: analysesByQuestion.get(question.id) || [],
      };
    }).sort((a: any, b: any) => (a.percentCorrect ?? 101) - (b.percentCorrect ?? 101));
    res.json({
      exam: exams[0],
      generatedAt: new Date().toISOString(),
      mostMissedQuestions: revisionQuestions.slice(0, Math.min(10, revisionQuestions.length)),
      savedAnalyses: savedRows,
    });
  });

  app.get("/api/admin/engagement", requireAdmin, async (req: any, res) => {
    const range = dateRange(req);
    if (!range) return res.status(400).json({ message: "from and to must be valid ordered dates" });
    const events = await pool.query(
      `SELECT event_type AS "eventType", page_key AS page, source,
              COUNT(*)::int AS events, COUNT(DISTINCT session_id)::int AS sessions
         FROM medqrown_engagement_events
        WHERE created_at::date BETWEEN $1::date AND $2::date
        GROUP BY event_type, page_key, source ORDER BY event_type, page_key, source`,
      [range.from, range.to],
    );
    const funnel = await pool.query(
      `SELECT
         COUNT(DISTINCT session_id) FILTER (WHERE event_type = 'page_view' AND page_key = 'home')::int AS "homepageVisits",
         COUNT(DISTINCT session_id) FILTER (WHERE event_type = 'demo_start')::int AS "demoStarts",
         COUNT(DISTINCT session_id) FILTER (WHERE event_type = 'demo_complete')::int AS "demoCompletions",
         COUNT(DISTINCT session_id) FILTER (WHERE event_type = 'signup_click')::int AS "signupClicks"
        FROM medqrown_engagement_events WHERE created_at::date BETWEEN $1::date AND $2::date`,
      [range.from, range.to],
    );
    const actual = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM medqrown_waitlist WHERE created_at::date BETWEEN $1::date AND $2::date) AS "waitlistSignups",
         (SELECT COUNT(*)::int FROM medqrown_invites WHERE created_at::date BETWEEN $1::date AND $2::date) AS "studentsInvited",
         (SELECT COUNT(*)::int FROM medqrown_invites WHERE used_at::date BETWEEN $1::date AND $2::date) AS "invitesActivated",
         (SELECT COUNT(DISTINCT p.student_id)::int FROM medqrown_payment_entries p
           WHERE p.status = 'paid' AND p.reviewed_at::date BETWEEN $1::date AND $2::date
             AND EXISTS (SELECT 1 FROM medqrown_payment_entries prior
                          WHERE prior.student_id = p.student_id AND prior.status = 'paid'
                            AND prior.created_at < p.created_at)) AS "renewalsApproved"`,
      [range.from, range.to],
    );
    const traffic = await pool.query(
      `WITH all_sources AS (
         SELECT source, COUNT(DISTINCT session_id) FILTER (WHERE event_type = 'page_view' AND page_key = 'home')::int AS visits,
                COUNT(DISTINCT session_id) FILTER (WHERE event_type = 'signup_click')::int AS "signupClicks"
           FROM medqrown_engagement_events WHERE created_at::date BETWEEN $1::date AND $2::date
          GROUP BY source
       )
       SELECT COALESCE(a.source, w.source) AS source, COALESCE(a.visits, 0) AS visits,
              COALESCE(a."signupClicks", 0) AS "signupClicks",
              (SELECT COUNT(*)::int FROM medqrown_waitlist wi
                WHERE wi.source = COALESCE(a.source, w.source)
                  AND wi.created_at::date BETWEEN $1::date AND $2::date) AS "waitlistSignups",
              (SELECT COUNT(*)::int FROM medqrown_invites i JOIN students s ON s.id = i.student_id
                WHERE i.created_at::date BETWEEN $1::date AND $2::date
                  AND EXISTS (SELECT 1 FROM medqrown_waitlist wi WHERE LOWER(wi.email) = LOWER(s.email)
                                AND wi.source = COALESCE(a.source, w.source))) AS "studentsInvited",
              (SELECT COUNT(DISTINCT p.id)::int FROM medqrown_payment_entries p JOIN students s ON s.id = p.student_id
                WHERE p.status = 'paid' AND p.reviewed_at::date BETWEEN $1::date AND $2::date
                  AND EXISTS (SELECT 1 FROM medqrown_waitlist wi WHERE LOWER(wi.email) = LOWER(s.email)
                                AND wi.source = COALESCE(a.source, w.source))) AS "approvedPayments"
         FROM all_sources a FULL JOIN (
           SELECT DISTINCT source FROM medqrown_waitlist
            WHERE source IS NOT NULL AND created_at::date BETWEEN $1::date AND $2::date
         ) w ON w.source = a.source ORDER BY source NULLS LAST`,
      [range.from, range.to],
    );
    const cohorts = await pool.query(
      `SELECT c.id AS "cohortId", c.start_date::text AS "startDate", c.end_date::text AS "endDate",
              COUNT(DISTINCT m.student_id) FILTER (WHERE m.created_at::date BETWEEN $1::date AND $2::date)::int AS "newMembers",
              COUNT(DISTINCT m.student_id)::int AS "memberCount",
              COUNT(DISTINCT m.student_id) FILTER (WHERE (
                SELECT COUNT(*) FROM medqrown_payment_entries renewal
                 WHERE renewal.student_id = m.student_id AND renewal.target_cohort_id = c.id AND renewal.status = 'paid'
              ) > 1)::int AS "renewedMembers",
              COUNT(DISTINCT m.student_id) FILTER (WHERE EXISTS (
                SELECT 1 FROM medqrown_payment_entries paid
                 WHERE paid.student_id = m.student_id AND paid.target_cohort_id = c.id AND paid.status = 'paid'
              ))::int AS "paidMembers",
              COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'paid' AND p.plan = 'Individual')::int AS "individualPayments",
              COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'paid' AND p.plan = 'Group')::int AS "groupPayments",
              COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'paid'), 0)::numeric AS "approvedPaymentAmount"
         FROM medqrown_cohorts c LEFT JOIN medqrown_memberships m ON m.cohort_id = c.id
         LEFT JOIN medqrown_payment_entries p ON p.target_cohort_id = c.id
          AND p.reviewed_at::date BETWEEN $1::date AND $2::date
        GROUP BY c.id ORDER BY c.start_date DESC`,
      [range.from, range.to],
    );
    for (const cohort of cohorts.rows as any[]) {
      cohort.renewalRate = cohort.paidMembers ? Number(cohort.renewedMembers) * 100 / Number(cohort.paidMembers) : null;
    }
    const demoStats = await pool.query(
      `SELECT e.id AS "examId", e.title AS "examTitle", q.id AS "questionId", q.content AS question,
              COUNT(DISTINCT ev.session_id) FILTER (WHERE ev.event_type = 'saq_submitted')::int AS "saqSubmissions",
              COUNT(*) FILTER (WHERE ev.is_correct = true)::int AS correct,
              COUNT(*) FILTER (WHERE ev.is_correct = false)::int AS incorrect
         FROM demo_exams e JOIN demo_questions q ON q.demo_exam_id = e.id
         LEFT JOIN demo_engagement_events ev ON ev.question_id = q.id
          AND ev.created_at::date BETWEEN $1::date AND $2::date
        GROUP BY e.id, e.title, q.id, q.content ORDER BY e.display_order, q.order_index`,
      [range.from, range.to],
    );
    res.json({
      range,
      funnel: { ...(funnel.rows[0] || {}), ...(actual.rows[0] || {}) },
      trafficSources: traffic.rows,
      eventBreakdown: events.rows,
      cohorts: cohorts.rows,
      demoStats: demoStats.rows,
    });
  });
}