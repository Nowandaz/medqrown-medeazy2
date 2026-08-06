import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain, Zap, Trophy, Users, Star, Activity,
  ChevronDown, Menu, X, Play, Mail, MessageCircle,
  Instagram, Twitter, Linkedin, ArrowRight, Crown,
  Rocket, FlaskConical, Target, Sparkles, Clock,
  Send, ExternalLink,
} from "lucide-react";
import medqrownIcon from "@/assets/medqrown-icon.png";

// ─── Data ────────────────────────────────────────────────────────────────────

const features = [
  {
    icon: Brain,
    title: "AI Clinical Scenarios",
    description:
      "Never just memorize a muscle again. Our AI frames basic sciences within high-yield patient presentations to build your clinical instincts from day one.",
    badge: "LIVE",
  },
  {
    icon: Zap,
    title: "Standoffs — Rapid Fire",
    description:
      "Go head-to-head. Challenge a friend to a 1v1 or 2v2 clinical duel with a 60-second clock. Think tactical chess, but for clinical reasoning.",
    badge: "COMING SOON",
  },
  {
    icon: Trophy,
    title: "Competitive Elo Ratings",
    description:
      "Track your clinical reasoning over time. Watch your rating climb as you master complex mechanisms, conquer your cohort, and dominate the global leaderboard.",
    badge: "COMING SOON",
  },
  {
    icon: Users,
    title: "Peer-Hosted Lobbies",
    description:
      "Create private exam rooms, set your own time limits, and test your knowledge against your specific study group — no admin required.",
    badge: "COMING SOON",
  },
  {
    icon: Star,
    title: "The XP Grind",
    description:
      "Win Standoffs and dominate lobbies to earn Clinical XP. Unlock advanced specialty cases, extra AI exam generations, and exclusive dashboard themes.",
    badge: "COMING SOON",
  },
  {
    icon: Activity,
    title: "Instant Results & AI Feedback",
    description:
      "Don't just see your score. Get per-question AI explanations telling you exactly why your answer was right or wrong, in clinical language.",
    badge: "LIVE",
  },
];

const premiumPerks = [
  {
    icon: Rocket,
    title: "Unlimited AI Exams",
    description: "Remove the monthly cap. Generate as many custom, targeted practice exams as you need to survive finals.",
  },
  {
    icon: Target,
    title: "Deep Tactical Analysis",
    description: "Get a post-game breakdown of exactly which mechanisms you misdiagnosed and why — not just a final score.",
  },
  {
    icon: Users,
    title: "Massive Lobbies",
    description: "Host cohort-wide exams without player caps. Stress-test your whole class at once.",
  },
  {
    icon: Star,
    title: "XP Store Access",
    description: "Instantly purchase Clinical XP to unlock premium scenario packs, AI utility, or exclusive visual customizations.",
  },
];

