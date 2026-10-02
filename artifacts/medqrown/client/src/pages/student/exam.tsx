import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  BookOpen, Clock, ChevronRight, Send, AlertTriangle, Loader2, ImageIcon
} from "lucide-react";
import { MedQrownBrand } from "@/components/MedQrownBrand";
import { TEXT_LIMITS } from "@/lib/text-limits";
import { apiErrorBody, apiErrorMessage } from "@/lib/api-error";

export default function StudentExam() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [examInfo, setExamInfo] = useState<any>(null);
  // Full-screen "Time's up — submitting" state for automatic submission.
  const [autoSubmitting, setAutoSubmitting] = useState(false);
  const examIdRef = useRef<number | null>(null);
  /** After submitting, show this exam's own page ("Submitted — results pending", or the results once released). */
  const goToSubmitted = useCallback(() => {
    setLocation(examIdRef.current ? `/student/exam-review?examId=${examIdRef.current}` : "/student/results");
  }, [setLocation]);
  const [attemptData, setAttemptData] = useState<any>(null);
  const [answer, setAnswer] = useState("");
  const [subAnswers, setSubAnswers] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  // Next stays disabled for 2 s after each question appears, so a double tap can't skip one.
  const [nextLocked, setNextLocked] = useState(true);
  const [remainingTime, setRemainingTime] = useState<number | null>(null);
  const [questionStartedAt, setQuestionStartedAt] = useState<string | null>(null);
  const [attemptStartedAt, setAttemptStartedAt] = useState<string | null>(null);
  const [upcomingImageUrl, setUpcomingImageUrl] = useState<string | null>(null);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [pendingSubmitValue, setPendingSubmitValue] = useState<string | undefined>(undefined);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const attemptDataRef = useRef<any>(null);
  const answerRef = useRef("");
  const subAnswersRef = useRef<Record<number, string>>({});
  const isAutoSubmittingRef = useRef(false);
  // Server clock minus device clock, so a wrong phone clock cannot end (or extend) the exam.
  const clockOffsetRef = useRef(0);
  // Hard guard against double-clicks on Next/Submit while the previous request is still in flight
  const advancingRef = useRef(false);

  useEffect(() => { attemptDataRef.current = attemptData; }, [attemptData]);
  useEffect(() => { answerRef.current = answer; }, [answer]);
  useEffect(() => { subAnswersRef.current = subAnswers; }, [subAnswers]);

  // Preload the next question's image in the background so it's already in the
  // browser cache by the time the student clicks Next. This dramatically reduces
  // perceived image load time on slower connections.
  useEffect(() => {
    if (!upcomingImageUrl) return;
    const img = new Image();
    img.decoding = "async";
    img.src = upcomingImageUrl;
  }, [upcomingImageUrl]);

  /**
   * One request: saves every non-blank answer for the current question and, with
   * `advance`, moves to the next question. Blank boxes are never sent, so they can't
   * overwrite a saved answer. Returns the server's reply; throws on failure.
   */
  const sendAnswer = useCallback(async (advance: boolean, answerOverride?: string) => {
    const data = attemptDataRef.current;
    if (!data?.question) return null;
    const q = data.question;
    const body: Record<string, unknown> = {
      attemptId: data.attemptId,
      questionId: q.id,
      expectedCurrentQuestionIndex: data.currentQuestionIndex,
      advance,
    };
    if (q.hasSubquestions && q.subquestions?.length > 0) {
      body.subAnswers = q.subquestions
        .filter((sq: any) => subAnswersRef.current[sq.id])
        .map((sq: any) => ({ subquestionId: sq.id, answer: subAnswersRef.current[sq.id] }));
    } else {
      const value = answerOverride ?? answerRef.current;
      if (value) body.answer = value;
    }
    const res = await apiRequest("POST", "/api/student/answer", body);
    return res.json();
  }, []);

  /** Show the question the server just moved this attempt to. */
  const applyNextQuestion = useCallback((nextData: any) => {
    setAttemptData((prev: any) => ({
      ...prev,
      currentQuestionIndex: nextData.currentQuestionIndex,
      totalQuestions: nextData.totalQuestions,
      question: nextData.question,
    }));
    setAnswer(nextData.question?.savedAnswer || "");
    setSubAnswers(nextData.question?.savedSubAnswers || {});
    if (nextData.questionStartedAt) setQuestionStartedAt(nextData.questionStartedAt);
    setUpcomingImageUrl(nextData.upcomingImageUrl || null);
  }, []);

  const saveCurrentAnswerImmediate = useCallback(async () => {
    try { await sendAnswer(false); } catch {}
  }, [sendAnswer]);

  const submitExamImmediate = useCallback(async () => {
    const data = attemptDataRef.current;
    if (!data) return;
    setAutoSubmitting(true);
    await saveCurrentAnswerImmediate();
    // Retry briefly on a bad connection; the server also submits expired attempts on its own.
    for (let tryNo = 0; tryNo < 3; tryNo++) {
      try {
        await apiRequest("POST", "/api/student/submit-exam", { attemptId: data.attemptId });
        break;
      } catch (e) {
        if (apiErrorBody(e)?.message && /already|not found/i.test(apiErrorBody(e).message)) break;
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    toast({ title: "Time's up — your exam has been submitted" });
    goToSubmitted();
  }, [saveCurrentAnswerImmediate, setLocation, toast]);

  /** Reload the attempt's current question from the server (e.g. after the server moved on). */
  const resyncAttempt = useCallback(async () => {
    try {
      const sessionRes = await fetch("/api/student/session", { credentials: "include" });
      const session = sessionRes.ok ? await sessionRes.json() : null;
      if (!session || session.attemptStatus === "submitted") { goToSubmitted(); return; }
      const res = await apiRequest("POST", "/api/student/start-exam");
      const data = await res.json();
      if (data.serverNow) clockOffsetRef.current = Date.parse(data.serverNow) - Date.now();
      setAttemptData(data);
      setAnswer(data.question?.savedAnswer || "");
      setSubAnswers(data.question?.savedSubAnswers || {});
      if (data.questionStartedAt) setQuestionStartedAt(data.questionStartedAt);
      setUpcomingImageUrl(data.upcomingImageUrl || null);
    } catch {
      goToSubmitted();
    }
  }, [setLocation]);

  /** Saves the current answers and moves on in one request. Returns true on the last question. */
  const saveAndMoveNextImmediate = useCallback(async (): Promise<boolean> => {
    try {
      const nextData = await sendAnswer(true);
      if (!nextData || nextData.isLastQuestion) return true;
      applyNextQuestion(nextData);
      return false;
    } catch (e: any) {
      const errorData = apiErrorBody(e);
      if (errorData?.submitted || errorData?.expired) { goToSubmitted(); return false; }
      // The server already moved this attempt on (or the connection failed): show where it really is.
      await resyncAttempt();
      return false;
    }
  }, [sendAnswer, applyNextQuestion, resyncAttempt, goToSubmitted]);

  const handleTimerExpiry = useCallback(async () => {
    if (isAutoSubmittingRef.current) return;
    if (advancingRef.current) return;
    isAutoSubmittingRef.current = true;
    advancingRef.current = true;
    setAdvancing(true);
    const data = attemptDataRef.current;
    if (!data) { isAutoSubmittingRef.current = false; return; }

    if (data.timerMode === "per_question") {
      const totalQ = data.totalQuestions || 0;
      const currentIdx = data.currentQuestionIndex || 0;
      if (currentIdx >= totalQ - 1) {
        await submitExamImmediate();
      } else {
        const isLast = await saveAndMoveNextImmediate();
        if (isLast) {
          await submitExamImmediate();
        } else {
          // Next question is showing: release the locks so its own timer and buttons work.
          isAutoSubmittingRef.current = false;
          advancingRef.current = false;
          setAdvancing(false);
        }
      }
    } else if (data.timerMode === "full_exam") {
      await submitExamImmediate();
    }
  }, [submitExamImmediate, saveAndMoveNextImmediate]);

  const loadExam = useCallback(async () => {
    try {
      const sessionRes = await fetch("/api/student/session", { credentials: "include" });
      if (!sessionRes.ok) { setLocation("/portal"); return; }
      const session = await sessionRes.json();
      if (session.attemptStatus === "submitted") { goToSubmitted(); return; }

      if (session.examId) examIdRef.current = Number(session.examId);
      const infoRes = await fetch("/api/student/exam-info", { credentials: "include" });
      const info = await infoRes.json();
      setExamInfo(info);
      if (info?.examId) examIdRef.current = Number(info.examId);

      const startRes = await apiRequest("POST", "/api/student/start-exam");
      const data = await startRes.json();
      if (data.serverNow) clockOffsetRef.current = Date.parse(data.serverNow) - Date.now();
      setAttemptData(data);
      setAnswer(data.question?.savedAnswer || "");
      setSubAnswers(data.question?.savedSubAnswers || {});
      if (data.questionStartedAt) setQuestionStartedAt(data.questionStartedAt);
      if (data.startedAt) setAttemptStartedAt(data.startedAt);
      setUpcomingImageUrl(data.upcomingImageUrl || null);
      setLoading(false);
    } catch {
      toast({ title: "Error", description: "Failed to load exam", variant: "destructive" });
      setLocation("/portal");
    }
  }, [setLocation, toast]);

  const currentQuestionId = attemptData?.question?.id;
  useEffect(() => {
    if (!currentQuestionId) return;
    setNextLocked(true);
    const timer = setTimeout(() => setNextLocked(false), 2000);
    return () => clearTimeout(timer);
  }, [currentQuestionId]);

  useEffect(() => {
    loadExam();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [loadExam]);

  useEffect(() => {
    if (!attemptData?.timerMode || attemptData.timerMode === "none") return;

    const computeRemaining = (): number | null => {
      const serverNow = Date.now() + clockOffsetRef.current;
      if (attemptData.timerMode === "per_question" && questionStartedAt) {
        const elapsed = Math.floor((serverNow - new Date(questionStartedAt).getTime()) / 1000);
        return Math.max(0, (attemptData.perQuestionSeconds ?? 0) - elapsed);
      }
      if (attemptData.timerMode === "full_exam" && attemptData.deadlineAt) {
        // The server's deadline is the earlier of the duration running out and the exam closing.
        return Math.max(0, Math.floor((Date.parse(attemptData.deadlineAt) - serverNow) / 1000));
      }
      if (attemptData.timerMode === "full_exam" && attemptStartedAt) {
        const elapsed = Math.floor((serverNow - new Date(attemptStartedAt).getTime()) / 1000);
        return Math.max(0, (attemptData.fullExamSeconds ?? 0) - elapsed);
      }
      return null;
    };

    if (timerRef.current) clearInterval(timerRef.current);

    const initial = computeRemaining();
    if (initial !== null) {
      setRemainingTime(initial);
      if (initial <= 0) { setAdvancing(true); handleTimerExpiry(); return; }
    }

    timerRef.current = setInterval(() => {
      const remaining = computeRemaining();
      if (remaining !== null) {
        setRemainingTime(remaining);
        if (remaining <= 0) {
          if (timerRef.current) clearInterval(timerRef.current);
          setAdvancing(true);
          handleTimerExpiry();
        }
      }
    }, 1000);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [attemptData?.timerMode, attemptData?.perQuestionSeconds, attemptData?.fullExamSeconds, attemptData?.deadlineAt, questionStartedAt, attemptStartedAt, handleTimerExpiry]);

  /** Returns false if the answer could not be saved. */
  const saveCurrentAnswer = async (answerOverride?: string): Promise<boolean> => {
    if (!attemptData?.question) return true;
    setSaving(true);
    try {
      await sendAnswer(false, answerOverride);
      return true;
    } catch (e) {
      const errorData = apiErrorBody(e);
      // Stale: Next already moved on, carrying this answer with it. Submitted/expired:
      // the server already ended the attempt, so there is nothing left to save.
      if (errorData?.staleRequest || errorData?.submitted || errorData?.expired) return true;
      toast({ title: "Save failed", variant: "destructive" });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleNext = async (answerOverride?: string) => {
    if (isAutoSubmittingRef.current) return;
    // Hard guard: ignore any clicks while a previous Next is still in flight.
    // This prevents accidental double-clicks from skipping a question.
    if (advancingRef.current) return;
    advancingRef.current = true;
    setAdvancing(true);
    let shouldSubmitAfter = false;
    try {
      // Saves this question's answers and moves on in a single request. The server
      // rejects it as stale (rather than skipping forward) if the expected index doesn't match.
      const data = await sendAnswer(true, answerOverride);
      if (!data || data.isLastQuestion) {
        shouldSubmitAfter = true;
      } else {
        applyNextQuestion(data);
      }
    } catch (e: any) {
      const errorData = apiErrorBody(e);
      if (errorData?.submitted || errorData?.expired) {
        goToSubmitted();
      } else if (errorData?.isLastQuestion) {
        // Defer the submit until after we release the in-flight lock below,
        // otherwise submitExam's own guard will see advancingRef and bail.
        shouldSubmitAfter = true;
      } else if (errorData?.staleRequest) {
        // The server already advanced (e.g. the question's time ran out): catch up.
        await resyncAttempt();
      } else {
        toast({ title: "Couldn't load the next question", description: apiErrorMessage(e, "Check your connection and tap Next again. Your answer stays on screen until it's saved."), variant: "destructive" });
      }
    } finally {
      advancingRef.current = false;
      setAdvancing(false);
    }
    if (shouldSubmitAfter) {
      await submitExam(answerOverride);
    }
  };

  const submitExam = async (answerOverride?: string) => {
    if (isAutoSubmittingRef.current) return;
    if (advancingRef.current) return;
    advancingRef.current = true;
    setSubmitting(true);
    try {
      // Never submit over an unsaved last answer; the student can tap Submit again.
      if (!(await saveCurrentAnswer(answerOverride))) throw new Error("Your last answer wasn't saved yet.");
      await apiRequest("POST", "/api/student/submit-exam", {
        attemptId: attemptData.attemptId,
      });
      toast({ title: "Exam submitted", description: "Well done! Your results will appear once they're released." });
      goToSubmitted();
    } catch (e) {
      toast({ title: "Couldn't submit yet", description: apiErrorMessage(e, "Check your connection and tap Submit again. Your answers are saved."), variant: "destructive" });
    } finally {
      advancingRef.current = false;
      setSubmitting(false);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  if (autoSubmitting) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6" role="status" aria-live="assertive">
        <div className="text-center space-y-3 max-w-sm">
          <Loader2 className="w-10 h-10 animate-spin mx-auto text-primary" />
          <h2 className="text-xl font-bold">Time's up!</h2>
          <p className="text-sm text-muted-foreground">Saving your answers and submitting your exam. Please don't close this page.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
          <p className="text-sm text-muted-foreground">Loading exam...</p>
        </div>
      </div>
    );
  }

  const q = attemptData?.question;
  const isLastQuestion = attemptData?.currentQuestionIndex === attemptData?.totalQuestions - 1;
  const progressPercent = ((attemptData?.currentQuestionIndex || 0) + 1) / (attemptData?.totalQuestions || 1) * 100;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-primary/3">
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <MedQrownBrand size="sm" />
            <div className="min-w-0">
              <h1 className="text-sm font-semibold truncate" data-testid="text-exam-title">{examInfo?.title}</h1>
              <p className="text-xs text-muted-foreground">
                Question {(attemptData?.currentQuestionIndex || 0) + 1} of {attemptData?.totalQuestions}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {remainingTime != null && (
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-mono font-medium ${
                remainingTime < 30 
                  ? "bg-destructive/10 text-destructive border border-destructive/20" 
                  : "bg-primary/10 text-primary border border-primary/20"
              }`} data-testid="badge-timer">
                <Clock className="w-3.5 h-3.5" />
                {formatTime(remainingTime)}
              </div>
            )}
          </div>
        </div>
        <div className="h-1 bg-muted" role="progressbar" aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100} aria-label="Exam progress">
          <div
            className="h-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {q ? (
          <div
            className={`space-y-5 transition-opacity duration-150 ${
              advancing ? "opacity-60 pointer-events-none select-none" : ""
            }`}
            aria-busy={advancing}
          >
            <Card className="border-primary/10 shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-primary/5 to-transparent px-5 py-3 border-b border-primary/10">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="bg-background text-xs font-medium">
                    {q.type === "mcq" ? "Multiple Choice" : "Short Answer"}
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    {q.marks} mark{q.marks > 1 ? "s" : ""}
                  </Badge>
                  {q.imageUrl && (
                    <Badge variant="outline" className="text-xs bg-background">
                      <ImageIcon className="w-3 h-3 mr-0.5" />Image
                    </Badge>
                  )}
                </div>
              </div>

              <CardContent className="p-5 space-y-4">
                <p className="text-base leading-relaxed whitespace-pre-wrap font-medium" data-testid="text-question">{q.content}</p>

                {q.imageUrl && (
                  <div className="rounded-xl border bg-muted/30 p-3">
                    <img
                      src={q.imageUrl}
                      alt="Question image"
                      className="max-w-full max-h-72 rounded-lg mx-auto object-contain"
                      data-testid="img-question"
                      loading="eager"
                      decoding="async"
                      // @ts-ignore - fetchpriority is a valid HTML attribute, not yet in React types
                      fetchpriority="high"
                    />
                  </div>
                )}

                <div className="pt-2">
                  {q.hasSubquestions && q.subquestions?.length > 0 ? (
                    <div className="space-y-5">
                      {q.subquestions.map((sq: any, i: number) => (
                        <div key={sq.id} className="space-y-2 pl-4 border-l-2 border-primary/20">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-xs font-semibold text-primary">
                              {String.fromCharCode(97 + i)}
                            </span>
                            <Label className="text-sm font-medium flex-1">{sq.content}</Label>
                            <Badge variant="outline" className="text-xs">{sq.marks} mark{sq.marks > 1 ? "s" : ""}</Badge>
                          </div>
                          <Textarea
                            value={subAnswers[sq.id] || ""}
                            onChange={(e) => setSubAnswers({ ...subAnswers, [sq.id]: e.target.value })}
                            maxLength={TEXT_LIMITS.answer}
                            placeholder="Type your answer..."
                            className="min-h-[80px] bg-background"
                            data-testid={`textarea-sub-${sq.id}`}
                          />
                          <p className="text-right text-xs text-muted-foreground">{(subAnswers[sq.id] || "").length}/{TEXT_LIMITS.answer}</p>
                        </div>
                      ))}
                    </div>
                  ) : q.type === "mcq" ? (
                    <RadioGroup value={answer} onValueChange={(value) => {
                      // No auto-advance: selecting only records (and autosaves) the choice.
                      // The student moves on with the Next / Submit button.
                      setAnswer(value);
                      if (!advancingRef.current && !submitting) void saveCurrentAnswer(value);
                    }}>
                      <div className="space-y-2">
                        {q.options?.map((opt: any, i: number) => (
                          <label
                            key={opt.id}
                            htmlFor={`opt-${opt.id}`}
                            className={`flex items-center space-x-3 p-3.5 rounded-xl border-2 transition-all cursor-pointer ${
                              answer === String(opt.id)
                                ? "border-primary bg-primary/5 shadow-sm"
                                : "border-transparent bg-muted/40 hover:bg-muted/60 hover:border-muted"
                            }`}
                            data-testid={`option-${opt.id}`}
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
                        placeholder="Type your answer here..."
                        className="min-h-[140px] bg-background text-sm"
                        data-testid="textarea-answer"
                      />
                      <p className="mt-1 text-right text-xs text-muted-foreground">{answer.length}/{TEXT_LIMITS.answer}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {saving && "Saving..."}
              </p>
              <div className="flex items-center gap-2">
                {isLastQuestion ? (
                  <Button
                    onClick={() => setShowSubmitConfirm(true)}
                    disabled={submitting || advancing || nextLocked}
                    size="lg"
                    className="shadow-sm"
                    data-testid="button-submit"
                  >
                    {submitting ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4 mr-2" />
                    )}
                    {submitting ? "Submitting..." : "Submit Exam"}
                  </Button>
                ) : (
                  <Button
                    onClick={() => handleNext()}
                    disabled={advancing || submitting || nextLocked}
                    size="lg"
                    className="shadow-sm"
                    data-testid="button-next"
                  >
                    {advancing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      <>
                        Next Question
                        <ChevronRight className="w-4 h-4 ml-1" />
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>

            {isLastQuestion && (
              <Card className="border-destructive/30 bg-destructive/5">
                <CardContent className="py-3 px-4 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                  <p className="text-sm text-muted-foreground">
                    This is the last question. Once you submit, you cannot modify your answers.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <BookOpen className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No questions available</p>
            </CardContent>
          </Card>
        )}

        <AlertDialog open={showSubmitConfirm} onOpenChange={setShowSubmitConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Submit Exam?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to submit? You will not be able to change your answers after submission.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => {
                setShowSubmitConfirm(false);
                setPendingSubmitValue(undefined);
              }}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setShowSubmitConfirm(false);
                  submitExam(pendingSubmitValue);
                }}
                disabled={submitting}
              >
                Submit Exam
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  );
}
