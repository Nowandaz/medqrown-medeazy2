-- Student-owned self-tests stay separate from administrator-approved exams.

CREATE TABLE IF NOT EXISTS self_tests (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  unit_id INTEGER REFERENCES units(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  focus TEXT,
  question_type TEXT NOT NULL DEFAULT 'mixed',
  content_style TEXT NOT NULL DEFAULT 'mixed',
  question_count INTEGER NOT NULL,
  timer_seconds INTEGER,
  status TEXT NOT NULL DEFAULT 'draft',
  generation_error TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_self_tests_student_created ON self_tests(student_id, created_at);

CREATE TABLE IF NOT EXISTS self_test_questions (
  id SERIAL PRIMARY KEY,
  self_test_id INTEGER NOT NULL REFERENCES self_tests(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  expected_answer TEXT,
  explanation TEXT,
  marks INTEGER NOT NULL DEFAULT 1,
  order_index INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_self_test_questions_test_order ON self_test_questions(self_test_id, order_index);

CREATE TABLE IF NOT EXISTS self_test_question_options (
  id SERIAL PRIMARY KEY,
  question_id INTEGER NOT NULL REFERENCES self_test_questions(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT false,
  order_index INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_self_test_options_question ON self_test_question_options(question_id);

CREATE TABLE IF NOT EXISTS self_test_attempts (
  id SERIAL PRIMARY KEY,
  self_test_id INTEGER NOT NULL REFERENCES self_tests(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'in_progress',
  current_question_index INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_self_test_attempts_student_test ON self_test_attempts(student_id, self_test_id);

CREATE TABLE IF NOT EXISTS self_test_responses (
  id SERIAL PRIMARY KEY,
  attempt_id INTEGER NOT NULL REFERENCES self_test_attempts(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES self_test_questions(id) ON DELETE CASCADE,
  answer TEXT,
  is_correct BOOLEAN,
  marks_awarded REAL,
  ai_feedback TEXT,
  UNIQUE(attempt_id, question_id)
);

CREATE TABLE IF NOT EXISTS self_test_question_reports (
  id SERIAL PRIMARY KEY,
  question_id INTEGER NOT NULL REFERENCES self_test_questions(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(question_id, student_id)
);