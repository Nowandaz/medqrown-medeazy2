/** All student/admin-facing dates are shown in Nairobi time, e.g. "Sat 26 Sep, 8:00 pm". */
const nairobiFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Nairobi",
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

export function formatNairobi(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return nairobiFormat.format(date).replace("Sept", "Sep");
}

/** "2026-09-28" -> "28 Sep 2026" (calendar dates, no time-zone shift). */
export function formatCalendarDate(value: string | null | undefined, withYear = true): string {
  const match = typeof value === "string" ? value.match(/^(\d{4})-(\d{2})-(\d{2})/) : null;
  if (!match) return "—";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const [, year, month, day] = match;
  return `${Number(day)} ${months[Number(month) - 1]}${withYear ? ` ${year}` : ""}`;
}

/** Display name for a cohort, e.g. "Cohort 28 Sep – 27 Oct 2026". */
export function cohortName(cohort: { startDate?: string; endDate?: string } | null | undefined): string {
  if (!cohort?.startDate || !cohort?.endDate) return "None";
  const sameYear = cohort.startDate.slice(0, 4) === cohort.endDate.slice(0, 4);
  return `Cohort ${formatCalendarDate(cohort.startDate, !sameYear)} – ${formatCalendarDate(cohort.endDate)}`;
}

/** Value for <input type="datetime-local"> showing Nairobi wall-clock time ("YYYY-MM-DDTHH:mm"). */
export function toNairobiInput(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 16);
}
