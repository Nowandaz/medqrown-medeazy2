# MedQrown MedEazy — Master Build Prompt

## 0. Context and ground rules

MedQrown MedEazy is being refocused on ONE purpose: running our paid monthly **Academic Consultancy** for medical students. Students pay monthly (individually or as a group of 4), take a weekly Mock CAT on this website, and receive announcements and support through it.

Rules for this job:

1. **Modify the existing codebase.** Do not start a new project, change the tech stack, or rebuild parts that already work: authentication, sessions, exam taking, autosave, marking, results pages, email sending (Gmail SMTP), admin authentication, theming (light/dark), and the existing visual style.
2. **Work in the stages below, in order.** After each stage, test it and give me a short report of what changed before moving on.
3. **Keep admin-side and student-side strictly separate.** Anything described as admin-only must never appear on the student side, in any form.
4. **Hidden features are switched off, not deleted.** Where this prompt says to hide a feature, put it behind a feature flag set to OFF. When a flag is OFF: remove it from all navigation and menus, redirect its routes to the relevant dashboard, and make its API endpoints return HTTP 403.
5. **Do not perform destructive actions other than those in Stage 1** without asking me first.
6. **Timezone:** Africa/Nairobi for all dates, times, schedules and reminders. **Currency:** KSh.
7. **Mobile:** every page and dialog must work on a ~390px-wide screen as well as desktop.
8. If anything in this prompt is technically impossible or conflicts with the existing code, stop and ask me rather than guessing.

---

## 1. Backup and data reset

1. Take a **full backup/export of the Supabase database** before changing anything. Tell me where it is stored and how to restore it.
2. Then **delete** all of the following:
   - All student accounts (including real ones — we have no active cohort yet)
   - Sign-up requests, exam access requests, reattempt requests, identity change requests
   - Units, exams, exam questions, attempts, submissions, answers, marks, results, rankings, exam feedback
   - Self-tests, live rooms, self-test question reports
   - Institution inquiries
   - Any QA/test data, including the test FAQ entry and QA units/universities
3. **Keep:**
   - Admin accounts and admin roles
   - AI provider configurations
   - Email templates (they will be updated in Stage 11)
   - General settings
   - Homepage demo subjects and demo questions (Anatomy and Biochemistry)
   - Legal pages and real FAQ entries (they will be rewritten in Stage 9)

---

## 2. Remove, hide and secure

### 2.1 Hide behind feature flags (default OFF)
- Self-tests (student and admin)
- Live rooms (student and admin)
- Admin "Reports" page (self-test question reports)
- Units, unit catalogue, "Enrol Now", unit enrolment
- Per-exam "Request Access" and the exam access request queue
- School email domain eligibility ("Approved school domains")
- Settings → Universities, and the university field on sign-up
- Admin "Sign-Up Requests" tab
- Institutions page, institution inquiry form, and Site Content → Inquiries
- Public self-signup (see Stage 9.6 for what the signup page shows instead)
- Homepage demo video slide (Site Content → Demo Media → Demo Video)

### 2.2 Security
- **Admins must never see student passwords or password hashes.** Remove the password line from every admin list, card, table and export.
- **Remove the generated-password logic entirely**, including "Send New", "Resend All" and any email that contains a password. Students set their own password only through a set-password link (Stage 4.4).
- Confirm that passwords are stored only as secure hashes (bcrypt or argon2). If not, fix it.
- Set-password and password-reset links must be single-use and expire.
- Keep the existing Forgot Password flow for students and admins.

---

## 3. Core data model

### 3.1 Cohorts (global)
- A cohort is a one-month membership period. Cohorts are **global** — the same dates apply to every class.
- Stored in Settings → Cohorts: name (e.g. "Cohort 28 Sep – 27 Oct 2026"), start date, end date.
- **The first cohort starts on 28 September 2026.**
- Cohort length is one calendar month: `end = start + 1 month − 1 day`.
- **Automatic rollover:** the next cohort is created automatically so that `next.start = previous.end + 1 day` with the same one-month rule. There must always be a "current" cohort and a "next" cohort.
- The admin can edit the dates of the current and next cohort and view past cohorts.

