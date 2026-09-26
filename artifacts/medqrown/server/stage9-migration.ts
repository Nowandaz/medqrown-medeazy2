import { pool } from "./db";

const faqDefaults = [
  ["What does the MedEazy academic consultancy include?", "The consultancy provides consistent academic support throughout the semester: weekly online sessions on Mondays from 8:00–10:00 pm, a weekly mock CAT on Saturdays from 8:00–8:30 pm, a weekly revision session on Saturdays from 8:30–10:30 pm, and a physical gross anatomy lab every two weeks on Saturday from 10:00 am–1:00 pm."],
  ["How do cohorts and monthly membership work?", "Students join a cohort for a defined monthly study period. Membership provides access to the academic support and resources assigned to that cohort. Cohort dates and the available membership period are shared when joining."],
  ["What are the Individual and Group plans and their prices?", "Individual membership is for one student. Group membership is for a group joining together; availability and terms are confirmed by the consultancy. Current prices are provided on the official signup and payment instructions and should be confirmed before paying."],
  ["How do I pay by M-Pesa?", "Follow the current cohort payment instructions to pay by M-Pesa, then submit the requested transaction code and details. Payments are manually verified; access is granted after verification. Keep your transaction confirmation until verification is complete."],
  ["How do invite-only accounts work?", "MedEazy accounts are invite-only. Join the current cohort through the official Google Form when registration is open, or join the waitlist when registration is closed. An invitation is required to create or access a cohort account."],
  ["What happens during the grace period or after membership expires?", "A grace period may be available after the cohort membership end date according to the current membership terms. Access can be limited during grace and ends after the grace period unless membership is renewed or updated. Contact the consultancy to confirm your account's dates."],
  ["What notifications and emails will I receive?", "We may send account invitations, payment verification updates, cohort and schedule announcements, and service notifications by email or in-app. Keep your contact details current and contact us if an expected message does not arrive."],
  ["What data is stored and how can I contact MedEazy?", "We store information needed to provide the service, including your name, email, phone number, M-Pesa transaction codes, exam answers and results, and feedback. Contact norysndachule@gmail.com or WhatsApp +254 702 797 977 with questions or data requests."],
];

const terms = `# Terms of Service

## Academic consultancy
MedQrown MedEazy provides semester-long academic support including weekly online preparation, mock CATs, revision sessions and periodic physical gross anatomy labs. Dates, delivery format and cohort-specific details are communicated to members.

## Cohorts, plans and payment
Membership is organized into cohorts and monthly study periods. Individual and Group plan availability, applicable prices and the period covered are stated in the current signup and payment instructions; confirm those terms before paying. M-Pesa payments are manually verified from the transaction information you submit. Do not submit another person's payment code without authorization.

## Invite-only accounts
Accounts are invite-only. Joining a cohort or waitlist is not itself an account invitation or a guarantee of admission. Keep invitation links private and notify us if you believe one has been misused.

## Membership expiry and grace
Membership access follows its stated cohort dates. Where a grace period applies, its length and available access are subject to the current membership terms. Access may be restricted after the membership end date and expires after any applicable grace period unless renewed or otherwise arranged.

## Notifications and acceptable use
We may send service, invitation, payment, schedule and cohort notifications by email or in-app. You are responsible for providing a working email and phone number. Use the service lawfully, do not share account credentials, and do not disrupt assessments or other users.

## Contact
Questions about these terms or the service: norysndachule@gmail.com or WhatsApp +254 702 797 977.`;

const privacy = `# Privacy Policy

## Information we store
To operate the academic consultancy we may store your name, email address, phone number, M-Pesa transaction codes and related payment verification records, exam answers and results, and feedback. We also keep account, cohort, invitation and service-usage records needed to provide and protect the service. Public demo engagement is recorded without names, emails, phone numbers or submitted answer text.

## How information is used
Information is used to manage invitations and cohort membership, verify payments manually, deliver academic support and assessments, provide results, respond to feedback, and send service notifications and emails. We do not use public demo answers to identify visitors.

## Access, retention and security
Access to personal records is limited to people who need them to administer the service. We retain records for as long as needed for these purposes and applicable obligations, and use reasonable safeguards. No online service can guarantee absolute security.

## Your choices and contact
For questions, correction requests or privacy concerns, contact norysndachule@gmail.com or WhatsApp +254 702 797 977.`;

export async function migrateStage9(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS demo_exams (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      display_order INTEGER NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT true,
      timer_seconds INTEGER NOT NULL DEFAULT 60,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS demo_questions (
      id SERIAL PRIMARY KEY,
      demo_exam_id INTEGER NOT NULL REFERENCES demo_exams(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      image_url TEXT,
      options JSONB,
      explanation TEXT,
      order_index INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS content_pages (
      slug TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS faq_items (
      id SERIAL PRIMARY KEY,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      order_index INTEGER NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT true
    );
    ALTER TABLE demo_questions ADD COLUMN IF NOT EXISTS model_answer TEXT;
    ALTER TABLE demo_questions ADD COLUMN IF NOT EXISTS marking_points TEXT;
    CREATE TABLE IF NOT EXISTS medqrown_waitlist (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      invitation_email_sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS medqrown_waitlist_email_unique
      ON medqrown_waitlist (LOWER(email));
    CREATE INDEX IF NOT EXISTS medqrown_waitlist_created_idx
      ON medqrown_waitlist (created_at DESC, id DESC);
    CREATE TABLE IF NOT EXISTS medqrown_contact_messages (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      context TEXT,
      message TEXT NOT NULL,
      notification_status TEXT NOT NULL DEFAULT 'pending',
      email_sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS medqrown_contact_messages_created_idx
      ON medqrown_contact_messages (created_at DESC, id DESC);
  `);

  // Seed only missing entries; existing pages and FAQ edits are never replaced.
  await pool.query(
    `INSERT INTO content_pages (slug, title, content)
       VALUES ('terms', 'Terms of Service', $1), ('privacy', 'Privacy Policy', $2)
     ON CONFLICT (slug) DO NOTHING`,
    [terms, privacy],
  );
  for (let index = 0; index < faqDefaults.length; index++) {
    const [question, answer] = faqDefaults[index];
    await pool.query(
      `INSERT INTO faq_items (question, answer, order_index, is_active)
       SELECT $1, $2, $3, true
       WHERE NOT EXISTS (SELECT 1 FROM faq_items WHERE question = $1)`,
      [question, answer, index],
    );
  }
}