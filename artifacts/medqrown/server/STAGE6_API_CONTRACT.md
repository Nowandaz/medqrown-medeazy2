# Stage 6 Exams API

All datetimes accepted by exam setup are Nairobi wall-clock values (`YYYY-MM-DDTHH:mm[:ss]`) or ISO datetimes with an explicit zone. Unzoned inputs are interpreted as `Africa/Nairobi` (UTC+03:00). Exam `classId`, class membership, membership status, attempt ownership, and result ownership are enforced server-side.

## Admin

- `POST /api/exams` — creates an exam. Body: `{ title, classId, opensAt, closesAt, durationMinutes, maxAttempts?, instructions?, autoMarkEnabled?, status? }`. Defaults: `maxAttempts: 1`, `autoMarkEnabled: true`, `status: "draft"`. Setup rejects an inactive/missing class, invalid/reversed window, and invalid duration or attempt limit.
- `PATCH /api/exams/:id` — updates exam setup fields; `classId`, schedule, duration, instructions, auto-mark and status are validated.
- `POST /api/admin/exams/:id/results/release` — `{ released: boolean }`. A first release transactionally enables results and creates one in-app notification for each student with a submitted attempt. Notification payload contains `type`, `examId`, `route`, and `pushReady` title/body/url data. `released: false` hides result access without deleting attempts or notifications.
- `GET /api/exams/:examId/rankings` remains admin-only.

## Student

- `GET /api/student/classes/:classId/exams` — only for authenticated students linked to the class. Returns each active class exam with `opensAt`, `closesAt`, `durationMinutes`, own `attemptsUsed`, `state` (`upcoming`, `open`, `results_pending`, `results_available`), `membershipStatus`, and `canOpen`. Expired members can see locked exams and their state; this response contains no cohort rankings, class averages, or other students' data.
- Existing `POST /api/student/exams/:id/enter`, `POST /api/student/start-exam`, `POST /api/student/save-answer`, `POST /api/student/next-question`, `POST /api/student/update-timer`, and `POST /api/student/submit-exam` remain in place. Class exams require linked class membership plus Active/Grace membership and an open schedule to enter or write. Answers are server-checked against the attempt's current question. `start-exam` returns server-calculated `deadlineAt = min(start + duration, close)`.
- `GET /api/student/exams/:id/results` returns only the authenticated student's latest submitted attempt, with answer breakdown and correct answers only after release. `GET /api/student/results` remains bound to the authenticated exam-student session and also respects manual release.
- `POST /api/student/exams/:id/request-reattempt` remains available for an exhausted attempt while the exam is open; approvals/declines remain under `GET /api/exams/:examId/reattempt-requests` and `POST /api/exams/:examId/reattempt-requests/:id/:decision` (admin).

Attempt expiration is server-driven: a startup sweep and 15-second recurring sweep submit in-progress attempts at the earlier of duration expiry and exam close, independently of client requests. Save/advance/submit handlers also invoke a due sweep before processing.

## Security checks

- Run the lightweight source-level checks with `npx tsx --test server/stage6-security.test.ts`.
- Result lookup binds exam ID **and** `req.student.id`, selects that student's submitted attempt, and never accepts a student ID from the request.
- Exam entry/writes require class roster membership, Active/Grace membership, active exam status, and an open interval.
- Attempt writes require ownership of the session's attempt; answer writes additionally require the attempt's current question to match the question ID.
- Student exam-list and result contracts contain no rankings or class-level aggregates.