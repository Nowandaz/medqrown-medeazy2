# Stage 5 API contract

All `/api/student/*` routes below require the existing student session and
derive the student id from that session. Renewal submission additionally
requires an existing membership, a membership end date within seven days or
already passed, and a class-student association. Admin payment routes require
the existing authenticated admin session. Validation errors use
`400 { message, errors? }`; missing sessions return `401`.

## Student

- `GET /api/student/renewal` → `{ available, message?, membership }`.
  `available` becomes true from seven days before the membership end date and
  remains true through Grace and Expired.
- `GET /api/student/renewal/payment-details` → configured `paybill`,
  `accountNumber`, `bankName`, `individualPrice`, `groupPrice`, `graceDays`,
  `accountNote`, and `groupInstructions`.
- `POST /api/student/renewal` body `{ code, plan }` → `201` with the pending
  payment entry and `message: "Pending payment verification"`. Codes are
  uppercased, whitespace is removed, and exactly ten A-Z/0-9 characters are
  required. Individual usage is limited to once per code; all uses are capped
  at four per code and duplicate student/code entries are refused, including
  entries already rejected. Submission uses an advisory lock and records
  `source: "in_app"` and the target cohort.
- `GET /api/student/notifications` → newest-first in-app notification rows,
  including prepared push payloads for renewal reminders.

## Admin payments

- `GET /api/admin/payments?status=Pending|Flagged|Approved|Rejected` → grouped
  code groups, including entries and named students, email, phone, membership
  status, source(s), amounts, plan(s), completeness, reviewer/reason/date, and
  computed flags. Omitting status returns all groups. A Group is flagged after
  48 hours if incomplete; mixed plans and multiple Individual uses are flagged.
- `PATCH /api/admin/payments/:entryId` body `{ code?, plan? }` → edits a
  non-approved entry and recalculates the price from settings. The canonical
  code format, duplicate-student rule, Individual-once rule, and four-use cap
  are checked transactionally. Edited codes automatically group with matching
  existing entries.
- `POST /api/admin/payments/approve` body
  `{ entryIds: number[], endDate?: "YYYY-MM-DD" }` → approve selected pending
  entries. Send every id in a code group to approve all, or a subset to approve
  selected people. Membership extensions follow master prompt section 5.6 and
  an optional admin end date overrides the computed end date. Reviewer, review
  timestamp, membership audit, in-app notification, and email are recorded.
- `POST /api/admin/payments/reject` body
  `{ entryIds: number[], reason: string }` → reject selected pending entries
  (all ids in a code group rejects the group). A reason is mandatory and
  recorded with reviewer and date; students receive an in-app notification and
  email and may submit a new code.

Legacy `POST /api/admin/payments` manual entry and Stage 4 CSV import retain
their existing contracts and share the canonical code rules. They remain
admin-only.

## Scheduled renewal reminders

The server worker runs at startup and every 15 minutes; it selects Africa/
Nairobi date-based reminders at 7, 3, and 0 days before membership end.
`medqrown_reminder_log` has a unique student/end-date/day key for idempotency.
Pending or approved entries targeting the next cohort suppress reminders.
Each reminder creates an in-app notification and sends email when SMTP is
configured. The notification payload includes a Stage 7-ready `push` object.
The email contains payment details, renewal and feedback links, and savings
calculated from the current configured prices when the student's latest
approved payment was Individual.