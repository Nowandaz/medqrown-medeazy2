import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain, Zap, Trophy, Users, Star, Activity,
  ChevronDown, Menu, X, Play, Mail, MessageCircle,
  Instagram, Twitter, Linkedin, ArrowRight, Crown,
  Rocket, FlaskConical, Target, Sparkles, Send,
  ExternalLink, GraduationCap, Clock, ChevronLeft, ChevronRight,
  Swords,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MedQrownBrand } from "@/components/MedQrownBrand";
import medqrownIcon from "@/assets/medqrown-icon.png";
import demoStudents from "@/assets/demo-students.jpg";

type DemoExamData = { id: number; title: string; timerSeconds: number };
type DemoQuestionData = {
  id: number; type: string; content: string; imageUrl?: string | null;
  options?: { content: string; isCorrect: boolean }[] | null;
  explanation?: string | null;
};
type DemoPhase = "select" | "mcq" | "mcq_result" | "saq" | "saq_result" | "done";
type SiteContentData = { settings: Record<string, any>; faq: { id: number; question: string; answer: string }[] };

function createDemoSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function trackDemoEngagement(event: {
  examId: number;
  sessionId: string;
  eventType: "started" | "mcq_answered" | "saq_started" | "saq_submitted" | "completed";
  questionId?: number;
  optionIndex?: number;
  responseLength?: number;
}) {
  void fetch("/api/demo/engagement", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(event),
  }).catch(() => undefined);
}

// ─── Custom subject dropdown (styled listbox) ────────────────────────────────

