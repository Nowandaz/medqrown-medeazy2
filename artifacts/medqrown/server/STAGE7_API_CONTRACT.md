# Stage 7 API contract

All routes use the existing session authentication. Admin routes require an
admin session; student routes require a student session. IDs and timestamps are
server-owned.

## Announcements

- `POST /api/admin/classes/:classId/announcements`
  body `{ title, message, link? }`; creates an announcement and delivers
  in-app/email/browser push to Active and Grace class members. Returns the
  announcement and `delivery` counts (`recipients`, `inAppSent`, `emailSent`,
  `emailFailed`, `emailPendingConfiguration`, `pushSent`,
  `pushPendingConfiguration`).
- `GET /api/admin/classes/:classId/announcements` → announcement history newest
  first.
- `PATCH /api/admin/classes/:classId/announcements/:id`
  body `{ title, message, link? }` → updated announcement.
- `DELETE /api/admin/classes/:classId/announcements/:id` → `{ deleted: true }`.
- `GET /api/student/classes/:classId/announcements` → full announcement
  history newest first for any enrolled student, including expired members.

## Student notifications and push subscription

- `GET /api/student/notifications` (Stage 5) → latest 100 notifications,
  including `readAt`.
- `GET /api/student/notifications/unread-count` → `{ count }`.
- `PATCH /api/student/notifications/:id/read` → `{ id, readAt }`.
- `PATCH /api/student/notifications/read-all` → `{ updated }`.
- `GET /api/student/push/config` → `{ enabled, publicKey }`; when VAPID is not
  fully configured, reports `enabled: false` and `publicKey: null`.
- `PUT /api/student/push/subscription` body
  `{ subscription: PushSubscriptionJSON }`; upserts the authenticated student's
  W3C subscription. Returns `204`. If VAPID is not configured, returns `503`
  with `Browser push is disabled pending VAPID configuration`.
- `DELETE /api/student/push/subscription` body `{ endpoint }` → `{ deleted }`.

Server configuration uses `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (base64url
P-256 private scalar), and `VAPID_SUBJECT` (for example a `mailto:` URI).
SMTP delivery uses the existing `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, and
`SMTP_PASS` environment settings. No browser manifest, service worker, or
permission prompt is introduced by this backend-only change.

## Named class feedback

- `POST /api/student/classes/:classId/feedback` body
  `{ message, examId? }` → created feedback. Omit `examId` for general feedback;
  provide an exam belonging to that class for exam feedback. Any enrolled
  student may submit, independent of membership expiry.
- `GET /api/admin/classes/:classId/feedback?type=general|exam&examId=&from=&to=`
  → named feedback newest first. Filters are optional; dates are inclusive
  `YYYY-MM-DD` bounds.
- `GET /api/admin/feedback/latest?limit=10` → latest named feedback across
  classes for the admin dashboard (`limit` 1–100).

## Existing event push dispatch

On configured VAPID keys, Stage 5 payment approval/rejection and renewal
reminders, and Stage 6 results releases now dispatch browser push from their
push-ready notification payloads. The Stage 5 payment and Stage 6 release
responses include `pushSent` and `pushPendingConfiguration`; renewal delivery
channel outcomes are persisted in the existing reminder log.