import type { Express, RequestHandler } from "express";
import { pool } from "./db";
import { getMembership } from "./stage3-storage";
import { enqueueMarking } from "./marking-queue";
import { dispatchPushToStudents } from "./stage7";

const isOpen = (opensAt: unknown, closesAt: unknown, now = Date.now()) =>
  opensAt != null && closesAt != null && new Date(opensAt as any).getTime() <= now
    && now < new Date(closesAt as any).getTime();

/** Server-owned deadline sweep; browser activity is never required for submission. */
export async function submitDueStage6Attempts(): Promise<number> {
  const { rows } = await pool.query(
    `UPDATE attempts a
        SET status = 'submitted', submitted_at = CURRENT_TIMESTAMP
       FROM exam_students es, exams e
      WHERE es.id = a.exam_student_id AND e.id = es.exam_id
        AND a.status = 'in_progress'
        AND (e.duration_minutes IS NOT NULL OR e.closes_at IS NOT NULL)
        AND CURRENT_TIMESTAMP >= LEAST(
          COALESCE(a.started_at + make_interval(mins => e.duration_minutes), 'infinity'::timestamptz),
          COALESCE(e.closes_at, 'infinity'::timestamptz)
        )
      RETURNING es.id AS "examStudentId", es.exam_id AS "examId"`,
  );
  const examStudentIds = [...new Set(rows.map((row: any) => Number(row.examStudentId)))];
  const examIds: number[] = [...new Set<number>(rows.map((row: any) => Number(row.examId)))];
  if (examStudentIds.length) {
    await pool.query(
      `UPDATE exam_students SET attempt_status = 'submitted' WHERE id = ANY($1::int[])`,
      [examStudentIds],
    );
  }
  for (const examId of examIds) {
    const { rows: exams } = await pool.query(
      "SELECT auto_mark_enabled AS enabled FROM exams WHERE id = $1",
      [examId],
    );
    if (exams[0]?.enabled) {
      void enqueueMarking(examId).catch((error) =>
        console.error(`Stage 6 auto-marking failed for exam ${examId}`, error),
      );
    }
  }
  return rows.length;
}

