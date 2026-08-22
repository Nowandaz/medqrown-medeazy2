import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useSelfTestAttempt, useSaveSelfTestAnswer, useAdvanceSelfTest, useSubmitSelfTest } from "@/hooks/use-student";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ChevronRight, Clock, Send, AlertTriangle } from "lucide-react";
import { MedQrownBrand } from "@/components/MedQrownBrand";
import { TEXT_LIMITS } from "@/lib/text-limits";

export default function StudentSelfTestRun() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: attemptData, isLoading } = useSelfTestAttempt(id || "");
  const saveMutation = useSaveSelfTestAnswer();
  const advanceMutation = useAdvanceSelfTest();
  const submitMutation = useSubmitSelfTest();

  const [answer, setAnswer] = useState("");
  const [saving, setSaving] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [remainingTime, setRemainingTime] = useState<number | null>(null);

  const answerRef = useRef("");
  const advancingRef = useRef(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    answerRef.current = answer;
  }, [answer]);

  useEffect(() => {
    if (attemptData?.question) {
      setAnswer(attemptData.question.savedAnswer || "");
    }
  }, [attemptData?.question?.id]);

  useEffect(() => {
    if (!attemptData?.timerSeconds || !attemptData?.startedAt) return;
    
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - new Date(attemptData.startedAt).getTime()) / 1000);
      const remain = Math.max(0, attemptData.timerSeconds! - elapsed);
      setRemainingTime(remain);
      
      if (remain <= 0) {
        clearInterval(interval);
        handleTimerExpiry();
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [attemptData?.timerSeconds, attemptData?.startedAt]);

  const handleTimerExpiry = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    
    try {
      if (attemptData?.question && answerRef.current !== attemptData.question.savedAnswer) {
        await saveMutation.mutateAsync({
          attemptId: attemptData.attemptId,
          questionId: attemptData.question.id,
          answer: answerRef.current
        }).catch(() => undefined);
      }
      if (attemptData) {
        await submitMutation.mutateAsync(attemptData.attemptId);
        toast({ title: "Time's up! Test submitted." });
        setLocation(`/student/self-tests/${attemptData.attemptId}/results`);
      }
    } catch {
      toast({ title: "Error submitting test", variant: "destructive" });
    }
  };

  const handleNext = async (answerOverride?: string) => {
    if (advancingRef.current || !attemptData?.question) return;
    advancingRef.current = true;
    setAdvancing(true);
    setSaving(true);
    
    try {
      const answerToSave = answerOverride ?? answer;
      if (answerToSave !== attemptData.question.savedAnswer) {
        await saveMutation.mutateAsync({
          attemptId: attemptData.attemptId,
          questionId: attemptData.question.id,
          answer: answerToSave
        });
      }
      
      const nextData = await advanceMutation.mutateAsync({
        attemptId: attemptData.attemptId,
        expectedCurrentQuestionIndex: attemptData.currentQuestionIndex
      });
      
      queryClient.setQueryData([`/api/student/self-test-attempts/${id}`], nextData);
    } catch (e: any) {
      const err = await e.json?.().catch(() => ({}));
      if (err?.isLastQuestion) {
        await submitExam(answerOverride);
      } else if (!err?.staleRequest) {
        toast({ title: "Error loading next question", variant: "destructive" });
      }
    } finally {
      advancingRef.current = false;
      setAdvancing(false);
      setSaving(false);
    }
  };

  const submitExam = async (answerOverride?: string) => {
    if (submittingRef.current || !attemptData?.question) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSaving(true);
    
    try {
      const answerToSave = answerOverride ?? answer;
      if (answerToSave !== attemptData.question.savedAnswer) {
        try {
          await saveMutation.mutateAsync({
            attemptId: attemptData.attemptId,
            questionId: attemptData.question.id,
            answer: answerToSave
          });
        } catch (error) {
          if (!String(error).includes("TIME_LIMIT_EXPIRED")) throw error;
        }
      }
      
      await submitMutation.mutateAsync(attemptData.attemptId);
      toast({ title: "Self-test completed successfully!" });
      setLocation(`/student/self-tests/${attemptData.attemptId}/results`);
    } catch {
      toast({ title: "Error submitting test", variant: "destructive" });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
      setSaving(false);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  if (isLoading || !attemptData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
          <p className="text-sm text-muted-foreground">Loading self-test...</p>
        </div>
      </div>
    );
  }

  const q = attemptData.question;
  const isLastQuestion = attemptData.currentQuestionIndex === attemptData.totalQuestions - 1;
  const progressPercent = ((attemptData.currentQuestionIndex + 1) / attemptData.totalQuestions) * 100;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-primary/3">
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <MedQrownBrand size="sm" />
            <div className="min-w-0">
              <h1 className="text-sm font-semibold truncate">{attemptData.title}</h1>
              <p className="text-xs text-muted-foreground">
                Question {attemptData.currentQuestionIndex + 1} of {attemptData.totalQuestions}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {remainingTime != null && (
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-mono font-medium ${
                remainingTime < 60 
                  ? "bg-destructive/10 text-destructive border border-destructive/20" 
                  : "bg-primary/10 text-primary border border-primary/20"
              }`}>
                <Clock className="w-3.5 h-3.5" />
                {formatTime(remainingTime)}
              </div>
            )}
          </div>
        </div>
        <div className="h-1 bg-muted" role="progressbar" aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100}>
          <div
            className="h-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {q ? (
          <div className={`space-y-5 transition-opacity duration-150 ${advancing ? "opacity-60 pointer-events-none select-none" : ""}`} aria-busy={advancing}>
            <Card className="border-primary/10 shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-primary/5 to-transparent px-5 py-3 border-b border-primary/10 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="bg-background text-xs font-medium uppercase">
                  {q.type === "mcq" ? "Multiple Choice" : "Short Answer"}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  {q.marks} mark{q.marks > 1 ? "s" : ""}
                </Badge>
              </div>

              <CardContent className="p-5 space-y-6">
                <p className="text-base leading-relaxed whitespace-pre-wrap font-medium">{q.content}</p>

                <div className="pt-2">
                  {q.type === "mcq" ? (
                    <RadioGroup value={answer} onValueChange={(value) => {
                      // MCQs lock on the first selection and auto-progress by product requirement;
                      // SAQs keep the explicit navigation control below.
                      setAnswer(value);
                      if (!advancingRef.current && !submittingRef.current) {
                        if (isLastQuestion) submitExam(value);
                        else handleNext(value);
                      }
                    }}>
                      <div className="space-y-2">
                        {q.options?.map((opt: any, i: number) => (
                          <label
                            key={opt.id}
                            className={`flex items-center space-x-3 p-3.5 rounded-xl border-2 transition-all cursor-pointer ${
                              answer === String(opt.id)
                                ? "border-primary bg-primary/5 shadow-sm"
                                : "border-transparent bg-muted/40 hover:bg-muted/60 hover:border-muted"
                            }`}
                          >
                            <RadioGroupItem value={String(opt.id)} id={`opt-${opt.id}`} />
                            <span className="flex-1 text-sm">
                              <span className="font-semibold text-muted-foreground mr-2">{String.fromCharCode(65 + i)}.</span>
                              {opt.content}
                            </span>
                          </label>
                        ))}
                      </div>
                    </RadioGroup>
                  ) : (
                    <div>
                      <Textarea
                        value={answer}
                        onChange={(e) => setAnswer(e.target.value)}
                        maxLength={TEXT_LIMITS.answer}
                        placeholder="Type your answer here... Be as specific as possible."
                        className="min-h-[140px] bg-background text-sm leading-relaxed"
                      />
                      <p className="mt-1 text-right text-xs text-muted-foreground">{answer.length}/{TEXT_LIMITS.answer}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center justify-between gap-3 pt-2">
              <p className="text-xs text-muted-foreground">
                {saving && "Saving answer..."}
              </p>
              <div className="flex items-center gap-2">
                {isLastQuestion && q.type !== "mcq" ? (
                  <Button
                    onClick={() => submitExam()}
                    disabled={submitting || advancing}
                    size="lg"
                    className="shadow-sm"
                  >
                    {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                    {submitting ? "Submitting..." : "Submit Test"}
                  </Button>
                ) : !isLastQuestion && q.type !== "mcq" ? (
                  <Button
                    onClick={() => handleNext()}
                    disabled={advancing || submitting}
                    size="lg"
                    className="shadow-sm"
                  >
                    {advancing ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading...</>
                    ) : (
                      <>Next Question <ChevronRight className="w-4 h-4 ml-1" /></>
                    )}
                  </Button>
                ) : null}
              </div>
            </div>

            {isLastQuestion && (
              <Card className="border-destructive/30 bg-destructive/5 mt-6">
                <CardContent className="py-3 px-4 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                  <p className="text-sm text-muted-foreground">
                    This is the final question. Ensure you have answered completely before submitting.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            No question data available.
          </div>
        )}
      </main>
    </div>
  );
}
