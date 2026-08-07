import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { AppHeader } from "@/components/AppHeader";
import { useUpload } from "@/hooks/use-upload";
import {
  ArrowLeft, Plus, Trash2, Save, Image as ImageIcon, Film, FileText,
  HelpCircle, Inbox, Upload, Mail, CheckCircle, Loader2, BarChart3,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";

type FaqItem = { id: number; question: string; answer: string; orderIndex: number; isActive: boolean };
type Inquiry = {
  id: number; name: string; email: string; institution: string;
  message?: string | null; isRead: boolean; createdAt: string;
};
type EngagementSummary = {
  exams: {
    id: number; title: string; starts: number; mcqAnswered: number;
    mcqCorrect: number; saqStarted: number; saqSubmitted: number; completions: number;
    lastActivity: string | null;
  }[];
  questions: {
    id: number; examId: number; examTitle: string; type: string; content: string;
    answered: number; correct: number; submitted: number; lastActivity: string | null;
  }[];
  daily: { date: string; starts: number; completions: number; total: number }[];
};

const TABS = [
  { id: "media", label: "Demo Media", icon: Film },
  { id: "engagement", label: "Engagement", icon: BarChart3 },
  { id: "pages", label: "Legal Pages", icon: FileText },
  { id: "faq", label: "FAQ", icon: HelpCircle },
  { id: "inquiries", label: "Inquiries", icon: Inbox },
] as const;

function Metric({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
      <p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-black text-foreground mt-1">{value}</p>
      {hint && <p className="text-muted-foreground text-[11px] mt-1">{hint}</p>}
    </div>
  );
}

function formatActivityDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) +
    " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function EngagementTab() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data, isLoading, error } = useQuery<EngagementSummary | null>({
    queryKey: ["/api/admin/demo-engagement"],
    refetchOnMount: "always",
    queryFn: async () => {
      const res = await fetch("/api/admin/demo-engagement", { credentials: "include" });
      if (res.status === 401) return null;          // session expired — handled below
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/demo-engagement", { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/demo-engagement"] });
      toast({ title: "Engagement data cleared", description: "All demo engagement counts have been reset to zero." });
    },
    onError: () => {
      toast({ title: "Could not clear engagement data", description: "Please try again.", variant: "destructive" });
    },
  });

  if (isLoading) return <p className="text-muted-foreground text-sm py-8">Loading engagement…</p>;

  // Session expired after server restart — send back to login cleanly.
  if (data === null) {
    return (
      <div className="py-10 text-center space-y-3">
        <p className="text-muted-foreground text-sm">Your session has expired. Please sign in again.</p>
        <button
          onClick={() => setLocation("/admin")}
          className="text-primary text-sm underline underline-offset-2 hover:opacity-80"
        >
          Go to Admin Login
        </button>
      </div>
    );
  }

  if (error || !data) {
    return <p className="text-destructive text-sm py-8">Could not load engagement data. Please refresh.</p>;
  }

  const totals = data.exams.reduce(
    (acc, exam) => ({
      starts: acc.starts + exam.starts,
      mcqAnswered: acc.mcqAnswered + exam.mcqAnswered,
      mcqCorrect: acc.mcqCorrect + exam.mcqCorrect,
      saqSubmitted: acc.saqSubmitted + exam.saqSubmitted,
      completions: acc.completions + exam.completions,
    }),
    { starts: 0, mcqAnswered: 0, mcqCorrect: 0, saqSubmitted: 0, completions: 0 },
  );
  const completionRate = totals.starts ? Math.round((totals.completions / totals.starts) * 100) : 0;
  const mcqAccuracy = totals.mcqAnswered ? Math.round((totals.mcqCorrect / totals.mcqAnswered) * 100) : 0;

  // Build a continuous 30-day series (fill days with no events with zeros).
  const byDate = new Map((data.daily ?? []).map((d) => [d.date, d]));
  const dailyChart: { label: string; date: string; starts: number; completions: number; total: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const day = new Date();
    day.setDate(day.getDate() - i);
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    const row = byDate.get(key);
    dailyChart.push({
      date: key,
      label: day.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
      starts: row?.starts ?? 0,
      completions: row?.completions ?? 0,
      total: row?.total ?? 0,
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-black text-foreground">Demo Engagement</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Anonymous activity from the public demo — starts, answers, drop-off, and question performance.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive shrink-0"
          disabled={clearMutation.isPending || totals.starts === 0}
          onClick={() => {
            if (window.confirm("Clear all demo engagement data? This resets every count to zero and cannot be undone.")) {
              clearMutation.mutate();
            }
          }}
        >
          {clearMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 mr-1.5" />}
          Clear data
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Metric label="Demo starts" value={totals.starts} />
        <Metric label="Completions" value={totals.completions} hint={`${completionRate}% of starts`} />
        <Metric label="MCQ answers" value={totals.mcqAnswered} />
        <Metric label="MCQ accuracy" value={`${mcqAccuracy}%`} />
        <Metric label="SAQ submissions" value={totals.saqSubmitted} />
      </div>

      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Daily activity (last 30 days)</h3>
        <Card>
          <CardContent className="p-4 sm:p-5">
            {dailyChart.some((d) => d.total > 0) ? (
              <div className="h-56 sm:h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyChart} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="total" name="All events" fill="#0d9488" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="starts" name="Starts" fill="#0d948880" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="completions" name="Completions" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm py-8 text-center">
                No activity in the last 30 days yet — the chart fills in as students use the demo.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {data.exams.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border text-center py-14">
          <BarChart3 className="w-9 h-9 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No demo subjects yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">By subject</h3>
          {data.exams.map((exam) => {
            const rate = exam.starts ? Math.round((exam.completions / exam.starts) * 100) : 0;
            const accuracy = exam.mcqAnswered ? Math.round((exam.mcqCorrect / exam.mcqAnswered) * 100) : 0;
            return (
              <Card key={exam.id}>
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                    <div className="min-w-0">
                      <h4 className="font-bold text-foreground">{exam.title}</h4>
                      {formatActivityDate(exam.lastActivity) && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Last activity: {formatActivityDate(exam.lastActivity)}
                        </p>
                      )}
                    </div>
                    <Badge variant={exam.starts ? "default" : "secondary"} className="text-[10px]">
                      {exam.starts ? `${rate}% completion` : "No activity"}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
                    <div><span className="text-muted-foreground block text-xs">Starts</span><strong>{exam.starts}</strong></div>
                    <div><span className="text-muted-foreground block text-xs">MCQ answered</span><strong>{exam.mcqAnswered}</strong></div>
                    <div><span className="text-muted-foreground block text-xs">MCQ accuracy</span><strong>{accuracy}%</strong></div>
                    <div><span className="text-muted-foreground block text-xs">SAQ submitted</span><strong>{exam.saqSubmitted}</strong></div>
                    <div><span className="text-muted-foreground block text-xs">Completed</span><strong>{exam.completions}</strong></div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {data.questions.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Question engagement</h3>
          {data.questions.map((question) => {
            const answerRate = question.type === "mcq" ? question.answered : question.submitted;
            const performance = question.type === "mcq" && question.answered
              ? `${Math.round((question.correct / question.answered) * 100)}% correct`
              : question.type === "saq" ? `${question.submitted} submitted` : "No answers";
            return (
              <div key={question.id} className="rounded-xl border border-border/70 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-[10px] uppercase">{question.type}</Badge>
                      <span className="text-muted-foreground text-[11px]">{question.examTitle}</span>
                    </div>
                    <p className="text-sm font-medium text-foreground line-clamp-2">{question.content}</p>
                    {formatActivityDate(question.lastActivity) && (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Last answered: {formatActivityDate(question.lastActivity)}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-foreground">{answerRate}</p>
                    <p className="text-[11px] text-muted-foreground">{performance}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-muted-foreground/70 text-xs">
        Counts are anonymous and intended as a basic signal of demo interest, not a measure of individual student performance.
      </p>
    </div>
  );
}

// ─── Demo media & photo text tab ──────────────────────────────────────────────

function MediaTab() {
  const { toast } = useToast();
  const { data: settings, isLoading } = useQuery<Record<string, any>>({
    queryKey: ["/api/admin/site-settings"],
  });
  const [form, setForm] = useState({
    demoVideoUrl: "",
    demoPhotoUrl: "",
    demoPhotoHeadline: "",
    demoPhotoSubtext: "",
    demoPhotoCta: "",
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const { uploadFile, isUploading } = useUpload();

  useEffect(() => {
    if (settings) {
      setForm({
        demoVideoUrl: settings.demoVideoUrl || "",
        demoPhotoUrl: settings.demoPhotoUrl || "",
        demoPhotoHeadline: settings.demoPhotoHeadline || "",
        demoPhotoSubtext: settings.demoPhotoSubtext || "",
        demoPhotoCta: settings.demoPhotoCta || "",
      });
    }
  }, [settings]);

  const save = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", "/api/admin/site-settings", form);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/site-settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/site-content"] });
      toast({ title: "Saved", description: "Demo media settings updated." });
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Not an image", description: "Please choose an image file.", variant: "destructive" });
      return;
    }
    const res = await uploadFile(file);
    if (res) {
      setForm((f) => ({ ...f, demoPhotoUrl: res.objectPath }));
      toast({ title: "Photo uploaded", description: "Don't forget to hit Save." });
    } else {
      toast({ title: "Upload failed", description: "Please try again.", variant: "destructive" });
    }
    e.target.value = "";
  };

  if (isLoading) return <p className="text-muted-foreground text-sm py-8">Loading…</p>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Film className="w-4 h-4 text-primary" />
            <h3 className="font-bold text-foreground">Demo Video (slide 2)</h3>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label className="text-xs">Video URL — YouTube link or direct .mp4 link</Label>
          <Input
            value={form.demoVideoUrl}
            onChange={(e) => setForm({ ...form, demoVideoUrl: e.target.value })}
            placeholder="https://www.youtube.com/watch?v=… or https://…/video.mp4"
          />
          <p className="text-muted-foreground text-xs">
            Leave empty to show the "coming soon" placeholder with the play button.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-primary" />
            <h3 className="font-bold text-foreground">Demo Photo & Text (slide 3)</h3>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <div className="w-full sm:w-56 shrink-0">
              <div className="aspect-video rounded-xl border border-border bg-muted overflow-hidden flex items-center justify-center">
                {form.demoPhotoUrl ? (
                  <img src={form.demoPhotoUrl} alt="Demo slide" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-muted-foreground text-xs">Default photo in use</span>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
              <div className="flex gap-2 mt-2">
                <Button
                  type="button" size="sm" variant="outline" className="flex-1 gap-1.5"
                  disabled={isUploading}
                  onClick={() => fileRef.current?.click()}
                >
                  {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  {isUploading ? "Uploading…" : "Upload Photo"}
                </Button>
                {form.demoPhotoUrl && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => setForm({ ...form, demoPhotoUrl: "" })}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </div>
            <div className="flex-1 w-full space-y-3">
              <div>
                <Label className="text-xs">Headline</Label>
                <Input
                  value={form.demoPhotoHeadline}
                  onChange={(e) => setForm({ ...form, demoPhotoHeadline: e.target.value })}
                  placeholder="Study less. Rank higher."
                />
              </div>
              <div>
                <Label className="text-xs">Subtext</Label>
                <Textarea
                  rows={3}
                  value={form.demoPhotoSubtext}
                  onChange={(e) => setForm({ ...form, demoPhotoSubtext: e.target.value })}
                  placeholder="Thousands of questions, AI feedback in seconds…"
                />
              </div>
              <div>
                <Label className="text-xs">Button label</Label>
                <Input
                  value={form.demoPhotoCta}
                  onChange={(e) => setForm({ ...form, demoPhotoCta: e.target.value })}
                  placeholder="Join Them"
                />
              </div>
            </div>
          </div>
          <p className="text-muted-foreground text-xs">Leave any field empty to use the default text.</p>
        </CardContent>
      </Card>

      <Button onClick={() => save.mutate()} disabled={save.isPending || isUploading} className="gap-2 font-bold">
        <Save className="w-4 h-4" /> {save.isPending ? "Saving…" : "Save Changes"}
      </Button>
    </div>
  );
}

// ─── Legal pages tab ──────────────────────────────────────────────────────────

function PageEditor({ slug, defaultTitle }: { slug: string; defaultTitle: string }) {
  const { toast } = useToast();
  const { data: page, isLoading } = useQuery<{ title: string; content: string } | null>({
    queryKey: [`/api/admin/pages/${slug}`],
  });
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!isLoading && !loaded) {
      setTitle(page?.title || defaultTitle);
      setContent(page?.content || "");
      setLoaded(true);
    }
  }, [isLoading, page, loaded, defaultTitle]);

  const save = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", `/api/admin/pages/${slug}`, { title, content });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/pages/${slug}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/pages/${slug}`] });
      toast({ title: "Saved", description: `${title} updated.` });
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
        <h3 className="font-bold text-foreground">{defaultTitle}</h3>
        <Link href={`/${slug}`} target="_blank" className="text-primary text-xs hover:underline">
          View live page →
        </Link>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label className="text-xs">Page title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Content</Label>
          <Textarea
            rows={14}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={`Write the ${defaultTitle.toLowerCase()} here…\n\nFormatting tips:\n## Section Heading\n- Bullet point\n\nBlank line = new paragraph. If left empty, the site shows a sensible default.`}
            className="font-mono text-xs leading-relaxed"
          />
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending || !title.trim() || !content.trim()} size="sm" className="gap-1.5 font-bold">
          <Save className="w-3.5 h-3.5" /> {save.isPending ? "Saving…" : "Save"}
        </Button>
      </CardContent>
    </Card>
  );
}

function PagesTab() {
  return (
    <div className="space-y-6">
      <p className="text-muted-foreground text-sm">
        Use <code className="bg-muted px-1.5 py-0.5 rounded text-xs">## Heading</code> to start a section and{" "}
        <code className="bg-muted px-1.5 py-0.5 rounded text-xs">- item</code> for bullet lists. Until you save custom content, the live pages show a built-in default.
      </p>
      <PageEditor slug="terms" defaultTitle="Terms of Service" />
      <PageEditor slug="privacy" defaultTitle="Privacy Policy" />
    </div>
  );
}

// ─── FAQ tab ──────────────────────────────────────────────────────────────────

function FaqTab() {
  const { toast } = useToast();
  const { data: items = [], isLoading } = useQuery<FaqItem[]>({ queryKey: ["/api/admin/faq"] });
  const [newQ, setNewQ] = useState("");
  const [newA, setNewA] = useState("");

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/faq"] });
    queryClient.invalidateQueries({ queryKey: ["/api/site-content"] });
  };

  const create = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/admin/faq", {
        question: newQ, answer: newA, orderIndex: items.length,
      });
    },
    onSuccess: () => {
      invalidate();
      setNewQ(""); setNewA("");
      toast({ title: "FAQ added" });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const update = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<FaqItem> }) => {
      await apiRequest("PUT", `/api/admin/faq/${id}`, data);
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/faq/${id}`);
    },
    onSuccess: () => { invalidate(); toast({ title: "FAQ deleted" }); },
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <h3 className="font-bold text-foreground flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary" /> Add FAQ
          </h3>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input value={newQ} onChange={(e) => setNewQ(e.target.value)} placeholder="Question — e.g. Is it free to start?" />
          <Textarea rows={3} value={newA} onChange={(e) => setNewA(e.target.value)} placeholder="Answer…" />
          <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending || !newQ.trim() || !newA.trim()} className="gap-1.5 font-bold">
            <Plus className="w-3.5 h-3.5" /> Add
          </Button>
          <p className="text-muted-foreground text-xs">Until you add your own FAQs, the live page shows a built-in default set.</p>
        </CardContent>
      </Card>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id} className={!item.isActive ? "opacity-60" : ""}>
              <CardContent className="p-4 flex items-start gap-3">
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="font-semibold text-foreground text-sm">{item.question}</p>
                  <p className="text-muted-foreground text-xs leading-relaxed">{item.answer}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Switch
                    checked={item.isActive}
                    onCheckedChange={(v) => update.mutate({ id: item.id, data: { isActive: v } })}
                  />
                  <Button variant="ghost" size="sm" onClick={() => remove.mutate(item.id)} className="text-muted-foreground hover:text-destructive px-2">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Inquiries tab ────────────────────────────────────────────────────────────

function InquiriesTab() {
  const { toast } = useToast();
  const { data: inquiries = [], isLoading } = useQuery<Inquiry[]>({ queryKey: ["/api/admin/inquiries"] });

  const markRead = useMutation({
    mutationFn: async ({ id, isRead }: { id: number; isRead: boolean }) => {
      await apiRequest("PATCH", `/api/admin/inquiries/${id}`, { isRead });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/inquiries"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/inquiries/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/inquiries"] });
      toast({ title: "Inquiry deleted" });
    },
  });

  if (isLoading) return <p className="text-muted-foreground text-sm py-8">Loading…</p>;

  if (inquiries.length === 0) {
    return (
      <div className="text-center py-16">
        <Inbox className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-muted-foreground text-sm">No institution inquiries yet.</p>
        <p className="text-muted-foreground/60 text-xs mt-1">
          Submissions from the /institutions contact form land here (and are emailed to you).
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {inquiries.map((inq) => (
        <Card key={inq.id} className={inq.isRead ? "opacity-70" : "border-primary/30"}>
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-foreground text-sm">{inq.institution}</p>
                  {!inq.isRead && <Badge className="text-[10px]">NEW</Badge>}
                </div>
                <p className="text-muted-foreground text-xs mt-0.5">
                  {inq.name} · <a href={`mailto:${inq.email}`} className="text-primary hover:underline">{inq.email}</a>
                </p>
              </div>
              <p className="text-muted-foreground/60 text-[11px]">
                {new Date(inq.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
            {inq.message && (
              <p className="text-foreground text-sm bg-muted/40 rounded-lg p-3 mb-3 whitespace-pre-line leading-relaxed">{inq.message}</p>
            )}
            <div className="flex gap-2">
              <a href={`mailto:${inq.email}?subject=${encodeURIComponent(`Re: MedQrown for ${inq.institution}`)}`}>
                <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8">
                  <Mail className="w-3.5 h-3.5" /> Reply
                </Button>
              </a>
              <Button
                size="sm" variant="ghost" className="gap-1.5 text-xs h-8"
                onClick={() => markRead.mutate({ id: inq.id, isRead: !inq.isRead })}
              >
                <CheckCircle className="w-3.5 h-3.5" /> {inq.isRead ? "Mark unread" : "Mark read"}
              </Button>
              <Button
                size="sm" variant="ghost" className="gap-1.5 text-xs h-8 text-muted-foreground hover:text-destructive ml-auto"
                onClick={() => remove.mutate(inq.id)}
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminSiteContent() {
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("media");

  const { data: me, isLoading: meLoading } = useQuery<{ id: number } | null>({
    queryKey: ["/api/admin/me"],
    retry: false,
    staleTime: 0,          // always revalidate — never serve a cached session after a server restart
    refetchOnMount: "always",
  });

  useEffect(() => {
    if (!meLoading && !me) setLocation("/admin");
  }, [me, meLoading, setLocation]);

  const { data: inquiries = [] } = useQuery<Inquiry[]>({
    queryKey: ["/api/admin/inquiries"],
    enabled: !!me,
  });
  const unread = inquiries.filter((i) => !i.isRead).length;

  if (meLoading || !me) return null;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader showHomeLink={false} />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/admin/dashboard")} className="gap-1.5">
            <ArrowLeft className="w-4 h-4" /> Dashboard
          </Button>
          <h1 className="text-xl font-black text-foreground">Site Content</h1>
        </div>

        <div className="flex gap-1.5 mb-8 overflow-x-auto pb-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${
                tab === id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-4 h-4" /> {label}
              {id === "inquiries" && unread > 0 && (
                <span className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center ${tab === id ? "bg-primary-foreground/20" : "bg-primary text-primary-foreground"}`}>
                  {unread}
                </span>
              )}
            </button>
          ))}
        </div>

        {tab === "media" && <MediaTab />}
        {tab === "engagement" && <EngagementTab />}
        {tab === "pages" && <PagesTab />}
        {tab === "faq" && <FaqTab />}
        {tab === "inquiries" && <InquiriesTab />}
      </div>
    </div>
  );
}
