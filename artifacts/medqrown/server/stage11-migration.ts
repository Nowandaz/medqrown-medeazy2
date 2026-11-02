import { pool } from "./db";

export const STAGE11_TEMPLATES = [
  {
    key: "invite_set_password",
    name: "Invite / set your password",
    subject: "Set your MedQrown MedEazy password",
    body: "Hello {student_name},\n\nYour class account is ready. Set your password within 7 days using this single-use link:\n{renew_link}\n\nMedQrown MedEazy",
  },
  {
    key: "existing_student_enrolled",
    name: "You're in for this cohort (existing student)",
    subject: "You're in for this cohort",
    body: "Hello {student_name},\n\nYour MedQrown MedEazy class membership has been confirmed. You're in for this cohort, through {cohort_end}.\n\nMedQrown MedEazy",
  },
  {
    key: "renewal_7_days",
    name: "Renewal reminder — 7 days",
    subject: "Your MedQrown membership ends in 7 days",
    body: "Hello {student_name},\n\nYour MedQrown MedEazy membership ends on {cohort_end}. Renew now so your exams, class and timetable carry on without a break.\n\nHow to renew (about 2 minutes):\n1. On your phone open M-Pesa → Lipa na M-Pesa → Pay Bill.\n2. Business number: {paybill}\n3. Account number: {account_number}\n4. Amount: KSh {individual_price} (Individual), or KSh {group_price} for a group of 4.\n5. Enter your M-Pesa PIN. You'll get an SMS: copy the 10-character code at the start of it (e.g. SJK4ABC123).\n6. Tap the button below, sign in, choose your plan and paste the code.\n\n{renew_link}\n\nWe'll check the payment and email you as soon as it's approved.\n\nMedQrown MedEazy",
  },
  {
    key: "renewal_3_days",
    name: "Renewal reminder — 3 days",
    subject: "Your MedQrown membership ends in 3 days",
    body: "Hello {student_name},\n\nYour MedQrown MedEazy membership ends on {cohort_end}. Renew now so your exams, class and timetable carry on without a break.\n\nHow to renew (about 2 minutes):\n1. On your phone open M-Pesa → Lipa na M-Pesa → Pay Bill.\n2. Business number: {paybill}\n3. Account number: {account_number}\n4. Amount: KSh {individual_price} (Individual), or KSh {group_price} for a group of 4.\n5. Enter your M-Pesa PIN. You'll get an SMS: copy the 10-character code at the start of it (e.g. SJK4ABC123).\n6. Tap the button below, sign in, choose your plan and paste the code.\n\n{renew_link}\n\nWe'll check the payment and email you as soon as it's approved.\n\nMedQrown MedEazy",
  },
  {
    key: "renewal_last_day",
    name: "Renewal reminder — last day",
    subject: "Your MedQrown membership ends today",
    body: "Hello {student_name},\n\nYour MedQrown MedEazy membership ends today ({cohort_end}). Renew now so your exams, class and timetable carry on without a break.\n\nHow to renew (about 2 minutes):\n1. On your phone open M-Pesa → Lipa na M-Pesa → Pay Bill.\n2. Business number: {paybill}\n3. Account number: {account_number}\n4. Amount: KSh {individual_price} (Individual), or KSh {group_price} for a group of 4.\n5. Enter your M-Pesa PIN. You'll get an SMS: copy the 10-character code at the start of it (e.g. SJK4ABC123).\n6. Tap the button below, sign in, choose your plan and paste the code.\n\n{renew_link}\n\nWe'll check the payment and email you as soon as it's approved.\n\nMedQrown MedEazy",
  },
  {
    key: "payment_approved",
    name: "Payment approved",
    subject: "MedQrown payment approved",
    body: "Hello {student_name},\n\nYour MedQrown MedEazy payment was approved. Your membership now ends {cohort_end}.\n\nMedQrown MedEazy",
  },
  {
    key: "payment_rejected",
    name: "Payment rejected (with reason)",
    subject: "MedQrown payment rejected",
    body: "Hello {student_name},\n\nYour payment was rejected. Reason: {reason}\nYou may submit another payment code.\n\nMedQrown MedEazy",
  },
  {
    key: "announcement",
    name: "Announcement",
    subject: "{announcement_title}",
    body: "Hello {student_name},\n\n{announcement_message}\n\n{announcement_link}\n\nMedQrown MedEazy",
  },
  {
    key: "waitlist_registration_open",
    name: "Registration is open (waitlist)",
    subject: "Registration is open for the MedEazy cohort",
    body: "Hello {student_name},\n\nRegistration is open. Complete the cohort signup form here:\n{renew_link}\n\nMedQrown MedEazy",
  },
  {
    key: "password_reset",
    name: "Password reset",
    subject: "Reset your MedQrown MedEazy password",
    body: "Hello {student_name},\n\nWe received a request to reset your password. Use this code: {reset_code}\n\nThis code expires in 15 minutes. If you didn't request a password reset, you can safely ignore this email.\n\nMedQrown MedEazy",
  },
] as const;

/** Earlier default wording: rows still exactly like this were never edited, so they get the new default. */
const PREVIOUS_DEFAULT_BODIES: Record<string, string> = {
  renewal_7_days: "Hello {student_name},\n\nYour membership ends {cohort_end}. Renew here: {renew_link}\nPaybill: {paybill}\nAccount number: {account_number}\n\nMedQrown MedEazy",
  renewal_3_days: "Hello {student_name},\n\nYour membership ends {cohort_end}. Renew here: {renew_link}\nPaybill: {paybill}\nAccount number: {account_number}\n\nMedQrown MedEazy",
  renewal_last_day: "Hello {student_name},\n\nYour membership ends today ({cohort_end}). Renew here: {renew_link}\nPaybill: {paybill}\nAccount number: {account_number}\n\nMedQrown MedEazy",
};

export async function migrateStage11(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS medqrown_email_templates (
      id SERIAL PRIMARY KEY,
      template_key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS medqrown_email_log (
      id BIGSERIAL PRIMARY KEY,
      recipient TEXT NOT NULL,
      template_key TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
      error TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS medqrown_email_log_created_idx
      ON medqrown_email_log (created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS medqrown_email_log_recipient_idx
      ON medqrown_email_log (LOWER(recipient));
    -- Resending: failed emails keep their rendered content until they go out.
    ALTER TABLE medqrown_email_log
      ADD COLUMN IF NOT EXISTS payload JSONB,
      ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMP;
  `);
  for (const template of STAGE11_TEMPLATES) {
    await pool.query(
      `INSERT INTO medqrown_email_templates (template_key, name, subject, body)
       VALUES ($1, $2, $3, $4) ON CONFLICT (template_key) DO NOTHING`,
      [template.key, template.name, template.subject, template.body],
    );
    const previous = PREVIOUS_DEFAULT_BODIES[template.key];
    if (previous) {
      await pool.query(
        "UPDATE medqrown_email_templates SET body = $2, updated_at = CURRENT_TIMESTAMP WHERE template_key = $1 AND body = $3",
        [template.key, template.body, previous],
      );
    }
  }
}