# Stage 11 — email administration API

All administrative routes below require the existing admin session.

## Editable templates

- `GET /api/admin/settings/email-templates`
  - Returns an array of `{ templateKey, name, subject, body, updatedAt }`.
- `PATCH /api/admin/settings/email-templates/:templateKey`
  - JSON body: `{ "subject": "…", "body": "…" }`
  - Returns the updated template. Subject is limited to 500 characters; body is
    limited to 20,000 characters.
- The ten seeded keys are `invite_set_password`,
  `existing_student_enrolled`, `renewal_7_days`, `renewal_3_days`,
  `renewal_last_day`, `payment_approved`, `payment_rejected`, `announcement`,
  `waitlist_registration_open`, and `password_reset`.
- Templates interpolate `{student_name}`, `{cohort_end}`, `{renew_link}`,
  `{paybill}`, `{account_number}`, `{reason}`, `{reset_code}`,
  `{announcement_title}`, `{announcement_message}`, and
  `{announcement_link}`. Additional values used by specific callers are
  interpolated by their corresponding named placeholders. Values are escaped
  for HTML in the generated message.

## Email log

- `GET /api/admin/settings/email-log?page=1&pageSize=25&search=...&templateKey=...&status=sent|failed`
- Returns `{ items, page, pageSize, total }`. Each item contains `id`,
  `recipient`, `templateKey`, `status`, `error`, and `createdAt`. Page size is
  limited to 100. `search` matches recipient and template key.
- Failed entries include SMTP configuration/delivery errors. Custom outbound
  messages use descriptive keys such as `custom:website_contact` or
  `exam_template:3`.

## Class Emails

- `POST /api/admin/classes/:classId/emails`
- Send all class members:
  `{ "templateKey": "announcement", "confirmedCount": 12 }`
- Send selected class members:
  `{ "templateKey": "announcement", "studentIds": [3, 9], "confirmedCount": 2 }`
- Send custom text instead of a template:
  `{ "subject": "Update", "body": "Hello {student_name}", "confirmedCount": 12 }`
  (custom subject/body may also be combined with `studentIds`).
- `studentIds`, when present, must be a non-empty array of positive IDs, and
  every selected student must belong to the requested class. The server checks
  `confirmedCount` against the current recipient count before sending and
  returns HTTP 409 with the current `count` if it changed or is empty.
- Returns `{ classId, total, sent, failed, results }`; each result includes
  `studentId`, `email`, `status`, and an `error` when delivery failed.