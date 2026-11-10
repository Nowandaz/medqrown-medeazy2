import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight, CalendarCheck, Check, CheckCircle2, Clock, Crown, FlaskConical, ListChecks,
  Loader2, Lock, Maximize2, MessageCircle, RotateCcw, ShieldCheck, Sparkles, Timer, X, XCircle, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MedQrownBrand } from "@/components/MedQrownBrand";
import { RegistrationCountdown, RegistrationCta } from "@/components/RegistrationCta";
import { Eyebrow, FactRow } from "@/components/eyebrow";
import { engagementSource, trackEngagement } from "@/lib/engagement";

type DemoInfo = { available: boolean; questionCount: number; durationMinutes: number; subject: string; perks: string[]; nextCohortStart: string | null };
type DemoQuestion = {
  id: number; type: string; content: string; imageUrl: string | null; marks: number;
  options: string[]; parts: { id: number; content: string; marks: number }[];
};
type Attempt = { attemptId: string; endsAt: string; durationSeconds: number; subject: string; questions: DemoQuestion[] };
type Answer = { option?: number; text?: string; parts?: Record<string, string> };
type ResultPart = { id: number | null; content: string | null; answer: string; marks: number; awarded: number | null; correct: boolean | null; feedback: string | null };
type ResultQuestion = DemoQuestion & {
  awarded: number | null; correct: boolean | null; chosen?: number | null; correctOptions?: number[];
  explanation: string | null; parts: any[];
};
type Results = { score: number; maxScore: number; shortAnswersLocked: boolean; beatPercent: number | null; questions: ResultQuestion[] };

const MAX_CHARS = 1000;
const STORE_KEY = "medqrown-demo-attempt";

function loadSaved(): { attempt: Attempt; answers: Record<number, Answer>; index: number } | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORE_KEY) || "null");
    return saved && Date.parse(saved.attempt?.endsAt) > Date.now() ? saved : null;
  } catch { return null; }
}
function save(value: unknown) {
  try { value ? sessionStorage.setItem(STORE_KEY, JSON.stringify(value)) : sessionStorage.removeItem(STORE_KEY); } catch { /* private mode */ }
}

const isAnswered = (q: DemoQuestion, a?: Answer) =>
  q.type === "mcq" ? a?.option !== undefined
    : q.parts.length ? q.parts.some((p) => a?.parts?.[p.id]?.trim()) : !!a?.text?.trim();

