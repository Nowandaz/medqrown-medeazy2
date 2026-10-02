import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { AdminNav } from "@/components/admin/admin-nav";
import { ArrowLeft, Brain, Mail, Users, Shield, Plus, Trash2, Save, Pencil, FlaskConical, CheckCircle, XCircle, Loader2, Building2, Calendar, CreditCard, FileText, Search, RotateCcw } from "lucide-react";
import { FEATURES } from "@/lib/feature-flags";
import { cohortName, formatNairobi } from "@/lib/datetime";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { apiErrorMessage } from "@/lib/api-error";

export default function AdminSettings() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: admin, isLoading: adminLoading } = useQuery<any>({ queryKey: ["/api/admin/me"] });
  const { data: providers } = useQuery<any[]>({ queryKey: ["/api/ai-providers"] });
  const { data: templates } = useQuery<any[]>({ queryKey: ["/api/admin/settings/email-templates"] });
  const { data: admins } = useQuery<any[]>({ queryKey: ["/api/admins"] });
  const { data: universities } = useQuery<any[]>({ queryKey: ["/api/admin/universities"], enabled: FEATURES.universityManagement });

  if (adminLoading) return null;
  if (!admin) {
    setLocation("/");
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-primary/3">
      <AdminNav admin={admin} />
      <header className="hidden">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link href="/admin/dashboard">
            <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
          </Link>
          <h1 className="text-lg font-bold flex-1">Settings</h1>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <Tabs defaultValue="ai">
          <TabsList className="mb-6 h-auto gap-1 bg-muted/50 p-1 flex-wrap">
            <TabsTrigger value="ai" className="text-xs gap-1"><Brain className="w-3 h-3" />AI Providers</TabsTrigger>
            <TabsTrigger value="email-templates" className="text-xs gap-1"><Mail className="w-3 h-3" />Email Templates</TabsTrigger>
            <TabsTrigger value="email-log" className="text-xs gap-1"><FileText className="w-3 h-3" />Email Log</TabsTrigger>
            <TabsTrigger value="admins" className="text-xs gap-1"><Users className="w-3 h-3" />Admin Roles</TabsTrigger>
            {FEATURES.universityManagement && <TabsTrigger value="universities" className="text-xs gap-1"><Building2 className="w-3 h-3" />Universities</TabsTrigger>}
            <TabsTrigger value="cohorts" className="text-xs gap-1"><Calendar className="w-3 h-3" />Cohorts</TabsTrigger>
            <TabsTrigger value="payments" className="text-xs gap-1"><CreditCard className="w-3 h-3" />Payments & Grace</TabsTrigger>
            <TabsTrigger value="password" className="text-xs gap-1"><Shield className="w-3 h-3" />Password</TabsTrigger>
          </TabsList>

          <TabsContent value="ai"><AiProvidersSection providers={providers || []} /></TabsContent>
          <TabsContent value="email-templates"><EmailTemplatesSection templates={templates || []} /></TabsContent>
          <TabsContent value="email-log"><EmailLogSection /></TabsContent>
          <TabsContent value="admins"><AdminsSection admins={admins || []} isSuperAdmin={admin.role === "super_admin"} /></TabsContent>
          {FEATURES.universityManagement && <TabsContent value="universities"><UniversitiesSection universities={universities || []} /></TabsContent>}
          <TabsContent value="cohorts"><CohortsSection /></TabsContent>
          <TabsContent value="payments"><PaymentsSection /></TabsContent>
          <TabsContent value="password"><ChangePasswordSection /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function AiProvidersSection({ providers }: { providers: any[] }) {
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: "", type: "openai", apiKeyValue: "", endpoint: "", model: "", weight: 1
  });
  const [testing, setTesting] = useState(false);
  const [testResults, setTestResults] = useState<any[] | null>(null);
  const [showTestDialog, setShowTestDialog] = useState(false);

  const runProviderTest = async () => {
    setTesting(true);
    setTestResults(null);
    try {
      const res = await apiRequest("POST", "/api/debug/batch-test", {});
      const data = await res.json();
      setTestResults(data.results || []);
      setShowTestDialog(true);
    } catch (e: any) {
      toast({ title: "Test failed", description: apiErrorMessage(e), variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  const resetForm = () => {
    setForm({ name: "", type: "openai", apiKeyValue: "", endpoint: "", model: "", weight: 1 });
    setEditingId(null);
  };

  const addProvider = useMutation({
    mutationFn: async () => {
      const { apiKeyValue, ...rest } = form;
      await apiRequest("POST", "/api/ai-providers", { ...rest, apiKeyValue: apiKeyValue || undefined, isActive: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-providers"] });
      setShowAdd(false);
      resetForm();
      toast({ title: "Provider added" });
    },
  });

  const updateProvider = useMutation({
    mutationFn: async () => {
      if (!editingId) return;
      const { apiKeyValue, ...rest } = form;
      await apiRequest("PATCH", `/api/ai-providers/${editingId}`, { ...rest, apiKeyValue: apiKeyValue || undefined });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-providers"] });
      setEditingId(null);
      resetForm();
      toast({ title: "Provider updated" });
    },
  });

  const toggleProvider = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      await apiRequest("PATCH", `/api/ai-providers/${id}`, { isActive });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/ai-providers"] }),
  });

  const deleteProvider = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/ai-providers/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/ai-providers"] }),
  });

  const startEdit = (p: any) => {
    setForm({
      name: p.name, type: p.type, apiKeyValue: "",
      endpoint: p.endpoint || "", model: p.model || "", weight: p.weight
    });
    setEditingId(p.id);
    setShowAdd(true);
  };

  const formContent = (
    <div className="space-y-4 pt-2">
      <div className="space-y-2">
        <Label>Provider Name</Label>
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. DeepSeek via OpenRouter" data-testid="input-provider-name" />
      </div>
      <div className="space-y-2">
        <Label>Type</Label>
        <Input value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} placeholder="openai, gemini, anthropic, etc." data-testid="input-provider-type" />
        <p className="text-xs text-muted-foreground">The API format: openai, gemini, anthropic, or any compatible type</p>
      </div>
      <div className="space-y-2">
        <Label>API Key {editingId ? "(leave empty to keep current)" : ""}</Label>
        <Input type="password" maxLength={2000} value={form.apiKeyValue} onChange={(e) => setForm({ ...form, apiKeyValue: e.target.value })} placeholder={editingId ? "Leave empty to keep existing key" : "sk-or-v1-..."} data-testid="input-provider-apiKeyValue" />
        <p className="text-xs text-muted-foreground">Your API key — stored securely in the database, persists across restarts.</p>
      </div>
      <div className="space-y-2">
        <Label>Endpoint URL (optional)</Label>
        <Input value={form.endpoint} onChange={(e) => setForm({ ...form, endpoint: e.target.value })} placeholder="https://openrouter.ai/api/v1" data-testid="input-provider-endpoint" />
        <p className="text-xs text-muted-foreground">Base URL only — do not include <code className="bg-muted px-1 rounded">/chat/completions</code> at the end. e.g. <code className="bg-muted px-1 rounded">https://api.together.xyz/v1</code></p>
      </div>
      <div className="space-y-2">
        <Label>Model (optional)</Label>
        <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="deepseek/deepseek-v3.2, gpt-4o, claude-3-opus, etc." data-testid="input-provider-model" />
        <p className="text-xs text-muted-foreground">Leave empty to use the default model for the selected type</p>
      </div>
      <div className="space-y-2">
        <Label>Weight</Label>
        <Input type="number" value={form.weight} onChange={(e) => setForm({ ...form, weight: parseInt(e.target.value) || 1 })} />
        <p className="text-xs text-muted-foreground">When multiple providers are active, higher weight = more marking tasks assigned</p>
      </div>
      <Button className="w-full" onClick={() => editingId ? updateProvider.mutate() : addProvider.mutate()} disabled={!form.name || addProvider.isPending || updateProvider.isPending}>
        {editingId ? (updateProvider.isPending ? "Updating..." : "Update Provider") : (addProvider.isPending ? "Adding..." : "Add Provider")}
      </Button>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-medium">AI Providers</h3>
          <p className="text-sm text-muted-foreground">Configure multiple AI providers with custom endpoints and models</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={runProviderTest} disabled={testing || providers.length === 0} title="Test all active providers with 2 dummy questions">
            {testing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <FlaskConical className="w-3 h-3 mr-1" />}
            {testing ? "Testing..." : "Test"}
          </Button>
          <Dialog open={showAdd} onOpenChange={(v) => { setShowAdd(v); if (!v) resetForm(); }}>
            <DialogTrigger asChild><Button size="sm" data-testid="button-add-provider"><Plus className="w-3 h-3 mr-1" />Add Provider</Button></DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editingId ? "Edit AI Provider" : "Add AI Provider"}</DialogTitle></DialogHeader>
              {formContent}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {providers.length === 0 && (
        <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          No AI providers configured. Add one above — paste your API key directly into the form. The key is stored in the database and works on any host (Render, Railway, etc.).
        </div>
      )}

      {providers.map((p: any) => (
        <Card key={p.id} className="shadow-sm" data-testid={`card-provider-${p.id}`}>
          <CardContent className="py-3 px-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="text-sm font-medium">{p.name}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge variant="outline">{p.type}</Badge>
                <span className="text-xs text-muted-foreground">Weight: {p.weight}</span>
                {p.model && <span className="text-xs text-muted-foreground">Model: {p.model}</span>}
                {p.endpoint && <span className="text-xs text-muted-foreground truncate max-w-[200px]">Endpoint: {p.endpoint}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={p.isActive} onCheckedChange={(checked) => toggleProvider.mutate({ id: p.id, isActive: checked })} />
              <Button variant="ghost" size="icon" onClick={() => startEdit(p)} data-testid={`button-edit-provider-${p.id}`}>
                <Pencil className="w-3 h-3" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => deleteProvider.mutate(p.id)}>
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Test results dialog */}
      <Dialog open={showTestDialog} onOpenChange={setShowTestDialog}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Provider Test Results</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground mb-3">Each provider was tested with 2 dummy medical questions.</p>
          <div className="space-y-3">
            {testResults?.length === 0 && (
              <p className="text-sm text-muted-foreground">No active providers to test.</p>
            )}
            {testResults?.map((r: any, i: number) => (
              <div key={i} className={`rounded-md border p-3 ${r.success ? "border-green-500/40 bg-green-50 dark:bg-green-950/20" : "border-red-500/40 bg-red-50 dark:bg-red-950/20"}`}>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  {r.success
                    ? <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
                    : <XCircle className="w-4 h-4 text-red-600 shrink-0" />}
                  <span className="font-medium text-sm">{r.provider}</span>
                  <Badge variant="outline" className="text-xs">{r.model}</Badge>
                </div>
                {r.keySource && (
                  <p className="text-xs text-muted-foreground mb-1">
                    Key: <code className="font-mono">{r.keyPreview}</code> · {r.keyLen} chars · source: {r.keySource}
                  </p>
                )}
                {r.success
                  ? <p className="text-xs text-green-700 dark:text-green-400 font-medium">✓ API call succeeded — this provider is working correctly</p>
                  : <p className="text-xs text-red-700 dark:text-red-400 break-all font-medium">{r.error || "Failed to parse response"}</p>}
                {r.success && r.raw && (
                  <details className="mt-1">
                    <summary className="text-xs text-muted-foreground cursor-pointer">Raw response</summary>
                    <pre className="text-xs mt-1 whitespace-pre-wrap break-all">{r.raw}</pre>
                  </details>
                )}
                {!r.success && r.raw && (
                  <details className="mt-1">
                    <summary className="text-xs text-muted-foreground cursor-pointer">Raw API response (for debugging)</summary>
                    <pre className="text-xs mt-1 whitespace-pre-wrap break-all">{r.raw}</pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmailTemplatesSection({ templates }: { templates: any[] }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState<any>(null);

  const updateTemplate = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/admin/settings/email-templates/${editing.templateKey}`, {
        subject: editing.subject, body: editing.body
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/email-templates"] });
      setEditing(null);
      toast({ title: "Template updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: apiErrorMessage(e), variant: "destructive" })
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-medium">System Email Templates</h3>
          <p className="text-sm text-muted-foreground">
            Manage the content of automated system emails.
          </p>
        </div>
      </div>

      {editing && (
        <Card className="shadow-sm border-primary/10">
          <div className="bg-gradient-to-r from-primary/5 to-transparent px-4 py-2.5 border-b border-primary/5">
            <h4 className="text-sm font-semibold">Editing: {editing.name}</h4>
          </div>
          <CardContent className="p-4 space-y-4">
            <div className="space-y-2"><Label>Template Key</Label><Input value={editing.templateKey} disabled /></div>
            <div className="space-y-2">
              <Label>Subject (max 500 chars)</Label>
              <Input value={editing.subject} maxLength={500} onChange={(e) => setEditing({ ...editing, subject: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Body (max 20,000 chars)</Label>
              <Textarea className="min-h-[200px]" maxLength={20000} value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} />
            </div>
            
            <div className="p-3 bg-muted rounded-md">
              <h5 className="text-xs font-semibold mb-2">Available Placeholders</h5>
              <div className="flex flex-wrap gap-2 text-xs font-mono text-muted-foreground">
                {"{student_name}"}, {"{cohort_end}"}, {"{renew_link}"}, {"{paybill}"}, {"{account_number}"}, {"{reason}"}, {"{reset_code}"}, {"{announcement_title}"}, {"{announcement_message}"}, {"{announcement_link}"}
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={() => updateTemplate.mutate()} disabled={updateTemplate.isPending || !editing.subject || !editing.body}>
                <Save className="w-3 h-3 mr-1" />Save Changes
              </Button>
              <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {templates.map((t: any) => (
          <Card key={t.templateKey} className="shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => setEditing({ ...t })}>
            <CardContent className="py-3 px-4 flex flex-col h-full justify-center">
              <div className="min-w-0 mb-2">
                <p className="text-sm font-medium">{t.name}</p>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">{t.templateKey}</p>
              </div>
              <div className="text-xs text-muted-foreground truncate" title={t.subject}>
                <span className="font-semibold">Subj:</span> {t.subject}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function EmailLogSection() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [templateKey, setTemplateKey] = useState<string>("all");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [status, templateKey]);

  const { data, isLoading } = useQuery({
    queryKey: ["/api/admin/settings/email-log", page, debouncedSearch, status, templateKey],
    queryFn: async () => {
      const p = new URLSearchParams({ page: page.toString(), pageSize: "25" });
      if (debouncedSearch) p.set("search", debouncedSearch);
      if (status !== "all") p.set("status", status);
      if (templateKey !== "all") p.set("templateKey", templateKey);
      const res = await apiRequest("GET", `/api/admin/settings/email-log?${p.toString()}`);
      return res.json();
    }
  });

  const { data: templates } = useQuery<any[]>({ queryKey: ["/api/admin/settings/email-templates"] });
  const { toast } = useToast();
  const [confirmDelete, setConfirmDelete] = useState<null | { id?: number; label: string }>(null);
  const filterParams = () => {
    const p = new URLSearchParams();
    if (debouncedSearch) p.set("search", debouncedSearch);
    if (status !== "all") p.set("status", status);
    if (templateKey !== "all") p.set("templateKey", templateKey);
    return p.toString();
  };
  const deleteLogs = useMutation({
    mutationFn: async (target: { id?: number }) => {
      const res = await apiRequest("DELETE", target.id ? `/api/admin/settings/email-log/${target.id}` : `/api/admin/settings/email-log?${filterParams()}`);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/email-log"] });
      setConfirmDelete(null);
      setPage(1);
      toast({ title: `Deleted ${data.deleted} log entr${data.deleted === 1 ? "y" : "ies"}` });
    },
    onError: (e: any) => toast({ title: "Couldn't delete logs", description: apiErrorMessage(e), variant: "destructive" }),
  });
  const filtered = debouncedSearch || status !== "all" || templateKey !== "all";

  // Resending failed emails: pick rows, or resend every failed email matching the filters.
  const [selected, setSelected] = useState<Set<number>>(new Set());
  useEffect(() => { setSelected(new Set()); }, [page, debouncedSearch, status, templateKey]);
  const resendable: any[] = (data?.items ?? []).filter((item: any) => item.canResend);
  const toggle = (id: number, on: boolean) => setSelected((prev) => {
    const next = new Set(prev);
    if (on) next.add(id); else next.delete(id);
    return next;
  });
  const resend = useMutation({
    mutationFn: async (body: { ids?: number[]; allFailed?: boolean }) => {
      const payload = body.allFailed
        ? { allFailed: true, search: debouncedSearch, templateKey: templateKey === "all" ? "" : templateKey }
        : body;
      const res = await apiRequest("POST", "/api/admin/settings/email-log/resend", payload);
      return res.json();
    },
    onSuccess: (r: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/email-log"] });
      setSelected(new Set());
      const total = r.sent + r.failed + r.skipped;
      toast({
        title: total === 0 ? "Nothing to resend" : `Resent ${r.sent} of ${total} email${total === 1 ? "" : "s"}`,
        description: [r.failed ? `${r.failed} failed again` : "", r.skipped ? `${r.skipped} couldn't be resent` : ""].filter(Boolean).join(" · ") || undefined,
        variant: r.failed || r.skipped ? "destructive" : undefined,
      });
    },
    onError: (e: any) => toast({ title: "Couldn't resend", description: apiErrorMessage(e), variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
        <div>
          <h3 className="font-medium">Email Log</h3>
          <p className="text-sm text-muted-foreground">View sent and failed emails across the system.</p>
        </div>
        <div className="flex flex-wrap gap-2">
        {selected.size > 0 && (
          <Button size="sm" onClick={() => resend.mutate({ ids: Array.from(selected) })} disabled={resend.isPending} data-testid="button-resend-selected">
            {resend.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-1" />}
            Resend selected ({selected.size})
          </Button>
        )}
        {status !== "sent" && data?.total > 0 && (
          <Button variant="outline" size="sm" onClick={() => resend.mutate({ allFailed: true })} disabled={resend.isPending} data-testid="button-resend-all-failed">
            {resend.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-1" />}
            {resend.isPending ? "Resending..." : filtered ? "Resend failed (matching)" : "Resend all failed"}
          </Button>
        )}
        {data?.total > 0 && (
          <Button variant="outline" size="sm" className="text-destructive"
            onClick={() => setConfirmDelete({ label: filtered ? `all ${data.total} matching entries` : `all ${data.total} entries` })}>
            <Trash2 className="w-4 h-4 mr-1" /> {filtered ? "Delete matching" : "Delete all"}
          </Button>
        )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 bg-muted/30 p-3 rounded-lg border">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search by recipient or template..." 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
            className="pl-9 h-9" 
          />
        </div>
        <div className="flex gap-2">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[120px] h-9"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={templateKey} onValueChange={setTemplateKey}>
            <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="Template" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Templates</SelectItem>
              {templates?.map(t => (
                <SelectItem key={t.templateKey} value={t.templateKey}>{t.name}</SelectItem>
              ))}
              <SelectItem value="custom">Custom Messages</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox aria-label="Select all failed emails on this page"
                    disabled={!resendable.length}
                    checked={resendable.length > 0 && resendable.every((item) => selected.has(item.id))}
                    onCheckedChange={(on) => setSelected(on ? new Set(resendable.map((item) => item.id)) : new Set())} />
                </TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Template / Source</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Details</TableHead>
                <TableHead className="w-20"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
              ) : data?.items?.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No email logs found.</TableCell></TableRow>
              ) : (
                data?.items?.map((item: any) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      {item.canResend && (
                        <Checkbox aria-label={`Select email to ${item.recipient}`} checked={selected.has(item.id)}
                          onCheckedChange={(on) => toggle(item.id, on === true)} data-testid={`checkbox-resend-${item.id}`} />
                      )}
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                      {formatNairobi(item.createdAt)}
                    </TableCell>
                    <TableCell className="font-medium text-sm">{item.recipient}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">{item.templateKey}</Badge>
                    </TableCell>
                    <TableCell>
                      {item.status === "sent" ? (
                        <Badge variant="default" className="bg-green-500/10 text-green-700 hover:bg-green-500/20 border-green-200">Sent</Badge>
                      ) : (
                        <Badge variant="destructive">Failed</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate" title={item.error}>
                      {item.error ? (
                        <span className="text-red-600">{item.attempts > 1 ? `Tried ${item.attempts}×: ` : ""}{item.error}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {item.canResend && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Resend to ${item.recipient}`} title="Resend"
                          onClick={() => resend.mutate({ ids: [item.id] })} disabled={resend.isPending} data-testid={`button-resend-${item.id}`}>
                          <RotateCcw className="w-4 h-4 text-primary" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Delete log entry"
                        onClick={() => setConfirmDelete({ id: item.id, label: `the log for ${item.recipient}` })}>
                        <Trash2 className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        
        {data?.total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20">
            <div className="text-xs text-muted-foreground">
              Showing {(page - 1) * data?.pageSize + 1} to {Math.min(page * data?.pageSize, data?.total)} of {data?.total}
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Previous
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setPage(p => p + 1)}
                disabled={page * data?.pageSize >= data?.total}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {confirmDelete?.label}?</AlertDialogTitle>
            <AlertDialogDescription>This permanently removes the log record only; it doesn't affect emails already delivered.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); if (confirmDelete) deleteLogs.mutate({ id: confirmDelete.id }); }}>
              {deleteLogs.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AdminsSection({ admins, isSuperAdmin }: { admins: any[]; isSuperAdmin: boolean }) {
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "examiner" });

  const createAdmin = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/admins", form);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admins"] });
      setShowAdd(false);
      setForm({ name: "", email: "", password: "", role: "examiner" });
      toast({ title: "Admin created" });
    },
    onError: (e: any) => toast({ title: "Error", description: apiErrorMessage(e), variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-medium">Admin Roles</h3>
          <p className="text-sm text-muted-foreground">Manage admin accounts and roles</p>
        </div>
        {isSuperAdmin && (
          <Dialog open={showAdd} onOpenChange={setShowAdd}>
            <DialogTrigger asChild><Button size="sm"><Plus className="w-3 h-3 mr-1" />Add Admin</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Admin</DialogTitle><DialogDescription className="hidden">Create a new admin account</DialogDescription></DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div className="space-y-2"><Label>Password</Label><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="examiner">Examiner</SelectItem>
                      <SelectItem value="reviewer">Reviewer</SelectItem>
                      <SelectItem value="super_admin">Super Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button className="w-full" onClick={() => createAdmin.mutate()} disabled={createAdmin.isPending}>Create Admin</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {admins.map((a: any) => (
        <Card key={a.id}>
          <CardContent className="py-3 flex items-center justify-between gap-3">
            <div><p className="text-sm font-medium">{a.name}</p><p className="text-xs text-muted-foreground">{a.email}</p></div>
            <Badge variant="outline">{a.role.replace("_", " ")}</Badge>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function UniversitiesSection({ universities }: { universities: any[] }) {
  const { toast } = useToast();
  const [newName, setNewName] = useState("");

  const addUniversity = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/universities", { name: newName });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.message || "Failed");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/universities"] });
      setNewName("");
      toast({ title: "University added" });
    },
    onError: (e: any) => toast({ title: "Error", description: apiErrorMessage(e), variant: "destructive" }),
  });

  const deleteUniversity = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/universities/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/universities"] });
      toast({ title: "University removed" });
    },
    onError: () => toast({ title: "Error", description: "Could not remove university", variant: "destructive" }),
  });

  return (
    <div className="max-w-lg space-y-4">
      <Card>
        <CardHeader><h3 className="font-medium flex items-center gap-2"><Building2 className="w-4 h-4" />Manage Universities</h3></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="University name..."
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && newName.trim()) addUniversity.mutate(); }}
              className="h-9"
            />
            <Button size="sm" className="h-9 shrink-0" onClick={() => addUniversity.mutate()} disabled={!newName.trim() || addUniversity.isPending}>
              <Plus className="w-4 h-4 mr-1" />Add
            </Button>
          </div>
          {universities.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No universities yet. Add some above — they'll appear in the student sign-up dropdown.</p>
          ) : (
            <div className="space-y-2">
              {universities.map((u: any) => (
                <div key={u.id} className="flex items-center justify-between gap-2 py-1.5 px-3 rounded-md bg-muted/50">
                  <span className="text-sm">{u.name}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => deleteUniversity.mutate(u.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ChangePasswordSection() {
  const { toast } = useToast();
  const [current, setCurrent] = useState("");
  const [newPass, setNewPass] = useState("");

  const changePassword = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/admin/change-password", { currentPassword: current, newPassword: newPass });
    },
    onSuccess: () => { setCurrent(""); setNewPass(""); toast({ title: "Password changed" }); },
    onError: (e: any) => toast({ title: "Error", description: apiErrorMessage(e), variant: "destructive" }),
  });

  return (
    <div className="max-w-md space-y-4">
      <Card>
        <CardHeader><h3 className="font-medium">Change Password</h3></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2"><Label>Current Password</Label><Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} /></div>
          <div className="space-y-2"><Label>New Password</Label><Input type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} /></div>
          <Button onClick={() => changePassword.mutate()} disabled={!current || !newPass || changePassword.isPending}>
            {changePassword.isPending ? "Changing..." : "Change Password"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function CohortsSection() {
  const { toast } = useToast();
  const { data: cohortsData, isLoading } = useQuery<any>({ queryKey: ["/api/admin/cohorts"] });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ startDate: "", endDate: "", reason: "" });

  const updateCohort = useMutation({
    mutationFn: async () => {
      if (!editingId) return;
      await apiRequest("PATCH", `/api/admin/cohorts/${editingId}`, form);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/cohorts"] });
      setEditingId(null);
      toast({ title: "Cohort updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: apiErrorMessage(e), variant: "destructive" }),
  });

  if (isLoading) return <div className="h-40 bg-muted/20 animate-pulse rounded-lg" />;
  const { current, next, history } = cohortsData || {};

  const openEdit = (c: any) => {
    setEditingId(c.id);
    setForm({ startDate: c.startDate, endDate: c.endDate, reason: "" });
  };

  const renderCohort = (c: any, title: string, canEdit: boolean) => {
    if (!c) return null;
    return (
      <Card key={c.id} className="shadow-sm">
        <CardContent className="py-4 px-5 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h4 className="font-semibold text-sm mb-1">{title}</h4>
            <div className="flex gap-4 text-sm text-muted-foreground">
              <span>Start: {c.startDate}</span>
              <span>End: {c.endDate}</span>
            </div>
          </div>
          {canEdit && (
            <Dialog open={editingId === c.id} onOpenChange={(o) => !o && setEditingId(null)}>
              <DialogTrigger asChild><Button variant="outline" size="sm" onClick={() => openEdit(c)}>Edit</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Edit {title}</DialogTitle></DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="space-y-2"><Label>Start Date (YYYY-MM-DD)</Label><Input type="date" value={form.startDate} onChange={e => setForm({...form, startDate: e.target.value})} /></div>
                  <div className="space-y-2"><Label>End Date (YYYY-MM-DD)</Label><Input type="date" value={form.endDate} onChange={e => setForm({...form, endDate: e.target.value})} /></div>
                  <div className="space-y-2"><Label>Reason for change (Required)</Label><Input value={form.reason} onChange={e => setForm({...form, reason: e.target.value})} placeholder="e.g. Adjusted to align with exams" /></div>
                  <Button className="w-full" disabled={!form.reason || updateCohort.isPending} onClick={() => updateCohort.mutate()}>Save Changes</Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-medium">Manage Cohorts</h3>
        <p className="text-sm text-muted-foreground">Update the current and next membership cohorts. Dates must be YYYY-MM-DD.</p>
      </div>
      <div className="space-y-3">
        {renderCohort(current, `Current: ${cohortName(current)}`, true)}
        {renderCohort(next, `Next: ${cohortName(next)}`, true)}
      </div>
      {history?.length > 0 && (
        <div className="mt-8">
          <h4 className="font-medium text-sm mb-3">History</h4>
          <div className="space-y-2 opacity-75">
            {history.map((h: any) => renderCohort(h, cohortName(h), false))}
          </div>
        </div>
      )}
    </div>
  );
}

function PaymentsSection() {
  const { toast } = useToast();
  const { data: settings, isLoading } = useQuery<any>({ queryKey: ["/api/admin/settings"] });
  const [form, setForm] = useState<any>(null);

  useEffect(() => {
    if (settings && !form) setForm(settings);
  }, [settings, form]);

  const updateSettings = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", "/api/admin/settings", {
        individualPrice: Number(form.individualPrice),
        groupPrice: Number(form.groupPrice),
        graceDays: Number(form.graceDays),
        paybill: form.paybill,
        accountNumber: form.accountNumber,
        bankName: form.bankName
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      toast({ title: "Settings updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: apiErrorMessage(e), variant: "destructive" }),
  });

  if (isLoading || !form) return <div className="h-40 bg-muted/20 animate-pulse rounded-lg" />;

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h3 className="font-medium">Payments & Grace Settings</h3>
        <p className="text-sm text-muted-foreground">Configure global membership pricing and grace period.</p>
      </div>
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Individual Price (KSh)</Label><Input type="number" value={form.individualPrice} onChange={e => setForm({...form, individualPrice: e.target.value})} /></div>
            <div className="space-y-2"><Label>Group Price (KSh)</Label><Input type="number" value={form.groupPrice} onChange={e => setForm({...form, groupPrice: e.target.value})} /></div>
          </div>
          <div className="space-y-2"><Label>Grace Period (Days)</Label><Input type="number" min="0" max="90" value={form.graceDays} onChange={e => setForm({...form, graceDays: e.target.value})} /></div>
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="space-y-2"><Label>Paybill Number</Label><Input value={form.paybill} onChange={e => setForm({...form, paybill: e.target.value})} /></div>
            <div className="space-y-2"><Label>Account Number</Label><Input value={form.accountNumber} onChange={e => setForm({...form, accountNumber: e.target.value})} /></div>
          </div>
          <div className="space-y-2"><Label>Bank Name</Label><Input value={form.bankName} onChange={e => setForm({...form, bankName: e.target.value})} /></div>

          <Button onClick={() => updateSettings.mutate()} disabled={updateSettings.isPending} className="mt-2">
            {updateSettings.isPending ? "Saving..." : "Save Settings"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
