import { db } from "./db";
import { eq, and, desc, asc, sql, count, inArray } from "drizzle-orm";
import { deleteSupabaseStorageObject, deleteSupabaseStorageObjects } from "./supabase-storage";
import {
  admins, exams, students, examStudents, questions, questionOptions,
  subquestions, attempts, responses, aiProviders, emailTemplates,
  emailLogs, studentFeedback, auditLogs, aiMarkingJobs, studentSignups, universities,
  demoExams, demoQuestions,
  demoEngagementEvents,
  siteSettings, contentPages, faqItems, institutionInquiries,
  type FaqItem, type InstitutionInquiry,
  type Admin, type InsertAdmin, type Exam, type InsertExam,
  type Student, type InsertStudent, type ExamStudent, type InsertExamStudent,
  type Question, type InsertQuestion, type QuestionOption, type InsertQuestionOption,
  type Subquestion, type InsertSubquestion, type Attempt, type InsertAttempt,
  type ExamResponse, type InsertResponse, type AiProvider, type InsertAiProvider,
  type EmailTemplate, type InsertEmailTemplate, type StudentFeedbackType,
  type InsertStudentFeedback, type AuditLog, type AiMarkingJob,
  type StudentSignup, type University, type DemoExam, type DemoQuestion,
} from "@shared/schema";

export interface IStorage {
  getAdmin(id: number): Promise<Admin | undefined>;
  getAdminByEmail(email: string): Promise<Admin | undefined>;
  createAdmin(admin: InsertAdmin): Promise<Admin>;
  updateAdminPassword(id: number, passwordHash: string): Promise<void>;
  getAllAdmins(): Promise<Admin[]>;

  getExam(id: number): Promise<Exam | undefined>;
  getAllExams(): Promise<Exam[]>;
  createExam(exam: InsertExam): Promise<Exam>;
  updateExam(id: number, data: Partial<InsertExam>): Promise<Exam>;
  deleteExam(id: number): Promise<void>;

  getStudent(id: number): Promise<Student | undefined>;
  getStudentByEmail(email: string): Promise<Student | undefined>;
  createStudent(student: InsertStudent): Promise<Student>;
  updateStudent(id: number, data: Partial<InsertStudent>): Promise<Student>;
  deleteStudent(id: number): Promise<void>;
  getStudentsByExam(examId: number): Promise<(ExamStudent & { student: Student })[]>;

  getExamStudent(id: number): Promise<ExamStudent | undefined>;
  createExamStudent(es: InsertExamStudent): Promise<ExamStudent>;
  updateExamStudent(id: number, data: Partial<ExamStudent>): Promise<void>;
  deleteExamStudent(id: number): Promise<void>;
  getExamStudentByExamAndStudent(examId: number, studentId: number): Promise<ExamStudent | undefined>;

  getQuestion(id: number): Promise<Question | undefined>;
  getQuestionsByExam(examId: number): Promise<Question[]>;
  createQuestion(q: InsertQuestion): Promise<Question>;
  updateQuestion(id: number, data: Partial<InsertQuestion>): Promise<Question>;
  deleteQuestion(id: number): Promise<void>;
  deleteQuestionCascade(id: number): Promise<void>;

  getQuestionOptions(questionId: number): Promise<QuestionOption[]>;
  createQuestionOption(opt: InsertQuestionOption): Promise<QuestionOption>;
  deleteQuestionOptions(questionId: number): Promise<void>;

  getSubquestions(questionId: number): Promise<Subquestion[]>;
  createSubquestion(sq: InsertSubquestion): Promise<Subquestion>;
  deleteSubquestions(questionId: number): Promise<void>;

  getAttempt(id: number): Promise<Attempt | undefined>;
  getAttemptByExamStudent(examStudentId: number): Promise<Attempt | undefined>;
  createAttempt(a: InsertAttempt): Promise<Attempt>;
  updateAttempt(id: number, data: Partial<Attempt>): Promise<void>;
  resetAttempt(examStudentId: number): Promise<void>;

  getResponse(attemptId: number, questionId: number, subquestionId?: number | null): Promise<ExamResponse | undefined>;
  getResponsesByAttempt(attemptId: number): Promise<ExamResponse[]>;
  upsertResponse(r: InsertResponse): Promise<ExamResponse>;
  updateResponse(id: number, data: Partial<ExamResponse>): Promise<void>;

  getAiProviders(): Promise<AiProvider[]>;
  createAiProvider(p: InsertAiProvider): Promise<AiProvider>;
  updateAiProvider(id: number, data: Partial<AiProvider>): Promise<void>;
  deleteAiProvider(id: number): Promise<void>;

