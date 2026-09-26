import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Bell, BookOpen, History, LayoutDashboard, Menu, Sparkles, User, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { AvatarPicker } from "@/components/student/avatar-picker";
import { useUpdateAvatar } from "@/hooks/use-student";
import { getStudentAvatarUrl } from "@/lib/avatar";

type Step = {
  /** Elements to spotlight, first visible one wins (desktop sidebar item, else the phone menu button). */
  targets: string[];
  icon: typeof Sparkles;
  title: string;
  body: string;
  /** Extra line shown when the target is the phone menu button. */
  mobileHint?: string;
};

const STEPS: Step[] = [
  { targets: [], icon: Sparkles, title: "Welcome to MedEazy!", body: "Here's a 30-second tour so you know where everything lives. You can skip it anytime." },
  { targets: ['[data-tour="nav-dashboard"]', '[data-tour="menu"]'], icon: LayoutDashboard, title: "Dashboard",
    body: "Your home base: your next class, the next Mock CAT countdown, your latest scores and your membership.",
    mobileHint: "On your phone, tap ☰ (top right) to open the menu." },
  { targets: ['[data-tour="nav-my-class"]', '[data-tour="menu"]'], icon: BookOpen, title: "My Class",
    body: "Take your Mock CATs, see the timetable with Google Meet links, read announcements and send us feedback.",
    mobileHint: "Find My Class in the ☰ menu." },
  { targets: ['[data-tour="nav-results"]', '[data-tour="menu"]'], icon: History, title: "Results",
    body: "Every released result with answers and explanations, plus a chart of your progress over time. Only you can see your scores.",
    mobileHint: "Find Results in the ☰ menu." },
  { targets: ['[data-tour="nav-profile"]', '[data-tour="menu"]'], icon: User, title: "Profile",
    body: "Your details, avatar, and membership & payment history.", mobileHint: "Find Profile in the ☰ menu." },
  { targets: ['[data-tour="bell"]'], icon: Bell, title: "Notifications",
    body: "Announcements, results and renewal reminders show up here. We'll also email you." },
];
const AVATAR_STEP = STEPS.length;

function visibleElement(selectors: string[]): HTMLElement | null {
  for (const selector of selectors) {
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight) return el;
    }
  }
  return null;
}

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
  const onMenuButton = target?.dataset.tour === "menu";
  const firstName = (user.name || "").trim().split(/\s+/)[0];
  const total = STEPS.length + 1;

  // Card position: under/next to the spotlighted element, or centred.
  const cardStyle: React.CSSProperties = {};
  const margin = 12;
  if (rect && !isAvatarStep) {
    const cardWidth = Math.min(360, window.innerWidth - 32);
    const beside = window.innerWidth >= 768 && rect.right + cardWidth + margin * 2 < window.innerWidth;
    if (beside) {
      cardStyle.left = rect.right + margin;
      cardStyle.top = Math.max(16, Math.min(rect.top - 8, window.innerHeight - 280));
    } else {
      cardStyle.left = Math.max(16, Math.min(rect.left + rect.width / 2 - cardWidth / 2, window.innerWidth - cardWidth - 16));
      cardStyle.top = rect.bottom + margin;
    }
    cardStyle.width = cardWidth;
  }

  const Icon = current?.icon ?? Sparkles;

  return (
    <div className="fixed inset-0 z-[10000]" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {/* Dimmed backdrop with a cut-out around the target */}
      {rect && !isAvatarStep ? (
        <div
          className="absolute rounded-xl ring-2 ring-primary transition-all duration-200 pointer-events-none"
          style={{
            left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.6)",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/60" />
      )}

      <div
        className={`${rect && !isAvatarStep ? "absolute" : "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)]"} ${isAvatarStep ? "max-w-lg" : "max-w-sm"} rounded-2xl border bg-card p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-200 max-h-[calc(100dvh-2rem)] overflow-y-auto`}
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
            {onMenuButton && current?.mobileHint && (
              <p className="text-sm font-medium inline-flex items-center gap-1.5"><Menu className="w-4 h-4" />{current.mobileHint}</p>
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
