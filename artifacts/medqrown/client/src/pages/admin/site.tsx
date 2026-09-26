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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { AdminNav } from "@/components/admin/admin-nav";
import { DemoExamsTab } from "@/pages/admin/demo-exams";
import { useUpload } from "@/hooks/use-upload";
import {
  ArrowLeft, Plus, Trash2, Save, Image as ImageIcon, Film, FileText,
  HelpCircle, Inbox, Upload, Mail, CheckCircle, Loader2, BarChart3, Users, Download, Search, Circle, Globe, Settings, Lock, Unlock
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import { FEATURES } from "@/lib/feature-flags";
import { apiErrorMessage } from "@/lib/api-error";
import { toNairobiInput } from "@/lib/datetime";

type FaqItem = { id: number; question: string; answer: string; orderIndex: number; isActive: boolean };
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
      if (res.status === 401) return null;
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
  if (data === null) return null;
  if (error || !data) return <p className="text-destructive text-sm py-8">Could not load engagement data. Please refresh.</p>;

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
                No activity in the last 30 days yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

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
    onError: (e: Error) => toast({ title: "Save failed", description: apiErrorMessage(e), variant: "destructive" }),
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
            placeholder={`Write the ${defaultTitle.toLowerCase()} here…\n\nFormatting tips:\n## Section Heading\n- Bullet point\n\nBlank line = new paragraph.`}
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
        <code className="bg-muted px-1.5 py-0.5 rounded text-xs">- item</code> for bullet lists.
      </p>
      <PageEditor slug="terms" defaultTitle="Terms of Service" />
      <PageEditor slug="privacy" defaultTitle="Privacy Policy" />
    </div>
  );
}

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
    onError: (e: Error) => toast({ title: "Failed", description: apiErrorMessage(e), variant: "destructive" }),
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

