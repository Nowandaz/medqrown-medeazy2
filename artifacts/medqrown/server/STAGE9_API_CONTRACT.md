# Stage 9 public site API contract

## General homepage contact

- `POST /api/contact` accepts `{ name, email, message }` and optional
  `{ context }`. The legacy contact form's optional `institution` or `subject`
  value is also accepted as context; `website` is a honeypot. Name is limited
  to 200 characters, email to 254, context to 300, and message to 5,000.
- Requests are limited to five per IP per hour. A valid message is persisted
  independently of SMTP availability; when SMTP is configured, an owner
  notification is attempted. Success returns `{ ok, message,
  notificationStatus }`, where notification status is `sent`, `failed`, or
  `pending`. Server/SMTP details are never returned.
- This endpoint is separate from the institution inquiry API. The existing
  Stage 2 guard on `POST /api/inquiries` and institution inquiry routes remain
  unchanged.

## Registration and waitlist

- `GET /api/site-content` retains `{ settings, faq }`. `settings.registrationOpen`
  is a boolean. `settings.googleFormUrl` is returned only while registration is
  open.
- `GET /api/admin/site-settings` and `PUT /api/admin/site-settings` remain
  admin-session protected. Settings can include `registrationOpen` (boolean)
  and `googleFormUrl` (HTTPS `forms.gle` or Google Forms URL). Opening
  registration requires a valid saved URL. Changing Closed → Open attempts one
  automatic invitation email for each waitlist entry not previously delivered;
  failures remain eligible for a future attempt. Startup sends no email.
- `POST /api/waitlist` accepts `{ name, email, phone }` only while registration
  is closed, validates each value, and deduplicates by case-insensitive email.
  It returns `{ ok, alreadyRegistered }` without echoing stored contact details.
- Admin-only `GET /api/admin/waitlist?search=...` returns matching entries;
  `GET /api/admin/waitlist/export.csv` downloads the full CSV;
  `DELETE /api/admin/waitlist/:id` removes one entry.
- `GET /api/admin/waitlist/resend-count` returns `{ count }`. Confirm that
  displayed count with `POST /api/admin/waitlist/resend` body
  `{ confirmedCount }` while registration is open; a changed count returns
  409. Success returns recipient, sent, failed and SMTP-configuration counts.

## No-AI public demo

- `GET /api/demo/exams` and `GET /api/demo/exams/:id/questions` retain the
  existing subject and question contracts. The question listing does not expose
  SAQ model answers or marking points.
- `POST /api/demo/saq-submit` accepts `{ examId, questionId, sessionId,
  response }` and returns `{ modelAnswer, markingPoints }` from the authored
  question. It stores only event/session metadata and response length, not the
  answer text or visitor identity. If authored answer/points are missing it
  returns 409 with an explicit error. This endpoint does not invoke AI or
  require an account.
- Existing admin question create/patch routes support `modelAnswer` and
  `markingPoints` text fields for SAQ authoring.

## Editable legal and FAQ defaults

Stage 9 inserts Terms of Service, Privacy Policy and consultancy FAQ entries
only when their slug/question is absent. Existing pages and FAQ rows are never
updated by migration; the existing admin page and FAQ routes remain the editing
surface.