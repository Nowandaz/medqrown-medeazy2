import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { FileJson, Copy, Download, AlertTriangle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { apiErrorMessage } from "@/lib/api-error";

type Summary = {
  dryRun: boolean;
  changedQuestions: number;
  unchangedQuestions: number;
  changes: { id: number; number: number; changes: string[] }[];
  mcqAnswersRescored: number;
  markedSaqAnswersWithOldMarks: number;
};

const byOrder = (a: any, b: any) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0) || a.id - b.id;

/** The same shape as Bulk Import, plus each question's id so changes can be matched. */
function exportQuestions(questions: any[]) {
  return [...questions].sort(byOrder).map((q, i) => {
    const base: Record<string, unknown> = { id: q.id, number: i + 1, type: q.type, question: q.content };
    if (q.type === "mcq") {
      const options = [...(q.options ?? [])].sort(byOrder);
      base.marks = q.marks;
      base.options = Object.fromEntries(options.map((o: any, j: number) => [String.fromCharCode(65 + j), o.content]));
      const correct = options.findIndex((o: any) => o.isCorrect);
      base.answer = correct >= 0 ? String.fromCharCode(65 + correct) : null;
      base.explanation = q.explanation ?? null;
    } else if (q.hasSubquestions && q.subquestions?.length) {
      base.hasSubquestions = true;
      base.subquestions = [...q.subquestions].sort(byOrder).map((s: any) => ({
        question: s.content, marks: s.marks, expectedAnswer: s.expectedAnswer ?? null,
      }));
      base.explanation = q.explanation ?? null;
    } else {
      base.marks = q.marks;
      base.expectedAnswer = q.expectedAnswer ?? null;
      base.explanation = q.explanation ?? null;
    }
    base.imageDescription = q.imageCaption ?? null;
    return base;
  });
}

/** Admin → Exam → Questions → Update via JSON: edit existing questions in bulk, only changed parts are saved. */
export function UpdateQuestionsJsonDialog({ examId, questions }: { examId: number; questions: any[] }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [json, setJson] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<Summary | null>(null);

  const exported = () => JSON.stringify(exportQuestions(questions), null, 2);

  const parse = (): any[] | null => {
    try {
      const parsed = JSON.parse(json);
      const list = Array.isArray(parsed) ? parsed : parsed?.questions;
      if (!Array.isArray(list) || list.length === 0) {
        setError("JSON must be a list of question objects (or an object with a \"questions\" list).");
        return null;
      }
      return list;
    } catch {
      setError("Invalid JSON. Check for missing commas, quotes, or brackets.");
      return null;
    }
  };

  const send = useMutation({
    mutationFn: async ({ list, dryRun }: { list: any[]; dryRun: boolean }) => {
      const res = await apiRequest("POST", `/api/exams/${examId}/questions/bulk-update`, { questions: list, dryRun });
      return (await res.json()) as Summary;
    },
    onSuccess: (summary) => {
      if (summary.dryRun) {
        setPreview(summary);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/exams", examId, "questions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/exams", examId] });
      toast({
        title: `Updated ${summary.changedQuestions} question${summary.changedQuestions === 1 ? "" : "s"}`,
        description: summary.mcqAnswersRescored ? `${summary.mcqAnswersRescored} MCQ answer(s) re-scored.` : undefined,
      });
      setOpen(false);
    },
    onError: (e) => { setPreview(null); setError(apiErrorMessage(e)); },
  });

  const runPreview = () => {
    setError(""); setPreview(null);
    const list = parse();
    if (list) send.mutate({ list, dryRun: true });
  };
  const apply = () => {
    setError("");
    const list = parse();
    if (list) send.mutate({ list, dryRun: false });
  };

  const download = () => {
    const blob = new Blob([exported()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `exam-${examId}-questions.json`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => {
      setOpen(next);
      if (next) { setJson(exported()); setError(""); setPreview(null); }
    }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="text-xs" disabled={!questions.length} data-testid="button-update-json">
          <FileJson className="w-3.5 h-3.5 mr-1" />Update via JSON
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Update questions via JSON</DialogTitle>
          <DialogDescription>
            The box below holds this exam's current questions. Edit what you need (or paste your edited copy) and preview: only the parts you changed are saved.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="rounded-lg bg-muted/60 border p-3 space-y-1 text-xs text-muted-foreground">
            <p>Keep each question's <code className="text-foreground">id</code>. Questions you remove from the list are left as they are; this never adds or deletes questions.</p>
            <p>You can change question text, marks, options, the correct answer, explanations, expected answers, subquestions and image descriptions. The type and the number of options or subquestions can't change here.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" className="text-xs" onClick={() => { navigator.clipboard?.writeText(json); toast({ title: "Copied" }); }}>
              <Copy className="w-3.5 h-3.5 mr-1" />Copy
            </Button>
            <Button size="sm" variant="ghost" className="text-xs" onClick={download}>
              <Download className="w-3.5 h-3.5 mr-1" />Download current questions
            </Button>
            <Button size="sm" variant="ghost" className="text-xs" onClick={() => { setJson(exported()); setPreview(null); setError(""); }}>
              Reset to current questions
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="update-json">Questions JSON</Label>
            <Textarea id="update-json" maxLength={10_000_000} value={json}
              onChange={(e) => { setJson(e.target.value); setPreview(null); setError(""); }}
              className="font-mono text-xs min-h-[260px]" data-testid="input-update-json" />
          </div>
          {error && (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-xs text-destructive" data-testid="text-update-json-error">
              <AlertTriangle className="w-4 h-4 shrink-0" />{error}
            </div>
          )}
          {preview && (
            <div className="rounded-lg border p-3 space-y-2 text-xs" data-testid="text-update-json-preview">
              {preview.changedQuestions === 0 ? (
                <p className="font-medium">No changes found. Everything already matches.</p>
              ) : (
                <>
                  <p className="font-medium text-sm">
                    {preview.changedQuestions} question{preview.changedQuestions === 1 ? "" : "s"} will change
                    {preview.unchangedQuestions ? `, ${preview.unchangedQuestions} unchanged` : ""}:
                  </p>
                  <ul className="space-y-0.5 max-h-40 overflow-y-auto">
                    {preview.changes.map((c) => (
                      <li key={c.id}><span className="font-medium">Q{c.number}</span>: {c.changes.join(", ")}</li>
                    ))}
                  </ul>
                  {preview.mcqAnswersRescored > 0 && (
                    <p className="text-amber-700 dark:text-amber-400">
                      {preview.mcqAnswersRescored} student MCQ answer{preview.mcqAnswersRescored === 1 ? "" : "s"} will be re-scored against the new answer key or marks.
                    </p>
                  )}
                  {preview.markedSaqAnswersWithOldMarks > 0 && (
                    <p className="text-amber-700 dark:text-amber-400">
                      {preview.markedSaqAnswersWithOldMarks} already-marked SAQ answer{preview.markedSaqAnswersWithOldMarks === 1 ? " keeps its" : "s keep their"} current marks; re-mark them from the Marking tab if needed.
                    </p>
                  )}
                </>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={runPreview} disabled={!json.trim() || send.isPending} data-testid="button-preview-json">
              {send.isPending && send.variables?.dryRun ? "Checking..." : "Preview changes"}
            </Button>
            <Button size="sm" onClick={apply} disabled={!preview || preview.changedQuestions === 0 || send.isPending} data-testid="button-apply-json">
              {send.isPending && !send.variables?.dryRun ? "Saving..." : "Apply changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
