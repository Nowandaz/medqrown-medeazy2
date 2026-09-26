import { pool } from "./db";

/** Idempotent Stage 7 schema for class announcements, feedback and web push. */
export async function migrateStage7(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS medqrown_class_announcements (
      id BIGSERIAL PRIMARY KEY,
      class_id INTEGER NOT NULL REFERENCES medqrown_classes(id) ON DELETE CASCADE,
      admin_id INTEGER REFERENCES admins(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      link TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS medqrown_class_announcements_history_idx
      ON medqrown_class_announcements(class_id, created_at DESC, id DESC);
    CREATE TABLE IF NOT EXISTS medqrown_class_feedback (
      id BIGSERIAL PRIMARY KEY,
      class_id INTEGER NOT NULL REFERENCES medqrown_classes(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      exam_id INTEGER REFERENCES exams(id) ON DELETE SET NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS medqrown_class_feedback_latest_idx
      ON medqrown_class_feedback(class_id, created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS medqrown_class_feedback_exam_idx
      ON medqrown_class_feedback(class_id, exam_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS medqrown_push_subscriptions (
      id BIGSERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS medqrown_push_subscriptions_student_idx
      ON medqrown_push_subscriptions(student_id);
  `);
}