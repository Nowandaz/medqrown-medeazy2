import { pool } from "./db";

/**
 * Idempotent, additive Stage 3 schema migration. Kept separate from the
 * Drizzle push path because this application runs production on Supabase.
 */
export async function migrateStage3(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS medqrown_cohorts (
      id SERIAL PRIMARY KEY,
      start_date DATE NOT NULL UNIQUE,
      end_date DATE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK (end_date >= start_date)
    );
    CREATE TABLE IF NOT EXISTS medqrown_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      individual_price INTEGER NOT NULL DEFAULT 700 CHECK (individual_price >= 0),
      group_price INTEGER NOT NULL DEFAULT 2500 CHECK (group_price >= 0),
      paybill TEXT NOT NULL DEFAULT '542542',
      account_number TEXT NOT NULL DEFAULT '00106133326150',
      bank_name TEXT NOT NULL DEFAULT 'I&M Bank',
      grace_days INTEGER NOT NULL DEFAULT 3 CHECK (grace_days BETWEEN 0 AND 90),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO medqrown_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
    CREATE TABLE IF NOT EXISTS medqrown_classes (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS medqrown_class_students (
      class_id INTEGER NOT NULL REFERENCES medqrown_classes(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (class_id, student_id)
    );
    CREATE INDEX IF NOT EXISTS medqrown_class_students_student_idx
      ON medqrown_class_students(student_id);
    CREATE TABLE IF NOT EXISTS medqrown_memberships (
      student_id INTEGER PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
      cohort_id INTEGER NOT NULL REFERENCES medqrown_cohorts(id),
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK (end_date >= start_date)
    );
    CREATE INDEX IF NOT EXISTS medqrown_memberships_cohort_idx
      ON medqrown_memberships(cohort_id);
    CREATE TABLE IF NOT EXISTS medqrown_membership_audit (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      admin_id INTEGER REFERENCES admins(id) ON DELETE SET NULL,
      reason TEXT NOT NULL,
      previous_values JSONB,
      new_values JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS medqrown_membership_audit_student_idx
      ON medqrown_membership_audit(student_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS medqrown_payment_entries (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      code TEXT NOT NULL,
      plan TEXT NOT NULL CHECK (plan IN ('Individual', 'Group')),
      amount INTEGER NOT NULL CHECK (amount >= 0),
      source TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'rejected')),
      reviewer_id INTEGER REFERENCES admins(id) ON DELETE SET NULL,
      reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reviewed_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS medqrown_payment_entries_student_idx
      ON medqrown_payment_entries(student_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS medqrown_payment_entries_code_idx
      ON medqrown_payment_entries(code, created_at DESC);
    CREATE INDEX IF NOT EXISTS medqrown_payment_entries_status_idx
      ON medqrown_payment_entries(status, created_at DESC);
    INSERT INTO medqrown_cohorts (start_date, end_date)
    VALUES ('2026-09-28', '2026-10-27')
    ON CONFLICT (start_date) DO NOTHING;
    CREATE TABLE IF NOT EXISTS "session" (
      "sid" varchar NOT NULL COLLATE "default" PRIMARY KEY,
      "sess" json NOT NULL,
      "expire" timestamp(6) NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
  `);
}