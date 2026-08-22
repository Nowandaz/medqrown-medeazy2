---
name: Production schema migrations
description: Deployment behavior for database schema changes in this project.
---

Production startup does not apply SQL migration files automatically; the service must run the project’s idempotent schema-sync step before serving requests that depend on new tables.

**Why:** A self-test feature worked locally after schema sync but would fail on a fresh deployed database if startup only launched the compiled server.

**How to apply:** When adding database-backed features, keep a tracked migration and ensure the production start lifecycle applies it before the application accepts traffic.