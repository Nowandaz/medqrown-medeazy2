import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Phone, Calendar, Edit, Check, X, AlertTriangle, ShieldCheck } from "lucide-react";
import { AdminNav } from "@/components/admin/admin-nav";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNairobi } from "@/lib/datetime";

type Tab = "Pending" | "Flagged" | "Approved" | "Rejected";
type Plan = "Individual" | "Group";

type PaymentEntry = {
  id: number;
  code?: string;
  studentId: number;
  studentName: string;
  studentEmail: string;
  phone: string | null;
  plan: Plan;
  amount: number;
  source: string;
  status: "pending" | "paid" | "rejected";
  reason: string | null;
  reviewerName: string | null;
  createdAt: string;
  reviewedAt: string | null;
  membershipStatus: string;
};

type PaymentGroup = {
  code: string;
  status: Tab;
  flags: string[];
  plans: Plan[];
  expectedAmount: number;
  sources: string[];
  firstSubmittedAt: string;
  completeness: { count: number; required: number };
  entries: PaymentEntry[];
};

const SOURCE_LABELS: Record<string, string> = { in_app: "In-app renewal", csv: "CSV upload", manual: "Manual" };
const ksh = (amount: number | null | undefined) => `KSh ${Number(amount ?? 0).toLocaleString("en-KE")}`;

function errorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  const json = text.replace(/^\d{3}:\s*/, "");
  try { return JSON.parse(json).message || json; } catch { return json; }
}