function SubjectDropdown({
  exams, value, onChange,
}: {
  exams: DemoExamData[];
  value: number | "";
  onChange: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = exams.find((e) => e.id === value);

  useEffect(() => {
    const handler = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between gap-3 bg-background border rounded-xl px-4 py-3.5 text-sm transition-all ${
          open ? "border-primary ring-2 ring-primary/20" : "border-input hover:border-primary/40"
        }`}
      >
        <span className="flex items-center gap-2.5 min-w-0">
          <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${selected ? "bg-primary/15" : "bg-muted"}`}>
            <FlaskConical className={`w-3.5 h-3.5 ${selected ? "text-primary" : "text-muted-foreground/50"}`} />
          </span>
          <span className={`truncate font-medium ${selected ? "text-foreground" : "text-muted-foreground"}`}>
            {selected ? selected.title : "Choose a subject…"}
          </span>
        </span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-200 ${open ? "rotate-180 text-primary" : ""}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute z-30 mt-2 w-full bg-card border border-border rounded-2xl shadow-xl overflow-hidden py-1.5 max-h-64 overflow-y-auto"
            role="listbox"
          >
            {exams.map((exam) => {
              const isSelected = exam.id === value;
              return (
                <li key={exam.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => { onChange(exam.id); setOpen(false); }}
                    className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-left transition-colors ${
                      isSelected ? "bg-primary/10 text-primary font-semibold" : "text-foreground hover:bg-muted"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isSelected ? "bg-primary" : "bg-muted-foreground/25"}`} />
                    <span className="flex-1 truncate">{exam.title}</span>
                    {isSelected && <span className="text-primary text-xs font-bold">✓</span>}
                  </button>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Data ────────────────────────────────────────────────────────────────────

const features = [
  {
    icon: Brain,
    title: "AI Clinical Scenarios",
    description:
      "Clinical case questions framed around real patient presentations to sharpen your diagnostic instincts.",
    badge: "COMING SOON",
  },
  {
    icon: Zap,
    title: "Standoffs — Rapid Fire",
    description:
      "Go head-to-head with a friend in a 1v1 or 2v2 clinical duel with a 60-second clock per question.",
    badge: "COMING SOON",
  },
  {
    icon: Trophy,
    title: "Competitive Elo Ratings",
    description:
      "Track your clinical reasoning over time and watch your rating climb as you master complex topics.",
    badge: "COMING SOON",
  },
  {
    icon: Users,
    title: "Peer-Hosted Lobbies",
    description:
      "Create private exam rooms, set your own time limits, and compete with your specific study group.",
    badge: "COMING SOON",
  },
  {
    icon: Star,
    title: "The XP Grind",
    description:
      "Earn Clinical XP by winning Standoffs and dominating lobbies. Unlock specialty cases and exclusive themes.",
    badge: "COMING SOON",
  },
  {
    icon: Activity,
    title: "Instant Results & AI Feedback",
    description:
      "After every exam, get per-question AI-written explanations detailing exactly why each answer was right or wrong.",
    badge: "LIVE",
  },
];

const premiumPerks = [
  {
    icon: Rocket,
    title: "Unlimited AI Exams",
    description: "Remove the monthly cap and generate as many custom practice exams as you need.",
  },
  {
    icon: Target,
    title: "Deep Tactical Analysis",
    description: "Post-exam breakdowns of every mechanism you misdiagnosed and why — not just a final score.",
  },
  {
    icon: Users,
    title: "Massive Lobbies",
    description: "Host cohort-wide exams without player caps.",
  },
  {
    icon: Star,
    title: "XP Store Access",
    description: "Unlock premium scenario packs, advanced AI features, and exclusive visual customizations.",
  },
];

const horizonFeatures = [
  {
    icon: FlaskConical,
    title: "Viva / Oral Assessment Simulator",
    description:
      "Multi-step clinical scenarios fired at you dynamically to prepare for the pressure of oral exams.",
  },
  {
    icon: Sparkles,
    title: "WARD-E: Your AI Companion",
    description:
      "Your personalized dashboard companion that guides you through difficult concepts and drives autonomous study sessions.",
  },
];

// ─── Navbar ──────────────────────────────────────────────────────────────────

function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [portalOpen, setPortalOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const portalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (portalRef.current && !portalRef.current.contains(e.target as Node)) {
        setPortalOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const scrollTo = (id: string) => {
    if (menuOpen) {
      // Close the mobile sheet first, then scroll once the overlay is gone —
      // scrolling while the full-screen menu unmounts gets cancelled on mobile.
      setMenuOpen(false);
      setTimeout(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
      }, 320);
    } else {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    }
  };

  // Lock body scroll while the mobile menu is open
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  return (
    <>
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-background/95 backdrop-blur-md border-b border-border shadow-sm"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Logo */}
        <a href="/" className="flex items-center gap-2 shrink-0">
          <MedQrownBrand size="sm" />
        </a>

        {/* Desktop center nav */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
          <button onClick={() => scrollTo("features")} className="hover:text-primary transition-colors">
            Features
          </button>
          <button onClick={() => scrollTo("study-hub")} className="hover:text-primary transition-colors">
            Study Hub
          </button>
          <button onClick={() => scrollTo("leaderboards")} className="hover:text-primary transition-colors">
            Leaderboards
          </button>
          <button onClick={() => scrollTo("demo-section")} className="hover:text-primary transition-colors">
            Demo
          </button>
        </nav>

        {/* Desktop right actions */}
        <div className="hidden md:flex items-center gap-3">
          <div className="relative" ref={portalRef}>
            <button
              onClick={() => setPortalOpen((v) => !v)}
              className="flex items-center gap-1.5 text-sm font-medium text-foreground border border-border hover:border-primary/40 rounded-lg px-4 py-2 transition-all bg-card hover:bg-muted"
            >
              Portal <ChevronDown className={`w-3.5 h-3.5 transition-transform ${portalOpen ? "rotate-180" : ""}`} />
            </button>
            <AnimatePresence>
              {portalOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.97 }}
                  transition={{ duration: 0.12 }}
                  className="absolute right-0 mt-2 w-56 bg-card border border-border rounded-xl shadow-lg overflow-hidden"
                >
                  <Link
                    href="/portal"
                    className="flex items-center gap-2 px-4 py-3 text-sm text-foreground hover:bg-muted transition-colors"
                    onClick={() => setPortalOpen(false)}
                  >
                    <GraduationCap className="w-4 h-4 text-primary" /> Student Portal
                  </Link>
                  <Link
                    href="/admin"
                    className="flex items-center gap-2 px-4 py-3 text-sm text-foreground hover:bg-muted transition-colors border-t border-border"
                    onClick={() => setPortalOpen(false)}
                  >
                    <Crown className="w-4 h-4 text-primary" /> Admin · Institution Login
                  </Link>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <Link href="/student/signup">
            <Button size="sm" className="font-semibold px-5">Start</Button>
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden text-foreground p-1"
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>
    </header>

    {/* Mobile menu — full-screen sheet (outside <header>: its backdrop-blur creates
        a containing block that would break this fixed-position overlay) */}
    <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="md:hidden fixed inset-x-0 top-16 bottom-0 z-40 bg-background/98 backdrop-blur-xl overflow-y-auto"
          >
            {/* Ambient glow */}
            <div
              className="absolute inset-0 pointer-events-none"
              aria-hidden
              style={{ backgroundImage: "radial-gradient(ellipse 80% 40% at 50% 0%, hsl(var(--primary) / 0.08), transparent 70%)" }}
            />
            <nav className="relative px-5 pt-6 pb-10 flex flex-col min-h-full">
              <p className="text-muted-foreground/60 text-[11px] font-bold uppercase tracking-[0.2em] mb-3 px-1">Explore</p>
              <div className="flex flex-col gap-2">
                {[
                  { id: "features", label: "Features", icon: Sparkles, desc: "What MedQrown can do" },
                  { id: "study-hub", label: "Study Hub", icon: Brain, desc: "Your practice arsenal" },
                  { id: "leaderboards", label: "Leaderboards", icon: Trophy, desc: "See who's on top" },
                  { id: "demo-section", label: "Try the Demo", icon: Zap, desc: "A real timed question" },
                ].map(({ id, label, icon: Icon, desc }) => (
                  <button
                    key={id}
                    type="button"
                    data-testid={`mobile-nav-${id}`}
                    onClick={() => scrollTo(id)}
                    className="relative z-10 flex items-center gap-4 rounded-2xl border border-border/60 bg-card px-4 py-3.5 text-left active:scale-[0.98] transition-transform"
                  >
                    <span className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5 text-primary" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-bold text-foreground text-[15px]">{label}</span>
                      <span className="block text-muted-foreground text-xs">{desc}</span>
                    </span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                  </button>
                ))}
              </div>

              <p className="text-muted-foreground/60 text-[11px] font-bold uppercase tracking-[0.2em] mt-7 mb-3 px-1">Portals</p>
              <div className="relative z-10 grid grid-cols-2 gap-2">
                <Link
                  href="/portal"
                  onClick={() => setMenuOpen(false)}
                  className="flex flex-col items-center gap-2 rounded-2xl border border-border/60 bg-card px-3 py-4 active:scale-[0.98] transition-transform"
                >
                  <GraduationCap className="w-6 h-6 text-primary" />
                  <span className="font-bold text-foreground text-sm">Student Portal</span>
                </Link>
                <Link
                  href="/admin"
                  onClick={() => setMenuOpen(false)}
                  className="flex flex-col items-center gap-2 rounded-2xl border border-border/60 bg-card px-3 py-4 active:scale-[0.98] transition-transform"
                >
                  <Crown className="w-6 h-6 text-primary" />
                  <span className="font-bold text-foreground text-sm">Institutions</span>
                </Link>
              </div>

              <div className="relative z-10 mt-auto pt-8">
                <Link href="/student/signup" onClick={() => setMenuOpen(false)}>
                  <Button className="w-full h-13 rounded-2xl font-bold text-base py-6 gap-2">
                    Start Practicing <ArrowRight className="w-5 h-5" />
                  </Button>
                </Link>
              </div>
            </nav>
          </motion.div>
        )}
    </AnimatePresence>
    </>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

function HeroSection() {
  return (
    <section className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center pt-16">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center py-20">
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center mb-8 gap-3"
        >
          <img
            src={medqrownIcon}
            alt="MedQrown"
            className="h-20 w-20 sm:h-28 sm:w-28 object-contain drop-shadow-lg"
          />
          <MedQrownBrand size="lg" />
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-5xl sm:text-6xl md:text-7xl font-black text-foreground leading-tight tracking-tight mb-6"
        >
          Master Medical{" "}
          <span className="text-primary">School.</span>
          <br />
          Together.
        </motion.h1>

        {/* Subheadline */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-lg sm:text-xl text-muted-foreground max-w-3xl mx-auto mb-10 leading-relaxed"
        >
          Generate targeted AI practice exams, conquer real-world clinical scenarios,
          challenge your friends in rapid-fire duels, and see how your clinical reasoning ranks.
          Take Timed Exams and see how you perform!
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6"
        >
          <Link href="/student/signup">
            <Button size="lg" className="px-8 h-12 text-base font-semibold gap-2">
              Start Practicing <ArrowRight className="w-5 h-5" />
            </Button>
          </Link>
          <div className="relative">
            <Button
              size="lg"
              variant="outline"
              disabled
              className="px-8 h-12 text-base font-semibold opacity-60 cursor-not-allowed"
            >
              Host a Group Exam
            </Button>
            <span className="absolute -top-2.5 -right-2 bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider">
              Soon
            </span>
          </div>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-muted-foreground text-sm"
        >
          Sign up or log in to take exams, host lobbies, and climb the leaderboard.
        </motion.p>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="mt-16 grid grid-cols-3 gap-6 max-w-lg mx-auto border-t border-border pt-10"
        >
          {[
            { value: "AI-Powered", label: "Clinical Marking" },
            { value: "Timed", label: "Exam Mode" },
            { value: "Free", label: "To Start" },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-lg font-black text-primary">{stat.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{stat.label}</div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

// ─── Demo section ─────────────────────────────────────────────────────────────

// ── Interactive Demo Section ──────────────────────────────────────────────────

function InteractiveDemoCard() {
  const [selectedExamId, setSelectedExamId] = useState<number | "">("");
  const [phase, setPhase] = useState<DemoPhase>("select");
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [saqText, setSaqText] = useState("");
  const [timeLeft, setTimeLeft] = useState(60);
  const [timerActive, setTimerActive] = useState(false);
  const [demoSessionId, setDemoSessionId] = useState("");

  const { data: demoExams = [] } = useQuery<DemoExamData[]>({
    queryKey: ["/api/demo/exams"],
  });

  const selectedExam = demoExams.find((e) => e.id === selectedExamId);

  const { data: questions = [] } = useQuery<DemoQuestionData[]>({
    queryKey: [`/api/demo/exams/${selectedExamId}/questions`],
    enabled: !!selectedExamId && phase !== "select",
  });

  const mcqQ = questions.find((q) => q.type === "mcq");
  const saqQ = questions.find((q) => q.type === "saq");

  useEffect(() => {
    if (!timerActive) return;
    if (timeLeft <= 0) {
      setTimerActive(false);
      if (phase === "mcq") setPhase("mcq_result");
      if (phase === "saq") setPhase("saq_result");
      return;
    }
    const t = setInterval(() => setTimeLeft((p) => p - 1), 1000);
    return () => clearInterval(t);
  }, [timerActive, timeLeft, phase]);

  const handleStart = () => {
    if (!selectedExamId) return;
    const sessionId = createDemoSessionId();
    setDemoSessionId(sessionId);
    trackDemoEngagement({ examId: selectedExamId, sessionId, eventType: "started" });
    // Refetch so a fresh random MCQ + SAQ is pulled from the bank each attempt
    queryClient.invalidateQueries({ queryKey: [`/api/demo/exams/${selectedExamId}/questions`] });
    setPhase("mcq");
    setTimeLeft(selectedExam?.timerSeconds ?? 60);
    setTimerActive(true);
    setSelectedOption(null);
    setSaqText("");
  };

  const handleMcqSubmit = () => {
    if (selectedOption === null) return;
    if (selectedExamId && demoSessionId && mcqQ) {
      trackDemoEngagement({
        examId: selectedExamId,
        sessionId: demoSessionId,
        eventType: "mcq_answered",
        questionId: mcqQ.id,
        optionIndex: selectedOption,
      });
    }
    setTimerActive(false);
    setPhase("mcq_result");
  };

  const handleNextToSaq = () => {
    if (!saqQ) {
      if (selectedExamId && demoSessionId) {
        trackDemoEngagement({ examId: selectedExamId, sessionId: demoSessionId, eventType: "completed" });
      }
      setPhase("done");
      return;
    }
    if (selectedExamId && demoSessionId) {
      trackDemoEngagement({
        examId: selectedExamId,
        sessionId: demoSessionId,
        eventType: "saq_started",
        questionId: saqQ.id,
      });
    }
    setPhase("saq");
    setTimeLeft(selectedExam?.timerSeconds ?? 60);
    setTimerActive(true);
    setSaqText("");
  };

  const handleSaqSubmit = () => {
    if (selectedExamId && demoSessionId && saqQ) {
      trackDemoEngagement({
        examId: selectedExamId,
        sessionId: demoSessionId,
        eventType: "saq_submitted",
        questionId: saqQ.id,
        responseLength: saqText.trim().length,
      });
      trackDemoEngagement({ examId: selectedExamId, sessionId: demoSessionId, eventType: "completed" });
    }
    setTimerActive(false);
    setPhase("saq_result");
  };

  const handleReset = () => {
    setPhase("select");
    setSelectedExamId("");
    setSelectedOption(null);
    setSaqText("");
    setTimerActive(false);
  };

  const mins = Math.floor(timeLeft / 60).toString().padStart(2, "0");
  const secs = (timeLeft % 60).toString().padStart(2, "0");
  const timerUrgent = timeLeft <= 10;

  const isCorrect =
    phase === "mcq_result" &&
    selectedOption !== null &&
    !!(mcqQ?.options?.[selectedOption]?.isCorrect);

  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.96 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="w-full max-w-xl mx-auto rounded-3xl bg-card/95 backdrop-blur-xl border border-border/60 shadow-[0_24px_80px_-16px_rgba(0,0,0,0.25)] overflow-hidden"
    >
      {/* Popup-style top bar */}
      <div className="px-6 pt-5 pb-4 flex items-center justify-between gap-3 border-b border-border/50">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex gap-1.5 shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-red-400/70" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400/70" />
            <span className="w-2.5 h-2.5 rounded-full bg-green-400/70" />
          </div>
          <span className="text-muted-foreground text-xs font-medium truncate">
            {phase === "select" ? "demo · medqrown.com" : selectedExam?.title ?? "Challenge"}
          </span>
        </div>
        {(phase === "mcq" || phase === "saq") ? (
          <motion.div
            animate={timerUrgent ? { scale: [1, 1.08, 1] } : {}}
            transition={{ repeat: Infinity, duration: 0.8 }}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 font-mono font-bold text-xs shrink-0 border ${
              timerUrgent
                ? "bg-red-500/10 text-red-500 border-red-500/30"
                : "bg-primary/10 text-primary border-primary/20"
            }`}
          >
            <Clock className="w-3.5 h-3.5" /> {mins}:{secs}
          </motion.div>
        ) : (
          <MedQrownBrand size="sm" className="opacity-80" />
        )}
      </div>

      {/* Content */}
      <div className="p-6 sm:p-8 min-h-[380px] flex flex-col justify-center">
        <AnimatePresence mode="wait">
        {phase === "select" && (
          <motion.div key="select" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="text-center">
            <h3 className="text-2xl sm:text-3xl font-black text-foreground mb-3 leading-tight">
              Think you can answer these<br className="hidden sm:block" /> in record time?
            </h3>
            <p className="text-muted-foreground text-sm mb-8 max-w-sm mx-auto">
              One timed MCQ. One short answer. Same pressure as the real thing.
            </p>
            {demoExams.length === 0 ? (
              <div className="bg-muted/40 rounded-2xl p-8">
                <FlaskConical className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-muted-foreground text-sm">Demo questions coming soon — check back later!</p>
              </div>
            ) : (
              <div className="space-y-3 max-w-xs mx-auto">
                <SubjectDropdown
                  exams={demoExams}
                  value={selectedExamId}
                  onChange={(id) => setSelectedExamId(id)}
                />
                <Button onClick={handleStart} disabled={!selectedExamId} size="lg" className="w-full gap-2 font-bold rounded-xl h-12">
                  Start Challenge <Zap className="w-4 h-4" />
                </Button>
              </div>
            )}
          </motion.div>
        )}

        {(phase === "mcq" || phase === "mcq_result") && (
          mcqQ ? (
            <motion.div key="mcq" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground font-semibold uppercase tracking-widest">Question 1 of 2</span>
                <span className="bg-primary/10 text-primary text-[10px] font-bold px-2.5 py-1 rounded-full">MCQ</span>
              </div>
              {mcqQ.imageUrl && (
                <img src={mcqQ.imageUrl} alt="Question" className="w-full rounded-xl object-cover max-h-40" />
              )}
              <p className="text-foreground font-semibold leading-relaxed">{mcqQ.content}</p>
              <div className="space-y-2">
                {mcqQ.options?.map((opt, idx) => {
                  let cls = "border-border/70 bg-background hover:border-primary/50 hover:bg-primary/[0.03]";
                  if (phase === "mcq_result") {
                    if (opt.isCorrect) cls = "border-green-500 bg-green-50 dark:bg-green-950/30";
                    else if (selectedOption === idx) cls = "border-red-400 bg-red-50 dark:bg-red-950/30";
                    else cls = "border-border/40 bg-background opacity-60";
                  } else if (selectedOption === idx) {
                    cls = "border-primary bg-primary/10 ring-1 ring-primary/30";
                  }
                  return (
                    <button
                      key={idx}
                      onClick={() => phase === "mcq" && setSelectedOption(idx)}
                      disabled={phase === "mcq_result"}
                      className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-all duration-150 ${cls}`}
                    >
                      <span className="font-bold text-primary mr-2.5">{String.fromCharCode(65 + idx)}</span>
                      {opt.content}
                      {phase === "mcq_result" && opt.isCorrect && <span className="ml-2 text-green-600 font-bold">✓</span>}
                      {phase === "mcq_result" && selectedOption === idx && !opt.isCorrect && <span className="ml-2 text-red-500 font-bold">✗</span>}
                    </button>
                  );
                })}
              </div>
              {phase === "mcq" && (
                <Button onClick={handleMcqSubmit} disabled={selectedOption === null} className="w-full rounded-xl h-11 font-bold">
                  Submit Answer
                </Button>
              )}
              {phase === "mcq_result" && (
                <div className="space-y-3">
                  <div className={`rounded-xl py-2.5 px-4 text-center text-sm font-bold ${
                    isCorrect
                      ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400"
                      : "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400"
                  }`}>
                    {isCorrect ? "✓ Correct! Well done." : "✗ Not quite — see explanation below."}
                  </div>
                  {mcqQ.explanation && (
                    <div className="bg-primary/5 border border-primary/15 rounded-xl p-4">
                      <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1">Explanation</p>
                      <p className="text-sm text-foreground leading-relaxed">{mcqQ.explanation}</p>
                    </div>
                  )}
                  <div className="flex justify-end">
                    <Button onClick={handleNextToSaq} className="gap-1.5 rounded-xl font-bold">
                      {saqQ ? "Next Question" : "Finish"} <ArrowRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </motion.div>
          ) : (
            <div key="mcq-loading" className="text-center py-10 text-muted-foreground text-sm">Loading question…</div>
          )
        )}

        {(phase === "saq" || phase === "saq_result") && (
          saqQ ? (
            <motion.div key="saq" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground font-semibold uppercase tracking-widest">Question 2 of 2</span>
                <span className="bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-bold px-2.5 py-1 rounded-full">SAQ</span>
              </div>
              {saqQ.imageUrl && (
                <img src={saqQ.imageUrl} alt="Question" className="w-full rounded-xl object-cover max-h-40" />
              )}
              <p className="text-foreground font-semibold leading-relaxed">{saqQ.content}</p>
              <textarea
                value={saqText}
                onChange={(e) => setSaqText(e.target.value)}
                placeholder="Type your answer here…"
                rows={4}
                disabled={phase === "saq_result"}
                className="w-full bg-background border border-input rounded-xl px-4 py-3 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
              />
              {phase === "saq" && (
                <Button onClick={handleSaqSubmit} disabled={!saqText.trim()} className="w-full rounded-xl h-11 font-bold">
                  Submit Answer
                </Button>
              )}
              {phase === "saq_result" && (
                <div className="relative rounded-2xl overflow-hidden">
                  <div className="border border-primary/15 rounded-2xl p-5 select-none pointer-events-none" aria-hidden>
                    <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-2">AI Analysis & Model Answer</p>
                    <p className="text-sm text-foreground mb-2">Your answer demonstrates a solid understanding of the primary pathway. You correctly identified the mechanism but missed the compensatory feedback loop. <strong>Score: 7/10.</strong></p>
                    <p className="text-xs text-muted-foreground">Model answer: The correct sequence involves activation of the renin–angiotensin–aldosterone system, leading to sodium retention and secondary hypertension.</p>
                  </div>
                  <div className="absolute inset-0 backdrop-blur-md bg-background/55 flex flex-col items-center justify-center text-center px-5">
                    <Crown className="w-8 h-8 text-primary mb-2" />
                    <p className="font-black text-foreground text-sm mb-1">Unlock AI Analysis &amp; Feedback</p>
                    <p className="text-muted-foreground text-xs mb-4 max-w-[220px] leading-relaxed">
                      Create an account to see your score, model answer, and full AI explanation.
                    </p>
                    <div className="flex gap-2">
                      <Link href="/student/signup">
                        <Button size="sm" className="font-bold text-xs rounded-lg">Create Account</Button>
                      </Link>
                      <Button size="sm" variant="outline" onClick={handleReset} className="text-xs rounded-lg">Try Again</Button>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          ) : (
            <div key="saq-loading" className="text-center py-10 text-muted-foreground text-sm">Loading question…</div>
          )
        )}

        {phase === "done" && (
          <motion.div key="done" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center">
            <div className="text-5xl mb-3">🎯</div>
            <h3 className="font-black text-foreground text-xl mb-2">Challenge complete!</h3>
            <p className="text-muted-foreground text-sm mb-6">Create an account to compete for real, track your Elo, and get AI-powered feedback.</p>
            <div className="flex gap-3 justify-center">
              <Link href="/student/signup"><Button className="font-bold rounded-xl">Create Account</Button></Link>
              <Button variant="outline" onClick={handleReset} className="rounded-xl">Try Again</Button>
            </div>
          </motion.div>
        )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function toYouTubeEmbed(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  return m ? `https://www.youtube.com/embed/${m[1]}` : null;
}

function DemoSection() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [slide, setSlide] = useState(0);
  const SLIDES = 3;

  const { data: siteContent } = useQuery<SiteContentData>({ queryKey: ["/api/site-content"] });
  const settings = siteContent?.settings || {};
  const videoUrl: string = settings.demoVideoUrl || "";
  const youtubeEmbed = videoUrl ? toYouTubeEmbed(videoUrl) : null;
  const photoUrl: string = settings.demoPhotoUrl || demoStudents;
  const photoHeadline: string = settings.demoPhotoHeadline || "Study less. Rank higher.";
  const photoSubtext: string =
    settings.demoPhotoSubtext ||
    "Thousands of questions, AI feedback in seconds, and classmates to outscore. This is how the top of your class prepares.";
  const photoCta: string = settings.demoPhotoCta || "Join Them";

  const goTo = (i: number) => {
    const el = trackRef.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(SLIDES - 1, i));
    el.scrollTo({ left: clamped * el.clientWidth, behavior: "smooth" });
  };

  const onScroll = () => {
    const el = trackRef.current;
    if (!el) return;
    setSlide(Math.round(el.scrollLeft / el.clientWidth));
  };

  return (
    <section id="demo-section" className="relative bg-background py-24 overflow-hidden scroll-mt-16">
      {/* Section header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-center mb-12 px-4"
      >
        <p className="text-primary text-xs font-semibold uppercase tracking-widest mb-2">Try It Now</p>
        <h2 className="text-3xl sm:text-4xl font-black text-foreground">
          See what exam day actually feels like.
        </h2>
        <p className="text-muted-foreground mt-3 max-w-xl mx-auto">
          A real timed question from our bank. No signup needed.
        </p>
      </motion.div>

      {/* Full-width slider */}
      <div className="relative">
        <div
          ref={trackRef}
          onScroll={onScroll}
          className="flex overflow-x-auto snap-x snap-mandatory scroll-smooth"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {/* ── Slide 1: quiz popup on ambient backdrop ── */}
          <div className="w-full shrink-0 snap-center relative px-4 sm:px-8 py-14 flex items-center justify-center min-h-[620px]">
            {/* Ambient backdrop */}
            <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.06] via-primary/[0.10] to-primary/[0.05]" aria-hidden />
            <div
              className="absolute inset-0 opacity-[0.35]"
              aria-hidden
              style={{
                backgroundImage:
                  "radial-gradient(ellipse 60% 50% at 50% 40%, hsl(var(--primary) / 0.18), transparent 70%)",
              }}
            />
            <div
              className="absolute inset-0 opacity-[0.05]"
              aria-hidden
              style={{
                backgroundImage:
                  "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)",
                backgroundSize: "44px 44px",
              }}
            />
            <div className="relative z-10 w-full">
              <InteractiveDemoCard />
            </div>
          </div>

          {/* ── Slide 2: video ── */}
          <div className="w-full shrink-0 snap-center relative flex items-center justify-center min-h-[620px] px-4 sm:px-8 py-14">
            <div className="absolute inset-0 bg-gradient-to-br from-[#06251f] via-[#0a3a30] to-[#06251f]" aria-hidden />
            <div
              className="absolute inset-0 opacity-30"
              aria-hidden
              style={{
                backgroundImage:
                  "radial-gradient(ellipse 50% 60% at 50% 50%, hsl(var(--primary) / 0.35), transparent 70%)",
              }}
            />
            {videoUrl ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                className="relative z-10 w-full max-w-3xl mx-auto"
              >
                <div className="aspect-video rounded-2xl overflow-hidden shadow-[0_24px_80px_-16px_rgba(0,0,0,0.5)] border border-white/10 bg-black">
                  {youtubeEmbed ? (
                    <iframe
                      src={youtubeEmbed}
                      title="MedQrown platform walkthrough"
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  ) : (
                    <video src={videoUrl} controls playsInline className="w-full h-full object-contain" />
                  )}
                </div>
                <p className="text-white/70 text-sm text-center mt-5">Watch the platform in action.</p>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                className="relative z-10 text-center max-w-lg mx-auto"
              >
                <motion.button
                  whileHover={{ scale: 1.06 }}
                  whileTap={{ scale: 0.97 }}
                  className="w-24 h-24 rounded-full bg-white/10 backdrop-blur border border-white/25 flex items-center justify-center mx-auto mb-8 shadow-[0_0_60px_rgba(255,255,255,0.12)]"
                >
                  <Play className="w-9 h-9 text-white ml-1.5 fill-white" />
                </motion.button>
                <h3 className="text-white text-2xl sm:text-3xl font-black mb-3">Watch the platform in action</h3>
                <p className="text-white/70 text-sm max-w-sm mx-auto leading-relaxed">
                  From first question to leaderboard glory — a full walkthrough is coming soon.
                </p>
              </motion.div>
            )}
          </div>

          {/* ── Slide 3: photo ── */}
          <div className="w-full shrink-0 snap-center relative flex items-end min-h-[620px]">
            <img
              src={photoUrl}
              alt="Medical students studying together"
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/10" aria-hidden />
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="relative z-10 w-full max-w-3xl mx-auto text-center px-6 pb-16"
            >
              <h3 className="text-white text-3xl sm:text-4xl font-black mb-3 leading-tight">
                {photoHeadline}
              </h3>
              <p className="text-white/80 text-sm sm:text-base max-w-lg mx-auto mb-7 leading-relaxed">
                {photoSubtext}
              </p>
              <Link href="/student/signup">
                <Button size="lg" className="px-8 h-12 font-bold rounded-xl gap-2">
                  {photoCta} <ArrowRight className="w-5 h-5" />
                </Button>
              </Link>
            </motion.div>
          </div>
        </div>

        {/* Arrows */}
        <button
          onClick={() => goTo(slide - 1)}
          aria-label="Previous slide"
          className={`hidden sm:flex absolute left-4 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full items-center justify-center bg-background/80 backdrop-blur border border-border shadow-lg hover:bg-background transition-all ${slide === 0 ? "opacity-0 pointer-events-none" : "opacity-100"}`}
        >
          <ChevronLeft className="w-5 h-5 text-foreground" />
        </button>
        <button
          onClick={() => goTo(slide + 1)}
          aria-label="Next slide"
          className={`hidden sm:flex absolute right-4 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full items-center justify-center bg-background/80 backdrop-blur border border-border shadow-lg hover:bg-background transition-all ${slide === SLIDES - 1 ? "opacity-0 pointer-events-none" : "opacity-100"}`}
        >
          <ChevronRight className="w-5 h-5 text-foreground" />
        </button>
      </div>

      {/* Dots */}
      <div className="flex items-center justify-center gap-2.5 mt-8">
        {Array.from({ length: SLIDES }).map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            aria-label={`Go to slide ${i + 1}`}
            className={`rounded-full transition-all duration-300 ${slide === i ? "w-8 h-2.5 bg-primary" : "w-2.5 h-2.5 bg-muted-foreground/25 hover:bg-muted-foreground/50"}`}
          />
        ))}
      </div>
    </section>
  );
}

// ─── Features grid ────────────────────────────────────────────────────────────

function FeaturesSection() {
  return (
    <section id="features" className="bg-background py-24 px-4 scroll-mt-16">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-14"
        >
          <p className="text-primary text-xs font-semibold uppercase tracking-widest mb-2">What We Offer</p>
          <h2 className="text-3xl sm:text-4xl font-black text-foreground">Core Features</h2>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((feat, i) => {
            const Icon = feat.icon;
            const isLive = feat.badge === "LIVE";
            return (
              <motion.div
                key={feat.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.07 }}
              >
                <Card className="h-full border-primary/10 hover:border-primary/30 transition-colors hover:shadow-md">
                  <CardContent className="p-6 flex flex-col h-full">
                    <div className="flex items-start justify-between mb-4">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Icon className="w-5 h-5 text-primary" />
                      </div>
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                          isLive
                            ? "bg-primary/10 text-primary border-primary/20"
                            : "bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400"
                        }`}
                      >
                        {feat.badge}
                      </span>
                    </div>
                    <h3 className="text-foreground font-bold text-base mb-2">{feat.title}</h3>
                    <p className="text-muted-foreground text-sm leading-relaxed flex-1">{feat.description}</p>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── Leaderboard teaser ───────────────────────────────────────────────────────

const fakeLeaders = [
  { rank: 1, name: "Amara K.", specialty: "Internal Medicine", xp: "2,340 XP", elo: "1,842" },
  { rank: 2, name: "David O.", specialty: "Surgery", xp: "2,190 XP", elo: "1,811" },
  { rank: 3, name: "Fatima H.", specialty: "Paediatrics", xp: "1,975 XP", elo: "1,793" },
  { rank: 4, name: "Yusuf A.", specialty: "Obstetrics", xp: "1,860 XP", elo: "1,765" },
  { rank: 5, name: "Sofia R.", specialty: "Pharmacology", xp: "1,720 XP", elo: "1,748" },
];

function LeaderboardTeaser() {
  return (
    <section id="leaderboards" className="bg-muted/30 py-24 px-4 scroll-mt-16">
      <div className="max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-10"
        >
          <p className="text-primary text-xs font-semibold uppercase tracking-widest mb-2">Leaderboards</p>
          <h2 className="text-3xl sm:text-4xl font-black text-foreground">Where do you rank globally?</h2>
          <p className="text-muted-foreground mt-3 max-w-md mx-auto">
            Compete with medical students worldwide. Your Elo rating updates in real time after every Standoff.
          </p>
          <span className="inline-block mt-3 bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full">
            Coming Soon
          </span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <Card className="border-primary/10 overflow-hidden">
            <div className="px-5 py-3 border-b border-border flex items-center justify-between bg-muted/40">
              <span className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">Global Elo Rankings</span>
              <Trophy className="w-4 h-4 text-primary" />
            </div>
            {fakeLeaders.map((leader, i) => (
              <div
                key={leader.rank}
                className={`flex items-center gap-4 px-5 py-3.5 border-b border-border last:border-0 ${
                  i === 0 ? "bg-primary/5" : ""
                }`}
              >
                <span
                  className={`text-sm font-black w-5 text-center ${
                    i === 0 ? "text-yellow-500" : i === 1 ? "text-muted-foreground" : i === 2 ? "text-amber-600" : "text-muted-foreground/40"
                  }`}
                >
                  #{leader.rank}
                </span>
                <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary text-xs font-bold">
                  {leader.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-foreground text-sm font-semibold">{leader.name}</p>
                  <p className="text-muted-foreground text-xs truncate">{leader.specialty}</p>
                </div>
                <div className="text-right hidden sm:block">
                  <p className="text-primary text-xs font-bold">{leader.xp}</p>
                  <p className="text-muted-foreground text-xs">Elo {leader.elo}</p>
                </div>
              </div>
            ))}
          </Card>
        </motion.div>
      </div>
    </section>
  );
}

// ─── Premium block ────────────────────────────────────────────────────────────

function PremiumSection() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleNotify = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitted(true);
  };

  return (
    <section className="bg-background py-24 px-4">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-14"
        >
          <p className="text-primary text-xs font-semibold uppercase tracking-widest mb-2">Premium</p>
          <h2 className="text-3xl sm:text-4xl font-black text-foreground">Take Your Prep to the Next Level.</h2>
        </motion.div>

        <div className="grid sm:grid-cols-2 gap-5 mb-12">
          {premiumPerks.map((perk, i) => {
            const Icon = perk.icon;
            return (
              <motion.div
                key={perk.title}
                initial={{ opacity: 0, x: i % 2 === 0 ? -15 : 15 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
              >
                <Card className="h-full border-primary/10">
                  <CardContent className="p-5 flex gap-4">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-foreground font-bold text-sm mb-1">{perk.title}</h3>
                      <p className="text-muted-foreground text-sm leading-relaxed">{perk.description}</p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>

        {/* Notify me */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <Card className="border-primary/20 max-w-lg mx-auto">
            <CardContent className="p-8 text-center">
              <Crown className="w-7 h-7 text-primary mx-auto mb-3" />
              <h3 className="text-foreground font-black text-lg mb-1">Premium is almost here.</h3>
              <p className="text-muted-foreground text-sm mb-6">Be the first to know when it launches.</p>
              {submitted ? (
                <p className="text-primary font-semibold text-sm">✓ You're on the list — we'll notify you!</p>
              ) : (
                <form onSubmit={handleNotify} className="flex gap-2">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="flex-1 bg-background border border-input rounded-lg px-4 py-2.5 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    required
                  />
                  <Button type="submit" size="sm" className="px-4 whitespace-nowrap">Notify Me</Button>
                </form>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </section>
  );
}

// ─── Horizon features ─────────────────────────────────────────────────────────

function HorizonSection() {
  const [waitlistEmail, setWaitlistEmail] = useState("");
  const [waitlistDone, setWaitlistDone] = useState(false);

  const handleWaitlist = (e: React.FormEvent) => {
    e.preventDefault();
    if (!waitlistEmail.trim()) return;
    setWaitlistDone(true);
  };

  return (
    <section id="study-hub" className="bg-muted/30 py-24 px-4 scroll-mt-16">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-14"
        >
          <span className="inline-flex items-center gap-1.5 bg-primary/10 border border-primary/20 text-primary text-xs font-semibold uppercase tracking-widest px-3 py-1 rounded-full mb-4">
            <Rocket className="w-3 h-3" /> On the Horizon
          </span>
          <h2 className="text-3xl sm:text-4xl font-black text-foreground mt-3">The platform is just getting started.</h2>
          <p className="text-muted-foreground mt-3 max-w-xl mx-auto">
            Two next-level features in active development.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 gap-6 mb-12">
          {horizonFeatures.map((feat, i) => {
            const Icon = feat.icon;
            return (
              <motion.div
                key={feat.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <Card className="h-full border-primary/10">
                  <CardContent className="p-7">
                    <div className="flex items-start justify-between mb-4">
                      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Icon className="w-6 h-6 text-primary" />
                      </div>
                      <span className="bg-primary/10 border border-primary/20 text-primary text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full">
                        In Development
                      </span>
                    </div>
                    <h3 className="text-foreground font-black text-lg mb-2">{feat.title}</h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">{feat.description}</p>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>

        {/* Waitlist */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center"
        >
          {waitlistDone ? (
            <p className="text-primary font-semibold">✓ You're on the waitlist — first in line!</p>
          ) : (
            <>
              <p className="text-muted-foreground text-sm mb-4 font-medium">Join our waitlist for these features</p>
              <form onSubmit={handleWaitlist} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
                <input
                  type="email"
                  value={waitlistEmail}
                  onChange={(e) => setWaitlistEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="flex-1 bg-background border border-input rounded-xl px-5 py-3 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  required
                />
                <Button type="submit" className="whitespace-nowrap">Join Waitlist</Button>
              </form>
            </>
          )}
        </motion.div>
      </div>
    </section>
  );
}

// ─── Contact section ──────────────────────────────────────────────────────────

function ContactSection() {
  const [form, setForm] = useState({ name: "", email: "", message: "" });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const subject = encodeURIComponent(`MedQrown Enquiry from ${form.name}`);
    const body = encodeURIComponent(`Name: ${form.name}\nEmail: ${form.email}\n\n${form.message}`);
    window.location.href = `mailto:norysndachule@gmail.com?subject=${subject}&body=${body}`;
  };

  return (
    <section id="contact" className="bg-background py-24 px-4 scroll-mt-16">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-14"
        >
          <p className="text-primary text-xs font-semibold uppercase tracking-widest mb-2">Get in Touch</p>
          <h2 className="text-3xl sm:text-4xl font-black text-foreground">We'd love to hear from you.</h2>
          <p className="text-muted-foreground mt-3 max-w-md mx-auto">
            Questions, feedback, or want to say hello — reach us directly.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Direct contact */}
          <motion.div
            initial={{ opacity: 0, x: -15 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="flex flex-col gap-4"
          >
            <a
              href="mailto:norysndachule@gmail.com"
              className="group"
            >
              <Card className="border-primary/10 hover:border-primary/30 transition-colors hover:shadow-md">
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Mail className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-muted-foreground text-xs mb-0.5">Email us</p>
                    <p className="text-foreground font-semibold text-sm group-hover:text-primary transition-colors truncate">
                      norysndachule@gmail.com
                    </p>
                  </div>
                  <ExternalLink className="w-4 h-4 text-muted-foreground/50 group-hover:text-primary transition-colors shrink-0" />
                </CardContent>
              </Card>
            </a>

            <a
              href="https://wa.me/254702797977"
              target="_blank"
              rel="noopener noreferrer"
              className="group"
            >
              <Card className="border-primary/10 hover:border-primary/30 transition-colors hover:shadow-md">
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <MessageCircle className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-muted-foreground text-xs mb-0.5">WhatsApp</p>
                    <p className="text-foreground font-semibold text-sm group-hover:text-primary transition-colors">
                      +254 702 797 977
                    </p>
                  </div>
                  <ExternalLink className="w-4 h-4 text-muted-foreground/50 group-hover:text-primary transition-colors shrink-0" />
                </CardContent>
              </Card>
            </a>

            <Card className="border-primary/10">
              <CardContent className="p-5">
                <p className="text-muted-foreground text-xs mb-3 uppercase tracking-wider font-semibold">Follow Us</p>
                <div className="flex gap-3">
                  {[
                    { Icon: Instagram, label: "Instagram" },
                    { Icon: Twitter, label: "X / Twitter" },
                    { Icon: Linkedin, label: "LinkedIn" },
                  ].map(({ Icon, label }) => (
                    <button
                      key={label}
                      title={`${label} — coming soon`}
                      className="w-10 h-10 rounded-xl bg-muted border border-border flex items-center justify-center text-muted-foreground cursor-not-allowed"
                    >
                      <Icon className="w-4 h-4" />
                    </button>
                  ))}
                </div>
                <p className="text-muted-foreground/60 text-xs mt-2">Social handles coming soon.</p>
              </CardContent>
            </Card>
          </motion.div>

          {/* Contact form */}
          <motion.form
            initial={{ opacity: 0, x: 15 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            onSubmit={handleSubmit}
          >
            <Card className="border-primary/10 h-full">
              <CardContent className="p-6 flex flex-col gap-4 h-full">
                <div>
                  <label className="text-muted-foreground text-xs font-semibold uppercase tracking-wider block mb-1.5">Name</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Your name"
                    className="w-full bg-background border border-input rounded-lg px-4 py-2.5 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    required
                  />
                </div>
                <div>
                  <label className="text-muted-foreground text-xs font-semibold uppercase tracking-wider block mb-1.5">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="your@email.com"
                    className="w-full bg-background border border-input rounded-lg px-4 py-2.5 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    required
                  />
                </div>
                <div className="flex-1">
                  <label className="text-muted-foreground text-xs font-semibold uppercase tracking-wider block mb-1.5">Message</label>
                  <textarea
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    placeholder="Tell us what's on your mind…"
                    rows={5}
                    className="w-full bg-background border border-input rounded-lg px-4 py-2.5 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                    required
                  />
                </div>
                <Button type="submit" className="w-full gap-2">
                  <Send className="w-4 h-4" /> Send Message
                </Button>
              </CardContent>
            </Card>
          </motion.form>
        </div>
      </div>
    </section>
  );
}

// ─── Final CTA band ───────────────────────────────────────────────────────────

function FinalCTASection() {
  return (
    <section className="bg-gradient-to-br from-background via-background to-primary/5 py-28 px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-center max-w-3xl mx-auto"
      >
        <h2 className="text-4xl sm:text-5xl font-black text-foreground leading-tight mb-6">
          Ready to dominate your next block?
        </h2>
        <p className="text-muted-foreground text-lg mb-10">
          Join medical students already sharpening their clinical edge with MedQrown MedEazy.
        </p>
        <Link href="/student/signup">
          <Button size="lg" className="px-10 h-14 text-lg font-bold gap-2">
            Start Practicing <ArrowRight className="w-5 h-5" />
          </Button>
        </Link>
      </motion.div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="bg-card border-t border-border py-14 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-10 mb-12">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <MedQrownBrand size="sm" />
            </div>
            <p className="text-muted-foreground text-sm leading-relaxed max-w-xs">
              The competitive clinical training ground for the next generation of medical professionals.
            </p>
          </div>

          <div>
            <p className="text-foreground text-xs font-semibold uppercase tracking-wider mb-4">Platform</p>
            <div className="flex flex-col gap-2.5">
              {["features", "study-hub", "leaderboards", "contact"].map((id) => (
                <button
                  key={id}
                  onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" })}
                  className="text-muted-foreground hover:text-primary text-sm text-left transition-colors capitalize"
                >
                  {id === "study-hub" ? "Study Hub" : id.charAt(0).toUpperCase() + id.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-foreground text-xs font-semibold uppercase tracking-wider mb-4">Legal</p>
            <div className="flex flex-col gap-2.5">
              {[
                { label: "Terms of Service", href: "/terms" },
                { label: "Privacy Policy", href: "/privacy" },
                { label: "FAQ", href: "/faq" },
              ].map(({ label, href }) => (
                <Link key={href} href={href} className="text-muted-foreground hover:text-primary text-sm transition-colors">
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-muted-foreground text-xs">
            © {new Date().getFullYear()} MedQrown MedEazy. All rights reserved.
          </p>
          <Link
            href="/institutions"
            className="text-muted-foreground hover:text-primary text-xs underline underline-offset-2 transition-colors"
          >
            Are you a University Administrator? Click here for MedQrown Institutions →
          </Link>
        </div>
      </div>
    </footer>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <HeroSection />
      <DemoSection />
      <FeaturesSection />
      <LeaderboardTeaser />
      <PremiumSection />
      <HorizonSection />
      <ContactSection />
      <FinalCTASection />
      <Footer />
    </div>
  );
}