### 3.2 Membership (per student, not per class)
- Each student has **one membership** with a start date, an end date, and a status.
- **One payment covers all classes the student belongs to.**
- Statuses:
  - **Invited** — account created, password not yet set.
  - **Active** — `membership start ≤ now ≤ membership end`.
  - **Grace** — `membership end < now ≤ membership end + grace period`. Grace period is **3 days**, editable in Settings. During grace, the student has full access, and sees a banner: "Your membership has ended. Renew within X days to keep access."
  - **Expired** — after grace.
  - **Pending payment** — a renewal has been submitted and is awaiting admin verification (shown alongside the other status).
- **Expired students** can log in, see their dashboard, announcements and their **own past results**, but **cannot open or take any exam**. Exams show as locked with a "Renew to access" button.
- The admin can manually set or extend any student's membership end date (e.g. for someone who joins late after talking to us, or a complimentary month). Record who changed it and why.

### 3.3 Classes
- A class organises exams, announcements, feedback and members. The admin can create multiple classes.
- Fields: name, description, active/archived.
- A student can belong to more than one class.
- A student can access a class's content only if they are a member of that class **and** their membership is Active or in Grace.
- Classes do **not** have their own cohort dates or payments.

### 3.4 Payments
- Every payment entry records: student, M-Pesa code, plan (Individual or Group), amount, source (in-app renewal, CSV upload, manual), submitted date, status (Pending, Approved, Rejected), reviewer, review date, and rejection reason.
- Payments are grouped by M-Pesa code (Stage 5).

---

## 4. Adding students

### 4.1 First-time registration (outside the site)
New students register through our **Google Form** (linked from the homepage), where they pay first, then submit their details and M-Pesa code. The admin verifies payments and then uploads them via CSV. The site does not read the Google Form directly.

### 4.2 CSV upload
- Location: Admin → Classes → [class] → Members → **Upload CSV**. Uploaded students are added to that class.
- Required columns (header row exactly as below):

```
full_name,email,phone,mpesa_code,plan
Jane Wanjiku,jane@example.com,0712345678,SJK4ABC123,Group
John Otieno,john@example.com,0723456789,SJK4ABC123,Group
Amina Hassan,amina@example.com,0734567890,SJK4ABC123,Group
Brian Kamau,brian@example.com,0745678901,SJK4ABC123,Group
Mary Achieng,mary@example.com,0756789012,SJL9XYZ456,Individual
```

- `plan` must be `Individual` or `Group`. Normalise phone numbers to +254 format. Uppercase M-Pesa codes.
- Upload has a checkbox **"I have already verified these payments"**, ticked by default.
  - **Ticked:** rows are recorded as **Approved** payments immediately and the membership rules in 5.6 are applied straight away.
  - **Unticked:** rows go into the Payments queue as **Pending** for approval.
- Before importing, show a **preview** listing each row as: New student / Existing student / Error, with the reason for each error (invalid email, invalid code format, code already used the maximum number of times, plan mismatch with other entries of the same code, duplicate email in the file). Nothing is imported until I click **Confirm import**. Rows with errors are skipped and listed in a downloadable error report.
- CSV rows go through **the same M-Pesa code matching as in-app renewals** (Stage 5), so a friend added by CSV and an existing member who renewed in-app with the same code form one group.

### 4.3 What happens to each row on approval
- **Existing email:** membership is extended (rule 5.6) and they're added to the class if not already a member. Send the **"You're in for this cohort"** email.
- **New email:** an account is created with status **Invited**, added to the class, membership set (rule 5.6), and a **set-password invite** email is sent.
- Emails are matched case-insensitively. Never create duplicate accounts for the same email.

