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
import { RegistrationCountdown, RegistrationCta, useRegistrationStatus } from "@/components/RegistrationCta";
import { Eyebrow, FactRow } from "@/components/eyebrow";
import { trackEngagement } from "@/lib/engagement";
import { formatNairobi } from "@/lib/datetime";

type SiteContentData = { settings: Record<string, any>; faq: { id: number; question: string; answer: string }[] };

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
                  { id: "demo-section", label: "Free challenge", icon: Zap, desc: "3 timed Anatomy questions" },
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
    <section className="min-h-[90vh] bg-background flex items-center justify-center pt-16">
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

type DemoInfo = { available: boolean; questionCount: number; durationMinutes: number; subject: string; nextCohortStart: string | null };

/** Big promo panel: the demo itself lives on its own page at /demo (the link on the posters). */
function DemoSection() {
  const { data: siteContent } = useQuery<SiteContentData>({ queryKey: ["/api/site-content"] });
  const { data: demo } = useQuery<DemoInfo>({ queryKey: ["/api/demo/info"] });
  const settings = siteContent?.settings || {};
  const photoUrl: string = settings.demoPhotoUrl || demoStudents;
  const photoHeadline: string = settings.demoPhotoHeadline || "Stay ahead all semester.";
  const photoSubtext: string =
    settings.demoPhotoSubtext ||
    "Weekly sessions before lectures, a Saturday Mock CAT structured like the real exams, and revision on the concepts you found hardest.";
  const subject = demo?.subject ?? "Anatomy";
  const count = demo?.questionCount || 3;
  const minutes = demo?.durationMinutes || 5;

  return (
    <section id="demo-section" className="relative bg-background pt-24 pb-10 overflow-hidden scroll-mt-16">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      <div className="max-w-6xl mx-auto px-4 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-2xl bg-[#0e3b37] p-6 sm:p-12 text-white mb-16"
        >
          <div className="grid gap-10 lg:grid-cols-[1.15fr_1fr] items-center">
            <div>
              <Eyebrow className="text-teal-300">Free {subject} challenge</Eyebrow>
              <h2 className="mt-5 text-4xl sm:text-5xl lg:text-6xl font-black leading-[1.05] tracking-tight">
                Feeling confident?<br /><span className="text-teal-300">Put it to the test.</span>
              </h2>
              <p className="mt-4 text-lg text-white/80 max-w-lg">
                Real {subject} questions from our CATs, on the clock, marked the moment you finish.
              </p>
              <FactRow className="mt-8 max-w-md" facts={[
                { value: String(count), label: "questions" },
                { value: `${minutes} min`, label: "on the clock" },
                { value: "KSh 0", label: "no sign-up" },
              ]} />
              <div className="mt-8">
                <Link href="/demo">
                  <Button size="lg" className="h-12 w-full sm:w-auto rounded-lg bg-white px-7 text-base font-bold text-[#0e3b37] hover:bg-teal-50 gap-2">
                    Take the free challenge <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              </div>
              <RegistrationCountdown nextCohortStart={demo?.nextCohortStart} className="mt-5 text-white/75" />
            </div>

            {/* A static preview of what the challenge looks like. */}
            <div aria-hidden="true" className="rounded-xl bg-white text-slate-900 p-5 hidden sm:block rotate-[1.5deg]">
              <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Question 1 of {count}</span>
                <span className="flex items-center gap-1 font-mono text-sm font-bold text-teal-700">
                  <Clock className="w-3.5 h-3.5" /> {String(minutes).padStart(2, "0")}:00
                </span>
              </div>
              <p className="font-semibold leading-snug mb-4">Which nerve supplies the muscles of the anterior compartment of the arm?</p>
              {["Radial nerve", "Musculocutaneous nerve", "Median nerve", "Ulnar nerve"].map((o, i) => (
                <div key={o} className={`mb-2 flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm ${i === 1 ? "border-teal-600 bg-teal-50" : "border-slate-200"}`}>
                  <span className={`flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold ${i === 1 ? "bg-teal-700 text-white" : "bg-slate-100"}`}>{String.fromCharCode(65 + i)}</span>
                  {o}
                </div>
              ))}
              <div className="mt-4 h-10 rounded-lg bg-teal-700 text-white text-sm font-bold flex items-center justify-center gap-1">Next question <ArrowRight className="w-4 h-4" /></div>
            </div>
          </div>
        </motion.div>

        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-muted border border-border/50">
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
          <Eyebrow className="text-primary justify-center mb-3">What we offer</Eyebrow>
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
                      <span className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider ${
                          isLive ? "text-primary" : "text-amber-700 dark:text-amber-400"}`}>
                        <span aria-hidden="true" className="h-1.5 w-1.5 bg-current" />
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
  // /#demo scrolls to the demo promo; /demo itself is the challenge page.
  useEffect(() => {
    if (window.location.hash !== "#demo") return;
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
