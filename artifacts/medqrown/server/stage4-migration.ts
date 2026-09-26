import { pool } from "./db";

/** Additive Stage 4 schema only; existing student and payment records are preserved. */
export async function migrateStage4(): Promise<void> {
  await pool.query(`
    ALTER TABLE students ADD COLUMN IF NOT EXISTS phone TEXT;
    CREATE TABLE IF NOT EXISTS medqrown_invites (
      student_id INTEGER PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS medqrown_invites_expiry_idx ON medqrown_invites(expires_at);
  `);
}