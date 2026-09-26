import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, boolean, timestamp, jsonb, real, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const admins = pgTable("admins", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("examiner"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const units = pgTable("units", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  university: text("university"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const medqrownClasses = pgTable("medqrown_classes", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const exams = pgTable("exams", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  status: text("status").notNull().default("draft"),
  maxAttempts: integer("max_attempts").notNull().default(1),
  classId: integer("class_id").references(() => medqrownClasses.id, { onDelete: "restrict" }),
  opensAt: timestamp("opens_at", { withTimezone: true }),
  closesAt: timestamp("closes_at", { withTimezone: true }),
  durationMinutes: integer("duration_minutes"),
  timerMode: text("timer_mode").notNull().default("none"),
  perQuestionSeconds: integer("per_question_seconds"),
  fullExamSeconds: integer("full_exam_seconds"),
  createdBy: integer("created_by").references(() => admins.id),
  resultsReleased: boolean("results_released").notNull().default(false),
  autoMarkEnabled: boolean("auto_mark_enabled").notNull().default(true),
  instructions: text("instructions"),
  unitId: integer("unit_id").references(() => units.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("exams_class_schedule_idx").on(table.classId, table.opensAt, table.closesAt),
]);

export const universities = pgTable("universities", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const students = pgTable("students", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  university: text("university"),
  yearOfStudy: text("year_of_study"),
  resetCode: text("reset_code"),
  resetExpiresAt: timestamp("reset_expires_at"),
  avatarKey: text("avatar_key").notNull().default("teal"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const studentAccounts = pgTable("student_accounts", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().unique().references(() => students.id, { onDelete: "cascade" }),
  passwordHash: text("password_hash").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const allowedEmailDomains = pgTable("allowed_email_domains", {
  id: serial("id").primaryKey(),
  domain: text("domain").notNull().unique(),
  label: text("label"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const unitMemberships = pgTable("unit_memberships", {
  id: serial("id").primaryKey(),
  unitId: integer("unit_id").notNull().references(() => units.id, { onDelete: "cascade" }),
  studentId: integer("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("enrolled"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  uniqueIndex("unit_memberships_unit_student_unique").on(table.unitId, table.studentId),
]);

export const examStudents = pgTable("exam_students", {
  id: serial("id").primaryKey(),
  examId: integer("exam_id").notNull().references(() => exams.id, { onDelete: "cascade" }),
  studentId: integer("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  password: text("password").notNull(),
  attemptStatus: text("attempt_status").notNull().default("not_started"),
  resetCount: integer("reset_count").notNull().default(0),
  emailSent: boolean("email_sent").notNull().default(false),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("idx_exam_students_exam_id").on(table.examId),
  index("idx_exam_students_student_id").on(table.studentId),
]);

export const examAccessRequests = pgTable("exam_access_requests", {
  id: serial("id").primaryKey(),
  examId: integer("exam_id").notNull().references(() => exams.id, { onDelete: "cascade" }),
  studentId: integer("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  reason: text("reason"),
  reviewedBy: integer("reviewed_by").references(() => admins.id, { onDelete: "set null" }),
  reviewReason: text("review_reason"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  reviewedAt: timestamp("reviewed_at"),
}, (table) => [
  uniqueIndex("exam_access_requests_exam_student_unique").on(table.examId, table.studentId),
]);

export const examReattemptRequests = pgTable("exam_reattempt_requests", {
  id: serial("id").primaryKey(),
  examId: integer("exam_id").notNull().references(() => exams.id, { onDelete: "cascade" }),
  studentId: integer("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  reason: text("reason"),
  reviewedBy: integer("reviewed_by").references(() => admins.id, { onDelete: "set null" }),
  reviewReason: text("review_reason"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  reviewedAt: timestamp("reviewed_at"),
  consumedAt: timestamp("consumed_at"),
}, (table) => [
  index("idx_exam_reattempt_requests_exam_student").on(table.examId, table.studentId),
  uniqueIndex("exam_reattempt_requests_one_pending_per_student").on(table.examId, table.studentId).where(sql`status = 'pending'`),
]);

export const profileChangeRequests = pgTable("profile_change_requests", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  fieldName: text("field_name").notNull(),
  requestedValue: text("requested_value").notNull(),
  reason: text("reason"),
  status: text("status").notNull().default("pending"),
  reviewedBy: integer("reviewed_by").references(() => admins.id, { onDelete: "set null" }),
  reviewReason: text("review_reason"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  reviewedAt: timestamp("reviewed_at"),
});

export const questions = pgTable("questions", {
  id: serial("id").primaryKey(),
  examId: integer("exam_id").notNull().references(() => exams.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  content: text("content").notNull(),
  orderIndex: integer("order_index").notNull(),
  marks: integer("marks").notNull().default(1),
  expectedAnswer: text("expected_answer"),
  explanation: text("explanation"),
  imageUrl: text("image_url"),
  imageCaption: text("image_caption"),
  hasSubquestions: boolean("has_subquestions").notNull().default(false),
}, (table) => [
  index("idx_questions_exam_id").on(table.examId),
]);

export const questionOptions = pgTable("question_options", {
  id: serial("id").primaryKey(),
  questionId: integer("question_id").notNull().references(() => questions.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  isCorrect: boolean("is_correct").notNull().default(false),
  orderIndex: integer("order_index").notNull(),
}, (table) => [
  index("idx_question_options_question_id").on(table.questionId),
]);

export const subquestions = pgTable("subquestions", {
  id: serial("id").primaryKey(),
  questionId: integer("question_id").notNull().references(() => questions.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  marks: integer("marks").notNull().default(1),
  expectedAnswer: text("expected_answer"),
  orderIndex: integer("order_index").notNull(),
}, (table) => [
  index("idx_subquestions_question_id").on(table.questionId),
]);

export const attempts = pgTable("attempts", {
  id: serial("id").primaryKey(),
  examStudentId: integer("exam_student_id").notNull().references(() => examStudents.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("in_progress"),
  currentQuestionIndex: integer("current_question_index").notNull().default(0),
  remainingTime: integer("remaining_time"),
  startedAt: timestamp("started_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  questionStartedAt: timestamp("question_started_at"),
  submittedAt: timestamp("submitted_at"),
}, (table) => [
  index("idx_attempts_exam_student_id").on(table.examStudentId),
  index("attempts_in_progress_started_idx").on(table.startedAt).where(sql`status = 'in_progress'`),
]);

export const responses = pgTable("responses", {
  id: serial("id").primaryKey(),
  attemptId: integer("attempt_id").notNull().references(() => attempts.id, { onDelete: "cascade" }),
  questionId: integer("question_id").notNull().references(() => questions.id, { onDelete: "cascade" }),
  subquestionId: integer("subquestion_id").references(() => subquestions.id, { onDelete: "set null" }),
  answer: text("answer"),
  isCorrect: boolean("is_correct"),
  aiFeedback: text("ai_feedback"),
  marksAwarded: real("marks_awarded"),
}, (table) => [
  index("idx_responses_attempt_id").on(table.attemptId),
  index("idx_responses_question_id").on(table.questionId),
]);

export const aiProviders = pgTable("ai_providers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  apiKeyEnv: text("api_key_env"),
  apiKeyDirect: text("api_key_direct"),
  baseUrlEnv: text("base_url_env"),
  endpoint: text("endpoint"),
  model: text("model"),
  isActive: boolean("is_active").notNull().default(true),
  weight: integer("weight").notNull().default(1),
});

export const emailTemplates = pgTable("email_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  placeholders: jsonb("placeholders").$type<Record<string, string>>().default({}),
  createdBy: integer("created_by").references(() => admins.id),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const emailLogs = pgTable("email_logs", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").references(() => emailTemplates.id),
  recipientEmail: text("recipient_email").notNull(),
  subject: text("subject").notNull(),
  status: text("status").notNull().default("pending"),
  sentAt: timestamp("sent_at"),
});

export const studentFeedback = pgTable("student_feedback", {
  id: serial("id").primaryKey(),
  examId: integer("exam_id").notNull().references(() => exams.id, { onDelete: "cascade" }),
  studentId: integer("student_id").notNull().references(() => students.id),
  content: text("content").notNull(),
  rating: integer("rating"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  adminId: integer("admin_id").references(() => admins.id),
  action: text("action").notNull(),
  details: text("details"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const aiMarkingJobs = pgTable("ai_marking_jobs", {
  id: serial("id").primaryKey(),
  examId: integer("exam_id").notNull().references(() => exams.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  totalItems: integer("total_items").notNull().default(0),
  completedItems: integer("completed_items").notNull().default(0),
  prompt: text("prompt"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// ── Student self-tests ───────────────────────────────────────────────────────
// These remain separate from administrator-managed official exams and attempts.
export const selfTests = pgTable("self_tests", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  unitId: integer("unit_id").references(() => units.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  focus: text("focus"),
  questionType: text("question_type").notNull().default("mixed"),
  contentStyle: text("content_style").notNull().default("mixed"),
  questionCount: integer("question_count").notNull(),
  timerSeconds: integer("timer_seconds"),
  status: text("status").notNull().default("draft"),
  generationError: text("generation_error"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("idx_self_tests_student_created").on(table.studentId, table.createdAt),
]);

export const selfTestQuestions = pgTable("self_test_questions", {
  id: serial("id").primaryKey(),
  selfTestId: integer("self_test_id").notNull().references(() => selfTests.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  content: text("content").notNull(),
  expectedAnswer: text("expected_answer"),
  explanation: text("explanation"),
  marks: integer("marks").notNull().default(1),
  orderIndex: integer("order_index").notNull(),
}, (table) => [
  index("idx_self_test_questions_test_order").on(table.selfTestId, table.orderIndex),
]);

export const selfTestQuestionOptions = pgTable("self_test_question_options", {
  id: serial("id").primaryKey(),
  questionId: integer("question_id").notNull().references(() => selfTestQuestions.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  isCorrect: boolean("is_correct").notNull().default(false),
  orderIndex: integer("order_index").notNull(),
}, (table) => [
  index("idx_self_test_options_question").on(table.questionId),
]);

export const selfTestAttempts = pgTable("self_test_attempts", {
  id: serial("id").primaryKey(),
  selfTestId: integer("self_test_id").notNull().references(() => selfTests.id, { onDelete: "cascade" }),
  studentId: integer("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("in_progress"),
  currentQuestionIndex: integer("current_question_index").notNull().default(0),
  startedAt: timestamp("started_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  submittedAt: timestamp("submitted_at"),
}, (table) => [
  index("idx_self_test_attempts_student_test").on(table.studentId, table.selfTestId),
]);

export const selfTestResponses = pgTable("self_test_responses", {
  id: serial("id").primaryKey(),
  attemptId: integer("attempt_id").notNull().references(() => selfTestAttempts.id, { onDelete: "cascade" }),
  questionId: integer("question_id").notNull().references(() => selfTestQuestions.id, { onDelete: "cascade" }),
  answer: text("answer"),
  isCorrect: boolean("is_correct"),
  marksAwarded: real("marks_awarded"),
  aiFeedback: text("ai_feedback"),
}, (table) => [
  uniqueIndex("self_test_responses_attempt_question_unique").on(table.attemptId, table.questionId),
]);

export const selfTestQuestionReports = pgTable("self_test_question_reports", {
  id: serial("id").primaryKey(),
  questionId: integer("question_id").notNull().references(() => selfTestQuestions.id, { onDelete: "cascade" }),
  studentId: integer("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  uniqueIndex("self_test_question_reports_one_per_student").on(table.questionId, table.studentId),
]);

export const studentSignups = pgTable("student_signups", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  university: text("university").notNull(),
  yearOfStudy: text("year_of_study"),
  password: text("password"),
  verificationCode: text("verification_code").notNull(),
  verificationExpiresAt: timestamp("verification_expires_at").notNull(),
  emailVerified: boolean("email_verified").notNull().default(false),
  status: text("status").notNull().default("pending_email"),
  token: text("token").notNull().unique(),
  rejectionReason: text("rejection_reason"),
  approvedExamId: integer("approved_exam_id").references(() => exams.id),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// ── Demo exam system ──────────────────────────────────────────────────────────
export const demoExams = pgTable("demo_exams", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  displayOrder: integer("display_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  timerSeconds: integer("timer_seconds").notNull().default(60),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const demoQuestions = pgTable("demo_questions", {
  id: serial("id").primaryKey(),
  demoExamId: integer("demo_exam_id").notNull().references(() => demoExams.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // 'mcq' or 'saq'
  content: text("content").notNull(),
  imageUrl: text("image_url"),
  options: jsonb("options").$type<{ content: string; isCorrect: boolean }[]>(),
  explanation: text("explanation"),
  modelAnswer: text("model_answer"),
  markingPoints: text("marking_points"),
  orderIndex: integer("order_index").notNull().default(0),
});

export const demoEngagementEvents = pgTable("demo_engagement_events", {
  id: serial("id").primaryKey(),
  demoExamId: integer("demo_exam_id").notNull().references(() => demoExams.id, { onDelete: "cascade" }),
  questionId: integer("question_id").references(() => demoQuestions.id, { onDelete: "set null" }),
  eventType: text("event_type").notNull(), // started | mcq_answered | saq_started | saq_submitted | completed
  sessionId: text("session_id").notNull(),
  isCorrect: boolean("is_correct"),
  responseLength: integer("response_length"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// ── Live AI quiz rooms ───────────────────────────────────────────────────────
// Live rooms are intentionally separate from official exams and self-tests.
// Question answers are never returned by the room-state APIs until a match is
// finished, and answer submissions are idempotent per member/question.
export const liveQuizRooms = pgTable("live_quiz_rooms", {
  id: serial("id").primaryKey(),
  roomCode: varchar("room_code", { length: 12 }).notNull().unique(),
  inviteToken: varchar("invite_token", { length: 96 }).notNull().unique(),
  hostStudentId: integer("host_student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  unitId: integer("unit_id").references(() => units.id, { onDelete: "set null" }),
  topic: text("topic").notNull(),
  difficulty: text("difficulty").notNull().default("mixed"),
  contentStyle: text("content_style").notNull().default("clinical"),
  questionCount: integer("question_count").notNull().default(5),
  perQuestionSeconds: integer("per_question_seconds").notNull().default(30),
  status: text("status").notNull().default("generating"),
  generationError: text("generation_error"),
  currentQuestionIndex: integer("current_question_index").notNull().default(-1),
  questionStartedAt: timestamp("question_started_at"),
  expiresAt: timestamp("expires_at").notNull(),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const liveQuizMembers = pgTable("live_quiz_members", {
  id: serial("id").primaryKey(),
  roomId: integer("room_id").notNull().references(() => liveQuizRooms.id, { onDelete: "cascade" }),
  studentId: integer("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("player"),
  status: text("status").notNull().default("joined"),
  joinedAt: timestamp("joined_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  lastSeenAt: timestamp("last_seen_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  leftAt: timestamp("left_at"),
}, (table) => [
  uniqueIndex("live_quiz_members_room_student_unique").on(table.roomId, table.studentId),
  index("idx_live_quiz_members_room").on(table.roomId),
]);

export const liveQuizQuestions = pgTable("live_quiz_questions", {
  id: serial("id").primaryKey(),
  roomId: integer("room_id").notNull().references(() => liveQuizRooms.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  options: jsonb("options").$type<string[]>().notNull(),
  correctOptionIndex: integer("correct_option_index").notNull(),
  explanation: text("explanation"),
  orderIndex: integer("order_index").notNull(),
}, (table) => [
  uniqueIndex("live_quiz_questions_room_order_unique").on(table.roomId, table.orderIndex),
]);

export const liveQuizAnswers = pgTable("live_quiz_answers", {
  id: serial("id").primaryKey(),
  roomId: integer("room_id").notNull().references(() => liveQuizRooms.id, { onDelete: "cascade" }),
  memberId: integer("member_id").notNull().references(() => liveQuizMembers.id, { onDelete: "cascade" }),
  questionId: integer("question_id").notNull().references(() => liveQuizQuestions.id, { onDelete: "cascade" }),
  selectedOptionIndex: integer("selected_option_index"),
  isCorrect: boolean("is_correct").notNull(),
  points: integer("points").notNull().default(0),
  responseMs: integer("response_ms"),
  answeredAt: timestamp("answered_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  uniqueIndex("live_quiz_answers_member_question_unique").on(table.memberId, table.questionId),
  index("idx_live_quiz_answers_room").on(table.roomId),
]);

export const liveQuizEvents = pgTable("live_quiz_events", {
  id: serial("id").primaryKey(),
  roomId: integer("room_id").notNull().references(() => liveQuizRooms.id, { onDelete: "cascade" }),
  memberId: integer("member_id").references(() => liveQuizMembers.id, { onDelete: "set null" }),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  index("idx_live_quiz_events_room_created").on(table.roomId, table.createdAt),
]);

export const liveQuizLeaderboard = pgTable("live_quiz_leaderboard", {
  id: serial("id").primaryKey(),
  roomId: integer("room_id").notNull().references(() => liveQuizRooms.id, { onDelete: "cascade" }),
  memberId: integer("member_id").notNull().references(() => liveQuizMembers.id, { onDelete: "cascade" }),
  score: integer("score").notNull().default(0),
  correctCount: integer("correct_count").notNull().default(0),
  answerCount: integer("answer_count").notNull().default(0),
  rank: integer("rank"),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  uniqueIndex("live_quiz_leaderboard_room_member_unique").on(table.roomId, table.memberId),
]);

export const liveQuizShares = pgTable("live_quiz_shares", {
  id: serial("id").primaryKey(),
  roomId: integer("room_id").notNull().references(() => liveQuizRooms.id, { onDelete: "cascade" }),
  memberId: integer("member_id").references(() => liveQuizMembers.id, { onDelete: "set null" }),
  token: varchar("token", { length: 96 }).notNull().unique(),
  kind: text("kind").notNull().default("score"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

export const liveQuizMatches = pgTable("live_quiz_matches", {
  id: serial("id").primaryKey(),
  roomId: integer("room_id").notNull().unique().references(() => liveQuizRooms.id, { onDelete: "cascade" }),
  unitId: integer("unit_id").references(() => units.id, { onDelete: "set null" }),
  participantCount: integer("participant_count").notNull().default(0),
  winnerStudentId: integer("winner_student_id").references(() => students.id, { onDelete: "set null" }),
  finishedAt: timestamp("finished_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertLiveQuizRoomSchema = createInsertSchema(liveQuizRooms).omit({ id: true, createdAt: true });
export type LiveQuizRoom = typeof liveQuizRooms.$inferSelect;
export type LiveQuizMember = typeof liveQuizMembers.$inferSelect;
export type LiveQuizQuestion = typeof liveQuizQuestions.$inferSelect;
export type LiveQuizAnswer = typeof liveQuizAnswers.$inferSelect;
export type LiveQuizLeaderboard = typeof liveQuizLeaderboard.$inferSelect;
export type LiveQuizShare = typeof liveQuizShares.$inferSelect;
export type LiveQuizMatch = typeof liveQuizMatches.$inferSelect;

export const insertUniversitySchema = createInsertSchema(universities).omit({ id: true, createdAt: true });
export const insertAdminSchema = createInsertSchema(admins).omit({ id: true, createdAt: true });
export const insertExamSchema = createInsertSchema(exams).omit({ id: true, createdAt: true });
export const insertStudentSchema = createInsertSchema(students).omit({ id: true, createdAt: true });
export const insertExamStudentSchema = createInsertSchema(examStudents).omit({ id: true, createdAt: true });
export const insertQuestionSchema = createInsertSchema(questions).omit({ id: true });
export const insertQuestionOptionSchema = createInsertSchema(questionOptions).omit({ id: true });
export const insertSubquestionSchema = createInsertSchema(subquestions).omit({ id: true });
export const insertAttemptSchema = createInsertSchema(attempts).omit({ id: true, startedAt: true });
export const insertResponseSchema = createInsertSchema(responses).omit({ id: true });
export const insertAiProviderSchema = createInsertSchema(aiProviders).omit({ id: true });
export const insertEmailTemplateSchema = createInsertSchema(emailTemplates).omit({ id: true, createdAt: true });
export const insertStudentFeedbackSchema = createInsertSchema(studentFeedback).omit({ id: true, createdAt: true });

export type Admin = typeof admins.$inferSelect;
export type InsertAdmin = z.infer<typeof insertAdminSchema>;
export type Exam = typeof exams.$inferSelect;
export type InsertExam = z.infer<typeof insertExamSchema>;
export type Student = typeof students.$inferSelect;
export type InsertStudent = z.infer<typeof insertStudentSchema>;
export type ExamStudent = typeof examStudents.$inferSelect;
export type InsertExamStudent = z.infer<typeof insertExamStudentSchema>;
export type Question = typeof questions.$inferSelect;
export type InsertQuestion = z.infer<typeof insertQuestionSchema>;
export type QuestionOption = typeof questionOptions.$inferSelect;
export type InsertQuestionOption = z.infer<typeof insertQuestionOptionSchema>;
export type Subquestion = typeof subquestions.$inferSelect;
export type InsertSubquestion = z.infer<typeof insertSubquestionSchema>;
export type Attempt = typeof attempts.$inferSelect;
export type InsertAttempt = z.infer<typeof insertAttemptSchema>;
export type ExamResponse = typeof responses.$inferSelect;
export type InsertResponse = z.infer<typeof insertResponseSchema>;
export type AiProvider = typeof aiProviders.$inferSelect;
export type InsertAiProvider = z.infer<typeof insertAiProviderSchema>;
export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type InsertEmailTemplate = z.infer<typeof insertEmailTemplateSchema>;
export type StudentFeedbackType = typeof studentFeedback.$inferSelect;
export type InsertStudentFeedback = z.infer<typeof insertStudentFeedbackSchema>;
export type University = typeof universities.$inferSelect;
export type InsertUniversity = z.infer<typeof insertUniversitySchema>;
export type AuditLog = typeof auditLogs.$inferSelect;
export type AiMarkingJob = typeof aiMarkingJobs.$inferSelect;
export type SelfTest = typeof selfTests.$inferSelect;
export type SelfTestQuestion = typeof selfTestQuestions.$inferSelect;
export type SelfTestAttempt = typeof selfTestAttempts.$inferSelect;
export type StudentSignup = typeof studentSignups.$inferSelect;
export const insertStudentSignupSchema = createInsertSchema(studentSignups).omit({ id: true, createdAt: true });
export type InsertStudentSignup = z.infer<typeof insertStudentSignupSchema>;
export type DemoExam = typeof demoExams.$inferSelect;
export type DemoQuestion = typeof demoQuestions.$inferSelect;
export type DemoEngagementEvent = typeof demoEngagementEvents.$inferSelect;

// ── Site content (landing page CMS) ──────────────────────────────────────────
export const siteSettings = pgTable("site_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value"),
});

export const contentPages = pgTable("content_pages", {
  slug: text("slug").primaryKey(), // 'terms' | 'privacy'
  title: text("title").notNull(),
  content: text("content").notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const faqItems = pgTable("faq_items", {
  id: serial("id").primaryKey(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  orderIndex: integer("order_index").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
});

export const institutionInquiries = pgTable("institution_inquiries", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  institution: text("institution").notNull(),
  message: text("message"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export type SiteSetting = typeof siteSettings.$inferSelect;
export type ContentPage = typeof contentPages.$inferSelect;
export type FaqItem = typeof faqItems.$inferSelect;
export type InstitutionInquiry = typeof institutionInquiries.$inferSelect;