function RegistrationConfigTab() {
  const { toast } = useToast();
  const { data: settings, isLoading } = useQuery<Record<string, any>>({
    queryKey: ["/api/admin/site-settings"],
  });

  const [form, setForm] = useState({ registrationOpen: false, googleFormUrl: "", registrationOpensAt: "", registrationClosesAt: "" });
  const [copied, setCopied] = useState("");

  useEffect(() => {
    if (settings) {
      setForm({
        registrationOpen: settings.registrationOpen || false,
        googleFormUrl: settings.googleFormUrl || "",
        registrationOpensAt: toNairobiInput(settings.registrationOpensAt),
        registrationClosesAt: toNairobiInput(settings.registrationClosesAt),
      });
    }
  }, [settings]);

  const saveConfig = useMutation({
    mutationFn: async () => {
      // datetime-local values are Nairobi time.
      const toIso = (v: string) => (v ? new Date(`${v}:00+03:00`).toISOString() : null);
      await apiRequest("PUT", "/api/admin/site-settings", {
        registrationOpen: form.registrationOpen,
        googleFormUrl: form.googleFormUrl.trim(),
        registrationOpensAt: toIso(form.registrationOpensAt),
        registrationClosesAt: toIso(form.registrationClosesAt),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/site-settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/site-content"] });
      toast({ title: "Registration settings saved" });
    },
    onError: (e: any) => toast({ title: "Save failed", description: apiErrorMessage(e), variant: "destructive" }),
  });

  if (isLoading) return <p className="text-muted-foreground">Loading...</p>;

  const origin = window.location.origin;
  const demoLinks = [
    { label: "Demo link", url: `${origin}/demo` },
    { label: "WhatsApp", url: `${origin}/demo?src=whatsapp` },
    { label: "Poster / QR code", url: `${origin}/demo?src=qr` },
  ];
  const copy = async (url: string) => {
    try { await navigator.clipboard.writeText(url); } catch { /* shown on screen anyway */ }
    setCopied(url);
    setTimeout(() => setCopied(""), 2000);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <h3 className="font-bold text-foreground flex items-center gap-2">
            <Settings className="w-4 h-4 text-primary" /> Registration
          </h3>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between gap-4 p-4 border rounded-lg bg-muted/20">
            <div className="space-y-0.5">
              <Label className="text-base font-semibold">Registration status</Label>
              <p className="text-sm text-muted-foreground">
                {form.registrationOpen
                  ? "Open: sign-up buttons go to your Google Form."
                  : "Closed: sign-up buttons go to the waitlist."}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-sm font-semibold ${form.registrationOpen ? "text-green-600" : "text-muted-foreground"}`}>
                {form.registrationOpen ? "Open" : "Closed"}
              </span>
              <Switch checked={form.registrationOpen} onCheckedChange={(v) => setForm({ ...form, registrationOpen: v })} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="google-form">Google Form URL</Label>
            <Input id="google-form" value={form.googleFormUrl} onChange={(e) => setForm({ ...form, googleFormUrl: e.target.value })}
              placeholder="https://forms.gle/..." />
            <p className="text-xs text-muted-foreground">Required to open registration. When registration opens, everyone on the waitlist is emailed this link once.</p>
          </div>

          <div className="space-y-3 rounded-lg border p-4">
            <div>
              <Label className="text-base font-semibold">Schedule (optional)</Label>
              <p className="text-sm text-muted-foreground">Registration opens and closes by itself at these Nairobi times. Leave empty to switch it manually.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="reg-opens">Opens at</Label>
                <Input id="reg-opens" type="datetime-local" value={form.registrationOpensAt}
                  onChange={(e) => setForm({ ...form, registrationOpensAt: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reg-closes">Closes at</Label>
                <Input id="reg-closes" type="datetime-local" value={form.registrationClosesAt}
                  onChange={(e) => setForm({ ...form, registrationClosesAt: e.target.value })} />
              </div>
            </div>
            {(form.registrationOpensAt || form.registrationClosesAt) && (
              <Button variant="ghost" size="sm" className="px-0" onClick={() => setForm({ ...form, registrationOpensAt: "", registrationClosesAt: "" })}>
                Clear schedule
              </Button>
            )}
          </div>

          <Button onClick={() => saveConfig.mutate()} disabled={saveConfig.isPending} className="gap-2">
            <Save className="w-4 h-4" /> {saveConfig.isPending ? "Saving..." : "Save changes"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h3 className="font-bold text-foreground">Share the free demo</h3>
          <p className="text-sm text-muted-foreground">These open the website straight at the demo. Tagged links show up per source in Engagement. Add <span className="font-mono">&amp;subject=Anatomy</span> to preselect a subject.</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {demoLinks.map((link) => (
            <div key={link.url} className="flex items-center justify-between gap-2 rounded-lg bg-muted p-2.5">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{link.label}</p>
                <p className="font-mono text-sm break-all">{link.url}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => copy(link.url)}>{copied === link.url ? "Copied" : "Copy"}</Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminSite() {
  const [, setLocation] = useLocation();

  const { data: admin, isLoading: adminLoading } = useQuery<any>({
    queryKey: ["/api/admin/me"],
  });

  useEffect(() => {
    if (!adminLoading && !admin) setLocation("/");
  }, [adminLoading, admin, setLocation]);

  if (adminLoading) return <div className="min-h-screen bg-background" />;
  if (!admin) return null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-primary/3">
      <AdminNav admin={admin} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="flex items-center gap-3 mb-6">
          <Globe className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Site Content & Settings</h1>
        </div>

        <Tabs defaultValue="registration" className="space-y-6">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="registration" className="gap-2"><Settings className="w-4 h-4" /> Registration</TabsTrigger>
            <TabsTrigger value="demo" className="gap-2"><Film className="w-4 h-4" /> Demo Questions</TabsTrigger>
            <TabsTrigger value="faq" className="gap-2"><HelpCircle className="w-4 h-4" /> FAQ & Legal</TabsTrigger>
            <TabsTrigger value="engagement" className="gap-2"><BarChart3 className="w-4 h-4" /> Engagement</TabsTrigger>
          </TabsList>

          <TabsContent value="registration" className="m-0 space-y-6">
            <RegistrationConfigTab />
          </TabsContent>

          <TabsContent value="demo" className="m-0">
            <DemoExamsTab />
          </TabsContent>

          <TabsContent value="faq" className="m-0 space-y-6">
            <FaqTab />
            <PagesTab />
          </TabsContent>

          <TabsContent value="engagement" className="m-0">
            <EngagementTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
