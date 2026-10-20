import { pool } from "./db";

/**
 * Closes Supabase's public Data API (PostgREST / GraphQL) over our tables.
 *
 * The app never uses the Data API: the server connects to Postgres directly as the table
 * owner (which RLS does not restrict) and uses Storage with the service-role key. So every
 * table in "public" gets Row Level Security with no policies, and the API roles lose their
 * grants. Runs on every start, after all migrations, so tables added later are covered too.
 * Safe on plain Postgres: the Supabase roles are only touched when they exist.
 */
export async function lockDownDataApi(): Promise<void> {
  await pool.query(`
    DO $$
    DECLARE
      t record;
      api_role text;
    BEGIN
      FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
      END LOOP;

      FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
          EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', api_role);
          EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', api_role);
          EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', api_role);
          EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', api_role);
        END IF;
      END LOOP;
    END $$;
  `);
}
