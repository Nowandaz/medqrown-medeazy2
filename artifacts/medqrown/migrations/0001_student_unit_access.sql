-- Student unit and official-exam access foundation.
-- This migration is versioned for deployment review; development schema updates
-- are applied through the configured Drizzle db:push workflow.

CREATE TABLE IF NOT EXISTS units (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  university TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS avatar_key TEXT NOT NULL DEFAULT 'teal';

ALTER TABLE exams
  ADD COLUMN IF NOT EXISTS unit_id INTEGER REFERENCES units(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS student_accounts (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL UNIQUE REFERENCES students(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS allowed_email_domains (
  id SERIAL PRIMARY KEY,
  domain TEXT NOT NULL UNIQUE,
  label TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS unit_memberships (
  id SERIAL PRIMARY KEY,
  unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'enrolled',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unit_memberships_unit_student_unique UNIQUE (unit_id, student_id)
);

CREATE TABLE IF NOT EXISTS exam_access_requests (
  id SERIAL PRIMARY KEY,
  exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  reason TEXT,
  reviewed_by INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  review_reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP,
  CONSTRAINT exam_access_requests_exam_student_unique UNIQUE (exam_id, student_id)
);

CREATE TABLE IF NOT EXISTS profile_change_requests (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  requested_value TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  review_reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_unit_memberships_student_id ON unit_memberships(student_id);
CREATE INDEX IF NOT EXISTS idx_exam_access_requests_status ON exam_access_requests(status);
CREATE INDEX IF NOT EXISTS idx_profile_change_requests_status ON profile_change_requests(status);