// Creates (or resets) a throwaway super_admin on the STAGING database for local testing.
// The generated password is written to .env.test-accounts (git-ignored), never printed.
//   node scripts/create-test-admin.cjs
require("dotenv").config({ path: ".env", quiet: true });
const fs = require("fs");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { Client } = require("pg");

const EMAIL = "qa-admin@medeazy.test";
const projectId = (url) => {
  try { return new URL(url).username.split(".")[1] || null; } catch { return null; }
};

(async () => {
  const url = process.env.SUPABASE_DATABASE_URL;
  if (!url) throw new Error("SUPABASE_DATABASE_URL is not set");
  if (process.env.PROD_DATABASE_URL && projectId(url) === projectId(process.env.PROD_DATABASE_URL)) {
    throw new Error("Refusing: SUPABASE_DATABASE_URL is the live project");
  }
  const password = crypto.randomBytes(12).toString("base64url");
  const hash = await bcrypt.hash(password, 12);
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  await client.query(
    `INSERT INTO admins (email, password_hash, name, role, is_active)
     VALUES ($1, $2, 'QA Test Admin', 'super_admin', true)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, is_active = true`,
    [EMAIL, hash],
  );
  await client.end();
  fs.writeFileSync(".env.test-accounts", `QA_ADMIN_EMAIL=${EMAIL}\nQA_ADMIN_PASSWORD=${password}\n`);
  console.log(`Test admin ${EMAIL} ready on staging project ${projectId(url)}; password saved to .env.test-accounts`);
})().catch((error) => { console.error("FAILED:", error.message); process.exit(1); });
