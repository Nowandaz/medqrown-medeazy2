import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
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

function getProviderKey(provider: AiProvider): string {
  return provider.apiKeyDirect || (provider.apiKeyEnv ? process.env[provider.apiKeyEnv] || "" : "");
}

function getProviderEndpoint(provider: AiProvider): string | undefined {
  const raw = provider.endpoint || (provider.baseUrlEnv ? process.env[provider.baseUrlEnv] : undefined);
  if (!raw) return undefined;
  // Strip common path suffixes that users mistakenly include in the base URL.
  // The OpenAI client appends /chat/completions itself, so the base URL must not include it.
  return raw
    .replace(/\/chat\/completions\/?$/, "")
    .replace(/\/messages\/?$/, "")
    .replace(/\/completions\/?$/, "")
    .replace(/\/$/, "");
}

function getOpenAiClient(provider: AiProvider): OpenAI {
  return new OpenAI({ apiKey: getProviderKey(provider) || "dummy", baseURL: getProviderEndpoint(provider) });
}

function getAnthropicClient(provider: AiProvider): Anthropic {
  return new Anthropic({ apiKey: getProviderKey(provider) || "dummy", baseURL: getProviderEndpoint(provider) });
}

function getModelName(provider: AiProvider): string {
  if (provider.model) return provider.model;
  switch (provider.type) {
    case "openai": return "gpt-4o";
    case "gemini": return "gemini-2.0-flash";
    case "anthropic": return "claude-sonnet-4-5";
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

// Used for single-response marking (fallback / markSingleResponse)
const DEFAULT_PROMPT = `You are marking a medical exam short answer question. Compare the student's answer to the expected answer.

Rules:
- Be strict but fair in your evaluation.
- Accept synonyms, abbreviations, alternative spellings, and similar phrasing that conveys the same meaning as the expected answer.
- Minor spelling mistakes should not count against the student if the intended answer is clearly correct.
- If the student's answer is INCORRECT, your feedback MUST explain why the expected answer is the correct one — provide a brief educational explanation.
- If the student's answer is CORRECT, give brief positive feedback.
- NEVER mention "image description", "image caption", "based on the image", or any reference to images/descriptions in your feedback. Write as if you inherently know the subject matter.

Respond in JSON format: {"isCorrect": true/false, "feedback": "your feedback"}`;

// Used for batch marking — all of one student's answers in a single API call
const DEFAULT_BATCH_PROMPT = `You are marking a medical exam. You will receive a numbered list of student answers. Mark each one against its expected answer.

Rules:
- Be strict but fair in your evaluation.
- Accept synonyms, abbreviations, alternative spellings, and similar phrasing that conveys the same meaning as the expected answer.
- Minor spelling mistakes should not count against the student if the intended answer is clearly correct.
- If the student's answer is INCORRECT, your feedback MUST explain why the expected answer is the correct one — provide a brief educational explanation.
- If the student's answer is CORRECT, give brief positive feedback.
- NEVER mention "image description", "image caption", "based on the image", or any reference to images/descriptions in your feedback. Write as if you inherently know the subject matter.

Respond ONLY with a JSON object in this exact format (one entry per numbered answer, in the same order):
{"results": [{"id": 1, "isCorrect": true, "feedback": "..."}, {"id": 2, "isCorrect": false, "feedback": "..."}, ...]}`;

function parseJsonSafe(raw: string): any {
  let content = raw.trim();
  // Strip markdown code fences
  const fenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) content = fenceMatch[1].trim();
  // Try direct parse
  try { return JSON.parse(content); } catch {}
  // Extract first {...} block
  const objMatch = content.match(/\{[\s\S]*\}/);
  if (objMatch) { try { return JSON.parse(objMatch[0]); } catch {} }
  return null;
}

// ─── Single-item call (used as fallback and for markSingleResponse) ───────────

async function callProviderSingle(
  item: MarkingItem,
  provider: AiProvider,
  prompt: string
): Promise<MarkingResult> {
  const model = getModelName(provider);
  let userContent = `Question: ${item.questionContent}\nExpected Answer: ${item.expectedAnswer}\nStudent Answer: ${item.studentAnswer}`;
  if (item.imageCaption) userContent += `\nAdditional context: ${item.imageCaption}`;

  let rawContent: string;

  if (provider.type === "anthropic") {
    const client = getAnthropicClient(provider);
    const response = await client.messages.create({
      model,
      max_tokens: 500,
      system: prompt,
      messages: [{ role: "user", content: userContent }],
    });
    rawContent = response.content[0]?.type === "text" ? response.content[0].text : "";
  } else {
    const client = getOpenAiClient(provider);
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: "system", content: prompt }, { role: "user", content: userContent }],
      response_format: { type: "json_object" },
      max_tokens: 500,
    });
    rawContent = response.choices[0]?.message?.content || "";
  }
  let parsed: { isCorrect: boolean; feedback: string };
  const data = parseJsonSafe(rawContent);
  if (data && typeof data.isCorrect !== "undefined") {
    parsed = {
      isCorrect: typeof data.isCorrect === "string"
        ? data.isCorrect.toLowerCase() === "true"
        : Boolean(data.isCorrect),
      feedback: data.feedback || "",
    };
  } else {
    console.error(`Failed to parse single AI response: ${rawContent.slice(0, 200)}`);
    parsed = { isCorrect: false, feedback: "Unable to parse AI response" };
  }

  const marksAwarded = parsed.isCorrect ? item.marks : 0;
  await storage.updateResponse(item.responseId, { isCorrect: parsed.isCorrect, aiFeedback: parsed.feedback, marksAwarded });
  return { responseId: item.responseId, isCorrect: parsed.isCorrect, marksAwarded, feedback: parsed.feedback };
}

