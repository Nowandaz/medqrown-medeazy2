import type { Express, RequestHandler } from "express";
import { pool } from "./db";
import { invalidateExamCache } from "./exam-cache";
import { storage } from "./storage";

/**
 * Admin → Exam → Questions → "Update via JSON".
 *
 * Takes the exported question JSON (each item carries the question's `id`),
 * compares it with the database and updates only what changed. Rows are edited
 * in place, never deleted and recreated, because students' saved answers point
 * at option and subquestion ids. Questions left out of the JSON are untouched;
 * nothing is added or deleted here.
 */

type ExistingQuestion = {
  id: number; type: string; content: string; marks: number; expectedAnswer: string | null;
  explanation: string | null; imageCaption: string | null; hasSubquestions: boolean; orderIndex: number;
  options: { id: number; content: string; isCorrect: boolean }[];
  subquestions: { id: number; content: string; marks: number; expectedAnswer: string | null }[];
};

type QuestionPlan = {
  id: number;
  number: number;
  changes: string[];
  question: Partial<Pick<ExistingQuestion, "content" | "marks" | "expectedAnswer" | "explanation" | "imageCaption">>;
  options: { id: number; content?: string; isCorrect?: boolean }[];
  subquestions: { id: number; content?: string; marks?: number; expectedAnswer?: string | null }[];
  rescoreMcq: boolean;
  saqMarksChanged: boolean;
};

class JsonUpdateError extends Error {}

const optionalText = (value: unknown): string | null => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text : null;
};

const requiredText = (value: unknown, label: string): string => {
  const text = optionalText(value);
  if (!text) throw new JsonUpdateError(`${label} cannot be empty`);
  return text;
};

const positiveInt = (value: unknown, label: string): number => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 1000) throw new JsonUpdateError(`${label} must be a whole number from 1 to 1000`);
  return n;
};

const optionLetter = (index: number) => String.fromCharCode(65 + index);

async function loadExamQuestions(examId: number): Promise<ExistingQuestion[]> {
  const { rows } = await pool.query(
    `SELECT q.id, q.type, q.content, q.marks, q.expected_answer AS "expectedAnswer", q.explanation,
            q.image_caption AS "imageCaption", q.has_subquestions AS "hasSubquestions", q.order_index AS "orderIndex",
            COALESCE((SELECT json_agg(json_build_object('id', o.id, 'content', o.content, 'isCorrect', o.is_correct)
                                      ORDER BY o.order_index, o.id)
                        FROM question_options o WHERE o.question_id = q.id), '[]'::json) AS options,
            COALESCE((SELECT json_agg(json_build_object('id', s.id, 'content', s.content, 'marks', s.marks,
                                                        'expectedAnswer', s.expected_answer)
                                      ORDER BY s.order_index, s.id)
                        FROM subquestions s WHERE s.question_id = q.id), '[]'::json) AS subquestions
       FROM questions q WHERE q.exam_id = $1 ORDER BY q.order_index, q.id`,
    [examId],
  );
  return rows;
}

