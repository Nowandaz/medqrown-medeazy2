import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Printer, CheckCircle, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type OptionStat = { id: number; content: string; isCorrect: boolean; count: number; percent: number; flagged: boolean };
type StudentAnswer = {
  studentName: string;
  marksAwarded: number;
  answers: { subquestion: string | null; answer: string | null; marksAwarded: number | null; modelAnswer: string | null }[];
};
type QuestionStat = {
  id: number;
  type: "mcq" | "saq";
  content: string;
  marks: number;
  expectedAnswer: string | null;
  answeredCount: number;
  percentCorrect: number | null;
  averageMark: number | null;
  options: OptionStat[];
  studentAnswers: StudentAnswer[];
};
type Analytics = { submittedAttemptCount: number; questions: QuestionStat[] };
type Insight = {
  questionId: number;
  summary?: string;
  commonMisconceptions?: string[];
  ambiguityOrFlaws?: string[];
  markingConsistencyConcerns?: string[];
  suggestedImprovements?: string[];
};
type SavedAnalysis = { id: number; analysis: Insight[]; createdAt: string };

function errorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  const json = text.replace(/^\d{3}:\s*/, "");
  try { return JSON.parse(json).message || json; } catch { return json; }
}

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

function InsightList({ title, items }: { title: string; items?: string[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="font-semibold text-xs uppercase text-muted-foreground">{title}</p>
      <ul className="list-disc pl-5 space-y-0.5">{items.map((item, i) => <li key={i}>{item}</li>)}</ul>
    </div>
  );
}

export function AnalyticsTab({ examId }: { examId: number }) {
  const { toast } = useToast();
  const [selectedQuestions, setSelectedQuestions] = useState<Set<number>>(new Set());
  const [saqMarkFilter, setSaqMarkFilter] = useState<string>("all");

  const { data: analytics, isLoading } = useQuery<Analytics>({ queryKey: [`/api/admin/exams/${examId}/analytics`] });
  const { data: savedAnalyses } = useQuery<SavedAnalysis[]>({ queryKey: [`/api/admin/exams/${examId}/ai-analysis`] });

  // Newest saved insight per question.
  const latestInsight = new Map<number, Insight>();
  for (const saved of savedAnalyses || []) {
    for (const insight of saved.analysis || []) {
      if (!latestInsight.has(Number(insight.questionId))) latestInsight.set(Number(insight.questionId), insight);
    }
  }

  const analyzeAI = useMutation({
    mutationFn: () => apiRequest("POST", `/api/admin/exams/${examId}/ai-analysis`, { questionIds: Array.from(selectedQuestions) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/exams/${examId}/ai-analysis`] });
      setSelectedQuestions(new Set());
      toast({ title: "Analysis complete", description: "Examiner feedback has been saved with this exam." });
    },
    onError: (e) => toast({ title: "Analysis failed", description: errorMessage(e), variant: "destructive" }),
  });

  const openRevisionPack = async () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast({ title: "Allow pop-ups to open the revision pack", variant: "destructive" });
      return;
    }
    printWindow.document.write("<p style='font-family:sans-serif'>Preparing revision pack…</p>");
    try {
      const res = await fetch(`/api/admin/exams/${examId}/revision-pack`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load the revision pack");
      const pack = await res.json();
      const questionsHtml = (pack.mostMissedQuestions || []).map((q: any, index: number) => {
        const insight = (q.savedAiAnalysis || [])[0];
        const options = q.type === "mcq" ? `<table>${(q.options || []).map((o: any) =>
          `<tr class="${o.isCorrect ? "correct" : o.flagged ? "flagged" : ""}"><td>${o.isCorrect ? "✓ " : o.flagged ? "⚠ " : ""}${escapeHtml(o.content)}</td><td>${o.count} (${Math.round(o.percent)}%)</td></tr>`).join("")}</table>` : "";
        const wrong = (q.wrongAnswerSamples || []).length && q.type === "saq"
          ? `<h4>Sample wrong answers</h4><ul>${q.wrongAnswerSamples.slice(0, 5).map((w: any) => `<li>${escapeHtml(w.answer)}</li>`).join("")}</ul>` : "";
        const ai = insight ? `<div class="ai"><h4>Examiner insight</h4>${insight.summary ? `<p>${escapeHtml(insight.summary)}</p>` : ""}${
          [["Common misconceptions", insight.commonMisconceptions], ["Possible flaws", insight.ambiguityOrFlaws], ["Suggested improvements", insight.suggestedImprovements]]
            .filter(([, items]) => (items as string[] | undefined)?.length)
            .map(([title, items]) => `<p><b>${title}:</b></p><ul>${(items as string[]).map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`).join("")}</div>` : "";
        return `<section><h3>${index + 1}. ${escapeHtml(q.content)}</h3><p class="meta">${q.type.toUpperCase()} · ${q.percentCorrect == null ? "no answers" : `${Math.round(q.percentCorrect)}% correct`} · ${q.answeredCount} answered</p>${options}${wrong}${ai}</section>`;
      }).join("");
      printWindow.document.open();
      printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Revision pack – ${escapeHtml(pack.exam?.title)}</title>
<style>body{font-family:Arial,sans-serif;max-width:800px;margin:24px auto;padding:0 16px;color:#111;line-height:1.45}
h1{font-size:22px;margin-bottom:4px}section{border-top:1px solid #ddd;padding:12px 0;page-break-inside:avoid}
h3{font-size:16px;margin:0 0 4px}.meta{color:#555;font-size:13px;margin:0 0 8px}table{border-collapse:collapse;width:100%;font-size:14px}
td{padding:4px 6px;border-bottom:1px solid #eee}tr.correct td{color:#166534;font-weight:bold}tr.flagged td{color:#b91c1c}
.ai{background:#f5f7f6;padding:8px 12px;border-radius:6px;margin-top:8px;font-size:14px}h4{margin:8px 0 4px;font-size:14px}
@media print{button{display:none}}</style></head><body>
<button onclick="window.print()" style="float:right;padding:6px 12px">Print</button>
<h1>Revision pack: ${escapeHtml(pack.exam?.title)}</h1><p class="meta">Most-missed questions first · generated ${new Date(pack.generatedAt).toLocaleString("en-GB", { timeZone: "Africa/Nairobi" })}</p>
${questionsHtml || "<p>No submitted answers yet.</p>"}</body></html>`);
      printWindow.document.close();
    } catch (e) {
      printWindow.close();
      toast({ title: "Revision pack failed", description: errorMessage(e), variant: "destructive" });
    }
  };

  const toggleSelection = (id: number) => {
    const next = new Set(selectedQuestions);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedQuestions(next);
  };

  const questions = analytics?.questions || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold">Performance Analytics</h3>
          <p className="text-xs text-muted-foreground">
            {analytics ? `${analytics.submittedAttemptCount} submitted attempt${analytics.submittedAttemptCount === 1 ? "" : "s"} · select questions to analyse with AI` : "Loading…"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {selectedQuestions.size > 0 && (
            <Button size="sm" onClick={() => analyzeAI.mutate()} disabled={analyzeAI.isPending} className="gap-2">
              <Sparkles className="w-4 h-4" />
              {analyzeAI.isPending ? "Analyzing..." : `Analyze ${selectedQuestions.size} with AI`}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={openRevisionPack} className="gap-2">
            <Printer className="w-4 h-4" /> Revision Pack
          </Button>
        </div>
      </div>

      {isLoading ? null : !analytics?.submittedAttemptCount ? (
        <Card className="border-dashed shadow-none">
          <CardContent className="py-10 text-center">
            <p className="text-sm text-muted-foreground">No analytics yet. They appear once students submit.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {questions.map((q, index) => {
            const insight = latestInsight.get(q.id);
            const isSelected = selectedQuestions.has(q.id);
            const answers = q.studentAnswers.filter((a) => {
              if (saqMarkFilter === "all") return true;
              if (saqMarkFilter === "full") return a.marksAwarded >= q.marks;
              if (saqMarkFilter === "zero") return a.marksAwarded === 0;
              return a.marksAwarded > 0 && a.marksAwarded < q.marks;
            });

            return (
              <Card key={q.id} className={`shadow-sm overflow-hidden transition-colors ${isSelected ? "border-primary ring-1 ring-primary/20" : ""}`}>
                <CardHeader className="py-3 px-4 bg-muted/20 border-b flex flex-row items-start gap-3 space-y-0">
                  <div className="pt-0.5">
                    <Checkbox checked={isSelected} onCheckedChange={() => toggleSelection(q.id)} aria-label={`Select question ${index + 1} for AI analysis`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wider">Q{index + 1} · {q.type}</Badge>
                      <span className="text-xs text-muted-foreground font-medium">{q.answeredCount} answered</span>
                      {q.averageMark != null && <span className="text-xs text-muted-foreground font-medium">Avg mark {q.averageMark.toFixed(1)}/{q.marks}</span>}
                      {q.percentCorrect != null && (
                        <Badge variant={q.percentCorrect >= 50 ? "default" : "destructive"} className="text-xs ml-auto">
                          {Math.round(q.percentCorrect)}% correct
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm font-medium leading-relaxed">{q.content}</p>
                  </div>
                </CardHeader>

                <CardContent className="p-4 space-y-4">
                  {q.type === "mcq" && (
                    <div className="space-y-2 mt-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Option distribution</p>
                      {q.options.map((opt) => (
                        <div key={opt.id} className="space-y-1">
                          <div className="flex justify-between gap-3 text-xs">
                            <span className="flex items-center gap-1.5 min-w-0">
                              {opt.isCorrect && <CheckCircle className="w-3 h-3 text-green-600 shrink-0" />}
                              {opt.flagged && <AlertTriangle className="w-3 h-3 text-red-500 shrink-0" />}
                              <span className={`truncate ${opt.isCorrect ? "font-medium text-green-700 dark:text-green-400" : opt.flagged ? "text-red-600 dark:text-red-400" : ""}`}>{opt.content}</span>
                            </span>
                            <span className="font-medium shrink-0">{opt.count} ({Math.round(opt.percent)}%)</span>
                          </div>
                          <Progress
                            value={opt.percent}
                            className={`h-1.5 ${opt.isCorrect ? "bg-green-100 dark:bg-green-950 [&>div]:bg-green-600" : opt.flagged ? "bg-red-100 dark:bg-red-950 [&>div]:bg-red-500" : ""}`}
                          />
                        </div>
                      ))}
                      {q.options.some((o) => o.flagged) && (
                        <p className="text-xs text-red-600 dark:text-red-400">⚠ A wrong option was chosen by more than 30% of students.</p>
                      )}
                    </div>
                  )}

                  {q.type === "saq" && (
                    <div className="space-y-3 mt-2">
                      <div className="flex justify-between items-center gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Student answers</p>
                        <Select value={saqMarkFilter} onValueChange={setSaqMarkFilter}>
                          <SelectTrigger className="w-[130px] h-7 text-xs" aria-label="Filter by mark"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All marks</SelectItem>
                            <SelectItem value="full">Full marks</SelectItem>
                            <SelectItem value="partial">Partial</SelectItem>
                            <SelectItem value="zero">Zero</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {q.expectedAnswer && (
                        <div className="bg-green-500/10 border border-green-500/20 p-3 rounded-md">
                          <p className="text-xs font-semibold text-green-700 dark:text-green-400 mb-1">Model answer</p>
                          <p className="text-sm whitespace-pre-wrap">{q.expectedAnswer}</p>
                        </div>
                      )}
                      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                        {answers.length === 0 && <p className="text-xs text-muted-foreground">No answers match this filter.</p>}
                        {answers.map((student, i) => (
                          <div key={i} className="bg-muted/30 p-2.5 rounded-md border text-sm flex gap-3">
                            <div className="flex-1 min-w-0 space-y-1">
                              <p className="font-medium text-xs">{student.studentName}</p>
                              {student.answers.map((a, j) => (
                                <p key={j} className="text-muted-foreground break-words">
                                  {a.subquestion && <span className="font-medium text-foreground">{a.subquestion}: </span>}
                                  {a.answer || <span className="italic">No answer</span>}
                                </p>
                              ))}
                            </div>
                            <Badge variant={student.marksAwarded >= q.marks ? "default" : student.marksAwarded > 0 ? "secondary" : "outline"} className="text-[10px] self-start shrink-0">
                              {student.marksAwarded}/{q.marks}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {insight && (
                    <div className="bg-primary/5 border border-primary/20 rounded-md p-4 mt-2 space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-primary" />
                        <h4 className="text-sm font-semibold text-primary">Examiner insight (AI)</h4>
                      </div>
                      {insight.summary && <p>{insight.summary}</p>}
                      <InsightList title="Common misconceptions" items={insight.commonMisconceptions} />
                      <InsightList title="Ambiguity or flaws" items={insight.ambiguityOrFlaws} />
                      <InsightList title="Marking consistency" items={insight.markingConsistencyConcerns} />
                      <InsightList title="Suggested improvements" items={insight.suggestedImprovements} />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