### 4.4 Invites
- The invite email contains a single-use **set-password link valid for 7 days**.
- After setting a password, the student is logged in and taken to their dashboard.
- Admin can **Resend invite** (generates a new link and invalidates the old one).
- Members tables show **"Invited – not activated"** for students who haven't set a password, so mistyped emails can be spotted.

### 4.5 Manual add
Admin → Classes → [class] → Members → **Add student**: full name, email, phone, and either an M-Pesa code + plan (treated like a CSV row) or **"No payment (complimentary / arranged with admin)"** with a required note and a membership end date.

---

## 5. Renewals and M-Pesa code matching

### 5.1 Settings (editable by admin)
- Individual price: **KSh 700 per month**
- Group price: **KSh 2,500 per month for exactly 4 students** (KSh 625 each)
- Paybill number: **542542**
- Account number: **00106133326150**
- Bank: **I&M Bank**
- Grace period: **3 days**

Plans are **only Individual (1 person) or Group (exactly 4 people)**. No groups of 2 or 3.

### 5.2 Student renewal flow
1. A **"Renew membership"** button appears on the student dashboard and on each class page from 7 days before their membership ends, and at all times during Grace and Expired status.
2. Clicking it opens a popup showing:
   - Paybill, account number (with a one-tap **Copy** button) and bank name
   - The note: "Please copy and paste the account number when paying via M-Pesa to avoid errors."
   - Prices for Individual and Group of 4
   - Group instructions: "One person pays KSh 2,500 for the group. Each of the 4 members must then enter the same M-Pesa code here (or be included in the registration form)."
3. The student chooses **Individual** or **Group of 4**, enters the **M-Pesa transaction code**, and submits.
4. Their status shows **"Pending payment verification"** until the admin reviews it.

There is **no** group leader role, no adding or confirming members, and no "I'm in a group" option. **Groups are formed only by matching identical M-Pesa codes.**

### 5.3 Code validation (in-app, CSV and manual entry)
- Exactly **10 characters**, uppercase letters A–Z and digits 0–9 only. Auto-convert input to uppercase and strip spaces.
- An **Individual** code can be used **once**, ever.
- A **Group** code can be used **at most 4 times**, ever (across in-app entries, CSV rows and manual entries combined).
- The same student cannot enter the same code twice.
- A code that has been used can never be reused for a later month.
- Clear error messages, e.g. "This code has already been used by 4 people. Please check your code or contact us."

### 5.4 Admin Payments queue
- Location: Admin → **Payments**. Tabs: **Pending**, **Flagged**, **Approved**, **Rejected**.
- Entries are **grouped by M-Pesa code**. Each group card shows: code, plan, expected amount, source(s), submission dates, and every person with **name, email, phone (tap-to-call on mobile)** and current membership status.
- Group completeness shown as **1/4, 2/4, 3/4 or 4/4**.
- **Flagged** automatically when:
  - Entries with the same code have different plans (some Individual, some Group)
  - An Individual code has more than one entry
  - A Group code is still incomplete **48 hours** after the first entry
- Admin actions:
  - **Approve all** in a code group
  - **Approve selected people** within a group (e.g. approve 3 of 4 while waiting for the 4th)
  - **Edit code** on a single entry (to fix a typo); the entry then re-matches to the correct group
  - **Change plan** on an entry
  - **Reject** an entry or a whole group, with a required reason shown to the student
- If part of a group was already approved, a later matching entry attaches to that same group and appears in Pending for approval.
- The student is notified of approval or rejection by **email and in-app notification**. A rejected student can submit again.

### 5.5 Group scenarios this must handle
- A new group of 4 registers via the form → admin uploads 4 CSV rows with the same code → one group of 4/4.
- An existing group of 4 renews → each member enters the same code in-app → one group of 4/4.
- An existing member renews with 3 new friends → the member enters the code in-app, the friends register via the form and are uploaded by CSV with the same code → one group of 4/4.
- Four existing individual members form a group → each enters the same code in-app.
- A group member switches to Individual → they simply renew as Individual with their own code.
- One member mistypes the code → they appear alone as a 1/4 group and get flagged after 48 hours → admin calls them and edits the code → they join the right group.

