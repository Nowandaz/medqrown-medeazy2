import { pool } from "./db";

/** Additive Stage 10 admin analytics storage. Existing student and exam data is untouched. */
export async function migrateStage10(): Promise<void> {
  await pool.query(`
    ALTER TABLE medqrown_waitlist ADD COLUMN IF NOT EXISTS source TEXT;
    ALTER TABLE medqrown_waitlist ADD COLUMN IF NOT EXISTS session_id TEXT;
    CREATE TABLE IF NOT EXISTS medqrown_engagement_events (
      id BIGSERIAL PRIMARY KEY,
      session_id TEXT NOT NULL,
      event_type TEXT NOT NULL CHECK (event_type IN ('page_view', 'demo_start', 'demo_complete', 'signup_click')),
      page_key TEXT,
      source TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS medqrown_engagement_events_created_idx
      ON medqrown_engagement_events(created_at, event_type);
    CREATE INDEX IF NOT EXISTS medqrown_engagement_events_source_idx
      ON medqrown_engagement_events(source, created_at);
    CREATE TABLE IF NOT EXISTS medqrown_exam_ai_analyses (
      id BIGSERIAL PRIMARY KEY,
      exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
      question_ids INTEGER[] NOT NULL,
      analysis JSONB NOT NULL,
      admin_id INTEGER REFERENCES admins(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS medqrown_exam_ai_analyses_exam_idx
      ON medqrown_exam_ai_analyses(exam_id, created_at DESC, id DESC);
  `);
}