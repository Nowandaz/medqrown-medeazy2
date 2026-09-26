# Stage 8 student API contract

All `/api/student/*` routes in this contract require the existing authenticated
student session. The student ID is always derived from that session; clients
cannot select another student. Admin routes and data remain separate and
admin-only. Dates are ISO values; membership dates use `YYYY-MM-DD`.

## Dashboard

- `GET /api/student/dashboard` returns:
  - `membership`: `null` or `{ status, startDate, endDate, graceEndDate,
    daysRemaining, pendingPayment }`. `daysRemaining` is calendar days until
    the membership end date and is zero once that date has passed.
  - `pendingPayment`: the newest pending payment entry for this student, or
    `null`, with `{ id, code, plan, amount, status, createdAt }`.
  - `nextExam`: the next scheduled exam in one of the student's assigned
    active classes, or `null`, with `{ id, title, opensAt, closesAt, classId,
    className, countdownSeconds }`. This is schedule metadata only and does
    not grant exam access.
  - `latestAnnouncement`: newest announcement among the student's assigned
    classes, or `null`.
  - `recentResults`: at most four newest released, submitted results belonging
    to this student.

## Results

- `GET /api/student/results/summary` → `{ totalResults, averageScore,
  bestScore, passRate, passThreshold }`. Score values are percentages;
  passThreshold is 50. Only this student's submitted attempts for released
  exams are counted.
- `GET /api/student/results/history` → newest-first rows containing
  `{ attemptId, examId, examTitle, className, submittedAt, earnedMarks,
  totalMarks, scorePercent }`, limited to this student's released results.

No class averages, rankings, or other students' records are returned.

## Profile

- `GET /api/student/profile` → `{ id, name, email, phone, avatarKey,
  membership, paymentHistory, changeRequests }`. Each payment history row
  contains its own `{ id, code, plan, amount, source, status, reason,
  submittedAt, reviewedAt, planStartDate, planEndDate }`. The membership
  summary is `null` or `{ status, startDate, endDate, graceEndDate }`.
- Existing `POST /api/student/profile/avatar` updates the authenticated
  student's avatar using an available avatar key.
- Existing `GET /api/student/profile/requests` and
  `POST /api/student/profile/requests` retain the official-detail change
  request workflow; requests are visible only to the owning student. Admin
  review remains under `/api/admin/profile-change-requests`.

The dashboard route replaces the prior unit-centric response at the same
student URL. Existing membership, class, renewal, announcement, and exam routes
remain in place; exam content access continues to be governed by the existing
Stage 6 membership, class, and schedule checks.