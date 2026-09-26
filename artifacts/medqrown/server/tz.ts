// Must be the first import of every server entry point. The database stores many
// timestamps without a time zone as UTC; node-postgres reads those in the process's
// local zone, so the process must run in UTC (as it does on Render) on every machine.
process.env.TZ = "UTC";
