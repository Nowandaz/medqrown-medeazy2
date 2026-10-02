import type { Express, RequestHandler } from "express";
import { pool } from "./db";
import { getMembership, nairobiDate } from "./stage3-storage";

const DAY_MS = 24 * 60 * 60 * 1000;

function daysUntil(from: string, to: string): number {
  return Math.ceil((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / DAY_MS);
}

async function ownReleasedResults(studentId: number) {
  const { rows } = await pool.query(
    `SELECT a.id AS "attemptId", e.id AS "examId", e.title AS "examTitle",
            COALESCE(c.name, u.name, 'Exam') AS "className",
            a.submitted_at AS "submittedAt",
            scores."earnedMarks", scores."totalMarks",
            CASE WHEN scores."totalMarks" > 0
                 THEN ROUND((scores."earnedMarks" * 100 / scores."totalMarks")::numeric)::int ELSE 0 END AS "scorePercent"
       FROM attempts a
       JOIN exam_students es ON es.id = a.exam_student_id
       JOIN exams e ON e.id = es.exam_id
       LEFT JOIN medqrown_classes c ON c.id = e.class_id
       LEFT JOIN units u ON u.id = e.unit_id
       CROSS JOIN LATERAL (
         SELECT COALESCE((SELECT SUM(r.marks_awarded)::float FROM responses r WHERE r.attempt_id = a.id), 0)::float
                  AS "earnedMarks",
                COALESCE((SELECT SUM(CASE WHEN q.has_subquestions
                                          THEN COALESCE(subs.total_marks, 0) ELSE q.marks END)::float
                            FROM questions q
                            LEFT JOIN (SELECT question_id, SUM(marks)::float AS total_marks
                                         FROM subquestions GROUP BY question_id) subs ON subs.question_id = q.id
                           WHERE q.exam_id = e.id), 0)::float AS "totalMarks"
       ) scores
      WHERE es.student_id = $1 AND a.status = 'submitted' AND e.results_released = true
        AND NOT EXISTS (
          SELECT 1 FROM responses pending_response
          JOIN questions pending_question ON pending_question.id = pending_response.question_id
           WHERE pending_response.attempt_id = a.id
             AND pending_question.type = 'saq' AND pending_response.is_correct IS NULL
        )
      ORDER BY a.submitted_at DESC NULLS LAST, a.id DESC`,
    [studentId],
  );
  return rows;
}

export function registerStage8Routes(app: Express, requireStudent: RequestHandler): void {
  // This Stage 8 dashboard intentionally replaces the legacy unit-oriented view.
  // It only aggregates data owned by the authenticated student or assigned classes.
  app.get("/api/student/dashboard", requireStudent, async (req: any, res) => {
    const studentId = Number(req.student.id);
    const [membership, pendingResult, examResult, announcementResult, resultHistory] = await Promise.all([
      getMembership(studentId),
      pool.query(
        `SELECT id, code, plan, amount, status, created_at AS "createdAt"
           FROM medqrown_payment_entries
          WHERE student_id = $1 AND status = 'pending'
          ORDER BY created_at DESC, id DESC`,
        [studentId],
      ),
      pool.query(
        `SELECT e.id, e.title, e.opens_at AS "opensAt", e.closes_at AS "closesAt",
                c.id AS "classId", c.name AS "className"
           FROM medqrown_class_students cs
           JOIN medqrown_classes c ON c.id = cs.class_id AND c.status = 'active'
           JOIN exams e ON e.class_id = c.id AND e.status = 'active'
          WHERE cs.student_id = $1
            AND e.opens_at IS NOT NULL AND e.closes_at IS NOT NULL
            AND e.closes_at > CURRENT_TIMESTAMP
            -- Skip exams the student has finished: same rule as "Start Exam" on My Class.
            AND (
              (SELECT COUNT(*) FROM attempts a JOIN exam_students es ON es.id = a.exam_student_id
                WHERE es.exam_id = e.id AND es.student_id = $1 AND a.status = 'submitted')
                < COALESCE(e.max_attempts, 1)
              OR EXISTS (SELECT 1 FROM attempts a JOIN exam_students es ON es.id = a.exam_student_id
                          WHERE es.exam_id = e.id AND es.student_id = $1 AND a.status = 'in_progress')
              OR EXISTS (SELECT 1 FROM exam_reattempt_requests rr
                          WHERE rr.exam_id = e.id AND rr.student_id = $1
                            AND rr.status = 'approved' AND rr.consumed_at IS NULL)
            )
          -- Exams open right now come first (the one closing soonest), then upcoming ones.
          ORDER BY CASE WHEN e.opens_at <= CURRENT_TIMESTAMP THEN 0 ELSE 1 END,
                   CASE WHEN e.opens_at <= CURRENT_TIMESTAMP THEN e.closes_at ELSE e.opens_at END,
                   e.id
          LIMIT 1`,
        [studentId],
      ),
      pool.query(
        `SELECT a.id, a.class_id AS "classId", c.name AS "className", a.title, a.message, a.link,
                a.created_at AS "createdAt"
           FROM medqrown_class_students cs
           JOIN medqrown_class_announcements a ON a.class_id = cs.class_id
           JOIN medqrown_classes c ON c.id = cs.class_id
          WHERE cs.student_id = $1
          ORDER BY a.created_at DESC, a.id DESC
          LIMIT 1`,
        [studentId],
      ),
      ownReleasedResults(studentId),
    ]);
    const today = nairobiDate();
    const endDate = membership?.endDate ?? null;
    const nextExam = examResult.rows[0] || null;
    const pendingPayments = pendingResult.rows;
    const latestResult = resultHistory[0] || null;
    res.json({
      membership: membership ? {
        status: membership.status,
        startDate: membership.startDate,
        endDate,
        graceEndDate: membership.graceEndDate,
        daysRemaining: Math.max(0, daysUntil(today, endDate)),
        pendingPayment: membership.pendingPayment,
      } : null,
      pendingPayment: pendingPayments[0] || null,
      nextExam: nextExam ? {
        ...nextExam,
        countdownSeconds: Math.max(0, Math.floor((new Date(nextExam.opensAt).getTime() - Date.now()) / 1000)),
      } : null,
      latestAnnouncement: announcementResult.rows[0] || null,
      recentResults: latestResult ? resultHistory.slice(0, 4) : [],
    });
  });

  app.get("/api/student/results/summary", requireStudent, async (req: any, res) => {
    const results = await ownReleasedResults(Number(req.student.id));
    const scores = results.map((result: any) => Number(result.scorePercent));
    res.json({
      totalResults: scores.length,
      averageScore: scores.length
        ? Math.round(scores.reduce((sum: number, score: number) => sum + score, 0) / scores.length)
        : 0,
      bestScore: scores.length ? Math.max(...scores) : 0,
      passRate: scores.length
        ? Math.round((scores.filter((score: number) => score >= 50).length / scores.length) * 100)
        : 0,
      passThreshold: 50,
    });
  });

  /** Submitted exams whose results aren't released yet (shown as "Awaiting results"; no scores). */
  app.get("/api/student/results/pending", requireStudent, async (req: any, res) => {
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (e.id) a.id AS "attemptId", e.id AS "examId", e.title AS "examTitle",
              COALESCE(c.name, 'Exam') AS "className", a.submitted_at AS "submittedAt"
         FROM attempts a
         JOIN exam_students es ON es.id = a.exam_student_id
         JOIN exams e ON e.id = es.exam_id
         LEFT JOIN medqrown_classes c ON c.id = e.class_id
        WHERE es.student_id = $1 AND a.status = 'submitted'
          AND (e.results_released IS NOT TRUE OR EXISTS (
            SELECT 1 FROM responses r JOIN questions q ON q.id = r.question_id
             WHERE r.attempt_id = a.id AND q.type = 'saq' AND r.is_correct IS NULL))
        ORDER BY e.id, a.submitted_at DESC NULLS LAST`,
      [req.student.id],
    );
    res.json(rows.sort((x: any, y: any) => String(y.submittedAt).localeCompare(String(x.submittedAt))));
  });

  app.get("/api/student/results/history", requireStudent, async (req: any, res) => {
    const results = await ownReleasedResults(Number(req.student.id));
    res.json(results);
  });

  app.get("/api/student/profile", requireStudent, async (req: any, res) => {
    const studentId = Number(req.student.id);
    const [profileResult, membership, payments, requests] = await Promise.all([
      pool.query(
        `SELECT id, name, email, phone, avatar_key AS "avatarKey"
           FROM students WHERE id = $1`,
        [studentId],
      ),
      getMembership(studentId),
      pool.query(
        `SELECT p.id, p.code, p.plan, p.amount, p.source, p.status, p.reason,
                p.created_at AS "submittedAt", p.reviewed_at AS "reviewedAt",
                c.start_date::text AS "planStartDate", c.end_date::text AS "planEndDate"
           FROM medqrown_payment_entries p
           LEFT JOIN medqrown_cohorts c ON c.id = p.target_cohort_id
          WHERE p.student_id = $1
          ORDER BY p.created_at DESC, p.id DESC`,
        [studentId],
      ),
      pool.query(
        `SELECT id, field_name AS "fieldName", requested_value AS "requestedValue", reason,
                status, review_reason AS "reviewReason", created_at AS "createdAt"
           FROM profile_change_requests WHERE student_id = $1
          ORDER BY created_at DESC, id DESC`,
        [studentId],
      ),
    ]);
    const student = profileResult.rows[0];
    if (!student) return res.status(404).json({ message: "Student profile not found" });
    res.json({
      ...student,
      membership: membership ? {
        status: membership.status,
        startDate: membership.startDate,
        endDate: membership.endDate,
        graceEndDate: membership.graceEndDate,
      } : null,
      paymentHistory: payments.rows,
      changeRequests: requests.rows,
    });
  });
}