const horizonFeatures = [
  {
    icon: FlaskConical,
    title: "Viva / Oral Assessment Simulator",
    description:
      "High-yield, multi-step clinical scenarios fired at you dynamically — prep for the pressure of oral exams without the white coat sweat.",
  },
  {
    icon: Sparkles,
    title: "WARD-E: Your AI Companion",
    description:
      "Your personalized, floating dashboard companion that actively guides you through difficult concepts and drives autonomous study sessions.",
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
          ? "bg-[#0a1a12]/95 backdrop-blur-md border-b border-[#1a3a22]/60 shadow-lg"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Logo */}
        <a href="/" className="flex items-center gap-2 shrink-0">
          <img src={medqrownIcon} alt="MedQrown" className="h-9 w-9 object-contain" />
          <span className="font-bold text-white text-lg leading-none">
            MedQrown <span className="text-[#4ade9a]">MedEazy</span>
          </span>
        </a>

        {/* Desktop center nav */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-white/70">
          <button onClick={() => scrollTo("features")} className="hover:text-[#4ade9a] transition-colors">
            Features
          </button>
          <button onClick={() => scrollTo("study-hub")} className="hover:text-[#4ade9a] transition-colors">
            Study Hub
          </button>
          <button onClick={() => scrollTo("leaderboards")} className="hover:text-[#4ade9a] transition-colors">
            Leaderboards
          </button>
        </nav>

        {/* Desktop right actions */}
        <div className="hidden md:flex items-center gap-3">
          {/* Portal dropdown */}
          <div className="relative" ref={portalRef}>
            <button
              onClick={() => setPortalOpen((v) => !v)}
              className="flex items-center gap-1.5 text-sm font-medium text-white/80 hover:text-white border border-white/20 hover:border-white/40 rounded-lg px-4 py-2 transition-all"
            >
              Portal <ChevronDown className={`w-3.5 h-3.5 transition-transform ${portalOpen ? "rotate-180" : ""}`} />
            </button>
            <AnimatePresence>
              {portalOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.96 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 mt-2 w-52 bg-[#0d2218] border border-[#1f4a2e] rounded-xl shadow-2xl overflow-hidden"
                >
                  <Link
                    href="/portal"
                    className="flex items-center gap-2 px-4 py-3 text-sm text-white/80 hover:text-white hover:bg-[#1a3a2a] transition-colors"
                    onClick={() => setPortalOpen(false)}
                  >
                    <Users className="w-4 h-4 text-[#4ade9a]" /> Student Portal
                  </Link>
                  <Link
                    href="/admin"
                    className="flex items-center gap-2 px-4 py-3 text-sm text-white/80 hover:text-white hover:bg-[#1a3a2a] transition-colors border-t border-[#1f4a2e]"
                    onClick={() => setPortalOpen(false)}
                  >
                    <Crown className="w-4 h-4 text-[#4ade9a]" /> Admin · Institution Login
                  </Link>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <Link
            href="/portal"
            className="bg-[#22c55e] hover:bg-[#16a34a] text-black font-bold text-sm px-5 py-2 rounded-lg transition-colors shadow-lg shadow-green-900/40"
          >
            Start Free
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden text-white/80 hover:text-white p-1"
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
            className="md:hidden bg-[#0a1a12]/98 border-t border-[#1a3a22]/60"
          >
            <div className="px-4 py-4 flex flex-col gap-3">
              <button onClick={() => scrollTo("features")} className="text-left text-white/80 hover:text-[#4ade9a] py-2 text-sm font-medium">Features</button>
              <button onClick={() => scrollTo("study-hub")} className="text-left text-white/80 hover:text-[#4ade9a] py-2 text-sm font-medium">Study Hub</button>
              <button onClick={() => scrollTo("leaderboards")} className="text-left text-white/80 hover:text-[#4ade9a] py-2 text-sm font-medium">Leaderboards</button>
              <hr className="border-[#1f4a2e]" />
              <Link href="/portal" onClick={() => setMenuOpen(false)} className="text-white/80 hover:text-white py-2 text-sm font-medium">Student Portal</Link>
              <Link href="/admin" onClick={() => setMenuOpen(false)} className="text-white/80 hover:text-white py-2 text-sm font-medium">Admin / Institution Login</Link>
              <Link href="/portal" onClick={() => setMenuOpen(false)} className="bg-[#22c55e] hover:bg-[#16a34a] text-black font-bold text-sm px-5 py-3 rounded-lg text-center transition-colors mt-1">Start Free</Link>
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
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#060f0a]">
      {/* Animated gradient background */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0a1f12] via-[#060f0a] to-[#080f14]" />
        {/* Green glow blobs */}
        <div
          className="absolute top-1/4 left-1/3 w-[500px] h-[500px] rounded-full opacity-20"
          style={{ background: "radial-gradient(circle, #22c55e 0%, transparent 70%)", filter: "blur(80px)" }}
        />
        <div
          className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #16a34a 0%, transparent 70%)", filter: "blur(60px)" }}
        />
        {/* Grid pattern overlay */}
        <div
          className="absolute inset-0 opacity-5"
          style={{
            backgroundImage:
              "linear-gradient(#22c55e 1px, transparent 1px), linear-gradient(90deg, #22c55e 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 text-center pt-20 pb-16">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 bg-[#22c55e]/10 border border-[#22c55e]/30 rounded-full px-4 py-1.5 text-[#4ade9a] text-xs font-semibold uppercase tracking-widest mb-6"
        >
          <span className="w-1.5 h-1.5 bg-[#22c55e] rounded-full animate-pulse" />
          The Competitive Clinical Training Ground
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-5xl sm:text-6xl md:text-7xl font-black text-white leading-tight tracking-tight mb-6"
        >
          Master Medical{" "}
          <span
            className="text-transparent bg-clip-text"
            style={{ backgroundImage: "linear-gradient(135deg, #4ade9a 0%, #22c55e 50%, #16a34a 100%)" }}
          >
            School.
          </span>
          <br />
          Together.
        </motion.h1>

        {/* Subheadline */}
        <motion.p
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-lg sm:text-xl text-white/60 max-w-3xl mx-auto mb-10 leading-relaxed"
        >
          Generate targeted AI practice exams, conquer real-world clinical scenarios, challenge your friends in rapid-fire duels, and see how your clinical reasoning ranks — guided by your AI study companion,{" "}
          <span className="text-[#4ade9a] font-semibold">WARD-E</span>.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6"
        >
          <Link
            href="/portal"
            className="flex items-center gap-2 bg-[#22c55e] hover:bg-[#16a34a] text-black font-bold text-base px-8 py-4 rounded-xl transition-all shadow-xl shadow-green-900/50 hover:shadow-green-900/70 hover:scale-105"
          >
            Start Practicing for Free <ArrowRight className="w-5 h-5" />
          </Link>
          <div className="relative">
            <button
              className="flex items-center gap-2 text-white/60 font-semibold text-base px-8 py-4 rounded-xl border border-white/10 cursor-not-allowed opacity-60"
              disabled
            >
              Host a Group Exam
            </button>
            <span className="absolute -top-2.5 -right-2 bg-amber-500 text-black text-[10px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider">
              Soon
            </span>
          </div>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-white/35 text-sm"
        >
          Sign up or log in to take exams, host lobbies, and climb the leaderboard.
        </motion.p>

        {/* Stats row */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="mt-16 grid grid-cols-3 gap-6 max-w-lg mx-auto border-t border-white/10 pt-10"
        >
          {[
            { value: "AI-Powered", label: "Clinical Marking" },
            { value: "Real-Time", label: "Leaderboards" },
            { value: "Free", label: "To Start" },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-xl font-black text-[#4ade9a]">{stat.value}</div>
              <div className="text-xs text-white/40 mt-0.5">{stat.label}</div>
            </div>
          ))}
        </motion.div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        animate={{ y: [0, 8, 0] }}
        transition={{ repeat: Infinity, duration: 2 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/30"
      >
        <ChevronDown className="w-6 h-6" />
      </motion.div>
    </section>
  );
}

// ─── Hook block ───────────────────────────────────────────────────────────────

function HookSection() {
  return (
    <section className="bg-[#0a1a12] py-20 px-4">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.7 }}
        className="max-w-4xl mx-auto text-center"
      >
        <div className="w-12 h-0.5 bg-[#22c55e] mx-auto mb-8" />
        <p className="text-2xl sm:text-3xl md:text-4xl font-bold text-white leading-snug">
          Stop cramming in the dark.{" "}
          <span className="text-[#4ade9a]">
            Turn basic anatomy and biochemistry into real-world clinical patient presentations
          </span>{" "}
          from day one. Active recall meets competitive learning.
        </p>
        <div className="w-12 h-0.5 bg-[#22c55e] mx-auto mt-8" />
      </motion.div>
    </section>
  );
}

// ─── Demo section ─────────────────────────────────────────────────────────────

function DemoSection() {
  const [hovered, setHovered] = useState(false);

  return (
    <section className="bg-[#060f0a] py-24 px-4">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-10"
        >
          <span className="text-[#4ade9a] text-xs font-semibold uppercase tracking-widest">See It In Action</span>
          <h2 className="text-3xl sm:text-4xl font-black text-white mt-3">
            Watch how we turn a basic textbook fact into a high-yield clinical standoff.
          </h2>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="relative rounded-2xl overflow-hidden border border-[#1f4a2e]/60 shadow-2xl shadow-black/60 aspect-video bg-[#0d2218] cursor-pointer group"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          {/* Placeholder thumbnail */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="absolute inset-0 bg-gradient-to-br from-[#0a2a18] via-[#0d2218] to-[#060f0a]" />
            {/* Grid overlay */}
            <div
              className="absolute inset-0 opacity-10"
              style={{
                backgroundImage:
                  "linear-gradient(#22c55e 1px, transparent 1px), linear-gradient(90deg, #22c55e 1px, transparent 1px)",
                backgroundSize: "40px 40px",
              }}
            />
            <motion.div
              animate={{ scale: hovered ? 1.1 : 1 }}
              transition={{ duration: 0.2 }}
              className="relative z-10 w-20 h-20 rounded-full bg-[#22c55e]/20 border-2 border-[#22c55e]/40 flex items-center justify-center backdrop-blur-sm"
            >
              <Play className="w-8 h-8 text-[#4ade9a] ml-1 fill-[#4ade9a]" />
            </motion.div>
            <p className="relative z-10 mt-5 text-white/40 text-sm font-medium">Demo video coming soon</p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ─── Features grid ────────────────────────────────────────────────────────────

function FeaturesSection() {
  return (
    <section id="features" className="bg-[#080f0a] py-24 px-4">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-14"
        >
          <span className="text-[#4ade9a] text-xs font-semibold uppercase tracking-widest">The Arsenal</span>
          <h2 className="text-3xl sm:text-4xl font-black text-white mt-3">Built for competitive clinical thinkers.</h2>
          <p className="text-white/50 mt-3 max-w-xl mx-auto">
            Six tools engineered to transform passive revision into active, competitive mastery.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((feat, i) => {
            const Icon = feat.icon;
            const isLive = feat.badge === "LIVE";
            return (
              <motion.div
                key={feat.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="relative bg-[#0d2218]/60 border border-[#1f4a2e]/50 rounded-2xl p-6 hover:border-[#22c55e]/40 hover:bg-[#0d2218]/80 transition-all group"
              >
                {/* Badge */}
                <span
                  className={`absolute top-4 right-4 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                    isLive
                      ? "bg-[#22c55e]/15 text-[#4ade9a] border border-[#22c55e]/30"
                      : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                  }`}
                >
                  {feat.badge}
                </span>

                <div className="w-11 h-11 rounded-xl bg-[#22c55e]/10 border border-[#22c55e]/20 flex items-center justify-center mb-4 group-hover:bg-[#22c55e]/15 transition-colors">
                  <Icon className="w-5 h-5 text-[#4ade9a]" />
                </div>
                <h3 className="text-white font-bold text-base mb-2">{feat.title}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{feat.description}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── Fake leaderboard teaser ──────────────────────────────────────────────────

const fakeLeaders = [
  { rank: 1, name: "Amara K.", specialty: "Internal Medicine", xp: "2,340 XP", elo: "1,842" },
  { rank: 2, name: "David O.", specialty: "Surgery", xp: "2,190 XP", elo: "1,811" },
  { rank: 3, name: "Fatima H.", specialty: "Paediatrics", xp: "1,975 XP", elo: "1,793" },
  { rank: 4, name: "Yusuf A.", specialty: "Obstetrics", xp: "1,860 XP", elo: "1,765" },
  { rank: 5, name: "Sofia R.", specialty: "Pharmacology", xp: "1,720 XP", elo: "1,748" },
];

function LeaderboardTeaser() {
  return (
    <section id="leaderboards" className="bg-[#060f0a] py-24 px-4">
      <div className="max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-10"
        >
          <span className="text-[#4ade9a] text-xs font-semibold uppercase tracking-widest">Leaderboards</span>
          <h2 className="text-3xl sm:text-4xl font-black text-white mt-3">Where do you rank globally?</h2>
          <p className="text-white/50 mt-3">
            Compete with medical students worldwide. Your Elo rating updates in real time after every Standoff.
          </p>
          <span className="inline-block mt-3 bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full">
            Coming Soon — Sample Data
          </span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="bg-[#0d2218]/60 border border-[#1f4a2e]/50 rounded-2xl overflow-hidden"
        >
          <div className="px-5 py-3 border-b border-[#1f4a2e]/50 flex items-center justify-between">
            <span className="text-white/70 text-xs font-semibold uppercase tracking-widest">Global Elo Rankings</span>
            <Trophy className="w-4 h-4 text-[#4ade9a]" />
          </div>
          {fakeLeaders.map((leader, i) => (
            <div
              key={leader.rank}
              className={`flex items-center gap-4 px-5 py-3.5 border-b border-[#1f4a2e]/30 last:border-0 ${
                i === 0 ? "bg-[#22c55e]/5" : ""
              }`}
            >
              <span
                className={`text-sm font-black w-5 text-center ${
                  i === 0 ? "text-yellow-400" : i === 1 ? "text-gray-400" : i === 2 ? "text-amber-600" : "text-white/30"
                }`}
              >
                #{leader.rank}
              </span>
              <div className="w-8 h-8 rounded-full bg-[#22c55e]/15 border border-[#22c55e]/20 flex items-center justify-center text-[#4ade9a] text-xs font-bold">
                {leader.name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-semibold">{leader.name}</p>
                <p className="text-white/40 text-xs truncate">{leader.specialty}</p>
              </div>
              <div className="text-right hidden sm:block">
                <p className="text-[#4ade9a] text-xs font-bold">{leader.xp}</p>
                <p className="text-white/40 text-xs">Elo {leader.elo}</p>
              </div>
            </div>
          ))}
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
    <section className="bg-[#080f0a] py-24 px-4">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-14"
        >
          <span className="text-[#4ade9a] text-xs font-semibold uppercase tracking-widest">Premium</span>
          <h2 className="text-3xl sm:text-4xl font-black text-white mt-3">Take Your Prep to the Next Level.</h2>
          <p className="text-white/50 mt-3 max-w-xl mx-auto">
            Free gets you started. Premium removes every limit.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 gap-5 mb-12">
          {premiumPerks.map((perk, i) => {
            const Icon = perk.icon;
            return (
              <motion.div
                key={perk.title}
                initial={{ opacity: 0, x: i % 2 === 0 ? -20 : 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="flex gap-4 bg-[#0d2218]/40 border border-[#1f4a2e]/40 rounded-2xl p-5"
              >
                <div className="w-10 h-10 rounded-xl bg-[#22c55e]/10 border border-[#22c55e]/20 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-[#4ade9a]" />
                </div>
                <div>
                  <h3 className="text-white font-bold text-sm mb-1">{perk.title}</h3>
                  <p className="text-white/50 text-sm leading-relaxed">{perk.description}</p>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Notify me block */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="bg-gradient-to-br from-[#0d2218] to-[#0a1a12] border border-[#22c55e]/20 rounded-2xl p-8 text-center max-w-lg mx-auto"
        >
          <Crown className="w-8 h-8 text-[#4ade9a] mx-auto mb-3" />
          <h3 className="text-white font-black text-lg mb-1">Premium is almost here.</h3>
          <p className="text-white/50 text-sm mb-6">Be the first to know when it launches.</p>
          {submitted ? (
            <p className="text-[#4ade9a] font-semibold text-sm">✓ You're on the list — we'll notify you!</p>
          ) : (
            <form onSubmit={handleNotify} className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="flex-1 bg-[#060f0a] border border-[#1f4a2e]/60 rounded-lg px-4 py-2.5 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-[#22c55e]/60"
                required
              />
              <button
                type="submit"
                className="bg-[#22c55e] hover:bg-[#16a34a] text-black font-bold text-sm px-5 py-2.5 rounded-lg transition-colors whitespace-nowrap"
              >
                Notify Me
              </button>
            </form>
          )}
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
    <section id="study-hub" className="bg-[#060f0a] py-24 px-4">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-14"
        >
          <span className="inline-flex items-center gap-1.5 bg-purple-500/10 border border-purple-500/30 text-purple-400 text-xs font-semibold uppercase tracking-widest px-3 py-1 rounded-full mb-4">
            <Rocket className="w-3 h-3" /> On the Horizon
          </span>
          <h2 className="text-3xl sm:text-4xl font-black text-white mt-3">The platform is just getting started.</h2>
          <p className="text-white/50 mt-3 max-w-xl mx-auto">
            Two next-level features in development. Join the waitlist to get early access.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 gap-6 mb-12">
          {horizonFeatures.map((feat, i) => {
            const Icon = feat.icon;
            return (
              <motion.div
                key={feat.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
                className="relative bg-gradient-to-br from-[#100a2a]/80 to-[#0d2218]/60 border border-purple-500/20 rounded-2xl p-7"
              >
                <span className="absolute top-4 right-4 bg-purple-500/15 border border-purple-500/30 text-purple-400 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full">
                  In Development
                </span>
                <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-4">
                  <Icon className="w-6 h-6 text-purple-400" />
                </div>
                <h3 className="text-white font-black text-lg mb-2">{feat.title}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{feat.description}</p>
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
            <p className="text-[#4ade9a] font-semibold">✓ You're on the waitlist — first in line!</p>
          ) : (
            <form onSubmit={handleWaitlist} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
              <input
                type="email"
                value={waitlistEmail}
                onChange={(e) => setWaitlistEmail(e.target.value)}
                placeholder="Join the waitlist — your@email.com"
                className="flex-1 bg-[#0d2218]/60 border border-[#1f4a2e]/60 rounded-xl px-5 py-3 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-[#22c55e]/60"
                required
              />
              <button
                type="submit"
                className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm px-6 py-3 rounded-xl transition-colors whitespace-nowrap"
              >
                Join Waitlist
              </button>
            </form>
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
    <section id="contact" className="bg-[#080f0a] py-24 px-4">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-14"
        >
          <span className="text-[#4ade9a] text-xs font-semibold uppercase tracking-widest">Get in Touch</span>
          <h2 className="text-3xl sm:text-4xl font-black text-white mt-3">We'd love to hear from you.</h2>
          <p className="text-white/50 mt-3 max-w-md mx-auto">
            Questions, feedback, or just want to say hello — reach us directly.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-10">
          {/* Direct contact */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="flex flex-col gap-5"
          >
            <a
              href="mailto:norysndachule@gmail.com"
              className="flex items-center gap-4 bg-[#0d2218]/60 border border-[#1f4a2e]/50 rounded-2xl p-5 hover:border-[#22c55e]/40 transition-colors group"
            >
              <div className="w-11 h-11 rounded-xl bg-[#22c55e]/10 border border-[#22c55e]/20 flex items-center justify-center shrink-0">
                <Mail className="w-5 h-5 text-[#4ade9a]" />
              </div>
              <div>
                <p className="text-white/50 text-xs mb-0.5">Email us</p>
                <p className="text-white font-semibold text-sm group-hover:text-[#4ade9a] transition-colors">
                  norysndachule@gmail.com
                </p>
              </div>
              <ExternalLink className="w-4 h-4 text-white/30 group-hover:text-[#4ade9a] ml-auto transition-colors" />
            </a>

            <a
              href="https://wa.me/254702797977"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 bg-[#0d2218]/60 border border-[#1f4a2e]/50 rounded-2xl p-5 hover:border-[#22c55e]/40 transition-colors group"
            >
              <div className="w-11 h-11 rounded-xl bg-[#22c55e]/10 border border-[#22c55e]/20 flex items-center justify-center shrink-0">
                <MessageCircle className="w-5 h-5 text-[#4ade9a]" />
              </div>
              <div>
                <p className="text-white/50 text-xs mb-0.5">WhatsApp</p>
                <p className="text-white font-semibold text-sm group-hover:text-[#4ade9a] transition-colors">
                  +254 702 797 977
                </p>
              </div>
              <ExternalLink className="w-4 h-4 text-white/30 group-hover:text-[#4ade9a] ml-auto transition-colors" />
            </a>

            {/* Social placeholders */}
            <div className="bg-[#0d2218]/40 border border-[#1f4a2e]/30 rounded-2xl p-5">
              <p className="text-white/50 text-xs mb-3 uppercase tracking-wider font-semibold">Follow Us</p>
              <div className="flex gap-3">
                {[
                  { Icon: Instagram, label: "Instagram" },
                  { Icon: Twitter, label: "X / Twitter" },
                  { Icon: Linkedin, label: "LinkedIn" },
                ].map(({ Icon, label }) => (
                  <button
                    key={label}
                    title={`${label} — coming soon`}
                    className="w-10 h-10 rounded-xl bg-[#0a1a12] border border-[#1f4a2e]/50 flex items-center justify-center text-white/30 cursor-not-allowed"
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                ))}
              </div>
              <p className="text-white/25 text-xs mt-2">Social handles coming soon.</p>
            </div>
          </motion.div>

          {/* Contact form */}
          <motion.form
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            onSubmit={handleSubmit}
            className="bg-[#0d2218]/60 border border-[#1f4a2e]/50 rounded-2xl p-6 flex flex-col gap-4"
          >
            <div>
              <label className="text-white/50 text-xs font-semibold uppercase tracking-wider block mb-1.5">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Your name"
                className="w-full bg-[#060f0a] border border-[#1f4a2e]/60 rounded-lg px-4 py-2.5 text-white text-sm placeholder:text-white/25 focus:outline-none focus:border-[#22c55e]/60"
                required
              />
            </div>
            <div>
              <label className="text-white/50 text-xs font-semibold uppercase tracking-wider block mb-1.5">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="your@email.com"
                className="w-full bg-[#060f0a] border border-[#1f4a2e]/60 rounded-lg px-4 py-2.5 text-white text-sm placeholder:text-white/25 focus:outline-none focus:border-[#22c55e]/60"
                required
              />
            </div>
            <div className="flex-1">
              <label className="text-white/50 text-xs font-semibold uppercase tracking-wider block mb-1.5">Message</label>
              <textarea
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                placeholder="Tell us what's on your mind…"
                rows={5}
                className="w-full bg-[#060f0a] border border-[#1f4a2e]/60 rounded-lg px-4 py-2.5 text-white text-sm placeholder:text-white/25 focus:outline-none focus:border-[#22c55e]/60 resize-none"
                required
              />
            </div>
            <button
              type="submit"
              className="flex items-center justify-center gap-2 bg-[#22c55e] hover:bg-[#16a34a] text-black font-bold text-sm px-6 py-3 rounded-xl transition-colors"
            >
              <Send className="w-4 h-4" /> Send Message
            </button>
          </motion.form>
        </div>
      </div>
    </section>
  );
}

// ─── Final CTA band ───────────────────────────────────────────────────────────

function FinalCTASection() {
  return (
    <section className="relative bg-[#060f0a] py-28 px-4 overflow-hidden">
      <div
        className="absolute inset-0 opacity-15"
        style={{ background: "radial-gradient(ellipse 80% 60% at 50% 100%, #22c55e, transparent)" }}
      />
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="relative z-10 text-center max-w-3xl mx-auto"
      >
        <h2 className="text-4xl sm:text-5xl md:text-6xl font-black text-white leading-tight mb-6">
          Ready to dominate your next block?
        </h2>
        <p className="text-white/50 text-lg mb-10">
          Join medical students already sharpening their clinical edge with MedQrown MedEazy.
        </p>
        <Link
          href="/portal"
          className="inline-flex items-center gap-2 bg-[#22c55e] hover:bg-[#16a34a] text-black font-black text-lg px-10 py-4 rounded-2xl transition-all shadow-2xl shadow-green-900/50 hover:scale-105"
        >
          Start Practicing for Free <ArrowRight className="w-5 h-5" />
        </Link>
      </motion.div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="bg-[#040b06] border-t border-[#1f4a2e]/30 py-14 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-10 mb-12">
          {/* Brand */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <img src={medqrownIcon} alt="MedQrown" className="h-8 w-8 object-contain" />
              <span className="font-black text-white text-base">
                MedQrown <span className="text-[#4ade9a]">MedEazy</span>
              </span>
            </div>
            <p className="text-white/40 text-sm leading-relaxed max-w-xs">
              The competitive clinical training ground for the next generation of medical professionals.
            </p>
          </div>

          {/* Links */}
          <div>
            <p className="text-white/60 text-xs font-semibold uppercase tracking-wider mb-4">Platform</p>
            <div className="flex flex-col gap-2.5">
              <button onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })} className="text-white/40 hover:text-white/70 text-sm text-left transition-colors">Features</button>
              <button onClick={() => document.getElementById("study-hub")?.scrollIntoView({ behavior: "smooth" })} className="text-white/40 hover:text-white/70 text-sm text-left transition-colors">Study Hub</button>
              <button onClick={() => document.getElementById("leaderboards")?.scrollIntoView({ behavior: "smooth" })} className="text-white/40 hover:text-white/70 text-sm text-left transition-colors">Leaderboards</button>
              <button onClick={() => document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" })} className="text-white/40 hover:text-white/70 text-sm text-left transition-colors">Contact</button>
            </div>
          </div>

          <div>
            <p className="text-white/60 text-xs font-semibold uppercase tracking-wider mb-4">Legal</p>
            <div className="flex flex-col gap-2.5">
              <span className="text-white/25 text-sm cursor-not-allowed">Terms of Service</span>
              <span className="text-white/25 text-sm cursor-not-allowed">Privacy Policy</span>
              <span className="text-white/25 text-sm cursor-not-allowed">FAQ</span>
            </div>
          </div>
        </div>

        <div className="border-t border-[#1f4a2e]/30 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-white/25 text-xs">
            © {new Date().getFullYear()} MedQrown MedEazy. All rights reserved.
          </p>
          <Link
            href="/admin"
            className="text-white/25 hover:text-white/50 text-xs underline underline-offset-2 transition-colors"
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
    <div className="min-h-screen font-sans" style={{ fontFamily: "Open Sans, sans-serif" }}>
      <Navbar />
      <HeroSection />
      <HookSection />
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