function useCountdown(endsAt: string | null) {
  const [left, setLeft] = useState(() => (endsAt ? Math.max(0, Math.round((Date.parse(endsAt) - Date.now()) / 1000)) : 0));
  useEffect(() => {
    if (!endsAt) return;
    const tick = () => setLeft(Math.max(0, Math.round((Date.parse(endsAt) - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [endsAt]);
  return left;
}

/** Public demo at /demo: straight into a timed set of real questions, marked on submit, nothing kept. */
export default function DemoPage() {
  const { data: info, isLoading } = useQuery<DemoInfo>({ queryKey: ["/api/demo/info"] });
  const restored = useMemo(loadSaved, []);
  const [phase, setPhase] = useState<"intro" | "exam" | "results">(restored ? "exam" : "intro");
  const [attempt, setAttempt] = useState<Attempt | null>(restored?.attempt ?? null);
  const [answers, setAnswers] = useState<Record<number, Answer>>(restored?.answers ?? {});
  const [index, setIndex] = useState(restored?.index ?? 0);
  const [results, setResults] = useState<Results | null>(null);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = "Free Anatomy demo · MedQrown MedEazy";
    // Lifts the floating light/dark button above the Start / Next buttons on phones.
    document.body.dataset.tabbar = "";
    return () => { delete document.body.dataset.tabbar; };
  }, []);
  useEffect(() => { if (phase === "exam" && attempt) save({ attempt, answers, index }); }, [phase, attempt, answers, index]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [phase, index]);

  const start = async () => {
    setStarting(true);
    setError("");
    try {
      const res = await fetch("/api/demo/start", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ src: engagementSource() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "We couldn't start the demo. Please try again.");
      trackEngagement("demo_start", "demo");
      setAttempt(data);
      setAnswers({});
      setIndex(0);
      setResults(null);
      setPhase("exam");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setStarting(false);
    }
  };

  const submit = useCallback(async () => {
    if (!attempt || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/demo/submit", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId: attempt.attemptId, answers }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "We couldn't mark this attempt. Please start again.");
      trackEngagement("demo_complete", "demo");
      save(null);
      setResults(data);
      setPhase("results");
    } catch (e: any) {
      save(null);
      setError(e.message);
      setPhase("intro");
    } finally {
      setSubmitting(false);
    }
  }, [attempt, answers, submitting]);

  return (
    <div className="min-h-[100dvh] bg-background">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4">
          <Link href="/"><MedQrownBrand size="sm" /></Link>
          {phase === "exam" && attempt ? <TimerPill endsAt={attempt.endsAt} onExpire={submit} /> : (
            <span className="whitespace-nowrap text-xs font-semibold uppercase tracking-[0.18em] text-primary">Free challenge</span>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-28 pt-6 sm:pt-10">
        <AnimatePresence mode="wait">
          {phase === "intro" && (
            <Intro key="intro" info={info} loading={isLoading} starting={starting} error={error} onStart={start} />
          )}
          {phase === "exam" && attempt && (
            <Exam key="exam" attempt={attempt} answers={answers} setAnswers={setAnswers}
              index={index} setIndex={setIndex} submitting={submitting} onSubmit={submit} />
          )}
          {phase === "results" && results && (
            <ResultsView key="results" results={results} perks={info?.perks ?? []} subject={info?.subject ?? "Anatomy"}
              nextCohortStart={info?.nextCohortStart ?? null}
              onRetry={() => { setPhase("intro"); setResults(null); }} />
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function TimerPill({ endsAt, onExpire }: { endsAt: string; onExpire: () => void }) {
  const left = useCountdown(endsAt);
  const fired = useRef(false);
  useEffect(() => {
    if (left <= 0 && !fired.current) { fired.current = true; onExpire(); }
  }, [left, onExpire]);
  const urgent = left <= 30;
  return (
    <div className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-sm font-bold tabular-nums ${
      urgent ? "animate-pulse border-red-500/50 text-red-600 dark:text-red-400" : "border-border text-foreground"}`}
      role="timer" aria-label="Time left">
      <Clock className="h-4 w-4" />
      {String(Math.floor(left / 60)).padStart(2, "0")}:{String(left % 60).padStart(2, "0")}
    </div>
  );
}

function Intro({ info, loading, starting, error, onStart }: {
  info?: DemoInfo; loading: boolean; starting: boolean; error: string; onStart: () => void;
}) {
  const n = info?.questionCount || 3;
  const minutes = info?.durationMinutes || 5;
  const rules = [
    { icon: Timer, text: `${minutes} minutes for all ${n} questions. The clock starts when you tap Start and doesn't pause.` },
    { icon: ListChecks, text: "One question per screen, like the real CAT: once you tap Next, you can't go back." },
    { icon: Zap, text: "When time runs out, whatever you've answered is submitted automatically." },
    { icon: CheckCircle2, text: "Marked the moment you finish, with feedback on every answer." },
    { icon: ShieldCheck, text: "No sign-up needed, and nothing you answer is saved." },
  ];
  return (
    <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} className="space-y-8">
      <div>
        <Eyebrow className="text-primary">Free {info?.subject ?? "Anatomy"} challenge</Eyebrow>
        <h1 className="mt-5 text-4xl font-black leading-[1.05] tracking-tight sm:text-6xl">
          Feeling confident?<br /><span className="text-primary">Put it to the test.</span>
        </h1>
        <p className="mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
          Real {info?.subject ?? "Anatomy"} questions from our CATs, under the same time pressure as the real thing.
        </p>
        <FactRow className="mt-8 max-w-md" facts={[
          { value: String(n), label: "questions" },
          { value: `${minutes} min`, label: "on the clock" },
          { value: "KSh 0", label: "no sign-up" },
        ]} />
      </div>

      <div className="rounded-xl border bg-card p-5 sm:p-8">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Before you start</h2>
        <ol className="divide-y">
          {rules.map(({ text }, i) => (
            <li key={text} className="flex gap-4 py-3 text-sm sm:text-base">
              <span className="w-5 shrink-0 font-mono text-sm font-bold text-primary">{String(i + 1).padStart(2, "0")}</span>
              <span>{text}</span>
            </li>
          ))}
        </ol>

        {error && <p className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300" role="alert">{error}</p>}

        {loading ? (
          <div className="mt-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : info?.available ? (
          <Button size="lg" onClick={onStart} disabled={starting} className="mt-6 h-12 w-full gap-2 rounded-lg text-base font-bold">
            {starting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Zap className="h-5 w-5" />}
            {starting ? "Getting your questions…" : `Start the ${minutes}-minute challenge`}
          </Button>
        ) : (
          <p className="mt-8 rounded-xl bg-muted/50 p-4 text-center text-sm text-muted-foreground">New demo questions are on the way. Check back soon!</p>
        )}
      </div>
      <p className="text-center text-sm text-muted-foreground">Already a member? <Link href="/portal" className="font-semibold text-primary hover:underline">Sign in</Link></p>
    </motion.section>
  );
}

function QuestionImage({ src }: { src: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="group relative block w-full overflow-hidden rounded-lg border bg-muted/30 p-2">
        <img src={src} alt="Question image" className="mx-auto max-h-[45vh] w-auto rounded-xl object-contain" loading="eager" />
        <span className="absolute bottom-3 right-3 flex items-center gap-1 rounded-md bg-background/90 px-2 py-1 text-xs font-medium">
          <Maximize2 className="h-3 w-3" /> Enlarge
        </span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[95vw] p-2 sm:max-w-4xl">
          <DialogTitle className="sr-only">Question image</DialogTitle>
          <img src={src} alt="Question image, enlarged" className="max-h-[85vh] w-full rounded-lg object-contain" />
        </DialogContent>
      </Dialog>
    </>
  );
}

function Exam({ attempt, answers, setAnswers, index, setIndex, submitting, onSubmit }: {
  attempt: Attempt; answers: Record<number, Answer>; setAnswers: React.Dispatch<React.SetStateAction<Record<number, Answer>>>;
  index: number; setIndex: (i: number) => void; submitting: boolean; onSubmit: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const questions = attempt.questions;
  const q = questions[index];
  const a = answers[q.id] ?? {};
  const last = index === questions.length - 1;
  const unanswered = questions.filter((x) => !isAnswered(x, answers[x.id])).length;
  const update = (patch: Answer) => setAnswers((prev) => ({ ...prev, [q.id]: { ...prev[q.id], ...patch } }));

  // Leaving mid-attempt loses the run; warn first.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  return (
    <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="mb-5 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-muted-foreground">Question {index + 1} of {questions.length}</p>
        <div className="flex gap-1.5" aria-hidden="true">
          {questions.map((x, i) => (
            <span key={x.id}
              className={`h-2.5 rounded-full transition-all ${i === index ? "w-8 bg-primary" : i < index ? "w-2.5 bg-primary/60" : "w-2.5 bg-muted-foreground/25"}`} />
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={q.id} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.2 }}
          className="space-y-5 rounded-xl border bg-card p-5 sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-[11px] font-semibold uppercase tracking-[0.15em] ${q.type === "mcq" ? "text-primary" : "text-amber-700 dark:text-amber-400"}`}>
              {q.type === "mcq" ? "Multiple choice" : "Short answer"}
            </span>
            <span className="text-xs text-muted-foreground">{q.marks} mark{q.marks === 1 ? "" : "s"}</span>
          </div>
          {q.imageUrl && <QuestionImage src={q.imageUrl} />}
          <p className="whitespace-pre-wrap text-lg font-semibold leading-relaxed">{q.content}</p>

          {q.type === "mcq" && (
            <div className="space-y-2.5" role="radiogroup">
              {q.options.map((opt, i) => {
                const chosen = a.option === i;
                return (
                  <button key={i} type="button" role="radio" aria-checked={chosen} onClick={() => update({ option: i })}
                    className={`flex w-full items-start gap-3 rounded-lg border p-4 text-left text-base transition-colors ${
                      chosen ? "border-primary bg-primary/10" : "border-border bg-background hover:border-primary/50"}`}>
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sm font-bold ${chosen ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                      {String.fromCharCode(65 + i)}
                    </span>
                    <span className="pt-0.5">{opt}</span>
                  </button>
                );
              })}
            </div>
          )}

          {q.type === "saq" && q.parts.length === 0 && (
            <AnswerBox value={a.text ?? ""} onChange={(text) => update({ text })} />
          )}
          {q.type === "saq" && q.parts.map((p, i) => (
            <div key={p.id} className="space-y-2">
              <p className="whitespace-pre-wrap font-medium">
                <span className="mr-1.5 font-bold text-primary">({String.fromCharCode(97 + i)})</span>{p.content}
                <span className="ml-2 text-xs font-normal text-muted-foreground">{p.marks} mark{p.marks === 1 ? "" : "s"}</span>
              </p>
              <AnswerBox value={a.parts?.[p.id] ?? ""} rows={3}
                onChange={(text) => update({ parts: { ...(a.parts ?? {}), [p.id]: text } })} />
            </div>
          ))}
        </motion.div>
      </AnimatePresence>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          {last ? (
            <Button size="lg" className="h-12 flex-1 gap-2 rounded-lg font-bold" disabled={submitting}
              onClick={() => (unanswered ? setConfirm(true) : onSubmit())}>
              {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Marking your answers…</> : <>Submit &amp; see my score <Check className="h-4 w-4" /></>}
            </Button>
          ) : (
            <Button size="lg" className="h-12 flex-1 gap-2 rounded-lg font-bold" onClick={() => setIndex(index + 1)}>
              Next question <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit with {unanswered} unanswered?</AlertDialogTitle>
            <AlertDialogDescription>Unanswered questions score zero.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not yet</AlertDialogCancel>
            <AlertDialogAction onClick={onSubmit}>Submit now</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.section>
  );
}

function AnswerBox({ value, onChange, rows = 5 }: { value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <div>
      <textarea value={value} onChange={(e) => onChange(e.target.value.slice(0, MAX_CHARS))} rows={rows} maxLength={MAX_CHARS}
        placeholder="Type your answer…" autoComplete="off" spellCheck
        className="w-full resize-y rounded-lg border border-input bg-background px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary/40" />
      <p className={`mt-1 text-right text-xs ${value.length > MAX_CHARS - 100 ? "text-amber-600" : "text-muted-foreground"}`}>{value.length}/{MAX_CHARS}</p>
    </div>
  );
}

function verdictLine(percent: number) {
  if (percent >= 80) return "Outstanding. You'd be at the top of the class.";
  if (percent >= 60) return "Solid work. A few weekly reviews and you'd own this.";
  if (percent >= 40) return "A good start. This is exactly what our Monday reviews fix.";
  return "Tough set! Our sessions are built to close exactly these gaps.";
}

function ResultsView({ results, perks, subject, nextCohortStart, onRetry }: {
  results: Results; perks: string[]; subject: string; nextCohortStart: string | null; onRetry: () => void;
}) {
  const percent = results.maxScore ? Math.round((results.score / results.maxScore) * 100) : 0;
  const mcqMax = results.questions.filter((q) => q.type === "mcq").reduce((s, q) => s + q.marks, 0);
  const shownMax = results.shortAnswersLocked ? mcqMax : results.maxScore;
  const shownPercent = shownMax ? Math.round((results.score / shownMax) * 100) : 0;
  const brag = results.beatPercent !== null && results.beatPercent >= 50 ? ` I beat ${results.beatPercent}% of people who tried it.` : "";
  const share = `https://wa.me/?text=${encodeURIComponent(`I just scored ${percent}% on MedQrown's free ${subject} challenge.${brag} Think you can beat me? ${window.location.origin}/demo?src=share`)}`;

  return (
    <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      <div className="rounded-xl border bg-card p-6 text-center sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Your score</p>
        <div className="relative mx-auto my-5 h-36 w-36">
          <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
            <circle cx="60" cy="60" r="52" fill="none" strokeWidth="12" className="stroke-muted" />
            <motion.circle cx="60" cy="60" r="52" fill="none" strokeWidth="12" strokeLinecap="round" className="stroke-primary"
              strokeDasharray={2 * Math.PI * 52} initial={{ strokeDashoffset: 2 * Math.PI * 52 }}
              animate={{ strokeDashoffset: 2 * Math.PI * 52 * (1 - shownPercent / 100) }} transition={{ duration: 1.1, ease: "easeOut" }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-4xl font-black">{shownPercent}%</span>
            <span className="text-xs text-muted-foreground">{results.score} / {shownMax} marks</span>
          </div>
        </div>
        <p className="text-lg font-bold">{results.shortAnswersLocked ? "Here's your multiple-choice score." : verdictLine(percent)}</p>
        {results.beatPercent !== null && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}
            className="mx-auto mt-6 max-w-sm border-t pt-5">
            {results.beatPercent >= 1 ? (
              <>
                <p className="text-4xl font-black text-primary">{results.beatPercent}%</p>
                <p className="mt-1 text-sm text-muted-foreground">of people who took this challenge scored lower than you</p>
              </>
            ) : <p className="text-sm text-muted-foreground">Everyone starts somewhere. Members improve fast.</p>}
          </motion.div>
        )}
        {results.shortAnswersLocked && (
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Short answers are marked by our examiners' AI, and today's free marking is used up. Sign up to get every answer marked and explained.</p>
        )}
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-bold">Your answers</h2>
        {results.questions.map((q, i) => <ReviewCard key={q.id} q={q} n={i + 1} locked={results.shortAnswersLocked} />)}
      </div>

      <div className="rounded-xl bg-[#0e3b37] p-6 text-white sm:p-10">
        <Eyebrow className="text-teal-300">MedEazy membership</Eyebrow>
        <h2 className="mt-4 text-3xl font-black leading-tight sm:text-4xl">Want more of this?</h2>
        <p className="mt-2 text-white/75">Here's what members get every month:</p>
        <ul className="mt-6 divide-y divide-white/15 border-y border-white/15">
          {perks.map((perk) => (
            <li key={perk} className="flex items-start gap-3 py-3.5 text-base font-medium">
              <Check className="mt-0.5 h-5 w-5 shrink-0 text-teal-300" />
              <span>{perk}</span>
            </li>
          ))}
        </ul>
        <RegistrationCountdown nextCohortStart={nextCohortStart}
          className="mt-6 text-white/80" />
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <RegistrationCta size="lg" className="h-12 w-full rounded-lg bg-white text-[#0e3b37] hover:bg-teal-50 sm:w-auto" />
          <a href={share} target="_blank" rel="noopener noreferrer" className="sm:w-auto">
            <Button size="lg" variant="outline" className="h-12 w-full gap-2 rounded-lg border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white">
              <MessageCircle className="h-4 w-4" /> Challenge a classmate
            </Button>
          </a>
        </div>
      </div>

      <div className="flex flex-col items-center gap-3 text-center">
        <p className="text-xs text-muted-foreground">This attempt isn't saved: your answers are discarded once you leave this page.</p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onRetry} className="gap-1.5"><RotateCcw className="h-4 w-4" /> Try a new set</Button>
          <Link href="/"><Button variant="ghost">Back to home</Button></Link>
        </div>
      </div>
    </motion.section>
  );
}

function ReviewCard({ q, n, locked }: { q: ResultQuestion; n: number; locked: boolean }) {
  const isSaq = q.type === "saq";
  const lockedHere = isSaq && locked;
  return (
    <div className="space-y-4 rounded-xl border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-muted-foreground">Question {n} · {isSaq ? "Short answer" : "Multiple choice"}</p>
        {lockedHere ? <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground"><Lock className="h-3.5 w-3.5" /> Members only</span>
          : <span className={`flex items-center gap-1 text-sm font-bold ${q.correct ? "text-green-600" : "text-red-500"}`}>
              {q.correct ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}{q.awarded}/{q.marks}
            </span>}
      </div>
      {q.imageUrl && <img src={q.imageUrl} alt="" className="mx-auto max-h-48 rounded-xl object-contain" />}
      <p className="whitespace-pre-wrap font-medium">{q.content}</p>

      {!isSaq && (
        <div className="space-y-2">
          {q.options.map((opt, i) => {
            const right = q.correctOptions?.includes(i);
            const picked = q.chosen === i;
            return (
              <div key={i} className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${
                right ? "border-green-500/50 bg-green-500/10" : picked ? "border-red-400/50 bg-red-500/10" : "opacity-70"}`}>
                <span className="font-bold">{String.fromCharCode(65 + i)}</span>
                <span className="flex-1">{opt}</span>
                {right && <Check className="h-4 w-4 shrink-0 text-green-600" />}
                {picked && !right && <X className="h-4 w-4 shrink-0 text-red-500" />}
              </div>
            );
          })}
          {q.chosen == null && <p className="text-sm text-muted-foreground">You didn't answer this one.</p>}
          {q.explanation && (
            <div className="rounded-xl bg-primary/5 p-3 text-sm"><p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-primary">Why</p>{q.explanation}</div>
          )}
        </div>
      )}

      {isSaq && (q.parts as ResultPart[]).map((p, i) => {
        const part = `(${String.fromCharCode(97 + i)}) `;
        const label = p.content;
        return (
          <div key={i} className="space-y-2 border-t pt-3 first:border-0 first:pt-0">
            {label && <p className="text-sm font-medium"><span className="font-bold text-primary">{part}</span>{label}</p>}
            <div className="rounded-xl bg-muted/50 p-3 text-sm"><p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Your answer</p>
              <p className="whitespace-pre-wrap">{p.answer || <span className="italic text-muted-foreground">Not answered</span>}</p>
            </div>
            {lockedHere ? (
              <div className="relative overflow-hidden rounded-xl border border-primary/20 p-3">
                <p className="select-none text-sm blur-[5px]" aria-hidden="true">Correct! The examiner's feedback and the key points you'd need for full marks appear here for members.</p>
                <div className="absolute inset-0 flex items-center justify-center gap-2 bg-background/60 text-sm font-semibold"><Lock className="h-4 w-4 text-primary" /> Sign up to see this mark</div>
              </div>
            ) : p.feedback ? (
              <div className={`rounded-xl p-3 text-sm ${p.correct ? "bg-green-500/10" : "bg-red-500/10"}`}>
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wider">{p.correct ? `Correct · ${p.awarded}/${p.marks}` : `Not quite · ${p.awarded ?? 0}/${p.marks}`}</p>
                {p.feedback}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
