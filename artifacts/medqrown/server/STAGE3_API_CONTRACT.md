# Stage 3 API contract

All endpoints are JSON. Admin routes require the existing authenticated admin
session; student routes require the existing authenticated student session.
Unauthenticated requests return `401 {"message":"Not authenticated"}` (student
routes use the existing student-session message). Validation errors return
`400 {"message":"..."}` and missing records return `404 {"message":"..."}`.
Dates are ISO calendar dates (`YYYY-MM-DD`), not timestamps. All computed
membership/cohort current-date decisions use `Africa/Nairobi`.

## Cohorts

- `GET /api/admin/cohorts` → `{ current: Cohort|null, next: Cohort|null, history: Cohort[] }`.
  Cohort: `{ id, startDate, endDate, createdAt, updatedAt }`. History contains
  cohorts before current. On startup and reads, the backend ensures current
  and next cohort records exist. Initial cohort begins `2026-09-28`.
- `PATCH /api/admin/cohorts/:id` body `{ startDate, endDate, reason }` →
  updated `Cohort`. Only current or next can be edited, `reason` is required,
  and endDate must be the clamped calendar-month anniversary minus one day.
  Returns `403` if the cohort is historical/future beyond next and `409` if
  another cohort already uses the requested start date.

## Classes

- `GET /api/admin/classes` → `Class[]`, each
  `{ id, name, description, status, createdAt, updatedAt, studentIds, studentCount }`.
- `POST /api/admin/classes` body `{ name, description?, status? }` →
  `201 Class`; status defaults to `active`. Status is `active|archived`.
- `PATCH /api/admin/classes/:id` body with any subset of
  `{ name, description, status }` → updated class.
- `DELETE /api/admin/classes/:id` archives the class (`status: "archived"`),
  preserving its student assignments and history.
- `PUT /api/admin/classes/:id/students` body `{ studentIds: number[] }`
  replaces the class's complete student assignment set →
  `{ classId, studentIds }`. An empty list removes all assignments.

## Memberships

- `GET /api/admin/memberships?status=invited|active|grace|expired&search=text`
  → `Membership[]`; either query parameter is optional. Each item includes
  `{ studentId, studentName, studentEmail, cohortId, startDate, endDate,
  cohortStartDate, cohortEndDate, status, graceEndDate, pendingPayment,
  classes, createdAt, updatedAt }`. Classes are `{ id, name, status }`.
- `PUT /api/admin/memberships/:studentId` body
  `{ cohortId, startDate?, endDate?, reason }` → the saved Membership shape
  returned by the student membership endpoint. Dates default to the selected
  cohort dates. `reason` is mandatory; every create/update appends an audit
  event with admin, reason, and before/after values.
- `GET /api/admin/memberships/:studentId/audit` → newest-first audit entries:
  `{ id, studentId, adminId, adminName, reason, previousValues, newValues, createdAt }[]`.
- Membership status is computed, not manually set: `invited` before startDate,
  `active` through endDate, `grace` through endDate plus configured grace days,
  then `expired`. `pendingPayment` is an independent boolean based on any
  pending payment entry.
- `GET /api/student/membership` → the student's Membership shape, or `null`.
- `GET /api/student/classes` → assigned classes:
  `{ id, name, description, status, joinedAt }[]` (active and archived).

## Pricing and payment entries

- `GET /api/admin/settings` → `{ individualPrice, groupPrice, paybill,
  accountNumber, bankName, graceDays, updatedAt }`. Initial values are
  `700`, `2500`, `"542542"`, `"00106133326150"`, `"I&M Bank"`, and `3`.
- `PATCH /api/admin/settings` accepts any subset of
  `{ individualPrice, groupPrice, paybill, accountNumber, bankName, graceDays }`
  and returns the complete updated settings object. Prices are non-negative
  integer KSh values; graceDays is an integer from 0 through 90.
- `POST /api/admin/payments` body
  `{ studentId, code, plan, amount, source }` (`plan` is `Individual|Group`,
  amount is a non-negative integer) → `201 PaymentEntry`. New entries have
  `status: "pending"` and no reviewer/reason.
- `GET /api/admin/payments` → payment groups sorted newest first:
  `{ code, entries: PaymentEntry[] }[]`. PaymentEntry fields are
  `{ id, studentId, studentName, studentEmail, code, plan, amount, source,
  status, reviewerId, reviewerName, reason, createdAt, reviewedAt }`.
  This Stage 3 API records and groups entries only; payment approval/review
  workflows are intentionally not included.