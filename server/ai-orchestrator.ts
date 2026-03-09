import OpenAI from "openai";
import { storage } from "./storage";
import type { AiProvider } from "@shared/schema";

interface MarkingItem {
  responseId: number;
  questionContent: string;
  expectedAnswer: string;
  studentAnswer: string;
  marks: number;
  imageCaption?: string | null;
  examStudentId: number;
  studentName: string;
  studentEmail: string;
  isUnanswered?: boolean;
}

interface MarkingResult {
  responseId: number;
  isCorrect: boolean;
  marksAwarded: number;
  feedback: string;
}

export interface MarkingProgressEvent {
  completed: number;
  total: number;
  studentName: string;
  studentEmail: string;
  examStudentId: number;
  error?: string;
}

function getAiClient(provider: AiProvider): OpenAI {
  const endpoint = provider.endpoint || (provider.baseUrlEnv ? process.env[provider.baseUrlEnv] : undefined);
  const apiKey = provider.apiKeyDirect || (provider.apiKeyEnv ? process.env[provider.apiKeyEnv] : "");
  return new OpenAI({ apiKey: apiKey || "dummy", baseURL: endpoint });
}

function getModelName(provider: AiProvider): string {
  if (provider.model) return provider.model;
  switch (provider.type) {
    case "openai": return "gpt-4o";
    case "gemini": return "gemini-2.0-flash";
    case "anthropic": return "claude-sonnet-4-20250514";
    default: return "gpt-4o";
  }
}

function getWeightedProviderOrder(providers: AiProvider[], index: number): AiProvider[] {
  if (providers.length === 0) return [];
  const totalWeight = providers.reduce((sum, p) => sum + p.weight, 0);
  let weightedIndex = index % totalWeight;
  let startIdx = 0;
  for (let i = 0; i < providers.length; i++) {
    if (weightedIndex < providers[i].weight) { startIdx = i; break; }
    weightedIndex -= providers[i].weight;
  }
  const order: AiProvider[] = [];
  for (let i = 0; i < providers.length; i++) {
    order.push(providers[(startIdx + i) % providers.length]);
  }
  return order;
}

const DEFAULT_PROMPT = `You are marking a medical exam short answer question. Compare the student's answer to the expected answer.

Rules:
- Be strict but fair in your evaluation.
- Accept synonyms, abbreviations, alternative spellings, and similar phrasing that conveys the same meaning as the expected answer.
- Minor spelling mistakes should not count against the student if the intended answer is clearly correct.
- If the student's answer is INCORRECT, your feedback MUST explain why the expected answer is the correct one — provide a brief educational explanation.
- If the student's answer is CORRECT, give brief positive feedback.
- NEVER mention "image description", "image caption", "based on the image", or any reference to images/descriptions in your feedback. Write as if you inherently know the subject matter.

Respond in JSON format: {"isCorrect": true/false, "feedback": "your feedback"}`;

async function callProvider(
  item: MarkingItem,
  provider: AiProvider,
  prompt: string
): Promise<MarkingResult> {
  const client = getAiClient(provider);
  const model = getModelName(provider);

  let userContent = `Question: ${item.questionContent}\nExpected Answer: ${item.expectedAnswer}\nStudent Answer: ${item.studentAnswer}`;
  if (item.imageCaption) {
    userContent += `\nAdditional context: ${item.imageCaption}`;
  }

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: prompt },
      { role: "user", content: userContent },
    ],
    response_format: { type: "json_object" },
    max_tokens: 500,
  });

  const content = response.choices[0]?.message?.content || "{}";
  let parsed: { isCorrect: boolean; feedback: string };
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = { isCorrect: false, feedback: "Unable to parse AI response" };
  }

  const marksAwarded = parsed.isCorrect ? item.marks : 0;
  await storage.updateResponse(item.responseId, {
    isCorrect: parsed.isCorrect,
    aiFeedback: parsed.feedback,
    marksAwarded,
  });

  return {
    responseId: item.responseId,
    isCorrect: parsed.isCorrect,
    marksAwarded,
    feedback: parsed.feedback,
  };
}

async function markItemWithFallback(
  item: MarkingItem,
  providers: AiProvider[],
  prompt: string,
  itemIndex: number
): Promise<{ result: MarkingResult | null; error?: string }> {
  const providerOrder = getWeightedProviderOrder(providers, itemIndex);
  for (const provider of providerOrder) {
    try {
      const result = await callProvider(item, provider, prompt);
      return { result };
    } catch (err: any) {
      console.error(`Provider "${provider.name}" failed for response ${item.responseId}: ${err.message}`);
    }
  }
  return { result: null, error: `All ${providers.length} provider(s) failed for this response` };
}