// ─── Batch call — all items for ONE student in a single API request ───────────

async function callProviderBatch(
  items: MarkingItem[],
  provider: AiProvider,
  batchPrompt: string
): Promise<MarkingResult[]> {
  const model = getModelName(provider);

  const userLines = items.map((item, idx) => {
    let line = `Answer ${idx + 1}:\nQuestion: ${item.questionContent}\nExpected Answer: ${item.expectedAnswer}\nStudent Answer: ${item.studentAnswer || "(no answer given)"}`;
    if (item.imageCaption) line += `\nContext: ${item.imageCaption}`;
    return line;
  }).join("\n\n---\n\n");

  const maxTokens = Math.min(250 * items.length + 300, 8000);
  console.log(`[Batch] Sending ${items.length} answers to provider "${provider.name}" model="${model}" max_tokens=${maxTokens}`);

  let rawContent: string;

  if (provider.type === "anthropic") {
    const client = getAnthropicClient(provider);
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system: batchPrompt,
      messages: [{ role: "user", content: userLines }],
    });
    rawContent = response.content[0]?.type === "text" ? response.content[0].text : "";
  } else {
    const client = getOpenAiClient(provider);
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: "system", content: batchPrompt }, { role: "user", content: userLines }],
      response_format: { type: "json_object" },
      max_tokens: maxTokens,
    });
    rawContent = response.choices[0]?.message?.content || "";
  }
  console.log(`[Batch] Raw response:\n${rawContent.slice(0, 1000)}`);

  const data = parseJsonSafe(rawContent);

  if (!data) {
    throw new Error(`Could not parse JSON from batch response. Raw: ${rawContent.slice(0, 400)}`);
  }

  // Accept both {"results": [...]} and a direct array wrapped as {"0": ..., "1": ...} (some models)
  let resultsArray: any[] = Array.isArray(data.results) ? data.results
    : Array.isArray(data) ? data
    : null;

  if (!resultsArray) {
    throw new Error(`Batch response missing results array. Keys found: ${Object.keys(data).join(", ")}. Raw: ${rawContent.slice(0, 400)}`);
  }

  if (resultsArray.length !== items.length) {
    console.warn(`[Batch] Expected ${items.length} results but got ${resultsArray.length}`);
  }

  const results: MarkingResult[] = [];
  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const entry = resultsArray.find((r: any) => Number(r.id) === idx + 1) ?? resultsArray[idx];

    let isCorrect = false;
    let feedback = "No result returned for this answer";

    if (entry) {
      isCorrect = typeof entry.isCorrect === "string"
        ? entry.isCorrect.toLowerCase() === "true"
        : Boolean(entry.isCorrect);
      feedback = entry.feedback || "";
    } else {
      console.error(`[Batch] Missing result entry for answer ${idx + 1}`);
      feedback = `AI did not return a result for answer ${idx + 1}`;
    }

    const marksAwarded = isCorrect ? item.marks : 0;
    await storage.updateResponse(item.responseId, { isCorrect, aiFeedback: feedback, marksAwarded });
    results.push({ responseId: item.responseId, isCorrect, marksAwarded, feedback });
  }

  console.log(`[Batch] Done — ${results.length} answers marked in 1 API call`);
  return results;
}

