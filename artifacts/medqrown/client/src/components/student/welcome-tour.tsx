import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Bell, BookOpen, History, LayoutDashboard, Sparkles, User, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { AvatarPicker } from "@/components/student/avatar-picker";
import { useUpdateAvatar } from "@/hooks/use-student";
import { getStudentAvatarUrl } from "@/lib/avatar";

type Step = {
  /** Elements to spotlight, first visible one wins (desktop sidebar item, else the phone tab bar). */
  targets: string[];
  icon: typeof Sparkles;
  title: string;
  body: string;
  /** Extra line shown on phones, where the target sits in the bottom tab bar. */
  mobileHint?: string;
};

const STEPS: Step[] = [
  { targets: [], icon: Sparkles, title: "Welcome to MedEazy!", body: "Here's a 30-second tour so you know where everything lives. You can skip it anytime." },
  { targets: ['[data-tour="nav-dashboard"]'], icon: LayoutDashboard, title: "Dashboard",
    body: "Your home base: your next class, the next Mock CAT countdown, your latest scores and your membership.",
    mobileHint: "It's the first button in the bar at the bottom of your screen." },
  { targets: ['[data-tour="nav-my-class"]'], icon: BookOpen, title: "My Class",
    body: "Take your Mock CATs, see the timetable with Google Meet links, read announcements and send us feedback.",
    mobileHint: "Tap My Class in the bottom bar, then pick Exams, Timetable, News or Feedback at the top." },
  { targets: ['[data-tour="nav-results"]'], icon: History, title: "Results",
    body: "Every released result with answers and explanations, plus a chart of your progress over time. Only you can see your scores.",
    mobileHint: "Tap Results in the bottom bar." },
  { targets: ['[data-tour="nav-profile"]'], icon: User, title: "Profile",
    body: "Your details, avatar, and membership & payment history.", mobileHint: "Tap Profile in the bottom bar." },
  { targets: ['[data-tour="bell"]'], icon: Bell, title: "Notifications",
    body: "Announcements, results and renewal reminders show up here. We'll also email you.",
    mobileHint: "Tap the bell at the top whenever you see a red dot." },
];
const AVATAR_STEP = STEPS.length;

export function visibleElement(selectors: string[]): HTMLElement | null {
  for (const selector of selectors) {
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight) return el;
    }
  }
  return null;
}

/** Centred card when a step has no target. (Not translate-centred: the enter animation overrides transforms.) */
export const CENTRED_CARD = "absolute inset-0 m-auto h-fit w-[calc(100%-2rem)]";

const CARD_GAP = 44; // room for the pointer arrow between the card and its target

/** Where the card goes relative to the spotlighted element. */
function placement(rect: DOMRect): "beside" | "above" | "below" {
  const cardWidth = Math.min(360, window.innerWidth - 32);
  if (window.innerWidth >= 768 && rect.right + cardWidth + 24 < window.innerWidth) return "beside";
  // Targets low on the screen (the phone tab bar) get the card above them.
  return rect.top > window.innerHeight / 2 ? "above" : "below";
}

/** Card position: next to, above or below the spotlighted element. */
export function spotlightCardStyle(rect: DOMRect): React.CSSProperties {
  const cardWidth = Math.min(360, window.innerWidth - 32);
  const where = placement(rect);
  if (where === "beside") {
    return { left: rect.right + 12, top: Math.max(16, Math.min(rect.top - 8, window.innerHeight - 280)), width: cardWidth };
  }
  const left = Math.max(16, Math.min(rect.left + rect.width / 2 - cardWidth / 2, window.innerWidth - cardWidth - 16));
  return where === "above"
    ? { left, bottom: window.innerHeight - rect.top + CARD_GAP, width: cardWidth }
    : { left, top: rect.bottom + CARD_GAP, width: cardWidth };
}

/** Dimmed page with a pulsing outline around the target and a bouncing arrow at it, so it's obvious what to tap. */
export function SpotlightHighlight({ rect }: { rect: DOMRect }) {
  const where = placement(rect);
  const Arrow = where === "above" ? ArrowDown : ArrowUp;
  const box = { left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12 };
  return (
    <>
      <div className="absolute rounded-xl ring-2 ring-primary transition-all duration-200 pointer-events-none"
        style={{ ...box, boxShadow: "0 0 0 9999px rgba(0,0,0,0.65)" }} />
      <div className="absolute rounded-xl ring-4 ring-primary/40 animate-ping pointer-events-none" style={box} />
      {where !== "beside" && (
        <div className="absolute pointer-events-none animate-bounce"
          style={{ left: rect.left + rect.width / 2 - 14, top: where === "above" ? rect.top - 40 : rect.bottom + 10 }}>
          <Arrow className="w-7 h-7 text-primary drop-shadow" strokeWidth={3} />
        </div>
      )}
    </>
  );
}