/** Works out what each JSON item changes. Throws JsonUpdateError with a readable message on bad input. */
function planUpdates(items: any[], existing: ExistingQuestion[]): QuestionPlan[] {
  const byId = new Map(existing.map((q) => [q.id, q]));
  const position = new Map(existing.map((q, i) => [q.id, i + 1]));
  const seen = new Set<number>();
  const plans: QuestionPlan[] = [];

  items.forEach((item, itemIndex) => {
    const label = `Item ${itemIndex + 1}`;
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new JsonUpdateError(`${label}: each entry must be a question object`);
    const id = Number(item.id);
    if (!Number.isInteger(id)) {
      throw new JsonUpdateError(`${label}: missing "id". Start from the JSON that "Update via JSON" shows (or "Download current questions") so every question keeps its id.`);
    }
    const current = byId.get(id);
    if (!current) throw new JsonUpdateError(`${label}: question id ${id} is not in this exam`);
    if (seen.has(id)) throw new JsonUpdateError(`${label}: question id ${id} appears more than once`);
    seen.add(id);
    const q = `Question ${position.get(id)} (id ${id})`;

    if (item.type !== undefined && String(item.type).toLowerCase() !== current.type) {
      throw new JsonUpdateError(`${q}: changing the type from ${current.type.toUpperCase()} is not supported. Delete it and add a new question instead.`);
    }

    const plan: QuestionPlan = {
      id, number: position.get(id)!, changes: [], question: {}, options: [], subquestions: [],
      rescoreMcq: false, saqMarksChanged: false,
    };

    if (item.question !== undefined || item.content !== undefined) {
      const content = requiredText(item.question ?? item.content, `${q}: "question"`);
      if (content !== current.content.trim()) { plan.question.content = content; plan.changes.push("question text"); }
    }
    if (item.explanation !== undefined) {
      const explanation = optionalText(item.explanation);
      if (explanation !== optionalText(current.explanation)) { plan.question.explanation = explanation; plan.changes.push("explanation"); }
    }
    if (item.imageDescription !== undefined || item.imageCaption !== undefined) {
      const caption = optionalText(item.imageDescription !== undefined ? item.imageDescription : item.imageCaption);
      if (caption !== optionalText(current.imageCaption)) { plan.question.imageCaption = caption; plan.changes.push("image description"); }
    }

    if (current.type === "mcq") {
      if (item.subquestions !== undefined && Array.isArray(item.subquestions) && item.subquestions.length) {
        throw new JsonUpdateError(`${q}: MCQs cannot have subquestions`);
      }
      if (item.marks !== undefined) {
        const marks = positiveInt(item.marks, `${q}: "marks"`);
        if (marks !== current.marks) { plan.question.marks = marks; plan.changes.push("marks"); plan.rescoreMcq = true; }
      }
      let optionTexts: string[] | null = null;
      if (item.options !== undefined) {
        const raw = item.options;
        const values = Array.isArray(raw)
          ? raw.map((o: any) => (o && typeof o === "object" ? o.content : o))
          : raw && typeof raw === "object" ? Object.keys(raw).sort().map((k) => raw[k]) : null;
        if (!values) throw new JsonUpdateError(`${q}: "options" must be an object like { "A": "...", "B": "..." }`);
        if (values.length !== current.options.length) {
          throw new JsonUpdateError(`${q}: has ${current.options.length} options but the JSON gives ${values.length}. The number of options cannot change here.`);
        }
        optionTexts = values.map((v: unknown, i: number) => requiredText(v, `${q}: option ${optionLetter(i)}`));
      }
      let correctIndex = current.options.findIndex((o) => o.isCorrect);
      if (item.answer !== undefined) {
        const key = String(item.answer ?? "").trim().toUpperCase();
        const index = key.length === 1 ? key.charCodeAt(0) - 65 : -1;
        if (index < 0 || index >= current.options.length) {
          throw new JsonUpdateError(`${q}: "answer" must be one of ${current.options.map((_, i) => optionLetter(i)).join(", ")}`);
        }
        if (index !== correctIndex) { plan.changes.push("correct answer"); plan.rescoreMcq = true; }
        correctIndex = index;
      }
      let optionTextChanged = false;
      current.options.forEach((option, i) => {
        const update: QuestionPlan["options"][number] = { id: option.id };
        if (optionTexts && optionTexts[i] !== option.content.trim()) { update.content = optionTexts[i]; optionTextChanged = true; }
        const shouldBeCorrect = i === correctIndex;
        if (shouldBeCorrect !== option.isCorrect) update.isCorrect = shouldBeCorrect;
        if (update.content !== undefined || update.isCorrect !== undefined) plan.options.push(update);
      });
      if (optionTextChanged) plan.changes.push("option text");
    } else {
      const hasSubs = current.subquestions.length > 0;
      if (item.subquestions !== undefined && item.subquestions !== null) {
        if (!Array.isArray(item.subquestions)) throw new JsonUpdateError(`${q}: "subquestions" must be a list`);
        if (item.subquestions.length !== current.subquestions.length) {
          throw new JsonUpdateError(`${q}: has ${current.subquestions.length} subquestions but the JSON gives ${item.subquestions.length}. The number of subquestions cannot change here.`);
        }
        const changedParts = new Set<string>();
        item.subquestions.forEach((sub: any, i: number) => {
          const existingSub = current.subquestions[i];
          const subLabel = `${q}, subquestion ${i + 1}`;
          if (!sub || typeof sub !== "object") throw new JsonUpdateError(`${subLabel}: must be an object`);
          const update: QuestionPlan["subquestions"][number] = { id: existingSub.id };
          if (sub.question !== undefined || sub.content !== undefined) {
            const content = requiredText(sub.question ?? sub.content, `${subLabel}: "question"`);
            if (content !== existingSub.content.trim()) { update.content = content; changedParts.add("subquestion text"); }
          }
          if (sub.marks !== undefined) {
            const marks = positiveInt(sub.marks, `${subLabel}: "marks"`);
            if (marks !== existingSub.marks) { update.marks = marks; changedParts.add("subquestion marks"); }
          }
          if (sub.expectedAnswer !== undefined) {
            const expected = optionalText(sub.expectedAnswer);
            if (expected !== optionalText(existingSub.expectedAnswer)) { update.expectedAnswer = expected; changedParts.add("subquestion expected answer"); }
          }
          if (Object.keys(update).length > 1) plan.subquestions.push(update);
        });
        plan.changes.push(...changedParts);
      } else if (item.hasSubquestions === true && !hasSubs) {
        throw new JsonUpdateError(`${q}: adding subquestions is not supported here`);
      }
      if (hasSubs) {
        // Total marks always follow the subquestions, as in bulk import.
        const total = current.subquestions.reduce((sum, sub) => {
          const update = plan.subquestions.find((u) => u.id === sub.id);
          return sum + (update?.marks ?? sub.marks);
        }, 0);
        if (total !== current.marks) { plan.question.marks = total; plan.changes.push("marks"); plan.saqMarksChanged = true; }
      } else {
        if (item.marks !== undefined) {
          const marks = positiveInt(item.marks, `${q}: "marks"`);
          if (marks !== current.marks) { plan.question.marks = marks; plan.changes.push("marks"); plan.saqMarksChanged = true; }
        }
        if (item.expectedAnswer !== undefined) {
          const expected = optionalText(item.expectedAnswer);
          if (expected !== optionalText(current.expectedAnswer)) { plan.question.expectedAnswer = expected; plan.changes.push("expected answer"); }
        }
      }
    }

    if (plan.changes.length) plans.push(plan);
  });
  return plans;
}