// ─── Mark one student's items: batch only, NO individual fallback ─────────────

async function markStudentItems(
  items: MarkingItem[],
  providers: AiProvider[],
  prompt: string,
  providerIndex: number
): Promise<{ results: MarkingResult[]; errors: { responseId: number; error: string }[] }> {
  const batchPrompt = prompt === DEFAULT_PROMPT ? DEFAULT_BATCH_PROMPT
    : `${prompt}\n\nRespond ONLY with a JSON object: {"results": [{"id": 1, "isCorrect": true, "feedback": "..."}, ...]}`;

  const providerOrder = getWeightedProviderOrder(providers, providerIndex);
  const providerErrors: string[] = [];

  for (const provider of providerOrder) {
    try {
      const results = await callProviderBatch(items, provider, batchPrompt);
      return { results, errors: [] };
    } catch (err: any) {
      const msg = `Provider "${provider.name}": ${err.message}`;
      console.error(`[Batch] ${msg}`);
      providerErrors.push(msg);
    }
  }

  // All providers failed — throw so the error surfaces to the admin
  throw new Error(`Batch marking failed for all providers:\n${providerErrors.join("\n")}`);
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
            const upserted = await storage.upsertResponse({ attemptId: attempt.id, questionId: q.id, subquestionId: sq.id, answer: null });
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
          const upserted = await storage.upsertResponse({ attemptId: attempt.id, questionId: q.id, subquestionId: null, answer: null });
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

// Group items by student
function groupByStudent(items: MarkingItem[]): Map<number, MarkingItem[]> {
  const map = new Map<number, MarkingItem[]>();
  for (const item of items) {
    if (!map.has(item.examStudentId)) map.set(item.examStudentId, []);
    map.get(item.examStudentId)!.push(item);
  }
  return map;
}

export async function markSAQResponses(
  examId: number,
  customPrompt?: string,
  onProgress?: (event: MarkingProgressEvent) => void
): Promise<{ jobId: number; results: MarkingResult[]; errors: { responseId: number; error: string }[] }> {
  let providers = (await storage.getAiProviders()).filter(p => p.isActive);
  if (providers.length === 0) providers = getDefaultProviders();

  const allItems = await buildMarkingItems(examId);
  const job = await storage.createAiMarkingJob({ examId, totalItems: allItems.length, prompt: customPrompt });
  const prompt = customPrompt || DEFAULT_PROMPT;

  const results: MarkingResult[] = [];
  const errors: { responseId: number; error: string }[] = [];
  let completed = 0;

  // Separate unanswered (no API call needed) from items needing marking
  const unanswered = allItems.filter(i => i.isUnanswered);
  const toMark = allItems.filter(i => !i.isUnanswered);

  // Handle unanswered items instantly
  for (const item of unanswered) {
    const feedback = item.expectedAnswer
      ? `Not answered. The correct answer is: ${item.expectedAnswer}`
      : "Not answered.";
    await storage.updateResponse(item.responseId, { isCorrect: false, aiFeedback: feedback, marksAwarded: 0 });
    results.push({ responseId: item.responseId, isCorrect: false, marksAwarded: 0, feedback });
    completed++;
    await storage.updateAiMarkingJob(job.id, { completedItems: completed });
    onProgress?.({ completed, total: allItems.length, studentName: item.studentName, studentEmail: item.studentEmail, examStudentId: item.examStudentId });
  }

  // Group remaining items by student — one API call per student
  const byStudent = groupByStudent(toMark);
  let studentIndex = 0;

  for (const [examStudentId, studentItems] of byStudent) {
    const { studentName, studentEmail } = studentItems[0];

    const { results: studentResults, errors: studentErrors } = await markStudentItems(
      studentItems, providers, prompt, studentIndex++
    );

    for (const r of studentResults) results.push(r);
    for (const e of studentErrors) errors.push(e);

    completed += studentItems.length;
    await storage.updateAiMarkingJob(job.id, { completedItems: completed });

    onProgress?.({
      completed,
      total: allItems.length,
      studentName,
      studentEmail,
      examStudentId,
      error: studentErrors.length > 0 ? `${studentErrors.length} answer(s) failed` : undefined,
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
        await db.update(responses).set({ isCorrect: null, aiFeedback: null, marksAwarded: null }).where(eq(responses.id, resp.id));
      }
    }
  }

  const allItems = await buildMarkingItems(examId, examStudentId, true);
  const prompt = customPrompt || DEFAULT_PROMPT;

  const results: MarkingResult[] = [];
  const errors: { responseId: number; error: string }[] = [];

  const unanswered = allItems.filter(i => i.isUnanswered);
  const toMark = allItems.filter(i => !i.isUnanswered);

  for (const item of unanswered) {
    const feedback = item.expectedAnswer
      ? `Not answered. The correct answer is: ${item.expectedAnswer}`
      : "Not answered.";
    await storage.updateResponse(item.responseId, { isCorrect: false, aiFeedback: feedback, marksAwarded: 0 });
    results.push({ responseId: item.responseId, isCorrect: false, marksAwarded: 0, feedback });
    onProgress?.({ completed: results.length + errors.length, total: allItems.length, studentName: item.studentName, studentEmail: item.studentEmail, examStudentId: item.examStudentId });
  }

  if (toMark.length > 0) {
    const { results: batchResults, errors: batchErrors } = await markStudentItems(toMark, providers, prompt, 0);
    for (const r of batchResults) results.push(r);
    for (const e of batchErrors) errors.push(e);
    const { studentName, studentEmail } = toMark[0];
    onProgress?.({ completed: allItems.length, total: allItems.length, studentName, studentEmail, examStudentId, error: batchErrors.length > 0 ? `${batchErrors.length} answer(s) failed` : undefined });
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
    if (sq) { questionContent = `${question.content}\n${sq.content}`; expectedAnswer = sq.expectedAnswer || ""; marks = sq.marks; }
  }

  const [attempt] = await db.select().from(attempts).where(eq(attempts.id, resp.attemptId));
  let studentName = "Unknown", studentEmail = "", examStudentId = 0;
  if (attempt) {
    examStudentId = attempt.examStudentId;
    const examStudents = await storage.getStudentsByExam(question.examId);
    const es = examStudents.find(s => s.id === attempt.examStudentId);
    if (es) { studentName = es.student?.name || "Unknown"; studentEmail = es.student?.email || ""; }
  }

  const prompt = customPrompt || DEFAULT_PROMPT;
  const fakeItem: MarkingItem = { responseId: resp.id, questionContent, expectedAnswer, studentAnswer: resp.answer, marks, imageCaption: question.imageCaption, examStudentId, studentName, studentEmail };

  const providerOrder = getWeightedProviderOrder(providers, 0);
  for (const provider of providerOrder) {
    try {
      return await callProviderSingle(fakeItem, provider, prompt);
    } catch (err: any) {
      console.error(`Provider "${provider.name}" failed for single response ${responseId}: ${err.message}`);
    }
  }
  throw new Error("All providers failed");
}