async function buildMarkingItems(
  examId: number,
  filterExamStudentId?: number,
  includeAlreadyMarked = false
): Promise<MarkingItem[]> {
  const questions = await storage.getQuestionsByExam(examId);
  const saqQuestions = questions.filter(q => q.type === "saq");
  const examStudents = await storage.getStudentsByExam(examId);

  const studentsToProcess = filterExamStudentId
    ? examStudents.filter(es => es.id === filterExamStudentId)
    : examStudents;

  const items: MarkingItem[] = [];

  for (const es of studentsToProcess) {
    const attempt = await storage.getAttemptByExamStudent(es.id);
    if (!attempt) continue;

    const allResponses = await storage.getResponsesByAttempt(attempt.id);
    const studentName = es.student?.name || "Unknown";
    const studentEmail = es.student?.email || "";

    for (const q of saqQuestions) {
      if (q.hasSubquestions) {
        const subs = await storage.getSubquestions(q.id);
        for (const sq of subs) {
          const resp = allResponses.find(r => r.questionId === q.id && r.subquestionId === sq.id);
          if (resp && resp.answer) {
            if (!includeAlreadyMarked && resp.isCorrect !== null) continue;
            items.push({
              responseId: resp.id,
              questionContent: `${q.content}\n${sq.content}`,
              expectedAnswer: sq.expectedAnswer || "",
              studentAnswer: resp.answer,
              marks: sq.marks,
              imageCaption: q.imageCaption,
              examStudentId: es.id,
              studentName,
              studentEmail,
            });
          } else {
            if (!includeAlreadyMarked && resp && resp.isCorrect !== null) continue;
            const upserted = await storage.upsertResponse({
              attemptId: attempt.id,
              questionId: q.id,
              subquestionId: sq.id,
              answer: null,
            });
            items.push({
              responseId: upserted.id,
              questionContent: `${q.content}\n${sq.content}`,
              expectedAnswer: sq.expectedAnswer || "",
              studentAnswer: "",
              marks: sq.marks,
              imageCaption: q.imageCaption,
              examStudentId: es.id,
              studentName,
              studentEmail,
              isUnanswered: true,
            });
          }
        }
      } else {
        const resp = allResponses.find(r => r.questionId === q.id && !r.subquestionId);
        if (resp && resp.answer) {
          if (!includeAlreadyMarked && resp.isCorrect !== null) continue;
          items.push({
            responseId: resp.id,
            questionContent: q.content,
            expectedAnswer: q.expectedAnswer || "",
            studentAnswer: resp.answer,
            marks: q.marks,
            imageCaption: q.imageCaption,
            examStudentId: es.id,
            studentName,
            studentEmail,
          });
        } else {
          if (!includeAlreadyMarked && resp && resp.isCorrect !== null) continue;
          const upserted = await storage.upsertResponse({
            attemptId: attempt.id,
            questionId: q.id,
            subquestionId: null,
            answer: null,
          });
          items.push({
            responseId: upserted.id,
            questionContent: q.content,
            expectedAnswer: q.expectedAnswer || "",
            studentAnswer: "",
            marks: q.marks,
            imageCaption: q.imageCaption,
            examStudentId: es.id,
            studentName,
            studentEmail,
            isUnanswered: true,
          });
        }
      }
    }
  }

  return items;
}

function getDefaultProviders(): AiProvider[] {
  return [{
    id: 0, name: "OpenAI (Default)", type: "openai",
    apiKeyEnv: "AI_INTEGRATIONS_OPENAI_API_KEY",
    baseUrlEnv: "AI_INTEGRATIONS_OPENAI_BASE_URL",
    endpoint: null, model: null, isActive: true, weight: 1,
    apiKeyDirect: null,
  }];
}

export async function markSAQResponses(
  examId: number,
  customPrompt?: string,
  onProgress?: (event: MarkingProgressEvent) => void
): Promise<{ jobId: number; results: MarkingResult[]; errors: { responseId: number; error: string }[] }> {
  let providers = (await storage.getAiProviders()).filter(p => p.isActive);
  if (providers.length === 0) providers = getDefaultProviders();

  const items = await buildMarkingItems(examId);
  const job = await storage.createAiMarkingJob({ examId, totalItems: items.length, prompt: customPrompt });
  const prompt = customPrompt || DEFAULT_PROMPT;

  const results: MarkingResult[] = [];
  const errors: { responseId: number; error: string }[] = [];
  let completed = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    let result: MarkingResult | null = null;
    let error: string | undefined;

    if (item.isUnanswered) {
      const feedback = item.expectedAnswer
        ? `Not answered. The correct answer is: ${item.expectedAnswer}`
        : "Not answered.";
      await storage.updateResponse(item.responseId, {
        isCorrect: false,
        aiFeedback: feedback,
        marksAwarded: 0,
      });
      result = { responseId: item.responseId, isCorrect: false, marksAwarded: 0, feedback };
    } else {
      const out = await markItemWithFallback(item, providers, prompt, i);
      result = out.result;
      error = out.error;
    }

    completed++;
    await storage.updateAiMarkingJob(job.id, { completedItems: completed });

    if (result) {
      results.push(result);
    } else {
      errors.push({ responseId: item.responseId, error: error || "Unknown error" });
    }

    onProgress?.({
      completed,
      total: items.length,
      studentName: item.studentName,
      studentEmail: item.studentEmail,
      examStudentId: item.examStudentId,
      error,
    });
  }

  await storage.updateAiMarkingJob(job.id, { status: "completed", completedItems: completed });
  return { jobId: job.id, results, errors };
}