  getEmailTemplates(): Promise<EmailTemplate[]>;
  getEmailTemplate(id: number): Promise<EmailTemplate | undefined>;
  createEmailTemplate(t: InsertEmailTemplate): Promise<EmailTemplate>;
  updateEmailTemplate(id: number, data: Partial<InsertEmailTemplate>): Promise<void>;

  createEmailLog(log: { templateId?: number; recipientEmail: string; subject: string; status: string }): Promise<void>;

  getStudentFeedback(examId: number): Promise<StudentFeedbackType[]>;
  createStudentFeedback(fb: InsertStudentFeedback): Promise<StudentFeedbackType>;
  deleteStudentFeedback(id: number): Promise<void>;
  getAllStudentsWithExams(): Promise<{ id: number; name: string; email: string; exams: { examId: number; examTitle: string; attemptStatus: string; enrolledAt: Date }[] }[]>;
  getInProgressAttempts(): Promise<{ attemptId: number; examStudentId: number; examId: number; currentQuestionIndex: number; startedAt: Date; questionStartedAt: Date | null; timerMode: string | null; perQuestionSeconds: number | null; fullExamSeconds: number | null; autoMarkEnabled: boolean }[]>;

  createAuditLog(log: { adminId?: number; action: string; details?: string }): Promise<void>;

  getAiMarkingJob(id: number): Promise<AiMarkingJob | undefined>;
  getAiMarkingJobsByExam(examId: number): Promise<AiMarkingJob[]>;
  createAiMarkingJob(job: { examId: number; totalItems: number; prompt?: string }): Promise<AiMarkingJob>;
  updateAiMarkingJob(id: number, data: Partial<AiMarkingJob>): Promise<void>;

  getExamStats(examId: number): Promise<{ total: number; submitted: number; inProgress: number; notStarted: number }>;
  getExamRankings(examId: number): Promise<{ studentName: string; studentEmail: string; totalScore: number; maxScore: number; percentage: number }[]>;
  getQuestionAnalytics(examId: number): Promise<{ questionId: number; content: string; type: string; totalAttempts: number; correctCount: number; avgMarks: number }[]>;
  recordDemoEngagement(data: {
    demoExamId: number;
    questionId?: number | null;
    eventType: string;
    sessionId: string;
    isCorrect?: boolean | null;
    responseLength?: number | null;
  }): Promise<void>;
  getDemoEngagementSummary(): Promise<{
    exams: {
      id: number;
      title: string;
      starts: number;
      mcqAnswered: number;
      mcqCorrect: number;
      saqStarted: number;
      saqSubmitted: number;
      completions: number;
      lastActivity: string | null;
    }[];
    questions: {
      id: number;
      examId: number;
      examTitle: string;
      type: string;
      content: string;
      answered: number;
      correct: number;
      submitted: number;
      lastActivity: string | null;
    }[];
    daily: {
      date: string;
      starts: number;
      completions: number;
      total: number;
    }[];
  }>;
  clearDemoEngagement(): Promise<void>;

  createStudentSignup(data: { name: string; email: string; university: string; verificationCode: string; verificationExpiresAt: Date; token: string }): Promise<StudentSignup>;
  getStudentSignupByEmail(email: string): Promise<StudentSignup | undefined>;
  getStudentSignupByToken(token: string): Promise<StudentSignup | undefined>;
  getStudentSignupById(id: number): Promise<StudentSignup | undefined>;
  getAllStudentSignups(): Promise<StudentSignup[]>;
  updateStudentSignup(id: number, data: Partial<StudentSignup>): Promise<StudentSignup>;
  deleteStudentSignup(id: number): Promise<void>;
  deleteStudentSignupsByEmail(email: string): Promise<void>;