### 5.6 Membership rule on approval
- If the student's membership is **Active or in Grace**: new end date = **end of the next cohort** after their current end date.
- If the student is **new, Invited without membership, or Expired**: membership = **the current cohort** (start and end), or the **next cohort** if today is before the current cohort's start date or within the last 3 days of the current cohort.
- The admin can override the resulting end date before approving.

### 5.7 Renewal reminders (automatic, scheduled job)
- Sent at **7 days before**, **3 days before**, and **on the day** the student's membership ends.
- Delivered by **email + in-app notification + browser push**.
- Content: membership end date, payment details, a **Renew** link, and a link to leave feedback.
- For students whose **most recent approved payment was Individual**, add this message:
  "MedEazy is cheaper with friends! Join with 3 friends and save about 11% (KSh 75 each per month)."
  Calculate the percentage and amount from the prices in Settings, don't hard-code them.
- **Do not send** a reminder to anyone who has a Pending or Approved payment for the next cohort.
- Log every reminder sent.

---

## 6. Exams

### 6.1 Structure and access
- Exams belong to a class.
- A student can see and take an exam if they are a member of that class **and** their membership is Active or in Grace. There are **no access requests**.
- Expired students see the exam as locked with "Renew to access".

### 6.2 Creating an exam (admin)
The **Create Exam** dialog must include:
- Title
- Class
- Open date and time
- Close date and time
- Duration in minutes (e.g. 30)
- Maximum attempts (default **1**)
- Instructions shown before the exam starts

### 6.3 Scheduling
- Exams **open and close automatically** at the set times.
- Before opening, students see the exam with a countdown ("Opens Saturday 8:00 pm").
- A student's attempt ends at whichever comes first: their duration runs out, or the exam's close time.
- Any attempt still in progress at that point is **auto-submitted** with the answers saved so far.
- After close, the exam shows "Closed – results pending" until results are released.

### 6.4 Taking an exam (student)
- **Remove auto-advance completely.**
- Each question has a **Next** button. Students **cannot go back** to earlier questions. The instructions page must state this clearly.
- The last question shows a **Submit** button with a confirmation dialog ("You can't change your answers after submitting").
- Keep answer autosave, and keep the attempt resumable after a page refresh within the time limit.
- **Fix the attempt counter bug:** the instructions page showed "Attempt 2 of 1". Attempts used must never exceed the maximum, and the count must stay correct after resets and approved reattempts.

### 6.5 Marking and results
- MCQs are marked automatically on submission.
- Keep **"Auto-Mark SAQ on Submission"** (AI marking) available and **on by default**. Current CATs use 1-mark SAQs.
- **Results are released manually** by the admin (keep the existing Hide/Release Results control). Until then, students see "Results pending".
- When results are released, students get an **in-app + push notification**.
- **Students only ever see their own results**: their score, per-question breakdown, correct answers and explanations. They never see rankings, positions, other students' scores or class averages.

### 6.6 Reattempts
Keep reattempt requests: a student who has used all attempts on an exam that is still open can request one extra attempt, which the admin approves or declines under the exam's Marking tab.

---

## 7. Announcements, notifications and feedback

### 7.1 Announcements
- Admin posts an announcement to a class: title, message, optional link (e.g. a Google Meet link).
- Delivered to all Active and Grace members of that class by **in-app notification + email + browser push**.
- Students see all announcements for their classes in the class's **Announcements** section, newest first.

### 7.2 Notifications
- Student notification bell in the header with an unread count.
- In-app notifications for: announcements, payment approved/rejected, renewal reminders, results released.
- **Browser push:** after login, show a friendly prompt explaining why notifications help (announcements, reminders, results) before triggering the browser's permission request. Never trigger the permission request on first page load.
- Add a **web app manifest and service worker** so the site can be installed and receive push notifications.
- For iPhone users, show the hint: "Add MedEazy to your Home Screen to get notifications."
- If a student declines push, email and in-app still work.

