// Runs the renewal-reminder job once (the server also runs it every 15 minutes).
//   EMAIL_OUTBOX_ONLY=true npx tsx scripts/run-reminders.ts
import "../server/tz";
import "dotenv/config";
import { sendDueRenewalReminders } from "../server/stage5";
import { pool } from "../server/db";

sendDueRenewalReminders()
  .then(() => console.log("Renewal reminder job finished"))
  .catch((error) => { console.error("Renewal reminder job failed:", error); process.exitCode = 1; })
  .finally(() => pool.end());
