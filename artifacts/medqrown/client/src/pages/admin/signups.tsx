import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { CheckCircle, XCircle, Clock, GraduationCap, Mail, Building2, ShieldCheck, ShieldX, Trash2, UserPlus, PlusCircle, Search } from "lucide-react";
import type { Exam } from "@shared/schema";

interface Signup {
  id: number;
  name: string;
  email: string;
  university: string;
  yearOfStudy: string | null;
  status: string;
  emailVerified: boolean;
  rejectionReason: string | null;
  approvedExamId: number | null;
  createdAt: string;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
  pending_email: { label: "Awaiting Email", variant: "secondary", icon: <Mail className="w-3 h-3" /> },
  pending_approval: { label: "Pending Approval", variant: "outline", icon: <Clock className="w-3 h-3" /> },
  approved: { label: "Approved", variant: "default", icon: <CheckCircle className="w-3 h-3" /> },
  rejected: { label: "Rejected", variant: "destructive", icon: <XCircle className="w-3 h-3" /> },
};

export default function AdminSignups() {
  const { toast } = useToast();
  const [approveTarget, setApproveTarget] = useState<Signup | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Signup | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Signup | null>(null);
  const [addExamTarget, setAddExamTarget] = useState<Signup | null>(null);
  const [selectedExam, setSelectedExam] = useState("");
  const [addExamSelected, setAddExamSelected] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  // Manual enrol form state
  const [enrolName, setEnrolName] = useState("");
  const [enrolEmail, setEnrolEmail] = useState("");
  const [enrolExam, setEnrolExam] = useState("");

  const { data: signups = [], isLoading } = useQuery<Signup[]>({
    queryKey: ["/api/admin/signups"],
    refetchInterval: 30000,
  });

  const { data: exams = [] } = useQuery<Exam[]>({
    queryKey: ["/api/exams"],
  });

  const approveMutation = useMutation({
    mutationFn: async ({ id, examId }: { id: number; examId: number }) => {
      const res = await apiRequest("POST", `/api/admin/signups/${id}/approve`, { examId });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/signups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/exams"] });
      setApproveTarget(null); setSelectedExam("");
      toast({ title: "Student approved", description: "They have been added to the selected exam." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) => {
      const res = await apiRequest("POST", `/api/admin/signups/${id}/reject`, { reason });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/signups"] });
      setRejectTarget(null); setRejectReason("");
      toast({ title: "Application rejected" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/admin/signups/${id}`);
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/signups"] });
      setDeleteTarget(null);
      toast({ title: "Record deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const clearAllMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", "/api/admin/signups/processed");
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/signups"] });
      setConfirmClearAll(false);
      toast({ title: "Cleared", description: `${data.count} processed request${data.count !== 1 ? "s" : ""} deleted.` });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addToExamMutation = useMutation({
    mutationFn: async ({ name, email, examId }: { name: string; email: string; examId: number }) => {
      const res = await apiRequest("POST", "/api/admin/students/enrol", { name, email, examId });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message);
      return d;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exams"] });
      setAddExamTarget(null); setAddExamSelected("");
      toast({ title: "Student added to exam", description: "They can now access the additional exam." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const enrolMutation = useMutation({
    mutationFn: async ({ name, email, examId }: { name: string; email: string; examId: number }) => {
      const res = await apiRequest("POST", "/api/admin/students/enrol", { name, email, examId });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message);
      return d;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/exams"] });
      setEnrolName(""); setEnrolEmail(""); setEnrolExam("");
      toast({ title: "Student enrolled", description: `Password: ${data.password}` });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const baseFiltered = filter === "all" ? signups : signups.filter(s => s.status === filter);
  const filtered = search.trim()
    ? baseFiltered.filter(s =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.email.toLowerCase().includes(search.toLowerCase()) ||
        s.university.toLowerCase().includes(search.toLowerCase())
      )
    : baseFiltered;
  const pendingCount = signups.filter(s => s.status === "pending_approval").length;

  const byUniversity = Object.entries(
    filtered.reduce<Record<string, Signup[]>>((acc, s) => {
      const uni = s.university || "Unknown University";
      (acc[uni] = acc[uni] || []).push(s);
      return acc;
    }, {})
  ).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-primary" />
            Student Sign-Up Requests
            {pendingCount > 0 && (
              <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-900/20">
                {pendingCount} pending
              </Badge>
            )}
          </h2>
          <p className="text-muted-foreground text-sm mt-0.5">Review, approve or reject student applications</p>
        </div>
        <div className="flex items-center gap-2">
          {signups.some(s => s.status === "approved" || s.status === "rejected") && (
            <Button
              variant="outline"
              size="sm"
              className="h-9 text-xs text-destructive border-destructive/30 hover:bg-destructive/10 gap-1.5"
              onClick={() => setConfirmClearAll(true)}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear Processed
            </Button>
          )}
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All ({signups.length})</SelectItem>
              <SelectItem value="pending_approval">Pending ({signups.filter(s => s.status === "pending_approval").length})</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="pending_email">Unverified Email</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, email or university…"
          className="pl-9 h-9 text-sm"
        />
      </div>

      {/* Signup list — grouped by university */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-24 rounded-lg bg-muted/50 animate-pulse" />)}
        </div>
      ) : byUniversity.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center">
            <GraduationCap className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">{search ? "No results match your search." : "No sign-up requests yet."}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {byUniversity.map(([university, signupsInUni]) => (
            <div key={university} className="space-y-2">
              <div className="flex items-center gap-2 pb-1 border-b">
                <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <h3 className="text-sm font-semibold text-foreground">{university}</h3>
                <span className="text-xs text-muted-foreground ml-auto">{signupsInUni.length} student{signupsInUni.length !== 1 ? "s" : ""}</span>
              </div>
              {signupsInUni.map(signup => {
                const sc = statusConfig[signup.status] || statusConfig.pending_email;
                return (
                  <Card key={signup.id} className="border-primary/10 hover:border-primary/20 transition-colors">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="space-y-1.5 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold">{signup.name}</span>
                            <Badge variant={sc.variant} className="flex items-center gap-1 text-xs">
                              {sc.icon} {sc.label}
                            </Badge>
                            {signup.emailVerified && (
                              <span className="flex items-center gap-1 text-green-600 text-xs font-medium">
                                <ShieldCheck className="w-3 h-3" /> Email verified
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                            <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> {signup.email}</span>
                            {signup.yearOfStudy && <span className="text-xs bg-muted px-2 py-0.5 rounded-full">{signup.yearOfStudy}</span>}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Applied {new Date(signup.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </p>
                          {signup.rejectionReason && (
                            <p className="text-xs text-red-500">Reason: {signup.rejectionReason}</p>
                          )}
                        </div>
                        <div className="flex gap-2 shrink-0 flex-wrap">
                          {signup.status === "pending_approval" && (
                            <>
                              <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-900/20"
                                onClick={() => setRejectTarget(signup)}>
                                <ShieldX className="w-3.5 h-3.5 mr-1" /> Reject
                              </Button>
                              <Button size="sm" onClick={() => setApproveTarget(signup)}>
                                <CheckCircle className="w-3.5 h-3.5 mr-1" /> Approve
                              </Button>
                            </>
                          )}
                          {signup.status === "approved" && (
                            <Button size="sm" variant="outline" className="text-primary border-primary/30 hover:bg-primary/5"
                              onClick={() => { setAddExamTarget(signup); setAddExamSelected(""); }}>
                              <PlusCircle className="w-3.5 h-3.5 mr-1" /> Add to Exam
                            </Button>
                          )}
                          <Button size="sm" variant="outline" className="text-red-500 border-red-200 hover:bg-red-50 dark:hover:bg-red-900/20"
                            onClick={() => setDeleteTarget(signup)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Manual enrol section */}
      <Card className="border-primary/10">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-primary" />
            Manually Enrol a Student
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Add any student directly to an exam. If they don't have an account yet, one will be created automatically.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Full Name</Label>
              <Input placeholder="Student's full name" value={enrolName} onChange={e => setEnrolName(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Email Address</Label>
              <Input type="email" placeholder="student@email.com" value={enrolEmail} onChange={e => setEnrolEmail(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Exam</Label>
              <Select value={enrolExam} onValueChange={setEnrolExam}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Choose exam..." />
                </SelectTrigger>
                <SelectContent>
                  {exams.map(e => <SelectItem key={e.id} value={String(e.id)}>{e.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <Button
              size="sm"
              disabled={!enrolEmail || !enrolExam || enrolMutation.isPending}
              onClick={() => enrolMutation.mutate({ name: enrolName, email: enrolEmail, examId: parseInt(enrolExam) })}
            >
              <UserPlus className="w-3.5 h-3.5 mr-1.5" />
              {enrolMutation.isPending ? "Enrolling..." : "Enrol Student"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Approve dialog */}
      <Dialog open={!!approveTarget} onOpenChange={() => { setApproveTarget(null); setSelectedExam(""); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Approve Application</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              Approving <strong>{approveTarget?.name}</strong> — select which exam to enrol them in.
            </p>
            <div className="space-y-2">
              <Label>Assign to Exam</Label>
              <Select value={selectedExam} onValueChange={setSelectedExam}>
                <SelectTrigger><SelectValue placeholder="Choose an exam..." /></SelectTrigger>
                <SelectContent>
                  {exams.map(e => <SelectItem key={e.id} value={String(e.id)}>{e.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => { setApproveTarget(null); setSelectedExam(""); }}>Cancel</Button>
              <Button
                disabled={!selectedExam || approveMutation.isPending}
                onClick={() => approveTarget && approveMutation.mutate({ id: approveTarget.id, examId: parseInt(selectedExam) })}
              >
                {approveMutation.isPending ? "Approving..." : "Approve & Enrol"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={!!rejectTarget} onOpenChange={() => { setRejectTarget(null); setRejectReason(""); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject Application</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              Rejecting <strong>{rejectTarget?.name}</strong>. You can optionally provide a reason.
            </p>
            <div className="space-y-2">
              <Label>Reason (optional)</Label>
              <Input placeholder="e.g. Not enrolled in this programme" value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)} />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => { setRejectTarget(null); setRejectReason(""); }}>Cancel</Button>
              <Button variant="destructive" disabled={rejectMutation.isPending}
                onClick={() => rejectTarget && rejectMutation.mutate({ id: rejectTarget.id, reason: rejectReason })}>
                {rejectMutation.isPending ? "Rejecting..." : "Reject Application"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add to another exam dialog */}
      <Dialog open={!!addExamTarget} onOpenChange={() => { setAddExamTarget(null); setAddExamSelected(""); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add to Another Exam</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              Add <strong>{addExamTarget?.name}</strong> to an additional exam. They'll be able to access it straight away.
            </p>
            <div className="space-y-2">
              <Label>Select Exam</Label>
              <Select value={addExamSelected} onValueChange={setAddExamSelected}>
                <SelectTrigger><SelectValue placeholder="Choose an exam..." /></SelectTrigger>
                <SelectContent>
                  {exams.map(e => <SelectItem key={e.id} value={String(e.id)}>{e.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => { setAddExamTarget(null); setAddExamSelected(""); }}>Cancel</Button>
              <Button
                disabled={!addExamSelected || addToExamMutation.isPending}
                onClick={() => addExamTarget && addToExamMutation.mutate({ name: addExamTarget.name, email: addExamTarget.email, examId: parseInt(addExamSelected) })}
              >
                <PlusCircle className="w-3.5 h-3.5 mr-1.5" />
                {addToExamMutation.isPending ? "Adding..." : "Add to Exam"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Clear all processed confirmation */}
      <AlertDialog open={confirmClearAll} onOpenChange={setConfirmClearAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all processed requests?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all <strong>approved</strong> and <strong>rejected</strong> signup records ({signups.filter(s => s.status === "approved" || s.status === "rejected").length} total).
              Pending requests are not affected. Students who were approved remain fully registered with their exam access — only the application log is cleared.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => clearAllMutation.mutate()}
            >
              {clearAllMutation.isPending ? "Clearing…" : "Clear All Processed"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete Record</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              Permanently delete the sign-up record for <strong>{deleteTarget?.name}</strong>? This cannot be undone.
            </p>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button variant="destructive" disabled={deleteMutation.isPending}
                onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}>
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
