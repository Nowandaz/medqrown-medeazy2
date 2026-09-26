import { pool } from "./db";

/** Additive Stage 6 exam scheduling fields; legacy exams and attempt history remain intact. */
export async function migrateStage6(): Promise<void> {
  await pool.query(`
    ALTER TABLE exams
      ADD COLUMN IF NOT EXISTS class_id INTEGER REFERENCES medqrown_classes(id) ON DELETE RESTRICT,
      ADD COLUMN IF NOT EXISTS opens_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS closes_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS duration_minutes INTEGER;
    ALTER TABLE exams ALTER COLUMN max_attempts SET DEFAULT 1;
    ALTER TABLE exams ALTER COLUMN auto_mark_enabled SET DEFAULT true;
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exams_duration_minutes_positive') THEN
        ALTER TABLE exams ADD CONSTRAINT exams_duration_minutes_positive
          CHECK (duration_minutes IS NULL OR duration_minutes > 0) NOT VALID;
      END IF;
    END $$;
    CREATE INDEX IF NOT EXISTS exams_class_schedule_idx ON exams(class_id, opens_at, closes_at);
    CREATE INDEX IF NOT EXISTS attempts_in_progress_started_idx ON attempts(started_at)
      WHERE status = 'in_progress';
  `);
}