export async function markStudentSAQResponses(
  examId: number,
  examStudentId: number,
  customPrompt?: string,
  onProgress?: (event: MarkingProgressEvent) => void
): Promise<{ results: MarkingResult[]; errors: { responseId: number; error: string }[] }> {
  let providers = (await storage.getAiProviders()).filter(p => p.isActive);
  if (providers.length === 0) throw new Error("No active AI providers");

  const attempt = await storage.getAttemptByExamStudent(examStudentId);
  if (attempt) {
    const { db } = await import("./db");
    const { responses } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    const questions = await storage.getQuestionsByExam(examId);
    const saqQuestionIds = new Set(questions.filter(q => q.type === "saq").map(q => q.id));
    const allResps = await storage.getResponsesByAttempt(attempt.id);
    for (const resp of allResps) {
      if (saqQuestionIds.has(resp.questionId)) {
        await db.update(responses)
          .set({ isCorrect: null, aiFeedback: null, marksAwarded: null })
          .where(eq(responses.id, resp.id));
      }
    }
  }

  const items = await buildMarkingItems(examId, examStudentId, true);
  const prompt = customPrompt || DEFAULT_PROMPT;

  const results: MarkingResult[] = [];
  const errors: { responseId: number; error: string }[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    let result: MarkingResult | null = null;
    let error: string | undefined;

    if (item.isUnanswered) {
      const feedback = item.expectedAnswer
        ? `Not answered. The correct answer is: ${item.expectedAnswer}`
        : "Not answered.";
      await storage.updateResponse(item.responseId, {
        isCorrect: false,
        aiFeedback: feedback,
        marksAwarded: 0,
      });
      result = { responseId: item.responseId, isCorrect: false, marksAwarded: 0, feedback };
    } else {
      const out = await markItemWithFallback(item, providers, prompt, i);
      result = out.result;
      error = out.error;
    }

    if (result) results.push(result);
    else errors.push({ responseId: item.responseId, error: error || "Unknown error" });
    onProgress?.({
      completed: i + 1,
      total: items.length,
      studentName: item.studentName,
      studentEmail: item.studentEmail,
      examStudentId: item.examStudentId,
      error,
    });
  }

  return { results, errors };
}

export async function markSingleResponse(
  responseId: number,
  customPrompt?: string
): Promise<MarkingResult> {
  let providers = (await storage.getAiProviders()).filter(p => p.isActive);
  if (providers.length === 0) throw new Error("No active AI providers");

  const { db } = await import("./db");
  const { responses, questions, subquestions: subqTable, attempts } = await import("@shared/schema");
  const { eq } = await import("drizzle-orm");

  const [resp] = await db.select().from(responses).where(eq(responses.id, responseId));
  if (!resp || !resp.answer) throw new Error("Response not found or empty");

  const [question] = await db.select().from(questions).where(eq(questions.id, resp.questionId));
  if (!question) throw new Error("Question not found");

  let expectedAnswer = question.expectedAnswer || "";
  let questionContent = question.content;
  let marks = question.marks;

  if (resp.subquestionId) {
    const [sq] = await db.select().from(subqTable).where(eq(subqTable.id, resp.subquestionId));
    if (sq) {
      questionContent = `${question.content}\n${sq.content}`;
      expectedAnswer = sq.expectedAnswer || "";
      marks = sq.marks;
    }
  }

  const [attempt] = await db.select().from(attempts).where(eq(attempts.id, resp.attemptId));
  let studentName = "Unknown";
  let studentEmail = "";
  let examStudentId = 0;
  if (attempt) {
    examStudentId = attempt.examStudentId;
    const examStudents = await storage.getStudentsByExam(question.examId);
    const es = examStudents.find(s => s.id === attempt.examStudentId);
    if (es) {
      studentName = es.student?.name || "Unknown";
      studentEmail = es.student?.email || "";
    }
  }

  const prompt = customPrompt || DEFAULT_PROMPT;
  const fakeItem: MarkingItem = {
    responseId: resp.id,
    questionContent,
    expectedAnswer,
    studentAnswer: resp.answer,
    marks,
    imageCaption: question.imageCaption,
    examStudentId,
    studentName,
    studentEmail,
  };

  const { result, error } = await markItemWithFallback(fakeItem, providers, prompt, 0);
  if (!result) throw new Error(error || "All providers failed");
  return result;
}
