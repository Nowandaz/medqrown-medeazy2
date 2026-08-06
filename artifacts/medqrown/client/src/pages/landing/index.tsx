import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain, Zap, Trophy, Users, Star, Activity,
  ChevronDown, Menu, X, Play, Mail, MessageCircle,
  Instagram, Twitter, Linkedin, ArrowRight, Crown,
  Rocket, FlaskConical, Target, Sparkles, Send,
  ExternalLink, GraduationCap, Clock,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import medqrownIcon from "@/assets/medqrown-icon.png";
import logoPath from "@assets/medqrown_logo.png";

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
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    setMenuOpen(false);
  };

  return (
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
          <img src={medqrownIcon} alt="MedQrown" className="h-9 w-9 object-contain" />
          <span className="font-bold text-foreground text-lg leading-none">
            MedQrown <span className="text-primary">MedEazy</span>
          </span>
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
            <Button size="sm" className="font-semibold px-5">Start Free</Button>
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

      {/* Mobile menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-background border-t border-border"
          >
            <div className="px-4 py-4 flex flex-col gap-2">
              <button onClick={() => scrollTo("features")} className="text-left text-foreground hover:text-primary py-2 text-sm font-medium">Features</button>
              <button onClick={() => scrollTo("study-hub")} className="text-left text-foreground hover:text-primary py-2 text-sm font-medium">Study Hub</button>
              <button onClick={() => scrollTo("leaderboards")} className="text-left text-foreground hover:text-primary py-2 text-sm font-medium">Leaderboards</button>
              <hr className="border-border my-1" />
              <Link href="/portal" onClick={() => setMenuOpen(false)} className="text-foreground hover:text-primary py-2 text-sm font-medium">Student Portal</Link>
              <Link href="/admin" onClick={() => setMenuOpen(false)} className="text-foreground hover:text-primary py-2 text-sm font-medium">Admin / Institution Login</Link>
              <Link href="/student/signup" onClick={() => setMenuOpen(false)}>
                <Button className="w-full mt-1">Start Free</Button>
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
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
          <img src={medqrownIcon} alt="MedQrown" className="h-28 w-28 object-contain" />
          <div className="text-center">
            <p className="text-2xl font-black text-foreground tracking-tight">
              MedQrown <span className="text-primary">MedEazy</span>
            </p>
          </div>
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
              Start Practicing for Free <ArrowRight className="w-5 h-5" />
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

function DemoSection() {
  const [hovered, setHovered] = useState(false);

  return (
    <section className="bg-muted/30 py-24 px-4">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-10"
        >
          <p className="text-primary text-xs font-semibold uppercase tracking-widest mb-2">See It In Action</p>
          <h2 className="text-3xl sm:text-4xl font-black text-foreground">
            Watch how we turn a basic textbook fact into a high-yield clinical standoff.
          </h2>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="relative rounded-2xl overflow-hidden border border-border shadow-lg aspect-video bg-muted cursor-pointer group"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <motion.div
              animate={{ scale: hovered ? 1.08 : 1 }}
              transition={{ duration: 0.2 }}
              className="w-20 h-20 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center"
            >
              <Play className="w-8 h-8 text-primary ml-1 fill-primary" />
            </motion.div>
            <p className="mt-4 text-muted-foreground text-sm font-medium">Demo video coming soon</p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ─── Features grid ────────────────────────────────────────────────────────────

function FeaturesSection() {
  return (
    <section id="features" className="bg-background py-24 px-4">
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
    <section id="leaderboards" className="bg-muted/30 py-24 px-4">
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
    <section id="study-hub" className="bg-muted/30 py-24 px-4">
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
    <section id="contact" className="bg-background py-24 px-4">
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
            Start Practicing for Free <ArrowRight className="w-5 h-5" />
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
              <img src={medqrownIcon} alt="MedQrown" className="h-8 w-8 object-contain" />
              <span className="font-black text-foreground text-base">
                MedQrown <span className="text-primary">MedEazy</span>
              </span>
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
              {["Terms of Service", "Privacy Policy", "FAQ"].map((item) => (
                <span key={item} className="text-muted-foreground/50 text-sm cursor-not-allowed">{item}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-muted-foreground text-xs">
            © {new Date().getFullYear()} MedQrown MedEazy. All rights reserved.
          </p>
          <Link
            href="/admin"
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
