# Stage 4 API contract

Admin endpoints use the existing authenticated admin session; set-password is
public. JSON validation errors return `400 { message, errors? }`, missing
classes return `404`, and unauthenticated admin calls return `401`.

- `GET /api/admin/classes/:classId/members` → member rows with normalized
  `phone`, `activated`, `invited`, `inviteExpiresAt`, `membershipEndDate`, and
  `inviteStatus` (`activated|invited-not-activated`).
- `POST /api/admin/classes/:classId/members/import-preview` body
  `{ csv }` → `{ rows, errorReport, verifiedDefault: true }`. `csv` must have
  exactly `full_name,email,phone,mpesa_code,plan` as its header. Rows include
  `rowNumber`, normalized values, `classification` (`New student`,
  `Existing student`, or `Error`), and explicit `errors`.
- `POST /api/admin/classes/:classId/members/import-confirm` body
  `{ csv, verified? }` (verified defaults to `true`) → `{ imported, rows,
  errorReport, verified }`. Revalidates inside the transaction; valid rows are
  imported while invalid rows are skipped and returned in the error report.
  Verified entries are recorded as `paid` and receive membership immediately;
  unverified entries are `pending`. Group code is limited to four total uses,
  Individual to one. Codes are uppercased and whitespace removed; accepted
  format is exactly ten A-Z/0-9 characters. Phone accepts Kenyan local or
  country-code formats and is stored as `+254...`.
- `POST /api/admin/classes/:classId/members` body
  `{ fullName, email, phone, complimentary?, note?, endDate?, code?, plan?,
  verified? }` → `201` created/assigned member. Complimentary requires
  `complimentary: true`, non-empty `note`, and `endDate`; paid entries require
  a valid code and plan and follow the same validation/payment rules as CSV.
- `POST /api/admin/students/:studentId/resend-invite` → `{ ok, expiresAt }`;
  replaces the stored token hash and invalidates the previous invite.
- `POST /api/student/set-password` body `{ token, password }` → sets a bcrypt
  password, consumes the single-use seven-day invite atomically, starts the
  student session, and returns `{ message, redirectTo: "/student/dashboard" }`.

Cross-source code matching canonicalizes codes before matching entries,
rejects plan mismatch, duplicate student/code use, and usage above the plan
limit. No payment approval queue actions are implemented here.