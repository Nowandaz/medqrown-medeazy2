import { pool } from "./db";

/**
 * Membership history: one row per continuous span a student was a member.
 *
 * medqrown_memberships keeps a single "current" row per student and is written from many places
 * (approvals, CSV, manual edits, pause/resume, bulk end dates). A database trigger turns every
 * change to that row into history here, so nothing that writes memberships needs to know:
 *   - a change that keeps the span continuous (extension, edit) updates the latest period;
 *   - a new start after a gap (renewing after expiry) opens a new period and keeps the old one.
 *
 * Students see an exam or announcement only if it fell inside one of their periods (plus grace),
 * so a student who paid for cohorts 1 and 3 keeps cohort 1's content, never sees cohort 2's, and
 * gets cohort 3's. Current and upcoming exams still show (locked) to lapsed students so they
 * can renew.
 */
export async function migrateMembershipPeriods(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS medqrown_membership_periods (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      cohort_id INTEGER REFERENCES medqrown_cohorts(id) ON DELETE SET NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS medqrown_membership_periods_student_idx
      ON medqrown_membership_periods(student_id, end_date DESC);

    CREATE OR REPLACE FUNCTION medqrown_track_membership_period() RETURNS trigger AS $$
    DECLARE
      latest RECORD;
    BEGIN
      IF TG_OP = 'UPDATE' AND NEW.start_date = OLD.start_date AND NEW.end_date = OLD.end_date
         AND NEW.cohort_id IS NOT DISTINCT FROM OLD.cohort_id THEN
        RETURN NEW;
      END IF;
      SELECT id, start_date, end_date INTO latest
        FROM medqrown_membership_periods WHERE student_id = NEW.student_id
       ORDER BY end_date DESC, id DESC LIMIT 1;
      IF latest.id IS NULL
         OR NEW.start_date > COALESCE(CASE WHEN TG_OP = 'UPDATE' THEN OLD.end_date END, latest.end_date) + 1 THEN
        -- First membership, or a fresh start after a gap: a new period; earlier ones stay.
        INSERT INTO medqrown_membership_periods (student_id, cohort_id, start_date, end_date)
        VALUES (NEW.student_id, NEW.cohort_id, NEW.start_date, NEW.end_date);
      ELSE
        -- Same continuous membership, extended or edited.
        UPDATE medqrown_membership_periods
           SET start_date = NEW.start_date, end_date = NEW.end_date, cohort_id = NEW.cohort_id,
               updated_at = CURRENT_TIMESTAMP
         WHERE id = latest.id;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS medqrown_membership_period_trigger ON medqrown_memberships;
    CREATE TRIGGER medqrown_membership_period_trigger
      AFTER INSERT OR UPDATE ON medqrown_memberships
      FOR EACH ROW EXECUTE FUNCTION medqrown_track_membership_period();

    -- Existing members start with their current span as their first period.
    INSERT INTO medqrown_membership_periods (student_id, cohort_id, start_date, end_date)
    SELECT m.student_id, m.cohort_id, m.start_date, m.end_date
      FROM medqrown_memberships m
     WHERE NOT EXISTS (SELECT 1 FROM medqrown_membership_periods p WHERE p.student_id = m.student_id);
  `);
}

const GRACE = "(SELECT COALESCE(grace_days, 3) FROM medqrown_settings WHERE id = 1)";
const nairobiDay = (timestampSql: string) => `((${timestampSql}) AT TIME ZONE 'Africa/Nairobi')::date`;

/** True when the given moment (a timestamptz SQL expression) fell inside one of the student's periods (+grace). */
export function inMembershipPeriodSql(timestampSql: string, studentIdSql: string): string {
  return `EXISTS (SELECT 1 FROM medqrown_membership_periods mp
                   WHERE mp.student_id = ${studentIdSql}
                     AND ${nairobiDay(timestampSql)} BETWEEN mp.start_date AND mp.end_date + ${GRACE})`;
}

/**
 * Whether a student should see an exam at all: it opened during one of their periods, or it is
 * still current/upcoming and opens after their membership lapsed (shown locked: "Renew to access").
 * Exams from cohorts they skipped, or from before they joined, stay hidden.
 */
export function examVisibleSql(examAlias: string, studentIdSql: string): string {
  return `(${examAlias}.opens_at IS NULL
    OR ${inMembershipPeriodSql(`${examAlias}.opens_at`, studentIdSql)}
    OR ((${examAlias}.closes_at IS NULL OR ${examAlias}.closes_at > CURRENT_TIMESTAMP)
        AND ${nairobiDay(`${examAlias}.opens_at`)} > COALESCE(
          (SELECT MAX(mp.end_date) + ${GRACE} FROM medqrown_membership_periods mp WHERE mp.student_id = ${studentIdSql}),
          DATE '1900-01-01')))`;
}
