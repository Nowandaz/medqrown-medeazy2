---
name: Supabase connections on Replit
description: How to connect a direct PostgreSQL client to Supabase from the Replit runtime.
---

For direct PostgreSQL clients, use Supabase's Session pooler URI rather than the project's direct database hostname. The URI must use the project database password, not the user's Supabase account password, and retain the pooler username exactly as Supabase provides it.

**Why:** The direct Supabase database hostname can resolve only to IPv6, which may be unreachable from the Replit runtime. The Replit Supabase connector can access PostgREST successfully but does not replace the raw PostgreSQL URL expected by an existing Drizzle/node-postgres application.

**How to apply:** When a direct Supabase hostname fails to resolve, request the Session pooler URI securely. If authentication fails, confirm the pooler username and reset or verify the separate project database password.