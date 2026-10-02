import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Copy } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toNairobiInput } from "@/lib/datetime";
import { apiErrorMessage } from "@/lib/api-error";

/** Admin → Classes → [class] → Exams → Copy an existing exam (with its questions) into this class. */
export function CopyExamDialog({ classId }: { classId: number }) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [sourceClassId, setSourceClassId] = useState("");
  const [sourceExamId, setSourceExamId] = useState("");
  const [title, setTitle] = useState("");
  const [opensAt, setOpensAt] = useState("");
  const [closesAt, setClosesAt] = useState("");

  const { data: classes } = useQuery<any[]>({ queryKey: ["/api/admin/classes"], enabled: open });
  const { data: exams } = useQuery<any[]>({ queryKey: ["/api/exams"], enabled: open });
  const { data: sourceQuestions, isLoading: questionsLoading } = useQuery<any[]>({
    queryKey: ["/api/exams", Number(sourceExamId), "questions"],
    queryFn: async () => {
      const res = await fetch(`/api/exams/${sourceExamId}/questions`, { credentials: "include" });
      if (!res.ok) throw new Error("Could not load questions");
      return res.json();
    },
    enabled: open && !!sourceExamId,
  });

  const classesWithExams = (classes ?? [])
    .filter((c) => exams?.some((e) => e.classId === c.id))
    .sort((a, b) => (a.id === classId ? 1 : 0) - (b.id === classId ? 1 : 0));
  const sourceExams = (exams ?? [])
    .filter((e) => String(e.classId) === sourceClassId)
    .sort((a, b) => b.id - a.id);
  const sourceExam = sourceExams.find((e) => String(e.id) === sourceExamId);

  const reset = () => {
    // Default: next Saturday 8:00–8:30 pm Nairobi (the weekly Mock CAT slot).
    const now = new Date(Date.now() + 3 * 3600000);
    const daysToSaturday = (6 - now.getUTCDay() + 7) % 7 || 7;
    const saturday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysToSaturday, 20, 0));
    setSourceClassId(""); setSourceExamId(""); setTitle("");
    setOpensAt(saturday.toISOString().slice(0, 16));
    setClosesAt(new Date(saturday.getTime() + 30 * 60000).toISOString().slice(0, 16));
  };

  const copyExam = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/exams/${sourceExamId}/copy`, {
        title: title.trim(), classId, opensAt, closesAt,
      });
      return res.json();
    },
    onSuccess: (exam: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/exams"] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/classes/${classId}/overview`] });
      setOpen(false);
      toast({ title: "Exam copied", description: `${exam.questionCount} question${exam.questionCount === 1 ? "" : "s"} copied into "${exam.title}".` });
      setLocation(`/admin/exams/${exam.id}`);
    },
    onError: (e) => toast({ title: "Could not copy exam", description: apiErrorMessage(e), variant: "destructive" }),
  });

  const valid = sourceExam && title.trim() && opensAt && closesAt && opensAt < closesAt;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (next) reset(); setOpen(next); }}>
      <DialogTrigger asChild>
        <Button variant="outline"><Copy className="w-4 h-4 mr-2" />Copy from another class</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Copy an exam into this class</DialogTitle>
          <DialogDescription>
            Copies the questions, instructions, timer and attempt settings. Students, attempts and results are not copied, and the original exam is unchanged.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Copy from class</Label>
            <Select value={sourceClassId} onValueChange={(v) => { setSourceClassId(v); setSourceExamId(""); setTitle(""); }}>
              <SelectTrigger data-testid="select-copy-source-class"><SelectValue placeholder="Choose a class" /></SelectTrigger>
              <SelectContent>
                {classesWithExams.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}{c.id === classId ? " (this class)" : ""}{c.status === "archived" ? " (archived)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {classes && exams && !classesWithExams.length && <p className="text-xs text-muted-foreground">No class has exams to copy yet.</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Exam</Label>
            <Select value={sourceExamId} disabled={!sourceClassId}
              onValueChange={(v) => { setSourceExamId(v); setTitle(sourceExams.find((e) => String(e.id) === v)?.title ?? ""); }}>
              <SelectTrigger data-testid="select-copy-source-exam"><SelectValue placeholder={sourceClassId ? "Choose an exam" : "Choose a class first"} /></SelectTrigger>
              <SelectContent>
                {sourceExams.map((e) => (
                  <SelectItem key={e.id} value={String(e.id)}>{e.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {sourceExam && (
              <p className="text-xs text-muted-foreground" data-testid="text-copy-summary">
                {questionsLoading ? "Counting questions…" : `${sourceQuestions?.length ?? 0} question${sourceQuestions?.length === 1 ? "" : "s"}`}
                {" · "}
                {sourceExam.timerMode === "per_question" ? `${sourceExam.perQuestionSeconds}s per question` : sourceExam.durationMinutes ? `${sourceExam.durationMinutes} min` : "no timer"}
                {" · "}
                {sourceExam.maxAttempts} attempt{sourceExam.maxAttempts === 1 ? "" : "s"}
                {sourceExam.instructions ? " · has instructions" : ""}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="copy-exam-title">New exam name</Label>
            <Input id="copy-exam-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={250}
              placeholder="e.g. Mock CAT 1 – Upper limb" disabled={!sourceExam} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="copy-exam-opens">Opens</Label>
              <Input id="copy-exam-opens" type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="copy-exam-closes">Closes</Label>
              <Input id="copy-exam-closes" type="datetime-local" value={closesAt} min={opensAt || toNairobiInput(Date.now())} onChange={(e) => setClosesAt(e.target.value)} />
            </div>
          </div>
          {opensAt && closesAt && opensAt >= closesAt && <p className="text-xs text-destructive">The close time must be after the open time.</p>}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => copyExam.mutate()} disabled={!valid || copyExam.isPending}>
            {copyExam.isPending ? "Copying..." : "Copy exam"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
