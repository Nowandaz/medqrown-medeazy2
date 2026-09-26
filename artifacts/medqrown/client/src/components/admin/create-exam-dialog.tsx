import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Plus } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ExamTimerFields, type TimerMode } from "@/components/admin/exam-timer-fields";
import { toNairobiInput } from "@/lib/datetime";
import { apiErrorMessage } from "@/lib/api-error";

/** Admin → Classes → [class] → Exams → Create Exam (master prompt §6.2). */
export function CreateExamDialog({ classId }: { classId: number }) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [opensAt, setOpensAt] = useState("");
  const [closesAt, setClosesAt] = useState("");
  const [timerMode, setTimerMode] = useState<TimerMode>("full_exam");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [perQuestionSeconds, setPerQuestionSeconds] = useState(60);
  const [maxAttempts, setMaxAttempts] = useState(1);
  const [instructions, setInstructions] = useState("");
  const [autoMarkEnabled, setAutoMarkEnabled] = useState(true);

  const reset = () => {
    // Default: next Saturday 8:00–8:30 pm Nairobi (the weekly Mock CAT slot).
    const now = new Date(Date.now() + 3 * 3600000);
    const daysToSaturday = (6 - now.getUTCDay() + 7) % 7 || 7;
    const saturday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysToSaturday, 20, 0));
    setTitle(""); setInstructions(""); setMaxAttempts(1); setAutoMarkEnabled(true);
    setTimerMode("full_exam"); setDurationMinutes(30); setPerQuestionSeconds(60);
    setOpensAt(saturday.toISOString().slice(0, 16));
    setClosesAt(new Date(saturday.getTime() + 30 * 60000).toISOString().slice(0, 16));
  };

  const createExam = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/exams", {
        title: title.trim(), classId, opensAt, closesAt, timerMode,
        ...(timerMode === "full_exam" ? { durationMinutes } : { perQuestionSeconds }),
        maxAttempts, instructions: instructions.trim() || null, autoMarkEnabled, status: "active",
      });
      return res.json();
    },
    onSuccess: (exam: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/exams"] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/classes/${classId}/overview`] });
      setOpen(false);
      toast({ title: "Exam created", description: "Now add its questions." });
      setLocation(`/admin/exams/${exam.id}`);
    },
    onError: (e) => toast({ title: "Could not create exam", description: apiErrorMessage(e), variant: "destructive" }),
  });

  const valid = title.trim() && opensAt && closesAt && opensAt < closesAt;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (next) reset(); setOpen(next); }}>
      <DialogTrigger asChild>
        <Button><Plus className="w-4 h-4 mr-2" />Create Exam</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create exam</DialogTitle>
          <DialogDescription>Opens and closes automatically at these Nairobi times. You add questions next.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="exam-title">Title</Label>
            <Input id="exam-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Mock CAT 1 – Upper limb" maxLength={250} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="exam-opens">Opens</Label>
              <Input id="exam-opens" type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exam-closes">Closes</Label>
              <Input id="exam-closes" type="datetime-local" value={closesAt} min={opensAt || toNairobiInput(Date.now())} onChange={(e) => setClosesAt(e.target.value)} />
            </div>
          </div>
          {opensAt && closesAt && opensAt >= closesAt && <p className="text-xs text-destructive">The close time must be after the open time.</p>}
          <ExamTimerFields
            timerMode={timerMode} onTimerModeChange={setTimerMode}
            durationMinutes={durationMinutes} onDurationMinutesChange={setDurationMinutes}
            perQuestionSeconds={perQuestionSeconds} onPerQuestionSecondsChange={setPerQuestionSeconds}
          />
          <div className="space-y-1.5">
            <Label htmlFor="exam-attempts">Maximum attempts</Label>
            <Input id="exam-attempts" type="number" min={1} max={100} value={maxAttempts}
              onChange={(e) => setMaxAttempts(Math.max(1, parseInt(e.target.value) || 1))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="exam-instructions">Instructions (optional)</Label>
            <Textarea id="exam-instructions" rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)}
              placeholder="Shown before the exam starts, above the standard rules." />
          </div>
          <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <span>
              <span className="block text-sm font-medium">Auto-mark short answers with AI</span>
              <span className="block text-xs text-muted-foreground">Marks SAQs as soon as each student submits.</span>
            </span>
            <Switch checked={autoMarkEnabled} onCheckedChange={setAutoMarkEnabled} />
          </label>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => createExam.mutate()} disabled={!valid || createExam.isPending}>
            {createExam.isPending ? "Creating..." : "Create exam"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
