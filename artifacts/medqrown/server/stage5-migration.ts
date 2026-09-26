import { pool } from "./db";

/** Additive Stage 5 schema; preserves the existing Supabase payment history. */
export async function migrateStage5(): Promise<void> {
  await pool.query(`
    ALTER TABLE medqrown_payment_entries
      ADD COLUMN IF NOT EXISTS target_cohort_id INTEGER REFERENCES medqrown_cohorts(id);
    CREATE INDEX IF NOT EXISTS medqrown_payment_entries_target_cohort_idx
      ON medqrown_payment_entries(target_cohort_id, student_id, status);
    CREATE TABLE IF NOT EXISTS medqrown_notifications (
      id BIGSERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      read_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS medqrown_notifications_student_idx
      ON medqrown_notifications(student_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS medqrown_reminder_log (
      id BIGSERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      membership_end_date DATE NOT NULL,
      days_before_end INTEGER NOT NULL CHECK (days_before_end IN (7, 3, 0)),
      sent_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      channels JSONB NOT NULL DEFAULT '{}'::jsonb,
      UNIQUE (student_id, membership_end_date, days_before_end)
    );
  `);
}