### 7.3 Feedback
- Feedback is **always named** (never anonymous).
- Students can send **general feedback** in each class at any time, and keep **per-exam feedback** after an exam.
- Admin sees all feedback per class, filterable by exam, general, and date, and on the Dashboard as "Latest feedback".

---

## 8. Student side

### 8.1 Navigation
Replace the current sidebar (Dashboard, My Units, Self-tests, Live rooms, Past Exams, Stats, Profile) with exactly:

1. **Dashboard**
   - Membership status, end date and days left
   - **Renew membership** button (per 5.2)
   - Pending payment status, if any
   - Countdown to the next exam across their classes
   - Latest announcement
   - Their most recent results
2. **My Class**
   - Class switcher if they belong to more than one class
   - **Exams:** upcoming (with open time), open now, closed, with their own status and result for each
   - **Announcements**
   - **Feedback**
3. **Results**
   - Merge the current Past Exams and Stats pages: their own history, average, best score and pass rate. Only their own data.
4. **Profile**
   - Name, email, phone, avatar picker
   - Membership and payment history (codes, plans, dates, statuses)
   - **Request Change** for official details (keep this feature)

### 8.2 Fixes
- **Profile layout:** the avatar card squeezes its text to one word per line and the email address gets cut off. Fix the layout on desktop and mobile.
- Change the avatar text "This is how you'll appear to classmates" to **"Your avatar appears on your profile and to your tutors."**
- **Loading states must only apply to the button that was clicked.** Currently, clicking one "Enrol Now" changes every button to "Enrolling…". Apply this rule to every button on the site, including Renew.
- Fix the **duplicate React key** warning on the student dashboard.

---

## 9. Homepage and public pages

### 9.1 Homepage content (consultancy-focused only)
Rebuild the homepage content around the consultancy, reusing the existing styling:

- **Hero:** "MedQrown MedEazy Academic Consultancy" with a short line about consistent academic support throughout the semester, staying ahead of the workload, preparing for assessments and mastering the content.
- **Registration status banner** (see 9.2).
- **What's included:**
  - Weekly Online Session — Mondays, 8:00–10:00 pm: we cover the objectives for the coming week so you're familiar with the content before lectures.
  - Weekly Mock CAT — Saturdays, 8:00–8:30 pm, on this website, structured like the real exams.
  - Weekly Revision Session — Saturdays, 8:30–10:30 pm: we go through the tested concepts and areas of difficulty.
  - Physical Gross Anatomy Lab — every two weeks, Saturday, 10:00 am–1:00 pm.
- **Free demo** (see 9.4).
- **FAQ** section.
- **Contact:** norysndachule@gmail.com and WhatsApp +254 702 797 977, plus the existing contact form.
- **Navigation:** What's included, Demo, FAQ, Contact, Student Login.
- **Footer:** Terms of Service, Privacy Policy, FAQ.

### 9.2 Registration status
- Admin toggle: **Open / Closed** (Admin → Site).
- **Open:** banner and buttons say **"Sign up for this cohort"** and link to the Google Form. The Google Form URL is editable in Admin → Site.
- **Closed:** banner says registration is closed and shows the **waitlist form** (name, email, phone).
- All "Sign up" buttons across the site follow this status.

### 9.3 Remove from the homepage
- The mock leaderboard and all fake names/rankings
- "Thousands of questions" and any similar unverifiable claims, including the Demo Photo & Text slide text in Site Content
- The walkthrough video "coming soon" placeholder
- All "coming soon" / "in development" features: Elo ratings, XP, standoffs, peer-hosted lobbies, global leaderboard, Premium, Viva simulator, WARD-E, Host a Group Exam, and their waitlist/notify-me forms
- The Institutions link

