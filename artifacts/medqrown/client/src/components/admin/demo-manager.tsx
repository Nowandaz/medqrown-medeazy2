import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Check, Copy, ExternalLink, FlaskConical, Image as ImageIcon, KeyRound, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { apiErrorMessage } from "@/lib/api-error";

type DemoAdmin = {
  settings: { durationMinutes: number; subject: string; perks: string[] };
  demoProviders: number;
  stats: { starts: number; finished: number; averagePercent: number | null; sources: { src: string; starts: number; finished: number }[] };
  questions: {
    id: number; examId: number; examTitle: string; type: string; content: string; imageUrl: string | null;
    parts: number; marks: number; answered: number; fullyCorrect: number; problem: string | null;
  }[];
};

function Metric({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Admin → Site → Demo: the question pool (added from each exam's Questions tab), timer, selling points and results. */
export function DemoManager() {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<DemoAdmin>({ queryKey: ["/api/admin/demo"], refetchOnMount: "always" });
  const [minutes, setMinutes] = useState("5");
  const [subject, setSubject] = useState("Anatomy");
  const [perks, setPerks] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    if (!data) return;
    setMinutes(String(data.settings.durationMinutes));
    setSubject(data.settings.subject);
    setPerks(data.settings.perks.join("\n"));
  }, [data]);

  const saveSettings = useMutation({
    mutationFn: async () => (await apiRequest("PATCH", "/api/admin/demo/settings", {
      durationMinutes: Number(minutes), subject, perks: perks.split("\n").map((p) => p.trim()).filter(Boolean),
    })).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/demo"] });
      queryClient.invalidateQueries({ queryKey: ["/api/demo/info"] });
      toast({ title: "Demo settings saved" });
    },
    onError: (e: any) => toast({ title: "Couldn't save", description: apiErrorMessage(e), variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/admin/demo/questions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/demo"] });
      queryClient.invalidateQueries({ queryKey: ["/api/demo/info"] });
    },
  });

  if (isLoading || !data) return <Skeleton className="h-96" />;
  const origin = window.location.origin;
  const links = [
    { label: "Poster / QR code", url: `${origin}/demo?src=poster` },
    { label: "WhatsApp", url: `${origin}/demo?src=whatsapp` },
    { label: "Plain link", url: `${origin}/demo` },
  ];
  const copy = async (url: string) => {
    try { await navigator.clipboard.writeText(url); } catch { /* visible anyway */ }
    setCopied(url);
    setTimeout(() => setCopied(""), 2000);
  };
  const ready = data.questions.filter((q) => !q.problem).length;
  const { stats } = data;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Started (30 days)" value={stats.starts} />
        <Metric label="Finished" value={stats.finished} hint={stats.starts ? `${Math.round((stats.finished / stats.starts) * 100)}% of starts` : undefined} />
        <Metric label="Average score" value={stats.averagePercent == null ? "–" : `${stats.averagePercent}%`} />
        <Metric label="Questions ready" value={ready} hint={ready < 3 ? "Add at least 3" : "3 picked at random per attempt"} />
      </div>

      {data.demoProviders === 0 && (
        <div className="flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p>No AI key is reserved for the demo yet, so short answers show &quot;Sign up to see this mark&quot;. Add keys in{" "}
            <Link href="/admin/settings" className="font-semibold underline">Settings → AI Providers</Link> and set <b>Used for: Public demo only</b>.
            Multiple choice is always marked.</p>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <h3 className="font-bold">Demo links</h3>
          <p className="text-sm text-muted-foreground">Each link opens the challenge directly. Use a different one per channel to see what works below.</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {links.map((l) => (
            <div key={l.url} className="flex items-center gap-2">
              <span className="w-32 shrink-0 text-xs font-medium text-muted-foreground">{l.label}</span>
              <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1.5 text-xs">{l.url}</code>
              <Button size="sm" variant="outline" onClick={() => copy(l.url)} className="shrink-0 gap-1">
                {copied === l.url ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}{copied === l.url ? "Copied" : "Copy"}
              </Button>
            </div>
          ))}
          <a href="/demo" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 pt-1 text-xs font-semibold text-primary hover:underline">
            Open the demo <ExternalLink className="h-3 w-3" />
          </a>
          {stats.sources.length > 0 && (
            <div className="mt-3 border-t pt-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Where people came from (30 days)</p>
              <div className="flex flex-wrap gap-2">
                {stats.sources.map((s) => (
                  <Badge key={s.src} variant="outline" className="font-normal">{s.src}: {s.starts} started, {s.finished} finished</Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <h3 className="flex items-center gap-2 font-bold"><FlaskConical className="h-4 w-4 text-primary" /> Question pool</h3>
          <p className="text-sm text-muted-foreground">
            Add questions from any exam: open the exam, go to <b>Questions</b> and tap <b>Add to demo</b>. Each visitor gets 3 at random,
            multiple choice first. Images and sub-questions work too.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.questions.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No demo questions yet.</p>
          ) : data.questions.map((q) => (
            <div key={q.id} className="flex items-start gap-3 rounded-xl border p-3">
              {q.imageUrl ? <img src={q.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-lg border object-cover" /> : null}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px]">{q.type.toUpperCase()}</Badge>
                  {q.imageUrl && <Badge variant="outline" className="gap-0.5 text-[10px]"><ImageIcon className="h-3 w-3" />Image</Badge>}
                  {q.parts > 0 && <Badge variant="outline" className="text-[10px]">{q.parts} parts</Badge>}
                  <Link href={`/admin/exams/${q.examId}`} className="truncate text-xs text-muted-foreground hover:text-primary">{q.examTitle}</Link>
                </div>
                <p className="mt-1 line-clamp-2 text-sm">{q.content}</p>
                {q.problem ? (
                  <p className="mt-1 flex items-center gap-1 text-xs text-destructive"><AlertTriangle className="h-3 w-3" /> Not used: it {q.problem}. Fix it in the exam.</p>
                ) : q.answered > 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">{Math.round((q.fullyCorrect / q.answered) * 100)}% got full marks · {q.answered} answered</p>
                ) : null}
              </div>
              <Button size="icon" variant="ghost" className="shrink-0 text-destructive" aria-label="Remove from demo"
                onClick={() => remove.mutate(q.id)} disabled={remove.isPending}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><h3 className="font-bold">Challenge settings</h3></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Time limit for all 3 questions (minutes)</Label>
              <Input type="number" min={1} max={30} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Subject shown to visitors</Label>
              <Input value={subject} maxLength={60} onChange={(e) => setSubject(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>&quot;Want more of this?&quot; selling points (one per line)</Label>
            <Textarea rows={4} value={perks} onChange={(e) => setPerks(e.target.value)} />
            <p className="text-xs text-muted-foreground">Shown on the results screen above the sign-up button (which follows your registration status: sign-up form when open, waitlist when closed).</p>
          </div>
          <Button onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending}>{saveSettings.isPending ? "Saving…" : "Save settings"}</Button>
        </CardContent>
      </Card>
    </div>
  );
}
