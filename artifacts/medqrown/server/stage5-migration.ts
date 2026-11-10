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

  // Repair for early renewals approved before the fix in chooseMembership: the approval moved the
  // start date to the next cohort, so the student showed "not started" and lost access until then.
  // Restore the start date they had, only where they were still active or in grace when it was approved.
  const repaired = await pool.query(`
    UPDATE medqrown_memberships m
       SET start_date = (a.previous_values->>'startDate')::date, updated_at = CURRENT_TIMESTAMP
      FROM (SELECT DISTINCT ON (student_id) student_id, previous_values, new_values, created_at
              FROM medqrown_membership_audit ORDER BY student_id, created_at DESC, id DESC) a
     WHERE a.student_id = m.student_id
       AND m.start_date > (now() AT TIME ZONE 'Africa/Nairobi')::date
       AND a.new_values->>'startDate' = m.start_date::text
       AND a.previous_values->>'startDate' ~ '^\\d{4}-\\d{2}-\\d{2}$'
       AND a.previous_values->>'endDate' ~ '^\\d{4}-\\d{2}-\\d{2}$'
       AND (a.previous_values->>'startDate')::date <= (now() AT TIME ZONE 'Africa/Nairobi')::date
       AND (a.previous_values->>'endDate')::date
           + COALESCE((SELECT grace_days FROM medqrown_settings WHERE id = 1), 3)
           >= (a.created_at AT TIME ZONE 'Africa/Nairobi')::date
    RETURNING m.student_id`);
  if (repaired.rowCount) console.log(`[renewals] restored the start date for ${repaired.rowCount} early renewal(s)`);
}