/** Whether the phone layout (bottom tab bar) is showing. */
export const isPhoneLayout = () => window.innerWidth < 768;

/** First-login walkthrough: explains the navigation, then asks the student to choose an avatar. */
export function WelcomeTour({ user }: { user: { name?: string; avatarKey?: string | null; onboardedAt?: string | null } }) {
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [avatar, setAvatar] = useState<string | null>(user.avatarKey ?? null);
  const updateAvatar = useUpdateAvatar();

  const complete = useMutation({
    mutationFn: () => apiRequest("POST", "/api/student/onboarding/complete"),
    onSettled: () => {
      queryClient.setQueryData<any>(["/api/student/me"], (old: any) => (old ? { ...old, onboardedAt: new Date().toISOString() } : old));
    },
  });

  const active = !dismissed && !user.onboardedAt;

  const measure = useCallback(() => {
    if (step >= AVATAR_STEP) { setTarget(null); setRect(null); return; }
    const el = visibleElement(STEPS[step].targets);
    setTarget(el);
    setRect(el ? el.getBoundingClientRect() : null);
  }, [step]);

  useLayoutEffect(() => { if (active) measure(); }, [active, measure]);
  useEffect(() => {
    if (!active) return;
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => { window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); };
  }, [active, measure]);
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") finish(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!active) return null;

  function finish() {
    setDismissed(true);
    complete.mutate();
  }
  const chooseAvatar = (key: string) => {
    setAvatar(key);
    updateAvatar.mutate({ avatarKey: key });
  };

  const isAvatarStep = step === AVATAR_STEP;
  const current = isAvatarStep ? null : STEPS[step];
  const firstName = (user.name || "").trim().split(/\s+/)[0];
  const total = STEPS.length + 1;

  // Card position: under/next to the spotlighted element, or centred.
  const cardStyle: React.CSSProperties = rect && !isAvatarStep ? spotlightCardStyle(rect) : {};

  const Icon = current?.icon ?? Sparkles;

  return (
    <div className="fixed inset-0 z-[10000]" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {/* Dimmed backdrop with a cut-out around the target */}
      {rect && !isAvatarStep ? (
        <SpotlightHighlight rect={rect} />
      ) : (
        <div className="absolute inset-0 bg-black/60" />
      )}

      <div
        className={`${rect && !isAvatarStep ? "absolute" : CENTRED_CARD} ${isAvatarStep ? "max-w-lg" : "max-w-sm"} rounded-2xl border bg-card p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-200 max-h-[calc(100dvh-2rem)] overflow-y-auto`}
        style={cardStyle}
      >
        <button onClick={finish} className="absolute right-3 top-3 p-1 text-muted-foreground hover:text-foreground" aria-label="Skip tour">
          <X className="w-4 h-4" />
        </button>

        {isAvatarStep ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <img src={getStudentAvatarUrl(avatar, 96)} alt="" className="w-14 h-14 rounded-full border bg-muted" />
              <div>
                <h2 id="tour-title" className="text-lg font-bold">Last thing: pick your avatar</h2>
                <p className="text-sm text-muted-foreground">It shows on your profile and to your tutors. You can change it anytime in Profile.</p>
              </div>
            </div>
            <AvatarPicker value={avatar} onSelect={chooseAvatar} columns={5} />
          </div>
        ) : (
          <div className="space-y-3 pr-4">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-primary/10 p-2 text-primary"><Icon className="w-5 h-5" /></div>
              <h2 id="tour-title" className="text-lg font-bold">
                {step === 0 && firstName ? `Welcome, ${firstName}!` : current?.title}
              </h2>
            </div>
            <p className="text-sm text-muted-foreground">{current?.body}</p>
            {target && isPhoneLayout() && current?.mobileHint && (
              <p className="text-sm font-medium text-primary">{current.mobileHint}</p>
            )}
          </div>
        )}

        <div className="mt-5 flex items-center justify-between gap-2">
          <div className="flex gap-1" aria-label={`Step ${step + 1} of ${total}`}>
            {Array.from({ length: total }).map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/30"}`} />
            ))}
          </div>
          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setStep(step - 1)}><ArrowLeft className="w-4 h-4 mr-1" />Back</Button>
            )}
            {isAvatarStep ? (
              <Button size="sm" onClick={finish}>{avatar && avatar !== user.avatarKey ? "Done" : "Finish"}</Button>
            ) : (
              <Button size="sm" onClick={() => setStep(step + 1)}>{step === 0 ? "Show me" : "Next"}<ArrowRight className="w-4 h-4 ml-1" /></Button>
            )}
          </div>
        </div>
        {step === 0 && (
          <button onClick={finish} className="mt-3 w-full text-center text-xs text-muted-foreground hover:text-foreground">Skip the tour</button>
        )}
      </div>
    </div>
  );
}
