---
name: Deployment verification
description: Durable guidance for validating MedQrown integrations before deployment.
---

Replit environment secrets do not automatically transfer to Render; configure the same required keys separately in Render. A safe integration smoke test should authenticate to SMTP with `transporter.verify()` without sending mail, and should upload then immediately delete a temporary object in Supabase Storage.

**Why:** The app can start and serve its frontend even when an external integration is invalid or missing, so startup alone is not enough to validate deployment readiness.

**How to apply:** Before publishing changes, check secret presence without exposing values, verify SMTP credentials, test database-backed reads, and use temporary data for storage round trips. Keep real email sends and destructive admin workflows out of automated smoke tests unless a test recipient or isolated dataset is explicitly provided.