### 9.4 Demo (no AI usage)
- Keep the free demo: pick a subject, answer one MCQ (with its explanation), then one short-answer question.
- After the visitor submits the short answer, show **the model answer and marking points** that we have written for that question. **Do not call any AI** from the public demo.
- Below that, show the call to action: **"Sign up for this cohort"** (Google Form) when registration is open, or **"Join the waitlist"** when closed.
- Remove the blurred "Create Account" gate.
- The demo question editor (Admin → Site → Demo questions) must have a field for the SAQ model answer and marking points.

### 9.5 Waitlist
- Admin → **Waitlist**: list, search, export CSV, delete.
- When the admin switches registration to **Open**, automatically email everyone on the waitlist the Google Form link, once.
- A manual **"Resend to waitlist"** button, with a confirmation showing how many people will receive it.

### 9.6 Signup page
`/student/signup` shows: **"MedEazy is invite-only. Join the current cohort or the waitlist to get an invite,"** with the Google Form link (when Open) or the waitlist form (when Closed), and a link to Student Login.

### 9.7 Legal and FAQ
Rewrite the FAQ, Terms of Service and Privacy Policy to cover: what the consultancy includes, monthly membership and cohorts, Individual and Group pricing, M-Pesa payment and manual verification, invite-only accounts, the grace period and what happens after expiry, notifications and emails, the data we store (name, email, phone, M-Pesa codes, exam answers and results, feedback) and how to contact us.

---

## 10. Admin side

### 10.1 Navigation
Top navigation, exactly: **Dashboard | Classes | Students | Payments | Waitlist | Site | Settings**

### 10.2 Dashboard
Current cohort and its dates, active members, members in grace, pending payments, flagged payments, upcoming exams, latest feedback.

### 10.3 Classes
List of classes with member count and next exam, plus **Create class**. Each class page has these tabs:

- **Overview:** member counts by status, upcoming exams, recent announcements.
- **Members:** the master table for the class. Columns: avatar, name, email, phone (tap-to-call), latest plan, membership status, membership end date, invite status, exams taken, average score. Search, filter by status, sort, export CSV. Actions: Upload CSV, Add student, Resend invite, Edit membership end date, Remove from class.
- **Exams:** list and **Create Exam** (6.2).
- **Announcements:** post, edit, delete, see delivery counts.
- **Feedback:** general and per-exam feedback for the class.
- **Emails:** send an email to all or selected members using a template or a custom message.

### 10.4 Exam page
Reduce the current 11 tabs to these 6:

- **Overview:** enrolled, submitted, in progress and not started counts, completion rate, **Release/Hide results**, **Auto-Mark SAQ** toggle.
- **Questions:** add, edit, delete, bulk import (keep the existing editor and JSON import).
- **Setup:** schedule (open/close), duration, maximum attempts, instructions (merges the current Settings and Instructions tabs).
- **Marking:** AI marking progress, batch marking with optional custom prompt, re-mark, and reattempt requests.
- **Results:** rankings table with **student name, avatar and score** (admin-only), plus Analytics (10.5).
- **Feedback:** feedback for this exam.

Remove the exam-level Students and Emails tabs (they now live at class level).

### 10.5 Analytics (inside Results)
- **Fix the counts:** it currently shows "4 attempts" per MCQ when only 2 students submitted, and the SAQ counts each sub-question separately. Count one per submitted attempt.
- **Per question:** % correct, average mark, number answered.
- **MCQs:** for each option, the count and % of students who chose it. Highlight the correct option, and flag any wrong option chosen by more than 30% of students.
- **SAQs:** every student's answer with the mark awarded and the student's name, filterable by mark, with the model answer shown alongside.
- **AI analysis:** the admin selects one or more questions and clicks **"Analyze with AI"**. It returns examiner feedback for each: common misconceptions, whether the question or options may be ambiguous or flawed, marking consistency concerns, and suggested improvements. Save the analysis with the exam so it can be viewed later.
- **Revision pack:** a button that creates a printable summary of the most-missed questions, with option breakdowns, sample wrong answers and any saved AI analysis, for use in the Saturday revision session.

