import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ArrowLeft, Building2, CheckCircle2, Mail, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { MedQrownBrand } from "@/components/MedQrownBrand";

// ─── Shared shell ─────────────────────────────────────────────────────────────

function SitePageShell({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-4 sm:px-6 py-4 flex items-center justify-between border-b border-border/40 bg-background/80 backdrop-blur-sm sticky top-0 z-40">
        <Link href="/" className="flex items-center gap-2 group">
          <MedQrownBrand size="sm" />
        </Link>
        <Link
          href="/"
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors font-medium"
        >
          <Home className="w-3.5 h-3.5" /> Home
        </Link>
      </header>

      <div className="relative overflow-hidden border-b border-border/40 bg-gradient-to-b from-primary/[0.07] to-transparent">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-14 text-center">
          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-3xl sm:text-4xl font-black text-foreground"
          >
            {title}
          </motion.h1>
          {subtitle && (
            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 }}
              className="text-muted-foreground mt-3 max-w-xl mx-auto"
            >
              {subtitle}
            </motion.p>
          )}
        </div>
      </div>

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-12">{children}</main>

      <footer className="border-t border-border py-8 px-4">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()} MedQrown MedEazy. All rights reserved.</p>
          <div className="flex gap-4">
            <Link href="/terms" className="hover:text-primary transition-colors">Terms</Link>
            <Link href="/privacy" className="hover:text-primary transition-colors">Privacy</Link>
            <Link href="/faq" className="hover:text-primary transition-colors">FAQ</Link>
            <Link href="/institutions" className="hover:text-primary transition-colors">Institutions</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Simple text renderer: "## " → heading, "- " → bullet, blank-line separated paragraphs