  getUniversities(): Promise<University[]>;
  createUniversity(name: string): Promise<University>;
  deleteUniversity(id: number): Promise<void>;
  deleteStudent(id: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getAdmin(id: number) {
    const [admin] = await db.select().from(admins).where(eq(admins.id, id));
    return admin;
  }

  async getAdminByEmail(email: string) {
    const normalized = (email || "").trim().toLowerCase();
    const [admin] = await db
      .select()
      .from(admins)
      .where(sql`LOWER(${admins.email}) = ${normalized}`);
    return admin;
  }

  async createAdmin(admin: InsertAdmin) {
    const normalized = { ...admin, email: (admin.email || "").trim().toLowerCase() };
    const [created] = await db.insert(admins).values(normalized).returning();
    return created;
  }

  async updateAdminPassword(id: number, passwordHash: string) {
    await db.update(admins).set({ passwordHash }).where(eq(admins.id, id));
  }

  async getAllAdmins() {
    return db.select().from(admins).orderBy(admins.name);
  }

  async getExam(id: number) {
    const [exam] = await db.select().from(exams).where(eq(exams.id, id));
    return exam;
  }

  async getAllExams() {
    return db.select().from(exams).orderBy(desc(exams.createdAt));
  }

  async createExam(exam: InsertExam) {
    const [created] = await db.insert(exams).values(exam).returning();
    return created;
  }

  async updateExam(id: number, data: Partial<InsertExam>) {
    const [updated] = await db.update(exams).set(data).where(eq(exams.id, id)).returning();
    return updated;
  }

  async deleteExam(id: number) {
    // Collect image URLs first so we can clean up bucket files after the cascade
    const qs = await db.select({ imageUrl: questions.imageUrl }).from(questions).where(eq(questions.examId, id));
    const imageUrls = qs.map(q => q.imageUrl).filter((u): u is string => !!u);
    // Null out approved_exam_id references to avoid FK NO ACTION constraint
    await db.update(studentSignups).set({ approvedExamId: null }).where(eq(studentSignups.approvedExamId, id));
    await db.delete(exams).where(eq(exams.id, id));
    if (imageUrls.length > 0) {
      // Fire-and-forget — don't block the response on bucket cleanup
      deleteSupabaseStorageObjects(imageUrls)
        .then(r => console.log(`[deleteExam ${id}] bucket cleanup: ${r.deleted} deleted, ${r.failed} failed`))
        .catch(e => console.warn(`[deleteExam ${id}] bucket cleanup error:`, e?.message || e));
    }
  }

  async getStudent(id: number) {
    const [student] = await db.select().from(students).where(eq(students.id, id));
    return student;
  }

  async getStudentByEmail(email: string) {
    const normalized = (email || "").trim().toLowerCase();
    const [student] = await db
      .select()
      .from(students)
      .where(sql`LOWER(${students.email}) = ${normalized}`);
    return student;
  }

  async createStudent(student: InsertStudent) {
    const normalized = { ...student, email: (student.email || "").trim().toLowerCase() };
    const [created] = await db.insert(students).values(normalized).returning();
    return created;
  }

  async updateStudent(id: number, data: Partial<InsertStudent>) {
    const [updated] = await db.update(students).set(data).where(eq(students.id, id)).returning();
    return updated;
  }

  async deleteStudent(id: number) {
    // FK cascades remove examStudents, attempts, responses
    await db.delete(students).where(eq(students.id, id));
  }

  async getStudentsByExam(examId: number) {
    const result = await db
      .select()
      .from(examStudents)
      .innerJoin(students, eq(examStudents.studentId, students.id))
      .where(eq(examStudents.examId, examId))
      .orderBy(desc(examStudents.createdAt));
    return result.map(r => ({ ...r.exam_students, student: r.students }));
  }

  async getExamStudent(id: number) {
    const [es] = await db.select().from(examStudents).where(eq(examStudents.id, id));
    return es;
  }

  async createExamStudent(es: InsertExamStudent) {
    const [created] = await db.insert(examStudents).values(es).returning();
    return created;
  }

  async updateExamStudent(id: number, data: Partial<ExamStudent>) {
    await db.update(examStudents).set(data).where(eq(examStudents.id, id));
  }

  async deleteExamStudent(id: number) {
    await db.delete(examStudents).where(eq(examStudents.id, id));
  }

  async getExamStudentByExamAndStudent(examId: number, studentId: number) {
    const [es] = await db.select().from(examStudents).where(and(eq(examStudents.examId, examId), eq(examStudents.studentId, studentId)));
    return es;
  }

  async getQuestion(id: number) {
    const [q] = await db.select().from(questions).where(eq(questions.id, id));
    return q;
  }

  async getQuestionsByExam(examId: number) {
    return db.select().from(questions).where(eq(questions.examId, examId)).orderBy(asc(questions.orderIndex));
  }

  async createQuestion(q: InsertQuestion) {
    const [created] = await db.insert(questions).values(q).returning();
    return created;
  }

  async updateQuestion(id: number, data: Partial<InsertQuestion>) {
    const [updated] = await db.update(questions).set(data).where(eq(questions.id, id)).returning();
    return updated;
  }

  async deleteQuestion(id: number) {
    const [q] = await db.select({ imageUrl: questions.imageUrl }).from(questions).where(eq(questions.id, id));
    await db.delete(questions).where(eq(questions.id, id));
    if (q?.imageUrl) {
      deleteSupabaseStorageObject(q.imageUrl).catch(e => console.warn(`[deleteQuestion ${id}] bucket cleanup error:`, e?.message || e));
    }
  }

  async deleteQuestionCascade(id: number) {
    const [q] = await db.select({ imageUrl: questions.imageUrl }).from(questions).where(eq(questions.id, id));
    // Explicit cascade: delete responses first, then options/subquestions, then the question
    // (DB cascades now handle this, but explicit deletion is belt-and-suspenders safe)
    await db.delete(responses).where(eq(responses.questionId, id));
    const subs = await db.select({ id: subquestions.id }).from(subquestions).where(eq(subquestions.questionId, id));
    if (subs.length > 0) {
      await db.delete(responses).where(inArray(responses.subquestionId, subs.map(s => s.id)));
      await db.delete(subquestions).where(eq(subquestions.questionId, id));
    }
    await db.delete(questionOptions).where(eq(questionOptions.questionId, id));
    await db.delete(questions).where(eq(questions.id, id));
    if (q?.imageUrl) {
      deleteSupabaseStorageObject(q.imageUrl).catch(e => console.warn(`[deleteQuestionCascade ${id}] bucket cleanup error:`, e?.message || e));
    }
  }

  async getQuestionOptions(questionId: number) {
    return db.select().from(questionOptions).where(eq(questionOptions.questionId, questionId)).orderBy(asc(questionOptions.orderIndex));
  }

  async createQuestionOption(opt: InsertQuestionOption) {
    const [created] = await db.insert(questionOptions).values(opt).returning();
    return created;
  }

  async deleteQuestionOptions(questionId: number) {
    await db.delete(questionOptions).where(eq(questionOptions.questionId, questionId));
  }

  async getSubquestions(questionId: number) {
    return db.select().from(subquestions).where(eq(subquestions.questionId, questionId)).orderBy(asc(subquestions.orderIndex));
  }

  async createSubquestion(sq: InsertSubquestion) {
    const [created] = await db.insert(subquestions).values(sq).returning();
    return created;
  }

  async deleteSubquestions(questionId: number) {
    // Must delete responses referencing these subquestions first (FK constraint)
    const existingSubs = await db.select({ id: subquestions.id }).from(subquestions).where(eq(subquestions.questionId, questionId));
    if (existingSubs.length > 0) {
      const { inArray } = await import("drizzle-orm");
      const subIds = existingSubs.map(s => s.id);
      await db.delete(responses).where(inArray(responses.subquestionId, subIds));
    }
    await db.delete(subquestions).where(eq(subquestions.questionId, questionId));
  }

  async getAttempt(id: number) {
    const [a] = await db.select().from(attempts).where(eq(attempts.id, id));
    return a;
  }

  async getAttemptByExamStudent(examStudentId: number) {
    const [a] = await db.select().from(attempts).where(eq(attempts.examStudentId, examStudentId)).orderBy(desc(attempts.startedAt));
    return a;
  }

  async createAttempt(a: InsertAttempt) {
    const [created] = await db.insert(attempts).values(a).returning();
    return created;
  }

  async updateAttempt(id: number, data: Partial<Attempt>) {
    await db.update(attempts).set(data).where(eq(attempts.id, id));
  }

  async resetAttempt(examStudentId: number) {
    const allAttempts = await db.select().from(attempts).where(eq(attempts.examStudentId, examStudentId));
    for (const attempt of allAttempts) {
      await db.delete(responses).where(eq(responses.attemptId, attempt.id));
    }
    await db.delete(attempts).where(eq(attempts.examStudentId, examStudentId));
    await db.update(examStudents).set({
      attemptStatus: "not_started",
      resetCount: sql`${examStudents.resetCount} + 1`
    }).where(eq(examStudents.id, examStudentId));
  }

  async getResponse(attemptId: number, questionId: number, subquestionId?: number | null) {
    const conditions = [eq(responses.attemptId, attemptId), eq(responses.questionId, questionId)];
    if (subquestionId) {
      conditions.push(eq(responses.subquestionId, subquestionId));
    }
    const [r] = await db.select().from(responses).where(and(...conditions));
    return r;
  }

  async getResponsesByAttempt(attemptId: number) {
    return db.select().from(responses).where(eq(responses.attemptId, attemptId));
  }

  async upsertResponse(r: InsertResponse) {
    const conditions = [eq(responses.attemptId, r.attemptId), eq(responses.questionId, r.questionId)];
    if (r.subquestionId) {
      conditions.push(eq(responses.subquestionId, r.subquestionId));
    } else {
      conditions.push(sql`${responses.subquestionId} IS NULL`);
    }
    const existing = await db.select().from(responses).where(and(...conditions));
    if (existing.length > 0) {
      const [updated] = await db.update(responses)
        .set({ answer: r.answer })
        .where(eq(responses.id, existing[0].id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(responses).values(r).returning();
    return created;
  }

  async updateResponse(id: number, data: Partial<ExamResponse>) {
    await db.update(responses).set(data).where(eq(responses.id, id));
  }

  async getAiProviders() {
    return db.select().from(aiProviders).orderBy(aiProviders.name);
  }

  async createAiProvider(p: InsertAiProvider) {
    const [created] = await db.insert(aiProviders).values(p).returning();
    return created;
  }

  async updateAiProvider(id: number, data: Partial<AiProvider>) {
    await db.update(aiProviders).set(data).where(eq(aiProviders.id, id));
  }

  async deleteAiProvider(id: number) {
    await db.delete(aiProviders).where(eq(aiProviders.id, id));
  }

  async getEmailTemplates() {
    return db.select().from(emailTemplates).orderBy(desc(emailTemplates.createdAt));
  }

  async getEmailTemplate(id: number) {
    const [t] = await db.select().from(emailTemplates).where(eq(emailTemplates.id, id));
    return t;
  }

  async createEmailTemplate(t: InsertEmailTemplate) {
    const [created] = await db.insert(emailTemplates).values(t).returning();
    return created;
  }

  async updateEmailTemplate(id: number, data: Partial<InsertEmailTemplate>) {
    await db.update(emailTemplates).set(data).where(eq(emailTemplates.id, id));
  }

  async createEmailLog(log: { templateId?: number; recipientEmail: string; subject: string; status: string; sentAt?: Date }) {
    await db.insert(emailLogs).values(log);
  }

  async getStudentFeedback(examId: number) {
    const rows = await db.select({
      id: studentFeedback.id,
      examId: studentFeedback.examId,
      studentId: studentFeedback.studentId,
      content: studentFeedback.content,
      rating: studentFeedback.rating,
      createdAt: studentFeedback.createdAt,
      studentName: students.name,
      studentEmail: students.email,
    })
    .from(studentFeedback)
    .leftJoin(students, eq(studentFeedback.studentId, students.id))
    .where(eq(studentFeedback.examId, examId))
    .orderBy(desc(studentFeedback.createdAt));
    return rows;
  }

  async createStudentFeedback(fb: InsertStudentFeedback) {
    const [created] = await db.insert(studentFeedback).values(fb).returning();
    return created;
  }

  async deleteStudentFeedback(id: number) {
    await db.delete(studentFeedback).where(eq(studentFeedback.id, id));
  }

  async getAllStudentsWithExams() {
    const result = await db
      .select({
        studentId: students.id,
        name: students.name,
        email: students.email,
        university: students.university,
        yearOfStudy: students.yearOfStudy,
        examId: examStudents.examId,
        examTitle: exams.title,
        attemptStatus: examStudents.attemptStatus,
        enrolledAt: examStudents.createdAt,
      })
      .from(students)
      .leftJoin(examStudents, eq(students.id, examStudents.studentId))
      .leftJoin(exams, eq(examStudents.examId, exams.id))
      .orderBy(asc(students.name));

    const map = new Map<number, { id: number; name: string; email: string; university: string | null; yearOfStudy: string | null; exams: any[] }>();
    for (const row of result) {
      if (!map.has(row.studentId)) {
        map.set(row.studentId, { id: row.studentId, name: row.name, email: row.email, university: row.university, yearOfStudy: row.yearOfStudy, exams: [] });
      }
      if (row.examId) {
        map.get(row.studentId)!.exams.push({
          examId: row.examId,
          examTitle: row.examTitle,
          attemptStatus: row.attemptStatus,
          enrolledAt: row.enrolledAt,
        });
      }
    }
    return Array.from(map.values());
  }

  async getInProgressAttempts() {
    return db.select({
      attemptId: attempts.id,
      examStudentId: attempts.examStudentId,
      examId: examStudents.examId,
      currentQuestionIndex: attempts.currentQuestionIndex,
      startedAt: attempts.startedAt,
      questionStartedAt: attempts.questionStartedAt,
      timerMode: exams.timerMode,
      perQuestionSeconds: exams.perQuestionSeconds,
      fullExamSeconds: exams.fullExamSeconds,
      autoMarkEnabled: exams.autoMarkEnabled,
    })
    .from(attempts)
    .innerJoin(examStudents, eq(attempts.examStudentId, examStudents.id))
    .innerJoin(exams, eq(examStudents.examId, exams.id))
    .where(and(eq(attempts.status, "in_progress"), eq(examStudents.attemptStatus, "in_progress")));
  }

  async createAuditLog(log: { adminId?: number; action: string; details?: string }) {
    await db.insert(auditLogs).values(log);
  }

  async getAiMarkingJob(id: number) {
    const [job] = await db.select().from(aiMarkingJobs).where(eq(aiMarkingJobs.id, id));
    return job;
  }

  async getAiMarkingJobsByExam(examId: number) {
    return db.select().from(aiMarkingJobs).where(eq(aiMarkingJobs.examId, examId)).orderBy(desc(aiMarkingJobs.createdAt));
  }

  async createAiMarkingJob(job: { examId: number; totalItems: number; prompt?: string }) {
    const [created] = await db.insert(aiMarkingJobs).values(job).returning();
    return created;
  }

  async updateAiMarkingJob(id: number, data: Partial<AiMarkingJob>) {
    await db.update(aiMarkingJobs).set(data).where(eq(aiMarkingJobs.id, id));
  }

  async getExamStats(examId: number) {
    const allStudents = await db.select().from(examStudents).where(eq(examStudents.examId, examId));
    const total = allStudents.length;
    const submitted = allStudents.filter(s => s.attemptStatus === "submitted").length;
    const inProgress = allStudents.filter(s => s.attemptStatus === "in_progress").length;
    const notStarted = allStudents.filter(s => s.attemptStatus === "not_started").length;
    return { total, submitted, inProgress, notStarted };
  }

  async getExamRankings(examId: number) {
    const examStudentsList = await db
      .select()
      .from(examStudents)
      .innerJoin(students, eq(examStudents.studentId, students.id))
      .where(and(eq(examStudents.examId, examId), eq(examStudents.attemptStatus, "submitted")));

    const rankings = [];
    for (const es of examStudentsList) {
      const attempt = await this.getAttemptByExamStudent(es.exam_students.id);
      if (!attempt) continue;
      const resps = await this.getResponsesByAttempt(attempt.id);
      const totalScore = resps.reduce((sum, r) => sum + (r.marksAwarded || 0), 0);
      const qs = await this.getQuestionsByExam(examId);
      let maxScore = 0;
      for (const q of qs) {
        if (q.hasSubquestions) {
          const subs = await this.getSubquestions(q.id);
          maxScore += subs.reduce((s, sq) => s + sq.marks, 0);
        } else {
          maxScore += q.marks;
        }
      }
      rankings.push({
        studentName: es.students.name,
        studentEmail: es.students.email,
        totalScore,
        maxScore,
        percentage: maxScore > 0 ? (totalScore / maxScore) * 100 : 0,
      });
    }
    return rankings.sort((a, b) => b.percentage - a.percentage);
  }

  async getQuestionAnalytics(examId: number) {
    const qs = await this.getQuestionsByExam(examId);
    const analytics = [];
    for (const q of qs) {
      const allResponses = await db
        .select()
        .from(responses)
        .where(eq(responses.questionId, q.id));
      const totalAttempts = allResponses.length;
      const correctCount = allResponses.filter(r => r.isCorrect === true).length;
      const avgMarks = totalAttempts > 0
        ? allResponses.reduce((sum, r) => sum + (r.marksAwarded || 0), 0) / totalAttempts
        : 0;
      analytics.push({
        questionId: q.id,
        content: q.content,
        type: q.type,
        totalAttempts,
        correctCount,
        avgMarks,
      });
    }
    return analytics;
  }

  async createStudentSignup(data: { name: string; email: string; university: string; yearOfStudy?: string | null; password?: string | null; verificationCode: string; verificationExpiresAt: Date; token: string }) {
    const [row] = await db.insert(studentSignups).values({
      ...data,
      emailVerified: false,
      status: "pending_email",
    }).returning();
    return row;
  }

  async getStudentSignupByEmail(email: string) {
    const normalized = (email || "").trim().toLowerCase();
    const [row] = await db.select().from(studentSignups).where(eq(studentSignups.email, normalized)).orderBy(desc(studentSignups.createdAt));
    return row;
  }

  async getStudentSignupByToken(token: string) {
    const [row] = await db.select().from(studentSignups).where(eq(studentSignups.token, token));
    return row;
  }

  async getStudentSignupById(id: number) {
    const [row] = await db.select().from(studentSignups).where(eq(studentSignups.id, id));
    return row;
  }

  async getAllStudentSignups() {
    return db.select().from(studentSignups).orderBy(desc(studentSignups.createdAt));
  }

  async updateStudentSignup(id: number, data: Partial<StudentSignup>) {
    const [row] = await db.update(studentSignups).set(data).where(eq(studentSignups.id, id)).returning();
    return row;
  }

  async deleteStudentSignup(id: number) {
    await db.delete(studentSignups).where(eq(studentSignups.id, id));
  }

  async deleteStudentSignupsByEmail(email: string) {
    await db.delete(studentSignups).where(eq(studentSignups.email, email.trim().toLowerCase()));
  }

  async deleteProcessedStudentSignups() {
    const result = await db.delete(studentSignups)
      .where(inArray(studentSignups.status, ["approved", "rejected"]))
      .returning({ id: studentSignups.id });
    return result.length;
  }

  async getUniversities() {
    return db.select().from(universities).orderBy(asc(universities.name));
  }

  async createUniversity(name: string) {
    const [row] = await db.insert(universities).values({ name: name.trim() }).returning();
    return row;
  }

  async deleteUniversity(id: number) {
    await db.delete(universities).where(eq(universities.id, id));
  }

  // ── Demo exam system ────────────────────────────────────────────────────────
  async getDemoExams() {
    return db.select().from(demoExams).where(eq(demoExams.isActive, true)).orderBy(asc(demoExams.displayOrder));
  }
  async getAllDemoExams() {
    return db.select().from(demoExams).orderBy(asc(demoExams.displayOrder));
  }
  async getDemoExam(id: number) {
    const [row] = await db.select().from(demoExams).where(eq(demoExams.id, id));
    return row;
  }
  async createDemoExam(data: { title: string; displayOrder?: number; timerSeconds?: number }) {
    const [row] = await db.insert(demoExams).values({ ...data }).returning();
    return row;
  }
  async updateDemoExam(id: number, data: Partial<DemoExam>) {
    const [row] = await db.update(demoExams).set(data).where(eq(demoExams.id, id)).returning();
    return row;
  }
  async deleteDemoExam(id: number) {
    await db.delete(demoExams).where(eq(demoExams.id, id));
  }
  async getDemoQuestions(demoExamId: number) {
    return db.select().from(demoQuestions).where(eq(demoQuestions.demoExamId, demoExamId)).orderBy(asc(demoQuestions.orderIndex));
  }
  async createDemoQuestion(data: Omit<DemoQuestion, 'id'>) {
    const [row] = await db.insert(demoQuestions).values(data).returning();
    return row;
  }
  async updateDemoQuestion(id: number, data: Partial<DemoQuestion>) {
    const [row] = await db.update(demoQuestions).set(data).where(eq(demoQuestions.id, id)).returning();
    return row;
  }
  async deleteDemoQuestion(id: number) {
    await db.delete(demoQuestions).where(eq(demoQuestions.id, id));
  }

  async recordDemoEngagement(data: {
    demoExamId: number;
    questionId?: number | null;
    eventType: string;
    sessionId: string;
    isCorrect?: boolean | null;
    responseLength?: number | null;
  }) {
    await db.insert(demoEngagementEvents).values({
      demoExamId: data.demoExamId,
      questionId: data.questionId ?? null,
      eventType: data.eventType,
      sessionId: data.sessionId,
      isCorrect: data.isCorrect ?? null,
      responseLength: data.responseLength ?? null,
    });
  }

  async getDemoEngagementSummary() {
    const examRows = await db.execute(sql`
      SELECT
        e.id,
        e.title,
        COUNT(ev.id) FILTER (WHERE ev.event_type = 'started')::int AS starts,
        COUNT(ev.id) FILTER (WHERE ev.event_type = 'mcq_answered')::int AS "mcqAnswered",
        COUNT(ev.id) FILTER (WHERE ev.event_type = 'mcq_answered' AND ev.is_correct = true)::int AS "mcqCorrect",
        COUNT(ev.id) FILTER (WHERE ev.event_type = 'saq_started')::int AS "saqStarted",
        COUNT(ev.id) FILTER (WHERE ev.event_type = 'saq_submitted')::int AS "saqSubmitted",
        COUNT(ev.id) FILTER (WHERE ev.event_type = 'completed')::int AS completions,
        to_char(MAX(ev.created_at), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "lastActivity"
      FROM demo_exams e
      LEFT JOIN demo_engagement_events ev ON ev.demo_exam_id = e.id
      GROUP BY e.id, e.title, e.display_order
      ORDER BY e.display_order ASC, e.id ASC
    `);
    const questionRows = await db.execute(sql`
      SELECT
        q.id,
        q.demo_exam_id AS "examId",
        e.title AS "examTitle",
        q.type,
        q.content,
        COUNT(ev.id) FILTER (WHERE ev.event_type IN ('mcq_answered', 'saq_submitted'))::int AS answered,
        COUNT(ev.id) FILTER (WHERE ev.event_type = 'mcq_answered' AND ev.is_correct = true)::int AS correct,
        COUNT(ev.id) FILTER (WHERE ev.event_type = 'saq_submitted')::int AS submitted,
        to_char(MAX(ev.created_at), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "lastActivity"
      FROM demo_questions q
      JOIN demo_exams e ON e.id = q.demo_exam_id
      LEFT JOIN demo_engagement_events ev ON ev.question_id = q.id
      GROUP BY q.id, q.demo_exam_id, e.id, e.title, e.display_order, q.type, q.content, q.order_index
      ORDER BY e.display_order ASC, q.order_index ASC, q.id ASC
    `);
    const dailyRows = await db.execute(sql`
      SELECT
        to_char(created_at::date, 'YYYY-MM-DD') AS date,
        COUNT(*) FILTER (WHERE event_type = 'started')::int AS starts,
        COUNT(*) FILTER (WHERE event_type = 'completed')::int AS completions,
        COUNT(*)::int AS total
      FROM demo_engagement_events
      WHERE created_at >= CURRENT_DATE - INTERVAL '59 days'
      GROUP BY created_at::date
      ORDER BY created_at::date ASC
    `);
    return {
      exams: examRows.rows as any,
      questions: questionRows.rows as any,
      daily: dailyRows.rows as any,
    };
  }

  async clearDemoEngagement(): Promise<void> {
    await db.execute(sql`DELETE FROM demo_engagement_events`);
  }

  // ── Site content (landing page CMS) ─────────────────────────────────────────
  async getSiteSettings(): Promise<Record<string, any>> {
    const rows = await db.select().from(siteSettings);
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }
  async setSiteSetting(key: string, value: any) {
    await db
      .insert(siteSettings)
      .values({ key, value })
      .onConflictDoUpdate({ target: siteSettings.key, set: { value } });
  }
  async getContentPage(slug: string) {
    const [row] = await db.select().from(contentPages).where(eq(contentPages.slug, slug));
    return row;
  }
  async upsertContentPage(slug: string, title: string, content: string) {
    const [row] = await db
      .insert(contentPages)
      .values({ slug, title, content })
      .onConflictDoUpdate({
        target: contentPages.slug,
        set: { title, content, updatedAt: sql`CURRENT_TIMESTAMP` },
      })
      .returning();
    return row;
  }
  async getFaqItems(activeOnly = true) {
    const q = db.select().from(faqItems);
    const rows = activeOnly
      ? await q.where(eq(faqItems.isActive, true)).orderBy(asc(faqItems.orderIndex))
      : await q.orderBy(asc(faqItems.orderIndex));
    return rows;
  }
  async createFaqItem(data: { question: string; answer: string; orderIndex?: number; isActive?: boolean }) {
    const [row] = await db.insert(faqItems).values(data).returning();
    return row;
  }
  async updateFaqItem(id: number, data: Partial<FaqItem>) {
    const [row] = await db.update(faqItems).set(data).where(eq(faqItems.id, id)).returning();
    return row;
  }
  async deleteFaqItem(id: number) {
    await db.delete(faqItems).where(eq(faqItems.id, id));
  }
  async createInquiry(data: { name: string; email: string; institution: string; message?: string | null }) {
    const [row] = await db.insert(institutionInquiries).values(data).returning();
    return row;
  }
  async getInquiries() {
    return db.select().from(institutionInquiries).orderBy(desc(institutionInquiries.createdAt));
  }
  async updateInquiry(id: number, data: Partial<InstitutionInquiry>) {
    const [row] = await db.update(institutionInquiries).set(data).where(eq(institutionInquiries.id, id)).returning();
    return row;
  }
  async deleteInquiry(id: number) {
    await db.delete(institutionInquiries).where(eq(institutionInquiries.id, id));
  }
}

export const storage = new DatabaseStorage();
