# Stage 10 Admin API contract

All `/api/admin/*` endpoints below require the existing admin session. Responses are JSON unless marked CSV. No endpoint in this stage exposes cross-student analytics to student sessions.

## Dashboard and class administration

- `GET /api/admin/dashboard` — `{ currentCohort, activeMembers, graceMembers, pendingPayments, flaggedPayments, upcomingExams, latestFeedback }`. Flagged payments are pending entries whose transaction code is duplicated.
- `GET /api/admin/classes/overview` — class rows with `memberCount` and `nextExam`.
- `GET /api/admin/classes/:classId/overview` — `{ class, memberCounts, upcomingExams, recentAnnouncements }`.
- `GET /api/admin/classes/:classId/members` — master member array.
- `GET /api/admin/classes/:classId/members/export.csv` — same filtered table as CSV.
- `GET /api/admin/students` — all students and their classes.

Member endpoints accept `search`, `status`, `sort` and `direction=asc|desc`. Status values: `active`, `grace`, `invited`, `expired`, `unassigned`. Sort values: `name`, `email`, `phone`, `latestPlan`, `status`, `membershipEndDate`, `inviteStatus`, `examsTaken`, `averageScore`.

## Identity change requests

- `GET /api/admin/students/change-requests?status=pending|approved|declined` — identity requests.
- `PATCH /api/admin/students/change-requests/:id` — body `{ decision: "approved"|"declined", reviewReason?: string|null }`. Approval updates only name, email, or phone; unsupported fields are rejected.

## Exam analytics

- `GET /api/admin/exams/:examId/analytics?minMark=&maxMark=` — submitted-attempt counts, per-question correctness/mark/answered metrics, MCQ option distributions and SAQ responses with student name and model answer. Each submitted attempt contributes at most once per question.
- `POST /api/admin/exams/:examId/ai-analysis` — body `{ questionIds: number[] }`; calls the existing configured AI provider service and saves returned examiner analysis.
- `GET /api/admin/exams/:examId/ai-analysis` — saved analyses.
- `GET /api/admin/exams/:examId/revision-pack` — printable JSON summary with most-missed questions, option breakdowns, incorrect answer samples and saved analyses.

## Engagement

- `POST /api/engagement/events` — anonymous body `{ sessionId, eventType, page?, source? }`; public event types are `page_view`, `demo_start`, `demo_complete`, `signup_click`. `page` is required for `page_view` and supports `home`, `demo`, `signup`, `waitlist`, `classes`, `other`. The `src` query parameter is accepted as a source fallback.
- `POST /api/waitlist` accepts optional `source` (or `?src=`) and `sessionId` for first-party attribution.
- `GET /api/admin/engagement?from=YYYY-MM-DD&to=YYYY-MM-DD` — range-filtered funnel, source breakdown, cohort membership/payment splits, and existing demo question statistics.