export function registerQuestionJsonUpdateRoutes(app: Express, requireAdmin: RequestHandler): void {
  app.post("/api/exams/:examId/questions/bulk-update", requireAdmin, async (req: any, res) => {
    const examId = Number(req.params.examId);
    if (!Number.isInteger(examId) || examId < 1) return res.status(400).json({ message: "Invalid exam id" });
    const raw = req.body?.questions;
    const items = Array.isArray(raw) ? raw : null;
    if (!items || items.length === 0) return res.status(400).json({ message: "questions must be a non-empty list" });
    const dryRun = req.body?.dryRun !== false;

    const exam = await storage.getExam(examId);
    if (!exam) return res.status(404).json({ message: "Exam not found" });

    let plans: QuestionPlan[];
    try {
      plans = planUpdates(items, await loadExamQuestions(examId));
    } catch (error) {
      if (error instanceof JsonUpdateError) return res.status(400).json({ message: error.message });
      throw error;
    }

    const rescoreIds = plans.filter((p) => p.rescoreMcq).map((p) => p.id);
    const saqMarkIds = plans.filter((p) => p.saqMarksChanged).map((p) => p.id);
    const countAnswers = async (ids: number[], extra = "") => {
      if (!ids.length) return 0;
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS n FROM responses WHERE question_id = ANY($1::int[]) AND subquestion_id IS NULL ${extra}`,
        [ids],
      );
      return rows[0].n as number;
    };
    const summary = {
      dryRun,
      changedQuestions: plans.length,
      unchangedQuestions: items.length - plans.length,
      changes: plans.map((p) => ({ id: p.id, number: p.number, changes: p.changes })),
      mcqAnswersRescored: await countAnswers(rescoreIds),
      markedSaqAnswersWithOldMarks: saqMarkIds.length
        ? (await pool.query(
            "SELECT COUNT(*)::int AS n FROM responses WHERE question_id = ANY($1::int[]) AND marks_awarded IS NOT NULL",
            [saqMarkIds],
          )).rows[0].n as number
        : 0,
    };
    if (dryRun || plans.length === 0) return res.json(summary);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const plan of plans) {
        const q = plan.question;
        const sets: string[] = [];
        const values: unknown[] = [plan.id];
        const set = (column: string, value: unknown) => { values.push(value); sets.push(`${column} = $${values.length}`); };
        if (q.content !== undefined) set("content", q.content);
        if (q.marks !== undefined) set("marks", q.marks);
        if (q.expectedAnswer !== undefined) set("expected_answer", q.expectedAnswer);
        if (q.explanation !== undefined) set("explanation", q.explanation);
        if (q.imageCaption !== undefined) set("image_caption", q.imageCaption);
        if (sets.length) await client.query(`UPDATE questions SET ${sets.join(", ")} WHERE id = $1`, values);

        for (const option of plan.options) {
          await client.query(
            `UPDATE question_options SET content = COALESCE($2, content), is_correct = COALESCE($3, is_correct)
              WHERE id = $1 AND question_id = $4`,
            [option.id, option.content ?? null, option.isCorrect ?? null, plan.id],
          );
        }
        for (const sub of plan.subquestions) {
          await client.query(
            `UPDATE subquestions SET content = COALESCE($2, content), marks = COALESCE($3, marks),
                    expected_answer = CASE WHEN $4 THEN $5 ELSE expected_answer END
              WHERE id = $1 AND question_id = $6`,
            [sub.id, sub.content ?? null, sub.marks ?? null, sub.expectedAnswer !== undefined, sub.expectedAnswer ?? null, plan.id],
          );
        }
        if (plan.rescoreMcq) {
          // Same rule as saving an MCQ answer: full marks for the correct option, 0 otherwise.
          // Answers are stored as the chosen option's id.
          await client.query(
            `UPDATE responses r
                SET is_correct = COALESCE(r.answer = c.correct_id::text, false),
                    marks_awarded = CASE WHEN r.answer = c.correct_id::text THEN c.marks ELSE 0 END
               FROM (SELECT q.id, q.marks,
                            (SELECT o.id FROM question_options o WHERE o.question_id = q.id AND o.is_correct
                              ORDER BY o.order_index, o.id LIMIT 1) AS correct_id
                       FROM questions q WHERE q.id = $1) c
              WHERE r.question_id = c.id AND r.subquestion_id IS NULL`,
            [plan.id],
          );
        }
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("Question JSON update error:", error);
      return res.status(500).json({ message: "Failed to update questions; nothing was changed" });
    } finally {
      client.release();
    }
    invalidateExamCache(examId);
    await storage.createAuditLog({
      adminId: req.admin.id,
      action: "update_questions_json",
      details: `Exam #${examId}: ${plans.length} question(s) updated`,
    });
    res.json(summary);
  });
}
