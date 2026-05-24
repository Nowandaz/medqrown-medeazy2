import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
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

function getGeminiClient(provider: AiProvider): GoogleGenerativeAI {
  // The Replit Gemini sidecar injects AI_INTEGRATIONS_GEMINI_API_KEY and
  // AI_INTEGRATIONS_GEMINI_BASE_URL. The Google GenAI SDK accepts a custom
  // apiEndpoint to redirect through the Replit proxy.
  const key = getProviderKey(provider) || "dummy";
  const endpoint = getProviderEndpoint(provider);
  return endpoint
    ? new GoogleGenerativeAI(key, { apiEndpoint: endpoint } as any)
    : new GoogleGenerativeAI(key);
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
const DEFAULT_PROMPT = `You are an experienced medical examiner marking a short-answer question. Compare the student's answer to the expected answer and provide educational feedback.

Marking rules:
- Be strict but fair. Accept synonyms, abbreviations, alternative spellings, and equivalent phrasing that clearly conveys the same meaning.
- Minor spelling errors are acceptable if the intended answer is unambiguous.

Feedback rules — this is the most important part:
- If CORRECT: Start with a brief affirmation (e.g. "Correct!" or "Well done."), then add one concise educational point — a clinical pearl, the underlying mechanism, or a related fact that deepens understanding. Keep it to 2 sentences maximum.
- If INCORRECT: Clearly state the correct answer, then briefly explain WHY it is correct — the underlying physiology, pharmacology, or clinical reasoning. Do NOT just repeat the expected answer verbatim; give the student something to learn from. Keep it to 2–3 sentences.
- NEVER mention "image description", "image caption", or any reference to images in your feedback. Write as if you inherently know the subject matter.

Respond in JSON format only: {"isCorrect": true/false, "feedback": "your feedback"}`;

// Used for batch marking — all of one student's answers in a single API call
const DEFAULT_BATCH_PROMPT = `You are an experienced medical examiner marking a batch of short-answer questions. For each numbered answer, compare the student's response to the expected answer and provide educational feedback.

Marking rules:
- Be strict but fair. Accept synonyms, abbreviations, alternative spellings, and equivalent phrasing that clearly conveys the same meaning.
- Minor spelling errors are acceptable if the intended answer is unambiguous.

Feedback rules — this is the most important part:
- If CORRECT: Start with a brief affirmation (e.g. "Correct!" or "Well done."), then add one concise educational point — a clinical pearl, the underlying mechanism, or a related fact that deepens understanding. Keep it to 2 sentences maximum.
- If INCORRECT: Clearly state the correct answer, then briefly explain WHY it is correct — the underlying physiology, pharmacology, or clinical reasoning. Do NOT just repeat the expected answer verbatim; give the student something to learn from. Keep it to 2–3 sentences.
- NEVER mention "image description", "image caption", or any reference to images in your feedback. Write as if you inherently know the subject matter.

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
  } else if (provider.type === "gemini") {
    const client = getGeminiClient(provider);
    const geminiModel = client.getGenerativeModel({
      model,
      systemInstruction: prompt,
    });
    const result = await geminiModel.generateContent({
      contents: [{ role: "user", parts: [{ text: userContent }] }],
      generationConfig: { maxOutputTokens: 500 },
    });
    rawContent = result.response.text();
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

// ─── How many answers per API request ────────────────────────────────────────
const CHUNK_SIZE = 15;

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

// ─── Request body builder — exported so you can inspect/log it ───────────────
//
// Builds the plain-text user message that gets sent in each API request.
// Items are numbered 1..N within each chunk (reset per chunk).
// The system prompt instructs the model to return {"results": [{"id":1,...}, ...]}
//
export function buildBatchRequestBody(items: MarkingItem[]): string {
  return items.map((item, idx) => {
    let block = [
      `Answer ${idx + 1}:`,
      `Question: ${item.questionContent}`,
      `Expected Answer: ${item.expectedAnswer}`,
      `Student Answer: ${item.studentAnswer || "(no answer given)"}`,
    ].join("\n");
    if (item.imageCaption) block += `\nContext: ${item.imageCaption}`;
    return block;
  }).join("\n\n---\n\n");
}

// ─── Single chunk call (one API request, ≤ CHUNK_SIZE answers) ───────────────

async function callProviderChunk(
  chunk: MarkingItem[],
  chunkIndex: number,
  totalChunks: number,
  provider: AiProvider,
  batchPrompt: string
): Promise<MarkingResult[]> {
  const model = getModelName(provider);
  const userBody = buildBatchRequestBody(chunk);
  // Allow generous output so verbose models (e.g. Gemini 2.5 Flash) don't truncate mid-JSON.
  // Formula: ~200 tokens per answer + 400 overhead, capped at 8000.
  // Gemini (direct key) and Replit OpenAI are free so no credit concerns.
  const maxTokens = Math.min(200 * chunk.length + 400, 8000);

  console.log(
    `[Chunk ${chunkIndex + 1}/${totalChunks}] ${chunk.length} answers → provider "${provider.name}" ` +
    `model="${model}" max_tokens=${maxTokens}`
  );

  let rawContent: string;

  if (provider.type === "anthropic") {
    const client = getAnthropicClient(provider);
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system: batchPrompt,
      messages: [{ role: "user", content: userBody }],
    });
    rawContent = response.content[0]?.type === "text" ? response.content[0].text : "";
  } else if (provider.type === "gemini") {
    const client = getGeminiClient(provider);
    const geminiModel = client.getGenerativeModel({
      model,
      systemInstruction: batchPrompt,
    });
    const result = await geminiModel.generateContent({
      contents: [{ role: "user", parts: [{ text: userBody }] }],
      generationConfig: { maxOutputTokens: maxTokens },
    });
    rawContent = result.response.text();
  } else {
    const client = getOpenAiClient(provider);
    // NOTE: Do NOT use response_format: json_object here — many free-tier and open-source
    // models (e.g. Gemma, Llama, Mistral via OpenRouter) reject it with a 400 error.
    // The system prompt already instructs the model to return JSON; parseJsonSafe handles
    // the response including markdown fences and minor deviations.
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: batchPrompt },
        { role: "user", content: userBody },
      ],
      max_tokens: maxTokens,
    });
    rawContent = response.choices[0]?.message?.content || "";
  }

  console.log(`[Chunk ${chunkIndex + 1}/${totalChunks}] Raw response: ${rawContent.slice(0, 600)}`);

  const data = parseJsonSafe(rawContent);
  if (!data) {
    throw new Error(
      `Chunk ${chunkIndex + 1}: could not parse JSON. Raw: ${rawContent.slice(0, 300)}`
    );
  }

  const resultsArray: any[] = Array.isArray(data.results)
    ? data.results
    : Array.isArray(data)
    ? data
    : null;

  if (!resultsArray) {
    throw new Error(
      `Chunk ${chunkIndex + 1}: missing results array. Keys: ${Object.keys(data).join(", ")}`
    );
  }

  if (resultsArray.length !== chunk.length) {
    console.warn(
      `[Chunk ${chunkIndex + 1}/${totalChunks}] Expected ${chunk.length} results but got ${resultsArray.length}`
    );
  }

  const results: MarkingResult[] = [];
  for (let idx = 0; idx < chunk.length; idx++) {
    const item = chunk[idx];
    // IDs within a chunk are 1-based (reset per chunk)
    const entry = resultsArray.find((r: any) => Number(r.id) === idx + 1) ?? resultsArray[idx];

    let isCorrect = false;
    let feedback = `AI did not return a result for answer ${idx + 1}`;

    if (entry) {
      isCorrect = typeof entry.isCorrect === "string"
        ? entry.isCorrect.toLowerCase() === "true"
        : Boolean(entry.isCorrect);
      feedback = entry.feedback || "";
    } else {
      console.error(`[Chunk ${chunkIndex + 1}] Missing entry for answer ${idx + 1}`);
    }

    const marksAwarded = isCorrect ? item.marks : 0;
    await storage.updateResponse(item.responseId, { isCorrect, aiFeedback: feedback, marksAwarded });
    results.push({ responseId: item.responseId, isCorrect, marksAwarded, feedback });
  }

  console.log(
    `[Chunk ${chunkIndex + 1}/${totalChunks}] Done — ${results.length} answers marked`
  );
  return results;
}

// ─── Mark one student's items: split into CHUNK_SIZE chunks, per-chunk fallback

async function markStudentItems(
  items: MarkingItem[],
  providers: AiProvider[],
  prompt: string,
  providerIndex: number
): Promise<{ results: MarkingResult[]; errors: { responseId: number; error: string }[] }> {
  const batchPrompt = prompt === DEFAULT_PROMPT
    ? DEFAULT_BATCH_PROMPT
    : `${prompt}\n\nRespond ONLY with a JSON object: {"results": [{"id": 1, "isCorrect": true, "feedback": "..."}, ...]}`;

  const chunks = chunkArray(items, CHUNK_SIZE);
  const totalChunks = chunks.length;
  console.log(
    `[Mark] Student has ${items.length} answers → ${totalChunks} chunk(s) of ≤${CHUNK_SIZE}`
  );

  const allResults: MarkingResult[] = [];
  const allErrors: { responseId: number; error: string }[] = [];

  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci];
    const providerOrder = getWeightedProviderOrder(providers, providerIndex + ci);
    const chunkErrors: string[] = [];
    let chunkDone = false;

    for (const provider of providerOrder) {
      try {
        const results = await callProviderChunk(chunk, ci, totalChunks, provider, batchPrompt);
        for (const r of results) allResults.push(r);
        chunkDone = true;
        break;
      } catch (err: any) {
        const msg = `Chunk ${ci + 1} — Provider "${provider.name}": ${err.message}`;
        console.error(`[Mark] ${msg}`);
        chunkErrors.push(msg);
      }
    }

    if (!chunkDone) {
      // All providers failed this chunk — surface the error
      throw new Error(
        `Marking failed for chunk ${ci + 1}/${totalChunks} (answers ${ci * CHUNK_SIZE + 1}–${Math.min((ci + 1) * CHUNK_SIZE, items.length)}):\n${chunkErrors.join("\n")}`
      );
    }
  }

  return { results: allResults, errors: allErrors };
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

    // Skip students who haven't submitted yet during bulk marking.
    // Marking in-progress students permanently stamps unanswered questions as
    // "not answered" (isCorrect: false), which then gets skipped on their own
    // submission because the skip check is `isCorrect !== null`.
    // Only bypass this when marking a specific student (e.g. admin remark).
    if (!filterExamStudentId && attempt.status !== "submitted") continue;

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

function getReplitFallbackProvider(): AiProvider {
  return {
    id: 0, name: "OpenAI (Replit fallback)", type: "openai",
    apiKeyEnv: "AI_INTEGRATIONS_OPENAI_API_KEY",
    baseUrlEnv: "AI_INTEGRATIONS_OPENAI_BASE_URL",
    endpoint: null, model: null, isActive: true, weight: 1,
    apiKeyDirect: null,
  };
}

// Returns active DB providers with the Replit OpenAI appended as a last resort,
// but only when the Replit AI integrations sidecar is actually present (i.e. running on Replit).
// On Render and other non-Replit hosts those env vars don't exist, so we skip the fallback.
async function getProvidersWithFallback(): Promise<AiProvider[]> {
  const active = (await storage.getAiProviders()).filter(p => p.isActive);

  // Only add the Replit fallback if the sidecar key is actually injected
  const replitKeyAvailable = !!process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!replitKeyAvailable) {
    if (active.length === 0) {
      throw new Error(
        "No AI providers configured. Please add an AI provider (OpenAI, Anthropic, Gemini, or compatible) in the AI Providers settings."
      );
    }
    return active;
  }

  // On Replit: append the sidecar fallback unless already represented
  const alreadyHasReplit = active.some(
    p => p.apiKeyEnv === "AI_INTEGRATIONS_OPENAI_API_KEY" && !p.apiKeyDirect
  );
  return alreadyHasReplit ? active : [...active, getReplitFallbackProvider()];
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
  const providers = await getProvidersWithFallback();

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
  const providers = await getProvidersWithFallback();

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
  const providers = await getProvidersWithFallback();

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
