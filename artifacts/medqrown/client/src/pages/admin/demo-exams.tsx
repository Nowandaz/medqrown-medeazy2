import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { AppHeader } from "@/components/AppHeader";
import {
  Plus, Trash2, Edit, ChevronDown, ChevronUp, FlaskConical,
  CheckCircle, Circle, Clock, Image as ImageIcon, ArrowLeft, Eye, EyeOff
} from "lucide-react";

type DemoExam = { id: number; title: string; displayOrder: number; isActive: boolean; timerSeconds: number };
type DemoQuestion = {
  id: number; demoExamId: number; type: string; content: string;
  imageUrl?: string | null; options?: { content: string; isCorrect: boolean }[] | null;
  explanation?: string | null; orderIndex: number;
};

// ── Option editor for MCQ ──────────────────────────────────────────────────
function OptionEditor({
  options, onChange,
}: {
  options: { content: string; isCorrect: boolean }[];
  onChange: (opts: { content: string; isCorrect: boolean }[]) => void;
}) {
  return (
    <div className="space-y-2">
      {options.map((opt, i) => (
        <div key={i} className="flex gap-2 items-center">
          <button
            type="button"
            onClick={() => onChange(options.map((o, j) => ({ ...o, isCorrect: j === i })))}
            className={`shrink-0 ${opt.isCorrect ? "text-green-600" : "text-muted-foreground/40"}`}
            title="Mark as correct"
          >
            {opt.isCorrect ? <CheckCircle className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
          </button>
          <Input
            value={opt.content}
            onChange={(e) => onChange(options.map((o, j) => j === i ? { ...o, content: e.target.value } : o))}
            placeholder={`Option ${String.fromCharCode(65 + i)}`}
            className="h-9 text-sm"
          />
          {options.length > 2 && (
            <button type="button" onClick={() => onChange(options.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive shrink-0">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}
      {options.length < 6 && (
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...options, { content: "", isCorrect: false }])}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Add Option
        </Button>
      )}
    </div>
  );
}

// ── Question form (add/edit) ───────────────────────────────────────────────
function QuestionForm({
  demoExamId, question, onClose,
}: {
  demoExamId: number; question?: DemoQuestion; onClose: () => void;
}) {
  const { toast } = useToast();
  const [type, setType] = useState<"mcq" | "saq">(question?.type as "mcq" | "saq" || "mcq");
  const [content, setContent] = useState(question?.content || "");
  const [imageUrl, setImageUrl] = useState(question?.imageUrl || "");
  const [explanation, setExplanation] = useState(question?.explanation || "");
  const [orderIndex, setOrderIndex] = useState(question?.orderIndex ?? 0);
  const [options, setOptions] = useState<{ content: string; isCorrect: boolean }[]>(
    question?.options || [
      { content: "", isCorrect: true },
      { content: "", isCorrect: false },
      { content: "", isCorrect: false },
      { content: "", isCorrect: false },
    ]
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        type, content, imageUrl: imageUrl || null, orderIndex,
        options: type === "mcq" ? options : null,
        explanation: explanation || null,
      };
      if (question) {
        await apiRequest("PATCH", `/api/admin/demo-questions/${question.id}`, payload);
      } else {
        await apiRequest("POST", `/api/admin/demo-exams/${demoExamId}/questions`, payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/demo-exams/${demoExamId}/questions`] });
      toast({ title: question ? "Question updated" : "Question added" });
      onClose();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      {/* Type toggle */}
      <div className="flex gap-2">
        {(["mcq", "saq"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${type === t ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}
          >
            {t === "mcq" ? "Multiple Choice (MCQ)" : "Short Answer (SAQ)"}
          </button>
        ))}
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Question Text</Label>
        <Textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Enter the question..." rows={3} />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Image URL (optional)</Label>
        <div className="flex gap-2">
          <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." className="h-9 text-sm" />
          {imageUrl && <img src={imageUrl} alt="preview" className="h-9 w-9 object-cover rounded border" onError={(e) => (e.currentTarget.style.display = "none")} />}
        </div>
        <p className="text-xs text-muted-foreground">Paste a Supabase or public image URL. Upload via Storage first if needed.</p>
      </div>

      {type === "mcq" && (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Options <span className="text-green-600">(click ✓ to mark correct)</span></Label>
            <OptionEditor options={options} onChange={setOptions} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Explanation (shown after answering)</Label>
            <Textarea value={explanation} onChange={(e) => setExplanation(e.target.value)} placeholder="Explain why the correct answer is right..." rows={2} />
          </div>
        </>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Display Order</Label>
        <Input type="number" value={orderIndex} onChange={(e) => setOrderIndex(Number(e.target.value))} className="h-9 text-sm w-24" />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onClose} size="sm">Cancel</Button>
        <Button onClick={() => saveMutation.mutate()} disabled={!content.trim() || saveMutation.isPending} size="sm">
          {saveMutation.isPending ? "Saving..." : question ? "Update Question" : "Add Question"}
        </Button>
      </div>
    </div>
  );
}

// ── Questions panel ────────────────────────────────────────────────────────
function QuestionsPanel({ exam }: { exam: DemoExam }) {
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [editQ, setEditQ] = useState<DemoQuestion | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: questions = [], isLoading } = useQuery<DemoQuestion[]>({
    queryKey: [`/api/admin/demo-exams/${exam.id}/questions`],
  });

  const deleteQ = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/demo-questions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/demo-exams/${exam.id}/questions`] });
      toast({ title: "Question deleted" });
      setDeleteId(null);
    },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  return (
    <div className="mt-4 space-y-3">
      {isLoading && <Skeleton className="h-16 w-full" />}
      {questions.map((q, i) => (
        <div key={q.id} className="flex gap-3 items-start bg-muted/30 border border-border rounded-lg p-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant={q.type === "mcq" ? "default" : "outline"} className="text-[10px] py-0">{q.type.toUpperCase()}</Badge>
              <span className="text-xs text-muted-foreground">#{i + 1}</span>
              {q.imageUrl && <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" />}
            </div>
            <p className="text-sm text-foreground font-medium line-clamp-2">{q.content}</p>
            {q.type === "mcq" && q.options && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {q.options.length} options · correct: {q.options.find(o => o.isCorrect)?.content?.slice(0, 30) || "none"}
              </p>
            )}
          </div>
          <div className="flex gap-1 shrink-0">
            <Dialog open={editQ?.id === q.id} onOpenChange={(open) => !open && setEditQ(null)}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditQ(q)}>
                  <Edit className="w-3.5 h-3.5" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Edit Question</DialogTitle></DialogHeader>
                <QuestionForm demoExamId={exam.id} question={q} onClose={() => setEditQ(null)} />
              </DialogContent>
            </Dialog>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(q.id)}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      ))}
      {questions.length === 0 && !isLoading && (
        <p className="text-sm text-muted-foreground text-center py-4">No questions yet. Add your first question below.</p>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Add Question
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add Question to {exam.title}</DialogTitle></DialogHeader>
          <QuestionForm demoExamId={exam.id} onClose={() => setAddOpen(false)} />
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete question?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteQ.mutate(deleteId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function AdminDemoExams() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [newTitle, setNewTitle] = useState("");
  const [newTimer, setNewTimer] = useState(60);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editExam, setEditExam] = useState<DemoExam | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: exams = [], isLoading } = useQuery<DemoExam[]>({
    queryKey: ["/api/admin/demo-exams"],
  });

  const createExam = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/demo-exams", { title: newTitle, timerSeconds: newTimer }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/demo-exams"] });
      toast({ title: "Subject created" });
      setNewTitle("");
      setNewTimer(60);
    },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const updateExam = useMutation({
    mutationFn: (exam: DemoExam) => apiRequest("PATCH", `/api/admin/demo-exams/${exam.id}`, {
      title: exam.title, timerSeconds: exam.timerSeconds, isActive: exam.isActive, displayOrder: exam.displayOrder,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/demo-exams"] });
      toast({ title: "Updated" });
      setEditExam(null);
    },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const deleteExam = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/demo-exams/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/demo-exams"] });
      toast({ title: "Subject deleted" });
      setDeleteId(null);
    },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const toggleActive = (exam: DemoExam) => {
    updateExam.mutate({ ...exam, isActive: !exam.isActive });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex flex-col">
      <AppHeader />

      <div className="flex-1 max-w-3xl mx-auto w-full px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/admin/dashboard")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-black text-foreground">Demo Exam Manager</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Create subject groups and add MCQ + SAQ questions. These appear on the public landing page demo.
            </p>
          </div>
        </div>

        {/* Create new subject */}
        <Card className="border-primary/10 mb-6">
          <CardContent className="p-5">
            <h2 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wider">Add New Subject</h2>
            <div className="flex gap-3 flex-wrap">
              <div className="flex-1 min-w-[160px]">
                <Label className="text-xs text-muted-foreground mb-1 block">Subject Name</Label>
                <Input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Anatomy, Biochemistry..."
                  className="h-9 text-sm"
                  onKeyDown={(e) => e.key === "Enter" && newTitle.trim() && createExam.mutate()}
                />
              </div>
              <div className="w-28">
                <Label className="text-xs text-muted-foreground mb-1 block">Timer (sec)</Label>
                <Input
                  type="number"
                  value={newTimer}
                  onChange={(e) => setNewTimer(Number(e.target.value))}
                  min={10} max={300}
                  className="h-9 text-sm"
                />
              </div>
              <div className="flex items-end">
                <Button onClick={() => createExam.mutate()} disabled={!newTitle.trim() || createExam.isPending} size="sm" className="gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> Create Subject
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Subjects list */}
        {isLoading ? (
          <div className="space-y-3">{[1, 2].map(i => <Skeleton key={i} className="h-20" />)}</div>
        ) : exams.length === 0 ? (
          <Card className="border-primary/10">
            <CardContent className="p-10 text-center">
              <FlaskConical className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">No demo subjects yet. Create your first one above.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {exams.map((exam) => (
              <Card key={exam.id} className="border-primary/10">
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-foreground">{exam.title}</h3>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="w-3.5 h-3.5" /> {exam.timerSeconds}s / question
                        </div>
                        <Badge variant={exam.isActive ? "default" : "secondary"} className="text-[10px]">
                          {exam.isActive ? "Active" : "Hidden"}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Switch
                        checked={exam.isActive}
                        onCheckedChange={() => toggleActive(exam)}
                        title={exam.isActive ? "Hide from demo" : "Show in demo"}
                      />
                      <Dialog open={editExam?.id === exam.id} onOpenChange={(open) => !open && setEditExam(null)}>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditExam({ ...exam })}>
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader><DialogTitle>Edit Subject</DialogTitle></DialogHeader>
                          {editExam && (
                            <div className="space-y-4">
                              <div>
                                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Title</Label>
                                <Input value={editExam.title} onChange={(e) => setEditExam({ ...editExam, title: e.target.value })} className="mt-1 h-9" />
                              </div>
                              <div>
                                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Timer per question (seconds)</Label>
                                <Input type="number" value={editExam.timerSeconds} onChange={(e) => setEditExam({ ...editExam, timerSeconds: Number(e.target.value) })} className="mt-1 h-9 w-28" />
                              </div>
                              <div>
                                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Display Order</Label>
                                <Input type="number" value={editExam.displayOrder} onChange={(e) => setEditExam({ ...editExam, displayOrder: Number(e.target.value) })} className="mt-1 h-9 w-24" />
                              </div>
                              <div className="flex justify-end gap-2">
                                <Button variant="outline" size="sm" onClick={() => setEditExam(null)}>Cancel</Button>
                                <Button size="sm" onClick={() => editExam && updateExam.mutate(editExam)} disabled={updateExam.isPending}>Save</Button>
                              </div>
                            </div>
                          )}
                        </DialogContent>
                      </Dialog>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(exam.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setExpandedId(expandedId === exam.id ? null : exam.id)}>
                        {expandedId === exam.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>

                  {expandedId === exam.id && <QuestionsPanel exam={exam} />}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete subject and all its questions?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteExam.mutate(deleteId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
