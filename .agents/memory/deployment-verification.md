---
name: Deployment verification
description: Durable guidance for validating MedQrown integrations before deployment.
---

Replit environment secrets do not automatically transfer to Render; configure the same required keys separately in Render. A safe integration smoke test should authenticate to SMTP with `transporter.verify()` without sending mail, and should upload then immediately delete a temporary object in Supabase Storage.

**Why:** The app can start and serve its frontend even when an external integration is invalid or missing, so startup alone is not enough to validate deployment readiness.

**How to apply:** Before publishing changes, check secret presence without exposing values, verify SMTP credentials, test database-backed reads, and use temporary data for storage round trips. Keep real email sends and destructive admin workflows out of automated smoke tests unless a test recipient or isolated dataset is explicitly provided.

Admin authentication depends on the stored bcrypt hash, not a seed/default password assumption; when a confirmed password is rejected, compare it against the live hash before debugging the login route.

**Why:** A live admin account can retain an older hash after credentials are communicated or changed outside the current seed flow, producing a misleading “invalid credentials” result.

**How to apply:** For a user-authorized credential correction, verify the account identity and active status, update only that account’s hash, then confirm login without logging the password.

SMTP `sendMail` success means the configured mail server accepted the message, not that it reached the recipient’s inbox.

**Why:** Recipient spam filtering, Promotions classification, mailbox rules, quota, and downstream delivery can prevent inbox placement after SMTP acceptance.

**How to apply:** Report accepted/rejected SMTP counts separately from inbox delivery, record a send timestamp, and tell users to check Spam, Promotions, filters, and mailbox capacity.