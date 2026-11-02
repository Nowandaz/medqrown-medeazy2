import * as schema from "@shared/schema";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

const connectionString = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new pg.Pool({
  connectionString,
  ssl: connectionString.includes("supabase.com")
    ? { rejectUnauthorized: false }
    : undefined,
});

// Supabase's pooler closes idle connections now and then. Without a listener that
// 'error' event is unhandled and takes the whole server down; the pool just drops
// the dead client and opens a new one on the next query.
pool.on("error", (err) => {
  console.warn(`[db] idle connection closed: ${err.message}`);
});

// The workspace currently resolves two compatible pg type versions; the runtime
// client is still the node-postgres Pool expected by Drizzle.
export const db = drizzle(pool as any, { schema });