function RichText({ content }: { content: string }) {
  const blocks = content.split(/\n\s*\n/);
  return (
    <div className="space-y-5">
      {blocks.map((block, i) => {
        const lines = block.split("\n").filter((l) => l.trim() !== "");
        if (lines.length === 0) return null;
        if (lines[0].startsWith("## ")) {
          return (
            <div key={i} className="space-y-3 pt-3">
              <h2 className="text-xl font-black text-foreground">{lines[0].slice(3)}</h2>
              {lines.slice(1).length > 0 && (
                <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-line">
                  {lines.slice(1).join("\n")}
                </p>
              )}
            </div>
          );
        }
        if (lines.every((l) => l.trim().startsWith("- "))) {
          return (
            <ul key={i} className="space-y-2 pl-1">
              {lines.map((l, j) => (
                <li key={j} className="flex gap-2.5 text-muted-foreground text-sm leading-relaxed">
                  <span className="text-primary mt-1">•</span>
                  <span>{l.trim().slice(2)}</span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="text-muted-foreground text-sm leading-relaxed whitespace-pre-line">
            {block}
          </p>
        );
      })}
    </div>
  );
}

// ─── Terms & Privacy ──────────────────────────────────────────────────────────

type ContentPageData = { slug: string; title: string; content: string; updatedAt: string };

const DEFAULT_TERMS = `## 1. Acceptance of Terms
By creating an account or using MedQrown MedEazy, you agree to these Terms of Service. If you do not agree, please do not use the platform.

## 2. The Service
MedQrown MedEazy provides AI-assisted practice exams, study tools, and competitive learning features for medical students. Practice content is for educational purposes only and is not a substitute for formal medical education or clinical judgement.

## 3. Accounts
- You must provide accurate information when signing up.
- You are responsible for keeping your login credentials secure.
- Accounts are personal and may not be shared.

## 4. Acceptable Use
You agree not to misuse the platform, including attempting to access other users' data, disrupting exams, or scraping content.

## 5. Content & Intellectual Property
All questions, explanations, and platform content remain the property of MedQrown MedEazy. You may not reproduce or distribute platform content without permission.

## 6. Termination
We may suspend or terminate accounts that violate these terms.

## 7. Changes
We may update these terms from time to time. Continued use of the platform means you accept the updated terms.

## 8. Contact
Questions about these terms? Reach us through the contact section on our homepage.`;

const DEFAULT_PRIVACY = `## 1. What We Collect
We collect the information you provide when signing up — your name, email address, university, and year of study — plus your exam attempts and results so we can show your progress.

## 2. How We Use It
- To operate your account and deliver exams
- To email you verification codes, results, and important updates
- To improve the platform and its AI feedback

## 3. What We Don't Do
We do not sell your personal data. We do not share your data with third parties except the service providers needed to run the platform (such as email delivery and secure data hosting).

## 4. Data Security
Your data is stored securely and access is restricted. Passwords are stored hashed, never in plain text.

## 5. Your Rights
You may request access to or deletion of your personal data at any time by contacting us.

## 6. Cookies & Sessions
We use session cookies strictly to keep you logged in. No third-party advertising trackers are used.

## 7. Contact
Privacy questions? Reach us through the contact section on our homepage.`;

function LegalPage({ slug, fallbackTitle, fallbackContent }: { slug: string; fallbackTitle: string; fallbackContent: string }) {
  const { data: page, isLoading } = useQuery<ContentPageData | null>({
    queryKey: [`/api/pages/${slug}`],
    retry: false,
    queryFn: async () => {
      const res = await fetch(`/api/pages/${slug}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const title = page?.title || fallbackTitle;
  const content = page?.content || fallbackContent;

  return (
    <SitePageShell
      title={title}
      subtitle={page?.updatedAt ? `Last updated ${new Date(page.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}` : undefined}
    >
      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : (
        <RichText content={content} />
      )}
    </SitePageShell>
  );
}

export function TermsPage() {
  return <LegalPage slug="terms" fallbackTitle="Terms of Service" fallbackContent={DEFAULT_TERMS} />;
}

export function PrivacyPage() {
  return <LegalPage slug="privacy" fallbackTitle="Privacy Policy" fallbackContent={DEFAULT_PRIVACY} />;
}

// ─── FAQ ──────────────────────────────────────────────────────────────────────

type FaqItemData = { id: number; question: string; answer: string };

/** Strip HTML tags and common markdown so FAQ answers are plain text in JSON-LD. */
function stripFormatting(text: string): string {
  return text
    .replace(/<[^>]+>/g, " ")        // HTML tags
    .replace(/#{1,6}\s+/g, "")       // ## headings
    .replace(/^\s*-\s+/gm, "")       // bullet list items
    .replace(/\*\*([^*]+)\*\*/g, "$1") // **bold**
    .replace(/\*([^*]+)\*/g, "$1")    // *italic*
    .replace(/`([^`]+)`/g, "$1")      // `code`
    .replace(/\s{2,}/g, " ")
    .trim();
}

const DEFAULT_FAQ: FaqItemData[] = [
  { id: -1, question: "What is MedQrown MedEazy?", answer: "A competitive study platform for medical students — practice with AI-generated exams, get instant feedback, and see how your clinical reasoning ranks against your classmates." },
  { id: -2, question: "Is it free to start?", answer: "Yes. You can create an account and start practicing right away. Premium features are being rolled out for power users." },
  { id: -3, question: "How does the AI marking work?", answer: "For short-answer questions, our AI compares your answer to model answers and marking criteria, then gives you a score with a written explanation of what you got right and what you missed." },
  { id: -4, question: "Which universities are supported?", answer: "Any medical student can join. If your institution wants to run official exams on MedQrown, ask them to reach out via our Institutions page." },
  { id: -5, question: "How do I report a problem with a question?", answer: "Use the feedback option after any exam, or contact us via the homepage contact section — we review every report." },
];

export function FaqPage() {
  const { data } = useQuery<{ settings: Record<string, any>; faq: FaqItemData[] }>({
    queryKey: ["/api/site-content"],
  });
  const items = data?.faq?.length ? data.faq : DEFAULT_FAQ;
  const [open, setOpen] = useState<number | null>(null);

  // Inject FAQPage JSON-LD into <head> for this route only; clean up on unmount.
  useEffect(() => {
    const schema = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: items.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: stripFormatting(item.answer),
        },
      })),
    };
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = "faq-schema";
    script.textContent = JSON.stringify(schema, null, 2);
    document.head.appendChild(script);
    return () => {
      document.getElementById("faq-schema")?.remove();
    };
  }, [items]);

  return (
    <SitePageShell title="Frequently Asked Questions" subtitle="Everything you need to know before you start grinding.">
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

      <div className="mt-10 text-center rounded-2xl border border-primary/15 bg-primary/[0.04] p-8">
        <Mail className="w-6 h-6 text-primary mx-auto mb-2" />
        <p className="font-bold text-foreground text-sm mb-1">Still have a question?</p>
        <p className="text-muted-foreground text-xs mb-4">We're happy to help — reach out any time.</p>
        <Link href="/#contact">
          <Button size="sm" variant="outline" className="rounded-lg text-xs">Contact Us</Button>
        </Link>
      </div>
    </SitePageShell>
  );
}

// ─── Institutions contact form ────────────────────────────────────────────────

export function InstitutionsPage() {
  const [form, setForm] = useState({ name: "", email: "", institution: "", message: "", website: "" });
  const [submitted, setSubmitted] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/inquiries", form);
    },
    onSuccess: () => setSubmitted(true),
  });

  return (
    <SitePageShell
      title="MedQrown for Institutions"
      subtitle="Run secure, AI-marked exams for your entire cohort. Tell us about your institution and we'll get back to you."
    >
      <div className="grid md:grid-cols-5 gap-8">
        <div className="md:col-span-2 space-y-4">
          {[
            { title: "Cohort-scale exams", desc: "Host timed exams for hundreds of students at once with automated AI marking." },
            { title: "Full analytics", desc: "See performance by topic, student, and cohort — instantly after every exam." },
            { title: "Your question bank", desc: "Bring your own questions or build them with AI assistance." },
          ].map((f) => (
            <div key={f.title} className="rounded-2xl border border-border bg-card p-5">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                <Building2 className="w-4.5 h-4.5 text-primary" />
              </div>
              <p className="font-bold text-foreground text-sm mb-1">{f.title}</p>
              <p className="text-muted-foreground text-xs leading-relaxed">{f.desc}</p>
            </div>
          ))}
          <p className="text-muted-foreground text-xs px-1">
            Already have admin access?{" "}
            <Link href="/admin" className="text-primary hover:underline">Log in here</Link>.
          </p>
        </div>

        <div className="md:col-span-3">
          {submitted ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-3xl border border-primary/20 bg-primary/[0.04] p-10 text-center"
            >
              <CheckCircle2 className="w-12 h-12 text-primary mx-auto mb-4" />
              <h2 className="font-black text-foreground text-xl mb-2">Inquiry received!</h2>
              <p className="text-muted-foreground text-sm mb-6 max-w-sm mx-auto">
                Thanks, {form.name.split(" ")[0]}. We've got your details and will reach out to{" "}
                <span className="text-foreground font-semibold">{form.email}</span> shortly.
              </p>
              <Link href="/">
                <Button variant="outline" className="rounded-xl gap-2">
                  <ArrowLeft className="w-4 h-4" /> Back to Home
                </Button>
              </Link>
            </motion.div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                mutation.mutate();
              }}
              className="rounded-3xl border border-border bg-card p-6 sm:p-8 space-y-4 shadow-sm"
            >
              <div>
                <label className="text-muted-foreground text-xs font-semibold uppercase tracking-wider block mb-1.5">Your Name *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Dr. Jane Mwangi"
                  className="w-full bg-background border border-input rounded-xl px-4 py-3 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div>
                <label className="text-muted-foreground text-xs font-semibold uppercase tracking-wider block mb-1.5">Work Email *</label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="jane@university.ac.ke"
                  className="w-full bg-background border border-input rounded-xl px-4 py-3 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div>
                <label className="text-muted-foreground text-xs font-semibold uppercase tracking-wider block mb-1.5">Institution Name *</label>
                <input
                  type="text"
                  required
                  value={form.institution}
                  onChange={(e) => setForm({ ...form, institution: e.target.value })}
                  placeholder="University of Nairobi — School of Medicine"
                  className="w-full bg-background border border-input rounded-xl px-4 py-3 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div>
                <label className="text-muted-foreground text-xs font-semibold uppercase tracking-wider block mb-1.5">What do you need? (optional)</label>
                <textarea
                  rows={4}
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  placeholder="e.g. We'd like to run end-of-rotation exams for 250 students…"
                  className="w-full bg-background border border-input rounded-xl px-4 py-3 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                />
              </div>
              {/* Honeypot — hidden from real users, catches bots */}
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
              {mutation.isError && (
                <p className="text-red-500 text-xs">{(mutation.error as Error)?.message?.replace(/^\d+:\s*/, "") || "Something went wrong. Please try again."}</p>
              )}
              <Button type="submit" disabled={mutation.isPending} className="w-full h-12 rounded-xl font-bold">
                {mutation.isPending ? "Sending…" : "Send Inquiry"}
              </Button>
              <p className="text-muted-foreground/70 text-[11px] text-center">
                We'll only use your details to respond to this inquiry.
              </p>
            </form>
          )}
        </div>
      </div>
    </SitePageShell>
  );
}
