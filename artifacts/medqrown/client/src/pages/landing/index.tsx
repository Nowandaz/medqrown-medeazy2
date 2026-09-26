// ─── FAQ section ──────────────────────────────────────────────────────────────

function FaqSection() {
  const { data } = useQuery<{ faq: { id: number; question: string; answer: string }[] }>({
    queryKey: ["/api/site-content"],
  });
  const items = data?.faq || [];
  const [open, setOpen] = useState<number | null>(null);

  if (items.length === 0) return null;

  return (
    <section id="faq-section" className="bg-muted/30 py-24 px-4 scroll-mt-16">
      <div className="max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-14"
        >
          <p className="text-primary text-xs font-semibold uppercase tracking-widest mb-2">Questions?</p>
          <h2 className="text-3xl sm:text-4xl font-black text-foreground">Frequently Asked Questions</h2>
        </motion.div>
        
        <div className="space-y-3">
          {items.map((item) => {
            const isOpen = open === item.id;
            return (
              <div
                key={item.id}
                className={`rounded-2xl border transition-colors ${isOpen ? "border-primary/40 bg-primary/[0.03]" : "border-border bg-card"}`}
              >
                <button
                  onClick={() => setOpen(isOpen ? null : item.id)}
                  className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
                >
                  <span className="font-semibold text-foreground text-sm">{item.question}</span>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180 text-primary" : ""}`} />
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <p className="px-5 pb-4 text-muted-foreground text-sm leading-relaxed whitespace-pre-line">{item.answer}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain, Zap, Trophy, Users, Star, Activity,
  ChevronDown, Menu, X, Play, Mail, MessageCircle,
  Instagram, Twitter, Linkedin, ArrowRight, Crown,
  Rocket, FlaskConical, Target, Sparkles, Send,
  ExternalLink, GraduationCap, Clock, ChevronLeft, ChevronRight,
  Swords, HelpCircle,
  CheckCircle
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MedQrownBrand } from "@/components/MedQrownBrand";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import medqrownIcon from "@/assets/medqrown-icon.png";
import demoStudents from "@/assets/demo-students.jpg";
import { FEATURES } from "@/lib/feature-flags";
import { FormattedDemoText } from "@/components/formatted-demo-text";
import { RegistrationCta, useRegistrationStatus } from "@/components/RegistrationCta";
import { trackEngagement } from "@/lib/engagement";
import { formatNairobi } from "@/lib/datetime";

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
    title: "Weekly Online Session",
    description: "Mondays, 8:00–10:00 pm. We cover the objectives for the coming week so you're familiar with the content before lectures.",
    badge: "LIVE",
  },
  {
    icon: Activity,
    title: "Weekly Mock CAT",
    description: "Saturdays, 8:00–8:30 pm, on this website, structured like the real exams.",
    badge: "LIVE",
  },
  {
    icon: Brain,
    title: "Weekly Revision Session",
    description: "Saturdays, 8:30–10:30 pm. We go through the tested concepts and areas of difficulty.",
    badge: "LIVE",
  },
  {
    icon: FlaskConical,
    title: "Physical Gross Anatomy Lab",
    description: "Every two weeks, Saturday, 10:00 am–1:00 pm.",
    badge: "IN PERSON",
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
            What's included
          </button>
          <button onClick={() => scrollTo("demo-section")} className="hover:text-primary transition-colors">
            Demo
          </button>
          <button onClick={() => scrollTo("faq-section")} className="hover:text-primary transition-colors">
            FAQ
          </button>
          <button onClick={() => scrollTo("contact")} className="hover:text-primary transition-colors">
            Contact
          </button>
          <Link href="/portal" className="hover:text-primary transition-colors">
            Student Login
          </Link>
        </nav>

        {/* Desktop right actions */}
        <div className="hidden md:flex items-center gap-3">
          <Link href="/portal">
            <Button size="sm" variant="outline" className="font-semibold px-4">Student Login</Button>
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
                  { id: "features", label: "What's included", icon: Sparkles, desc: "What we offer" },
                  { id: "demo-section", label: "Demo", icon: Zap, desc: "A real timed question" },
                  { id: "faq-section", label: "FAQ", icon: HelpCircle, desc: "Frequently asked questions" },
                  { id: "contact", label: "Contact", icon: Mail, desc: "Get in touch" },
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
              <div className="relative z-10 grid grid-cols-1 gap-2">
                <Link
                  href="/portal"
                  onClick={() => setMenuOpen(false)}
                  className="flex flex-col items-center gap-2 rounded-2xl border border-border/60 bg-card px-3 py-4 active:scale-[0.98] transition-transform"
                >
                  <GraduationCap className="w-6 h-6 text-primary" />
                  <span className="font-bold text-foreground text-sm">Student Login</span>
                </Link>
              </div>

              <div className="relative z-10 mt-auto pt-8">
                <RegistrationCta className="w-full rounded-2xl text-base py-6" onNavigate={() => setMenuOpen(false)} />
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
  const { data: contentData } = useQuery<{ settings: Record<string, any> }>({
    queryKey: ["/api/site-content"],
  });
  
  const { registrationOpen } = useRegistrationStatus();
  useEffect(() => { trackEngagement("page_view", "home"); }, []);

  return (
    <section className="min-h-[90vh] bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center pt-16">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center py-16 sm:py-20">
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center mb-8 gap-3"
        >
          <MedQrownBrand size="lg" layout="stacked" iconClassName="h-28 w-28 sm:h-[135px] sm:w-[135px]" />
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-4xl sm:text-5xl md:text-6xl font-black text-foreground leading-tight tracking-tight mb-6"
        >
          MedQrown MedEazy<br />
          <span className="text-primary">Academic Consultancy</span>
        </motion.h1>

        {/* Subheadline */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-lg sm:text-xl text-muted-foreground max-w-3xl mx-auto mb-10 leading-relaxed"
        >
          Consistent academic support throughout the semester: weekly online sessions,
          mock CATs, guided revision, and hands-on anatomy practice.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6"
        >
          <RegistrationCta className="px-8 h-12 text-base" />
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-muted-foreground text-sm mt-4"
        >
          {registrationOpen
            ? (contentData?.settings?.registrationClosesAt
                ? `Registration is open until ${formatNairobi(contentData.settings.registrationClosesAt)}.`
                : "Registration is open for this cohort.")
            : (contentData?.settings?.registrationOpensAt
                ? `Registration opens ${formatNairobi(contentData.settings.registrationOpensAt)}. Join the waitlist and we'll email you.`
                : "Registration is currently closed. Join our waitlist to be notified when spots open.")}
        </motion.p>

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
  const [saqResultData, setSaqResultData] = useState<{ modelAnswer?: string; markingPoints?: string } | null>(null);
  const [timeLeft, setTimeLeft] = useState(60);
  const [timerActive, setTimerActive] = useState(false);
  const [demoSessionId, setDemoSessionId] = useState("");
  const [mcqNudgeDismissed, setMcqNudgeDismissed] = useState(false);

  const { data: demoExams = [] } = useQuery<DemoExamData[]>({
    queryKey: ["/api/demo/exams"],
  });

  // Shared demo links: /demo?subject=Anatomy preselects that subject.
  useEffect(() => {
    if (selectedExamId || !demoExams.length) return;
    const wanted = new URLSearchParams(window.location.search).get("subject")?.trim().toLowerCase();
    const match = wanted && demoExams.find((e) => e.title.toLowerCase() === wanted);
    if (match) setSelectedExamId(match.id);
  }, [demoExams, selectedExamId]);

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
    trackEngagement("demo_start", "demo");
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
        trackEngagement("demo_complete", "demo");
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

  const saqSubmit = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/demo/saq-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examId: selectedExamId,
          questionId: saqQ?.id,
          sessionId: demoSessionId,
          response: saqText,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (data) => {
      setSaqResultData(data);
      setTimerActive(false);
      setPhase("saq_result");
      if (selectedExamId && demoSessionId && saqQ) {
        trackDemoEngagement({
          examId: selectedExamId,
          sessionId: demoSessionId,
          eventType: "saq_submitted",
          questionId: saqQ.id,
          responseLength: saqText.trim().length,
        });
        trackDemoEngagement({ examId: selectedExamId, sessionId: demoSessionId, eventType: "completed" });
        trackEngagement("demo_complete", "demo");
      }
    },
  });

  const handleSaqSubmit = () => {
    if (!saqText.trim()) return;
    saqSubmit.mutate();
  };

  const handleReset = () => {
    setMcqNudgeDismissed(false);
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
                  {!mcqNudgeDismissed && (
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/[0.05] px-4 py-3">
                      <p className="text-xs text-foreground leading-snug">
                        <span className="font-bold">Enjoying this?</span>{" "}
                        <span className="text-muted-foreground">Members take a Mock CAT like this every Saturday.</span>
                      </p>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => setMcqNudgeDismissed(true)}
                          aria-label="Dismiss"
                          className="text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
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
                maxLength={4000}
                disabled={phase === "saq_result"}
                className="w-full bg-background border border-input rounded-xl px-4 py-3 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
              />
              {phase === "saq" && (
                <Button onClick={handleSaqSubmit} disabled={!saqText.trim() || saqSubmit.isPending} className="w-full rounded-xl h-11 font-bold">
                  {saqSubmit.isPending ? "Submitting..." : "Submit Answer"}
                </Button>
              )}
              {phase === "saq_result" && (
                <div className="space-y-4">
                  {/* The answer is shown blurred: members get the full answer, marking and explanations every week. */}
                  <div className="relative overflow-hidden rounded-2xl border border-primary/20">
                    <div aria-hidden="true" className="p-5 bg-primary/[0.03] blur-[5px] select-none pointer-events-none">
                      <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-2">Model Answer</p>
                      <FormattedDemoText text={saqResultData?.modelAnswer || ""} className="text-sm text-foreground mb-4 leading-relaxed whitespace-pre-wrap" />
                      <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-2 border-t border-primary/10 pt-4">Marking Points</p>
                      <FormattedDemoText text={saqResultData?.markingPoints || ""} className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap" />
                    </div>
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/60 backdrop-blur-[1px] px-5 text-center">
                      <Crown className="w-8 h-8 text-primary" />
                      <p className="font-bold text-foreground text-lg leading-tight">Unlock the model answer &amp; marking</p>
                      <p className="text-sm text-muted-foreground max-w-xs">
                        Members see exactly how every answer is marked, get it explained, and take a Mock CAT like this every Saturday.
                      </p>
                      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                        <RegistrationCta size="default" className="rounded-xl" />
                        <Button variant="outline" onClick={handleReset} className="rounded-xl">Try again</Button>
                      </div>
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
            <div className="flex justify-center mb-3">
              <Target className="w-12 h-12 text-primary" />
            </div>
            <h3 className="font-black text-foreground text-xl mb-2">Challenge complete!</h3>
            <p className="text-muted-foreground text-sm mb-6">Sign in to access your official exams and results.</p>
            <div className="flex gap-3 justify-center">
              <Link href="/portal"><Button className="font-bold rounded-xl">Student Sign In</Button></Link>
              <Button variant="outline" onClick={handleReset} className="rounded-xl">Try Again</Button>
            </div>
          </motion.div>
        )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}



function DemoSection() {
  const { data: siteContent } = useQuery<SiteContentData>({ queryKey: ["/api/site-content"] });
  const settings = siteContent?.settings || {};
  const photoUrl: string = settings.demoPhotoUrl || demoStudents;
  const photoHeadline: string = settings.demoPhotoHeadline || "Stay ahead all semester.";
  const photoSubtext: string =
    settings.demoPhotoSubtext ||
    "Weekly sessions before lectures, a Saturday Mock CAT structured like the real exams, and revision on the concepts you found hardest.";

  return (
    <section id="demo-section" className="relative bg-background pt-24 pb-10 overflow-hidden scroll-mt-16">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      <div className="max-w-6xl mx-auto px-4 lg:px-8">
        <div className="text-center mb-10">
          <h2 className="text-3xl sm:text-4xl font-black text-foreground">See for yourself</h2>
        </div>

        <div className="flex justify-center mb-16">
          <div className="w-full">
            <InteractiveDemoCard />
          </div>
        </div>

        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div className="relative aspect-[4/3] rounded-3xl overflow-hidden shadow-2xl bg-muted border border-border/50">
              <img src={photoUrl} alt="Students studying" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              <div className="absolute bottom-6 left-6 right-6 text-left">
                <MedQrownBrand size="sm" className="opacity-90 mb-2 brightness-0 invert" />
              </div>
            </div>
            
            <div className="flex flex-col gap-6 items-start">
              <h3 className="text-3xl md:text-4xl font-black text-foreground leading-tight tracking-tight">
                {photoHeadline}
              </h3>
              <p className="text-muted-foreground text-lg leading-relaxed">
                {photoSubtext}
              </p>
              <RegistrationCta className="rounded-xl px-8" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}


// ─── Features grid ────────────────────────────────────────────────────────────

function FeaturesSection() {
  return (
    <section id="features" className="bg-background pt-10 pb-24 px-4 scroll-mt-16">
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





// ─── Premium block ────────────────────────────────────────────────────────────



// ─── Horizon features ─────────────────────────────────────────────────────────



// ─── Contact section ──────────────────────────────────────────────────────────

// ─── Contact section ──────────────────────────────────────────────────────────

function ContactSection() {
  const [form, setForm] = useState({ name: "", email: "", message: "", website: "" });
  const [submitted, setSubmitted] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      if (!response.ok) throw new Error((await response.json()).message || "Message could not be sent");
    },
    onSuccess: () => setSubmitted(true),
  });

  return (
    <section id="contact" className="bg-background py-24 px-4 scroll-mt-16 border-t border-border">
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
          <motion.div
            initial={{ opacity: 0, x: -15 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="flex flex-col gap-4"
          >
            <a
              href="mailto:norysndachule@gmail.com"
              className="flex items-center gap-4 p-5 rounded-2xl border border-border bg-card hover:border-primary/30 transition-colors"
            >
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Mail className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <span className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-0.5">Email</span>
                <span className="block font-medium text-foreground truncate">norysndachule@gmail.com</span>
              </div>
            </a>
            <a
              href="https://wa.me/254702797977"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 p-5 rounded-2xl border border-border bg-card hover:border-primary/30 transition-colors"
            >
              <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center shrink-0">
                <MessageCircle className="w-5 h-5 text-green-600" />
              </div>
              <div className="min-w-0">
                <span className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-0.5">WhatsApp</span>
                <span className="block font-medium text-foreground truncate">+254 702 797 977</span>
              </div>
            </a>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 15 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            {submitted ? (
              <div className="rounded-2xl border border-primary/20 bg-primary/[0.04] p-8 text-center h-full flex flex-col items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <CheckCircle className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-bold text-lg text-foreground mb-2">Message Received</h3>
                <p className="text-muted-foreground text-sm">Thanks for reaching out! We'll get back to you shortly.</p>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  mutation.mutate();
                }}
                className="rounded-2xl border border-border bg-card p-6"
              >
                <h3 className="font-bold text-foreground mb-4">Send us a message</h3>
                <div className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Name</Label>
                      <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Email</Label>
                      <Input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Message</Label>
                    <Textarea required rows={4} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
                  </div>
                  <input
                    type="text"
                    name="website"
                    value={form.website}
                    onChange={(e) => setForm({ ...form, website: e.target.value })}
                    tabIndex={-1}
                    autoComplete="off"
                    aria-hidden="true"
                    className="absolute -left-[9999px] top-auto w-px h-px opacity-0"
                  />
                  <Button type="submit" disabled={mutation.isPending} className="w-full font-bold">
                    {mutation.isPending ? "Sending..." : "Send Message"}
                  </Button>
                  {mutation.isError && <p role="alert" className="text-sm text-destructive">{mutation.error instanceof Error ? mutation.error.message : "Message could not be sent"}</p>}
                </div>
              </form>
            )}
          </motion.div>
        </div>
      </div>
    </section>
  );
}


// ─── Final CTA band ───────────────────────────────────────────────────────────



// ─── Footer ───────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="bg-card border-t border-border py-14 px-4">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-2">
          <MedQrownBrand size="sm" />
        </div>
        <div className="flex items-center gap-6">
          <Link href="/terms" className="text-sm font-medium text-muted-foreground hover:text-foreground">Terms</Link>
          <Link href="/privacy" className="text-sm font-medium text-muted-foreground hover:text-foreground">Privacy</Link>
          <Link href="/faq" className="text-sm font-medium text-muted-foreground hover:text-foreground">FAQ</Link>
        </div>
      </div>
      <div className="max-w-6xl mx-auto mt-8 pt-8 border-t border-border/40 text-center md:text-left flex flex-col md:flex-row justify-between text-xs text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} MedQrown MedEazy. All rights reserved.</p>
        <p>Built for medical students.</p>
      </div>
    </footer>
  );
}


// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  // Shareable link straight to the demo: /demo, /demo?subject=Anatomy&src=whatsapp or /#demo.
  useEffect(() => {
    if (window.location.pathname !== "/demo" && window.location.hash !== "#demo") return;
    const timer = setTimeout(() => document.getElementById("demo-section")?.scrollIntoView({ behavior: "smooth", block: "start" }), 400);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen">
      <Navbar />
      <AnnouncementBanner />
      <HeroSection />
      <FeaturesSection />
      <DemoSection />
      
      
      
      <FaqSection />
      <ContactSection />
      
      <Footer />
    </div>
  );
}