export function registerStage6Routes(app: Express, requireAdmin: RequestHandler, requireStudent: RequestHandler): void {
  app.get("/api/student/classes/:classId/exams", requireStudent, async (req: any, res) => {
    const classId = Number(req.params.classId);
    if (!Number.isInteger(classId) || classId < 1) return res.status(400).json({ message: "Invalid class id" });
    const { rows: memberRows } = await pool.query(
      `SELECT 1 FROM medqrown_class_students WHERE class_id = $1 AND student_id = $2`,
      [classId, req.student.id],
    );
    if (!memberRows[0]) return res.status(403).json({ message: "You are not a member of this class" });
    const membership = await getMembership(req.student.id);
    const membershipStatus = membership?.status ?? "expired";
    const { rows } = await pool.query(
      `SELECT e.id, e.title, e.class_id AS "classId", e.opens_at AS "opensAt",
              e.closes_at AS "closesAt", e.duration_minutes AS "durationMinutes",
              e.timer_mode AS "timerMode", e.per_question_seconds AS "perQuestionSeconds",
              e.max_attempts AS "maxAttempts", e.instructions, e.results_released AS "resultsReleased",
              COALESCE(e.auto_mark_enabled, true) AS "autoMarkEnabled",
              COALESCE((SELECT COUNT(*)::int FROM attempts a JOIN exam_students own_es ON own_es.id = a.exam_student_id
                         WHERE own_es.exam_id = e.id AND own_es.student_id = $2 AND a.status = 'submitted'), 0) AS "attemptsUsed",
              EXISTS (SELECT 1 FROM attempts a JOIN exam_students own_es ON own_es.id = a.exam_student_id
                       WHERE own_es.exam_id = e.id AND own_es.student_id = $2 AND a.status = 'in_progress') AS "hasInProgressAttempt",
              EXISTS (SELECT 1 FROM exam_reattempt_requests rr
                       WHERE rr.exam_id = e.id AND rr.student_id = $2 AND rr.status = 'approved' AND rr.consumed_at IS NULL) AS "hasApprovedReattempt"
         FROM exams e
        WHERE e.class_id = $1 AND e.status = 'active'
        ORDER BY e.opens_at NULLS LAST, e.id`,
      [classId, req.student.id],
    );
    const now = Date.now();
    res.json(rows.map((exam: any) => {
      const beforeOpen = exam.opensAt != null && new Date(exam.opensAt).getTime() > now;
      const afterClose = exam.closesAt != null && new Date(exam.closesAt).getTime() <= now;
      const scheduleConfigured = exam.opensAt != null && exam.closesAt != null
        && (exam.timerMode === "per_question" ? exam.perQuestionSeconds > 0 : exam.durationMinutes > 0);
      const canTake = scheduleConfigured && isOpen(exam.opensAt, exam.closesAt, now)
        && ["active", "grace"].includes(membershipStatus);
      return {
        ...exam,
        membershipStatus,
        state: !scheduleConfigured ? "unavailable"
          : beforeOpen ? "upcoming" : afterClose ? (exam.resultsReleased ? "results_available" : "results_pending") : "open",
        lockedReason: !["active", "grace"].includes(membershipStatus) ? "renew_to_access"
          : !scheduleConfigured ? "schedule_incomplete" : beforeOpen ? "not_open" : afterClose ? "closed" : null,
        canOpen: canTake && (exam.hasInProgressAttempt || exam.attemptsUsed < exam.maxAttempts || exam.hasApprovedReattempt),
      };
    }));
  });

  app.post("/api/admin/exams/:id/results/release", requireAdmin, async (req: any, res) => {
    const examId = Number(req.params.id);
    if (!Number.isInteger(examId) || examId < 1) return res.status(400).json({ message: "Invalid exam id" });
    const shouldRelease = req.body?.released;
    if (typeof shouldRelease !== "boolean") return res.status(400).json({ message: "released must be a boolean" });
    if (shouldRelease) await submitDueStage6Attempts();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows: exams } = await client.query(
        `SELECT id, title, closes_at AS "closesAt", results_released AS "resultsReleased"
           FROM exams WHERE id = $1 FOR UPDATE`,
        [examId],
      );
      if (!exams[0]) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Exam not found" });
      }
      if (shouldRelease && exams[0].closesAt && new Date(exams[0].closesAt).getTime() > Date.now()) {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: "Results can only be released after the exam closes" });
      }
      if (shouldRelease) {
        const { rows: marking } = await client.query(
          `SELECT EXISTS (
             SELECT 1 FROM attempts a
             JOIN exam_students es ON es.id = a.exam_student_id
             JOIN questions q ON q.exam_id = es.exam_id AND q.type = 'saq'
            WHERE es.exam_id = $1 AND a.status = 'submitted'
              AND (
                (NOT q.has_subquestions AND NOT EXISTS (
                  SELECT 1 FROM responses r WHERE r.attempt_id = a.id AND r.question_id = q.id
                    AND r.subquestion_id IS NULL AND r.is_correct IS NOT NULL
                ))
                OR (q.has_subquestions AND EXISTS (
                  SELECT 1 FROM subquestions sq LEFT JOIN responses r
                    ON r.attempt_id = a.id AND r.question_id = q.id AND r.subquestion_id = sq.id
                   WHERE sq.question_id = q.id AND (r.id IS NULL OR r.is_correct IS NULL)
                ))
              )
           ) AS pending`,
          [examId],
        );
        if (marking[0]?.pending) {
          await client.query("ROLLBACK");
          return res.status(409).json({ message: "Finish SAQ marking before releasing results" });
        }
      }
      await client.query("UPDATE exams SET results_released = $2 WHERE id = $1", [examId, shouldRelease]);
      let notificationsCreated = 0;
      let notificationStudentIds: number[] = [];
      if (shouldRelease && !exams[0].resultsReleased) {
        const inserted = await client.query(
          `INSERT INTO medqrown_notifications (student_id, kind, title, body, payload)
           SELECT DISTINCT es.student_id, 'exam_results', 'Exam results released',
                  $2::text || ' results are now available.',
                  jsonb_build_object(
                    'type', 'exam_results', 'examId', $1::int, 'title', $2::text,
                    'route', '/student/exams/' || $1::int::text || '/results',
                    'pushReady', jsonb_build_object('title', 'Exam results released',
                      'body', $2::text || ' results are now available.', 'url', '/student/exams/' || $1::int::text || '/results')
                  )
             FROM exam_students es JOIN attempts a ON a.exam_student_id = es.id
            WHERE es.exam_id = $1::int AND a.status = 'submitted'
              AND NOT EXISTS (
                SELECT 1 FROM medqrown_notifications n
                 WHERE n.student_id = es.student_id AND n.kind = 'exam_results'
                   AND n.payload->>'examId' = $1::int::text
              )
            RETURNING id, student_id AS "studentId"`,
          [examId, exams[0].title],
        );
        notificationsCreated = inserted.rows.length;
         notificationStudentIds = inserted.rows.map((row: any) => Number(row.studentId));
      }
      await client.query("COMMIT");
      const pushSent = shouldRelease && notificationStudentIds.length
        ? await dispatchPushToStudents(notificationStudentIds, {
          title: "Exam results released",
          body: `${exams[0].title} results are now available.`,
          url: `/student/exams/${examId}/results`,
        })
        : 0;
      res.json({
        examId, released: shouldRelease, notificationsCreated, pushSent,
        pushPendingConfiguration: shouldRelease
          && (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY || !process.env.VAPID_SUBJECT),
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  // Result ownership is derived from the authenticated account, never the URL/session's
  // legacy exam-student selector. No class statistics or other students are returned.
  app.get("/api/student/exams/:id/results", requireStudent, async (req: any, res) => {
    const examId = Number(req.params.id);
    if (!Number.isInteger(examId) || examId < 1) return res.status(400).json({ message: "Invalid exam id" });
    const { rows: exams } = await pool.query(
      `SELECT id, title, results_released AS "resultsReleased" FROM exams WHERE id = $1`,
      [examId],
    );
    if (!exams[0]) return res.status(404).json({ message: "Exam not found" });
    const { rows: attemptRows } = await pool.query(
      `SELECT a.id FROM attempts a JOIN exam_students es ON es.id = a.exam_student_id
        WHERE es.exam_id = $1 AND es.student_id = $2 AND a.status = 'submitted'
        ORDER BY a.started_at DESC, a.id DESC LIMIT 1`,
      [examId, req.student.id],
    );
    if (!attemptRows[0]) return res.status(404).json({ message: "No submitted result found" });
    if (!exams[0].resultsReleased) return res.json({ released: false, message: "Results have not been released yet." });
    const attemptId = attemptRows[0].id;
    const { rows: pendingMarks } = await pool.query(
      `SELECT EXISTS (
         SELECT 1 FROM responses r JOIN questions q ON q.id = r.question_id
          WHERE r.attempt_id = $1 AND q.type = 'saq' AND r.is_correct IS NULL
       ) AS pending`,
      [attemptId],
    );
    if (pendingMarks[0]?.pending) {
      return res.json({ released: false, markingInProgress: true, message: "Answers are still being marked." });
    }
    const { rows: questions } = await pool.query(
      `SELECT q.id, q.type, q.content, q.marks, q.expected_answer AS "expectedAnswer",
              q.explanation, q.image_url AS "imageUrl",
              COALESCE((SELECT json_agg(json_build_object(
                'id', qo.id, 'content', qo.content, 'isCorrect', qo.is_correct, 'orderIndex', qo.order_index
              ) ORDER BY qo.order_index) FROM question_options qo WHERE qo.question_id = q.id), '[]'::json) AS options,
              COALESCE((SELECT json_agg(json_build_object(
                'id', sq.id, 'content', sq.content, 'marks', sq.marks, 'expectedAnswer', sq.expected_answer,
                'orderIndex', sq.order_index
              ) ORDER BY sq.order_index) FROM subquestions sq WHERE sq.question_id = q.id), '[]'::json) AS subquestions,
              COALESCE((SELECT json_agg(json_build_object(
                'id', r.id, 'subquestionId', r.subquestion_id, 'answer', r.answer,
                'isCorrect', r.is_correct, 'marksAwarded', r.marks_awarded, 'aiFeedback', r.ai_feedback
              ) ORDER BY r.id) FROM responses r WHERE r.attempt_id = $2 AND r.question_id = q.id), '[]'::json) AS responses
         FROM questions q WHERE q.exam_id = $1 ORDER BY q.order_index, q.id`,
      [examId, attemptId],
    );
    const { rows: score } = await pool.query(
      `SELECT (SELECT COALESCE(SUM(r.marks_awarded), 0)::float
                 FROM responses r WHERE r.attempt_id = $1) AS "totalScore",
              (SELECT COALESCE(SUM(CASE WHEN q.has_subquestions
                                        THEN COALESCE(subs.total_marks, 0) ELSE q.marks END), 0)::float
                 FROM questions q
                 LEFT JOIN (SELECT question_id, SUM(marks) AS total_marks
                              FROM subquestions GROUP BY question_id) subs ON subs.question_id = q.id
                WHERE q.exam_id = $2) AS "maxScore"`,
      [attemptId, examId],
    );
    const totalScore = Number(score[0]?.totalScore || 0);
    const maxScore = Number(score[0]?.maxScore || 0);
    res.json({
      released: true, examTitle: exams[0].title, totalScore, maxScore,
      percentage: maxScore > 0 ? Math.round((totalScore / maxScore) * 1000) / 10 : 0,
      questions,
    });
  });
}