### 10.6 Students
- **All students** across all classes (same columns as the class Members table, plus which classes they belong to).
- **Change requests** tab: approve or decline identity change requests from students.

### 10.7 Payments
As described in 5.4.

### 10.8 Waitlist
As described in 9.5.

### 10.9 Site
- Registration status (Open/Closed) and Google Form URL
- Demo questions (with SAQ model answers and marking points)
- FAQ and legal pages
- **Engagement** (10.10)

### 10.10 Engagement
Replace the demo-only stats with a conversion view:

- **Funnel** for a chosen date range: homepage visits → demo starts → demo completions → "Sign up for this cohort" clicks → waitlist signups → students invited → invites activated → renewals approved.
- **Traffic sources:** support tagged links such as `?src=poster`, `?src=whatsapp` and `?src=qr`, and show visits, sign-up clicks and waitlist signups per source.
- **Per cohort:** new members, renewal rate, Individual vs Group split, and total amount from approved payments.
- Keep the existing demo stats (per subject and per question) below.

### 10.11 Settings
- Cohorts (3.1)
- Prices and payment details, grace period (5.1)
- Email templates (Stage 11)
- Admins and roles (fix: the Add Admin dialog needs an accessible description via `aria-describedby`)
- AI providers (keep as is)
- Change password

---

## 11. Emails

- Keep Gmail SMTP.
- Templates (editable in Settings, with placeholders such as `{student_name}`, `{cohort_end}`, `{renew_link}`, `{paybill}`, `{account_number}`):
  1. Invite / set your password
  2. You're in for this cohort (existing student)
  3. Renewal reminder — 7 days
  4. Renewal reminder — 3 days
  5. Renewal reminder — last day
  6. Payment approved
  7. Payment rejected (with reason)
  8. Announcement
  9. Registration is open (waitlist)
  10. Password reset
- **Log every email** with recipient, template, time and status (sent / failed + error). Show the log in Settings → Email log.

---

## 12. General fixes and quality

- Every destructive action (delete class, exam, question, student, announcement; reject payment; remove from class) requires a confirmation dialog.
- All pages and dialogs work on mobile (~390px).
- Remove the PostCSS warning about the missing `from` option if possible.
- No console errors or React warnings on any page.

---

## 13. Out of scope for now (do not build)

- Improved AI marking for multi-mark SAQs (we'll handle this later)
- Automatic M-Pesa/bank payment verification (admin verifies manually)
- Switching away from Gmail SMTP
- Self-tests and live rooms (hidden, not removed)
- Student-facing rankings or leaderboards of any kind

---

## 14. Final testing and report

Test end to end with **test accounts only**:

1. Create a class and confirm the current and next cohorts exist.
2. Upload a CSV with 1 Individual and 1 Group of 4 (verified). Check the preview, the import, the invite emails and the "Invited" status.
3. Set passwords from the invite links and log in.
4. Create a scheduled exam; confirm it opens and closes automatically and auto-submits an unfinished attempt.
5. Take the exam with Next-only navigation; confirm no going back and a correct attempt counter.
6. Release results; confirm students see only their own results and get a notification.
7. Check analytics, run AI analysis on selected questions, and generate a revision pack.
8. Renewals: an Individual renewal, a Group renewal where all 4 enter the same code in-app, a mixed group (1 in-app + 3 by CSV), a mistyped code fixed by the admin, and a 5th person blocked from a full group code.
9. Trigger the 7/3/0-day reminders with test dates and confirm the "cheaper with friends" message appears only for Individual members.
10. Let a membership pass the grace period and confirm exams lock while past results stay visible.
11. Post an announcement and confirm in-app, email and push delivery.
12. Submit named feedback and see it in the admin.
13. Toggle registration Closed → join the waitlist → toggle Open and confirm the waitlist email.
14. Check the homepage demo shows the model answer with no AI call.

Then **delete all test data**, and give me:
- A summary of everything that changed
- Any settings I need to fill in or check
- Anything that needs my action or decision
