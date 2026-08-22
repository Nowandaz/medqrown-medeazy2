-- Configurable official-exam attempt limits and one-time reattempt approvals.

ALTER TABLE exams
  ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 1;

UPDATE exams SET max_attempts = 1 WHERE max_attempts IS NULL OR max_attempts < 1;

CREATE TABLE IF NOT EXISTS exam_reattempt_requests (
  id SERIAL PRIMARY KEY,
  exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  reason TEXT,
  reviewed_by INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  review_reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP,
  consumed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_exam_reattempt_requests_exam_student
  ON exam_reattempt_requests(exam_id, student_id);

CREATE UNIQUE INDEX IF NOT EXISTS exam_reattempt_requests_one_pending_per_student
  ON exam_reattempt_requests(exam_id, student_id)
  WHERE status = 'pending';