export default function AdminPayments() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>("Pending");
  const { data: admin, isLoading: adminLoading } = useQuery<any>({ queryKey: ["/api/admin/me"] });

  useEffect(() => {
    if (!adminLoading && !admin) setLocation("/");
  }, [admin, adminLoading, setLocation]);

  const { data: groups, isLoading } = useQuery<PaymentGroup[]>({
    queryKey: ["/api/admin/payments", { status: activeTab }],
    queryFn: async () => {
      const res = await fetch(`/api/admin/payments?status=${activeTab}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load payments");
      return res.json();
    },
    enabled: !!admin,
  });

  const [selectedEntries, setSelectedEntries] = useState<Set<number>>(new Set());
  const [approveDialog, setApproveDialog] = useState<{ open: boolean; entries: number[] }>({ open: false, entries: [] });
  const [overrideEndDate, setOverrideEndDate] = useState("");
  const [rejectDialog, setRejectDialog] = useState<{ open: boolean; entries: number[] }>({ open: false, entries: [] });
  const [rejectReason, setRejectReason] = useState("");
  const [editDialog, setEditDialog] = useState<{ open: boolean; entry: PaymentEntry | null }>({ open: false, entry: null });
  const [editCode, setEditCode] = useState("");
  const [editPlan, setEditPlan] = useState<Plan>("Individual");
  const { toast } = useToast();

  const reviewable = activeTab === "Pending" || activeTab === "Flagged";

  const toggleEntry = (id: number) => {
    const next = new Set(selectedEntries);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedEntries(next);
  };

  const toggleGroup = (ids: number[]) => {
    const next = new Set(selectedEntries);
    const allSelected = ids.every((id) => next.has(id));
    ids.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
    setSelectedEntries(next);
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/payments"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard"] });
  };

  const approveMutation = useMutation({
    mutationFn: (data: { entryIds: number[]; endDate?: string }) => apiRequest("POST", "/api/admin/payments/approve", data),
    onSuccess: () => {
      refresh();
      setApproveDialog({ open: false, entries: [] });
      setSelectedEntries(new Set());
      toast({ title: "Payments approved", description: "Memberships updated and students notified." });
    },
    onError: (e) => toast({ title: "Approval failed", description: errorMessage(e), variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: (data: { entryIds: number[]; reason: string }) => apiRequest("POST", "/api/admin/payments/reject", data),
    onSuccess: () => {
      refresh();
      setRejectDialog({ open: false, entries: [] });
      setSelectedEntries(new Set());
      toast({ title: "Payments rejected", description: "Students were notified with your reason." });
    },
    onError: (e) => toast({ title: "Rejection failed", description: errorMessage(e), variant: "destructive" }),
  });

  const editMutation = useMutation({
    mutationFn: ({ entryId, data }: { entryId: number; data: { code: string; plan: Plan } }) =>
      apiRequest("PATCH", `/api/admin/payments/${entryId}`, data),
    onSuccess: () => {
      refresh();
      setEditDialog({ open: false, entry: null });
      toast({ title: "Payment entry updated", description: "It has been re-matched to its M-Pesa code group." });
    },
    onError: (e) => toast({ title: "Update failed", description: errorMessage(e), variant: "destructive" }),
  });

  const openApprove = (entries: number[]) => { setOverrideEndDate(""); setApproveDialog({ open: true, entries }); };
  const openReject = (entries: number[]) => { setRejectReason(""); setRejectDialog({ open: true, entries }); };
  const openEdit = (entry: PaymentEntry) => {
    setEditCode(entry.code ?? "");
    setEditPlan(entry.plan);
    setEditDialog({ open: true, entry });
  };

  if (adminLoading || !admin) return null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-primary/3">
      <AdminNav admin={admin} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 pb-28">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Payments</h1>
          <p className="text-muted-foreground text-sm mt-1">Entries are grouped by M-Pesa code. Groups need 4 people; Individual codes need 1.</p>
        </div>

        <div className="flex gap-2 bg-muted/50 p-1 rounded-lg max-w-full w-fit overflow-x-auto no-scrollbar">
          {(["Pending", "Flagged", "Approved", "Rejected"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); setSelectedEntries(new Set()); }}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === tab ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "Pending" && <Calendar className="w-4 h-4" />}
              {tab === "Flagged" && <AlertTriangle className="w-4 h-4" />}
              {tab === "Approved" && <ShieldCheck className="w-4 h-4" />}
              {tab === "Rejected" && <X className="w-4 h-4" />}
              {tab}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-48 w-full" />)}</div>
        ) : !groups || groups.length === 0 ? (
          <Card className="border-dashed shadow-none">
            <CardContent className="py-16 text-center text-muted-foreground">
              No payments in the {activeTab.toLowerCase()} queue.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {groups.map((group) => {
              const pendingIds = group.entries.filter((e) => e.status === "pending").map((e) => e.id);
              const allSelected = pendingIds.length > 0 && pendingIds.every((id) => selectedEntries.has(id));
              const someSelected = pendingIds.some((id) => selectedEntries.has(id)) && !allSelected;
              const { count, required } = group.completeness;
              const complete = count >= required;
              const flagged = group.flags.length > 0;

              return (
                <Card key={group.code} className={`shadow-sm overflow-hidden border-t-4 ${flagged ? "border-t-yellow-500" : activeTab === "Approved" ? "border-t-green-500" : activeTab === "Rejected" ? "border-t-red-500" : "border-t-primary"}`}>
                  <div className="bg-muted/30 px-4 py-3 border-b flex items-start sm:items-center justify-between flex-wrap gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      {reviewable && pendingIds.length > 0 && (
                        <Checkbox
                          className="mt-1.5"
                          aria-label={`Select all pending entries for ${group.code}`}
                          checked={allSelected ? true : someSelected ? "indeterminate" : false}
                          onCheckedChange={() => toggleGroup(pendingIds)}
                        />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-mono font-bold text-lg">{group.code}</h3>
                          <Badge variant="secondary" className={complete
                            ? "bg-green-100 text-green-800 hover:bg-green-100 border-green-200"
                            : "bg-yellow-100 text-yellow-800 hover:bg-yellow-100 border-yellow-200"}>
                            {count}/{required}
                          </Badge>
                          {flagged && <Badge variant="destructive"><AlertTriangle className="w-3 h-3 mr-1" /> Flagged</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {group.plans.join(" + ")} · expected {ksh(group.expectedAmount)}
                          {" · "}{group.sources.map((s) => SOURCE_LABELS[s] || s).join(", ")}
                          {" · "}first {formatNairobi(group.firstSubmittedAt)}
                        </p>
                        {flagged && (
                          <ul className="mt-2 text-xs text-yellow-800 dark:text-yellow-300 space-y-0.5">
                            {group.flags.map((flag) => <li key={flag}>• {flag}</li>)}
                          </ul>
                        )}
                      </div>
                    </div>
                    {reviewable && pendingIds.length > 0 && (
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => openReject(pendingIds)}>Reject all</Button>
                        <Button size="sm" onClick={() => openApprove(pendingIds)}>Approve all</Button>
                      </div>
                    )}
                  </div>
                  <div className="divide-y">
                    {group.entries.map((entry) => (
                      <div key={entry.id} className="p-4 flex flex-col md:flex-row gap-3 justify-between items-start md:items-center">
                        <div className="flex items-start gap-3 min-w-0">
                          {reviewable && entry.status === "pending" && (
                            <Checkbox className="mt-1" aria-label={`Select ${entry.studentName}`}
                              checked={selectedEntries.has(entry.id)} onCheckedChange={() => toggleEntry(entry.id)} />
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="font-medium">{entry.studentName}</span>
                              <Badge variant="outline" className="text-[10px]">{entry.plan}</Badge>
                              <Badge variant="secondary" className="text-[10px] capitalize">{entry.membershipStatus}</Badge>
                              {entry.status !== "pending" && (
                                <Badge variant={entry.status === "paid" ? "default" : "destructive"} className="text-[10px]">
                                  {entry.status === "paid" ? "Approved" : "Rejected"}
                                </Badge>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                              <span className="break-all">{entry.studentEmail}</span>
                              {entry.phone && (
                                <a href={`tel:${entry.phone}`} className="flex items-center gap-1 hover:text-primary transition-colors">
                                  <Phone className="w-3 h-3" /> {entry.phone}
                                </a>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {SOURCE_LABELS[entry.source] || entry.source} · {ksh(entry.amount)} · submitted {formatNairobi(entry.createdAt)}
                            </div>
                            {entry.status !== "pending" && (
                              <div className="text-xs mt-2 p-2 bg-muted rounded-md inline-block">
                                {entry.status === "paid" ? "Approved" : "Rejected"}{entry.reviewerName ? ` by ${entry.reviewerName}` : ""}
                                {entry.reviewedAt ? ` · ${formatNairobi(entry.reviewedAt)}` : ""}
                                {entry.status === "rejected" && entry.reason && <span className="block text-destructive mt-1">Reason: {entry.reason}</span>}
                              </div>
                            )}
                          </div>
                        </div>
                        {entry.status === "pending" && (
                          <Button variant="ghost" size="sm" onClick={() => openEdit({ ...entry, code: group.code })}>
                            <Edit className="w-4 h-4 mr-2" /> Edit code / plan
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      {/* Selected-people actions (e.g. approve 3 of 4 while waiting for the 4th). */}
      {reviewable && selectedEntries.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur px-4 py-3 pr-20 flex items-center justify-between gap-3">
          <span className="text-sm font-medium">{selectedEntries.size} selected</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => openReject(Array.from(selectedEntries))}>
              <X className="w-4 h-4 mr-1" /> Reject
            </Button>
            <Button size="sm" onClick={() => openApprove(Array.from(selectedEntries))}>
              <Check className="w-4 h-4 mr-1" /> Approve
            </Button>
          </div>
        </div>
      )}

      <Dialog open={approveDialog.open} onOpenChange={(o) => !o && setApproveDialog({ open: false, entries: [] })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve {approveDialog.entries.length} payment{approveDialog.entries.length === 1 ? "" : "s"}?</DialogTitle>
            <DialogDescription>
              Memberships are set by the cohort rules and each student is notified by email and in-app.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label htmlFor="overrideDate" className="text-sm font-medium">Override end date (optional)</label>
            <Input id="overrideDate" type="date" value={overrideEndDate} onChange={(e) => setOverrideEndDate(e.target.value)} />
            <p className="text-xs text-muted-foreground">Leave empty to use the automatic cohort end date.</p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setApproveDialog({ open: false, entries: [] })}>Cancel</Button>
            <Button
              onClick={() => approveMutation.mutate({ entryIds: approveDialog.entries, endDate: overrideEndDate || undefined })}
              disabled={approveMutation.isPending}
            >
              {approveMutation.isPending ? "Approving..." : "Confirm approval"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectDialog.open} onOpenChange={(o) => !o && setRejectDialog({ open: false, entries: [] })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject {rejectDialog.entries.length} payment{rejectDialog.entries.length === 1 ? "" : "s"}?</DialogTitle>
            <DialogDescription>The student sees this reason and can submit again.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label htmlFor="rejectReason" className="text-sm font-medium">Reason *</label>
            <Textarea id="rejectReason" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. We couldn't find this code on our statement." className="min-h-[100px]" maxLength={1000} />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRejectDialog({ open: false, entries: [] })}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => rejectMutation.mutate({ entryIds: rejectDialog.entries, reason: rejectReason.trim() })}
              disabled={rejectMutation.isPending || !rejectReason.trim()}
            >
              {rejectMutation.isPending ? "Rejecting..." : "Confirm rejection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editDialog.open} onOpenChange={(o) => !o && setEditDialog({ open: false, entry: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit payment entry</DialogTitle>
            <DialogDescription>
              Fix a mistyped code or change the plan for {editDialog.entry?.studentName}. The entry moves to the matching code group.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="editCode" className="text-sm font-medium">M-Pesa code</label>
              <Input id="editCode" value={editCode} maxLength={14} className="font-mono uppercase"
                onChange={(e) => setEditCode(e.target.value.replace(/\s+/g, "").toUpperCase())} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Plan</label>
              <Select value={editPlan} onValueChange={(v) => setEditPlan(v as Plan)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Individual">Individual</SelectItem>
                  <SelectItem value="Group">Group of 4</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditDialog({ open: false, entry: null })}>Cancel</Button>
            <Button
              onClick={() => editDialog.entry && editMutation.mutate({ entryId: editDialog.entry.id, data: { code: editCode, plan: editPlan } })}
              disabled={editMutation.isPending || !/^[A-Z0-9]{10}$/.test(editCode)}
            >
              {editMutation.isPending ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
