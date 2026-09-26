import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export type TimerMode = "full_exam" | "per_question";

/** Shared "time the whole exam" vs "time each question" fields (Create Exam and Setup). */
export function ExamTimerFields({
  timerMode, onTimerModeChange, durationMinutes, onDurationMinutesChange, perQuestionSeconds, onPerQuestionSecondsChange,
}: {
  timerMode: TimerMode;
  onTimerModeChange: (mode: TimerMode) => void;
  durationMinutes: number;
  onDurationMinutesChange: (value: number) => void;
  perQuestionSeconds: number;
  onPerQuestionSecondsChange: (value: number) => void;
}) {
  return (
    <div className="space-y-3">
      <Label>Timing</Label>
      <RadioGroup value={timerMode} onValueChange={(v) => onTimerModeChange(v as TimerMode)} className="grid gap-2 sm:grid-cols-2">
        <label htmlFor="timer-full" className={`flex items-start gap-2 rounded-lg border p-3 cursor-pointer ${timerMode === "full_exam" ? "border-primary bg-primary/5" : ""}`}>
          <RadioGroupItem value="full_exam" id="timer-full" className="mt-0.5" />
          <span>
            <span className="block text-sm font-medium">Whole exam</span>
            <span className="block text-xs text-muted-foreground">One countdown for the entire exam.</span>
          </span>
        </label>
        <label htmlFor="timer-question" className={`flex items-start gap-2 rounded-lg border p-3 cursor-pointer ${timerMode === "per_question" ? "border-primary bg-primary/5" : ""}`}>
          <RadioGroupItem value="per_question" id="timer-question" className="mt-0.5" />
          <span>
            <span className="block text-sm font-medium">Per question</span>
            <span className="block text-xs text-muted-foreground">When a question's time is up, the answer is saved and the next question opens.</span>
          </span>
        </label>
      </RadioGroup>
      {timerMode === "full_exam" ? (
        <div className="space-y-1.5">
          <Label htmlFor="exam-duration">Duration (minutes)</Label>
          <Input id="exam-duration" type="number" min={1} max={1440} value={durationMinutes}
            onChange={(e) => onDurationMinutesChange(Math.max(1, parseInt(e.target.value) || 1))} />
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="exam-per-question">Seconds per question</Label>
          <Input id="exam-per-question" type="number" min={10} max={3600} value={perQuestionSeconds}
            onChange={(e) => onPerQuestionSecondsChange(Math.max(10, parseInt(e.target.value) || 10))} />
          <p className="text-xs text-muted-foreground">e.g. 60 for one minute per question. The exam still ends at its close time.</p>
        </div>
      )}
    </div>
  );
}
