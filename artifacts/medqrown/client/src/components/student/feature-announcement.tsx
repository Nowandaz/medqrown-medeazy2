import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, BookOpen, History, Menu, RotateCcw, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { spotlightCardStyle, visibleElement } from "@/components/student/welcome-tour";

type Step = {
  /** Elements to spotlight, first visible one wins; empty = centred card. */
  targets: string[];
  icon: typeof RotateCcw;
  title: string;
  body: string;
  mobileHint?: string;
};

type Announcement = { key: string; steps: Step[] };

/**
 * The current "what's new" walkthrough. Each key is shown to a student once, ever.
 * To announce something else later, replace this with a new key and steps.
 */
const ANNOUNCEMENT: Announcement = {
  key: "free-reattempts-2026-10",
  steps: [
    { targets: [], icon: RotateCcw, title: "New: retake your Mock CATs",
      body: "Every Mock CAT now gives you up to 3 free reattempts (4 attempts in total). No request needed: just take it again." },
    { targets: ['[data-tour="nav-my-class"]', '[data-tour="menu"]'], icon: BookOpen, title: "Retake from My Class",
      body: "Open the exam in My Class and start your next attempt. After your 4th attempt, tap Request Reattempt and your tutors will review it.",
      mobileHint: "Find My Class in the ☰ menu." },
    { targets: ['[data-tour="nav-results"]', '[data-tour="menu"]'], icon: History, title: "Every attempt is kept",
      body: "In Results, open an exam and switch between Attempt 1, Attempt 2 and so on to compare your scores and answers.",
      mobileHint: "Find Results in the ☰ menu." },
  ],
};

/** Whether the signed-in student had already done the welcome tour when this visit began. */
let arrival: { studentId: string; onboarded: boolean } | null = null;

/**
 * One-time walkthrough of a new feature, shown on a student's next portal visit.
 * Brand-new students get the welcome tour first and see this on the visit after.
 */
export function FeatureAnnouncement({ user }: { user: { id: string; onboardedAt?: string | null; seenAnnouncements?: string[] } }) {
  const queryClient = useQueryClient();
  // Brand-new students finish the welcome tour this visit; they get this on their next visit instead.
  if (arrival?.studentId !== String(user.id)) arrival = { studentId: String(user.id), onboarded: !!user.onboardedAt };
  const [eligible] = useState(() => arrival!.onboarded && !user.seenAnnouncements?.includes(ANNOUNCEMENT.key));
  const [dismissed, setDismissed] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const recorded = useRef(false);

  const active = eligible && !dismissed;
  const { steps } = ANNOUNCEMENT;

  // Record it as soon as it's shown, so a refresh or a second tab never brings it back.
  useEffect(() => {
    if (!active || recorded.current) return;
    recorded.current = true;
    apiRequest("POST", `/api/student/announcements/${ANNOUNCEMENT.key}/seen`)
      .then(() => queryClient.setQueryData<any>(["/api/student/me"], (old: any) => (old
        ? { ...old, seenAnnouncements: [...(old.seenAnnouncements ?? []), ANNOUNCEMENT.key] } : old)))
      .catch(() => { recorded.current = false; });
  }, [active, queryClient]);

  const measure = useCallback(() => {
    const el = visibleElement(steps[step].targets);
    setTarget(el);
    setRect(el ? el.getBoundingClientRect() : null);
  }, [step, steps]);

  useLayoutEffect(() => { if (active) measure(); }, [active, measure]);
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDismissed(true); };
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [active, measure]);

  if (!active) return null;

  const current = steps[step];
  const Icon = current.icon;
  const isLast = step === steps.length - 1;
  const onMenuButton = target?.dataset.tour === "menu";
  const finish = () => setDismissed(true);

  return (
    <div className="fixed inset-0 z-[10000]" role="dialog" aria-modal="true" aria-labelledby="announcement-title">
      {rect ? (
        <div
          className="absolute rounded-xl ring-2 ring-primary transition-all duration-200 pointer-events-none"
          style={{ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12, boxShadow: "0 0 0 9999px rgba(0,0,0,0.6)" }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/60" />
      )}

      <div
        className={`${rect ? "absolute" : "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)]"} max-w-sm rounded-2xl border bg-card p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-200 max-h-[calc(100dvh-2rem)] overflow-y-auto`}
        style={rect ? spotlightCardStyle(rect) : undefined}
        data-testid="feature-announcement"
      >
        <button onClick={finish} className="absolute right-3 top-3 p-1 text-muted-foreground hover:text-foreground" aria-label="Close">
          <X className="w-4 h-4" />
        </button>
        <div className="space-y-3 pr-4">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-primary/10 p-2 text-primary"><Icon className="w-5 h-5" /></div>
            <h2 id="announcement-title" className="text-lg font-bold">{current.title}</h2>
          </div>
          <p className="text-sm text-muted-foreground">{current.body}</p>
          {onMenuButton && current.mobileHint && (
            <p className="text-sm font-medium inline-flex items-center gap-1.5"><Menu className="w-4 h-4" />{current.mobileHint}</p>
          )}
        </div>
        <div className="mt-5 flex items-center justify-between gap-2">
          <div className="flex gap-1" aria-label={`Step ${step + 1} of ${steps.length}`}>
            {steps.map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/30"}`} />
            ))}
          </div>
          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setStep(step - 1)}><ArrowLeft className="w-4 h-4 mr-1" />Back</Button>
            )}
            {isLast ? (
              <Button size="sm" onClick={finish}>Got it</Button>
            ) : (
              <Button size="sm" onClick={() => setStep(step + 1)}>{step === 0 ? "Show me" : "Next"}<ArrowRight className="w-4 h-4 ml-1" /></Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
