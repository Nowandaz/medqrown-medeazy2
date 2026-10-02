import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams, Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { MedQrownBrand } from "@/components/MedQrownBrand";
import { ArrowLeft, UserPlus, Calendar, Upload, Mail, Download, AlertCircle, CheckCircle2, Plus, Edit, Trash2, Megaphone, MessageSquare, BookOpen, Eye, Clock, Users } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AdminNav } from "@/components/admin/admin-nav";
import { Skeleton } from "@/components/ui/skeleton";
import { MembersTable } from "@/components/admin/members-table";
import { CreateExamDialog } from "@/components/admin/create-exam-dialog";
import { CopyExamDialog } from "@/components/admin/copy-exam-dialog";
import { apiErrorMessage } from "@/lib/api-error";
import { ClassTimetable } from "@/components/admin/class-timetable";

export default function AdminClassDetail() {
  const { id } = useParams<{ id: string }>();
  const classId = parseInt(id || "0", 10);
  const { toast } = useToast();

  const { data: admin, isLoading: adminLoading } = useQuery<any>({ queryKey: ["/api/admin/me"] });

  const { data: overview, isLoading: isLoadingOverview } = useQuery<any>({ 
    queryKey: [`/api/admin/classes/${classId}/overview`],
    enabled: !!classId,
  });

  const { data: members, isLoading: isLoadingMembers } = useQuery<any[]>({
    queryKey: [`/api/admin/classes/${classId}/members`],
    enabled: !!classId,
  });

  const resendInvite = useMutation({
    mutationFn: async (studentId: number) => {
      const res = await apiRequest("POST", `/api/admin/students/${studentId}/resend-invite`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/classes/${classId}/members`] });
      toast({ title: "Invite Resent", description: "A new invite link has been generated." });
    },
    onError: (e: any) => toast({ title: "Error", description: apiErrorMessage(e), variant: "destructive" }),
  });

  if (adminLoading) return null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-primary/3">
      <AdminNav admin={admin} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/admin/classes">
            <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold truncate">{overview?.class?.name || "Class"}</h1>
          </div>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <TabsList className="flex-wrap h-auto gap-1">
              <TabsTrigger value="overview" className="gap-2"><Eye className="w-4 h-4" /> Overview</TabsTrigger>
              <TabsTrigger value="members" className="gap-2"><UserPlus className="w-4 h-4" /> Members</TabsTrigger>
              <TabsTrigger value="exams" className="gap-2"><BookOpen className="w-4 h-4" /> Exams</TabsTrigger>
              <TabsTrigger value="timetable" className="gap-2"><Calendar className="w-4 h-4" /> Timetable</TabsTrigger>
              <TabsTrigger value="announcements" className="gap-2"><Megaphone className="w-4 h-4" /> Announcements</TabsTrigger>
              <TabsTrigger value="feedback" className="gap-2"><MessageSquare className="w-4 h-4" /> Feedback</TabsTrigger>
              <TabsTrigger value="emails" className="gap-2"><Mail className="w-4 h-4" /> Emails</TabsTrigger>
            </TabsList>
            <div className="flex gap-2 shrink-0">
              <ImportCsvDialog classId={classId} />
              <AddStudentDialog classId={classId} />
            </div>
          </div>

          <TabsContent value="overview" className="m-0 space-y-6">
            <ClassOverview overview={overview} loading={isLoadingOverview} />
          </TabsContent>

          <TabsContent value="members" className="space-y-4 m-0">
            <Card>
              <CardContent className="p-0">
                <MembersTable classId={classId} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="exams" className="m-0">
            <ClassExams classId={classId} />
          </TabsContent>

          <TabsContent value="timetable" className="m-0">
            <ClassTimetable classId={classId} />
          </TabsContent>

          <TabsContent value="announcements" className="m-0">
            <ClassAnnouncements classId={classId} />
          </TabsContent>

          <TabsContent value="feedback" className="m-0">
            <ClassFeedback classId={classId} />
          </TabsContent>

          <TabsContent value="emails" className="m-0">
            <ClassEmails classId={classId} members={members || []} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function ClassOverview({ overview, loading }: { overview: any, loading: boolean }) {
  if (loading) return <Skeleton className="h-64" />;
  if (!overview) return null;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Active Members</p>
                <p className="text-2xl font-bold">{overview.memberCounts?.active || 0}</p>
              </div>
              <div className="p-2 bg-green-500/10 rounded-lg">
                <Users className="w-5 h-5 text-green-600" />
              </div>
            </div>
            <div className="mt-4 text-xs text-muted-foreground flex gap-3">
              <span>{overview.memberCounts?.grace || 0} in grace</span>
              <span>{overview.memberCounts?.pending || 0} pending</span>
            </div>
          </CardContent>
        </Card>
      </div>
      
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><Calendar className="w-5 h-5 text-primary"/>Upcoming Exams</CardTitle>
          </CardHeader>
          <CardContent>
            {overview.upcomingExams?.length ? (
              <div className="space-y-4">
                {overview.upcomingExams.map((exam: any) => (
                  <div key={exam.id} className="flex justify-between items-center border-b pb-3 last:border-0 last:pb-0">
                    <div>
                      <p className="font-medium text-sm">{exam.title}</p>
                      <p className="text-xs text-muted-foreground">{new Date(exam.opensAt).toLocaleString()}</p>
                    </div>
                    <Link href={`/admin/exams/${exam.id}`}>
                      <Button variant="ghost" size="sm">Manage</Button>
                    </Link>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground">No upcoming exams.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><Megaphone className="w-5 h-5 text-primary"/>Recent Announcements</CardTitle>
          </CardHeader>
          <CardContent>
            {overview.recentAnnouncements?.length ? (
              <div className="space-y-4">
                {overview.recentAnnouncements.map((ann: any) => (
                  <div key={ann.id} className="border-b pb-3 last:border-0 last:pb-0">
                    <p className="font-medium text-sm">{ann.title}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{ann.message}</p>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground">No recent announcements.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ClassExams({ classId }: { classId: number }) {
  const { data: exams, isLoading } = useQuery<any[]>({
    queryKey: ["/api/exams"]
  });

  const classExams = exams?.filter(e => e.classId === classId) || [];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Class Exams</h3>
        <div className="flex flex-wrap gap-2">
          <CopyExamDialog classId={classId} />
          <CreateExamDialog classId={classId} />
        </div>
      </div>
      
      {isLoading ? (
        <Skeleton className="h-40" />
      ) : !classExams.length ? (
        <Card className="border-dashed"><CardContent className="py-12 text-center text-muted-foreground">No exams yet.</CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {classExams.map((exam) => (
            <Card key={exam.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <h3 className="font-semibold">{exam.title}</h3>
                  <Badge variant={exam.status === "active" ? "default" : "secondary"}>{exam.status}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3"/> {exam.timerMode === "per_question" ? `${exam.perQuestionSeconds}s per question` : `${exam.durationMinutes ?? "—"} min`}</span>
                  <Link href={`/admin/exams/${exam.id}`}>
                    <Button variant="outline" size="sm">Manage Exam</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ClassEmails({ classId, members }: { classId: number, members: any[] }) {
  const { toast } = useToast();
  const [mode, setMode] = useState<"template" | "custom">("template");
  const [templateKey, setTemplateKey] = useState("announcement");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [actualCount, setActualCount] = useState<number | null>(null);
  const [result, setResult] = useState<any>(null);

  const { data: templates } = useQuery<any[]>({ queryKey: ["/api/admin/settings/email-templates"] });

  const currentCount = actualCount !== null ? actualCount : (selectedIds.length > 0 ? selectedIds.length : members.length);

  const sendEmail = useMutation({
    mutationFn: async (countToConfirm: number) => {
      const payload: any = { confirmedCount: countToConfirm };
      if (selectedIds.length > 0) payload.studentIds = selectedIds;
      if (mode === "template") {
        payload.templateKey = templateKey;
      } else {
        payload.subject = subject;
        payload.body = body;
      }
      const res = await fetch(`/api/admin/classes/${classId}/emails`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        throw { status: res.status, data };
      }
      return data;
    },
    onSuccess: (data) => {
      setResult(data);
      setShowConfirm(false);
      setSubject("");
      setBody("");
      setSelectedIds([]);
      setActualCount(null);
    },
    onError: (e: any) => {
      if (e.status === 409 && e.data && typeof e.data.count === 'number') {
        setActualCount(e.data.count);
      } else {
        toast({ title: "Error", description: e.data?.message || e.message || "Failed to send email", variant: "destructive" });
        setShowConfirm(false);
        setActualCount(null);
      }
    }
  });

  const handleOpenConfirm = () => {
    setActualCount(null);
    setResult(null);
    setShowConfirm(true);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Send Email to Class</CardTitle>
          <CardDescription>Send an email to all active members or selected members.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Message Type</Label>
            <RadioGroup value={mode} onValueChange={(v: "template"|"custom") => setMode(v)} className="flex gap-4">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="template" id="t-template" />
                <Label htmlFor="t-template">Use Template</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="custom" id="t-custom" />
                <Label htmlFor="t-custom">Custom Message</Label>
              </div>
            </RadioGroup>
          </div>

          {mode === "template" ? (
            <div className="space-y-2">
              <Label>Template</Label>
              <Select value={templateKey} onValueChange={setTemplateKey}>
                <SelectTrigger><SelectValue placeholder="Select template..." /></SelectTrigger>
                <SelectContent>
                  {templates?.map(t => (
                    <SelectItem key={t.templateKey} value={t.templateKey}>{t.name} ({t.subject})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Subject</Label>
                <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Email subject..." />
              </div>
              <div className="space-y-2">
                <Label>Message</Label>
                <Textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Write your message here. You can use placeholders like {student_name}." className="h-32" />
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label>Recipients (Leave blank for all {members.length} members)</Label>
            <Select onValueChange={v => { if (!selectedIds.includes(parseInt(v))) setSelectedIds([...selectedIds, parseInt(v)]) }}>
              <SelectTrigger><SelectValue placeholder="Select specific members (optional)" /></SelectTrigger>
              <SelectContent>
                {members.map(m => (
                  <SelectItem key={m.id} value={m.id.toString()}>{m.name} ({m.email})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedIds.length > 0 && (
              <div className="flex gap-2 flex-wrap mt-2">
                {selectedIds.map(id => {
                  const m = members.find(x => x.id === id);
                  return (
                    <Badge key={id} variant="secondary" className="cursor-pointer" onClick={() => setSelectedIds(selectedIds.filter(x => x !== id))}>
                      {m?.name} <span className="ml-1 text-muted-foreground">×</span>
                    </Badge>
                  );
                })}
              </div>
            )}
          </div>

          <Button 
            onClick={handleOpenConfirm} 
            disabled={(mode === "custom" && (!subject || !body)) || (mode === "template" && !templateKey)}
          >
            Review & Send
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card className="border-green-200 bg-green-50/50 dark:bg-green-950/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-green-800 dark:text-green-400 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              Email Campaign Finished
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-6 mb-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-2xl font-bold">{result.total}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Sent</p>
                <p className="text-2xl font-bold text-green-600">{result.sent}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Failed</p>
                <p className={`text-2xl font-bold ${result.failed > 0 ? "text-red-600" : "text-muted-foreground"}`}>{result.failed}</p>
              </div>
            </div>

            {result.failed > 0 && (
              <div className="space-y-2 mt-4">
                <p className="font-medium text-sm text-red-800">Failed Deliveries:</p>
                <div className="max-h-40 overflow-y-auto space-y-2">
                  {result.results.filter((r: any) => r.status === "failed").map((r: any, i: number) => (
                    <div key={i} className="text-xs p-2 rounded bg-red-100/50 text-red-900 border border-red-200">
                      <span className="font-semibold">{r.email}</span>: {r.error}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Email Send</DialogTitle>
            <DialogDescription>
              Please review the recipient count before sending.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {actualCount !== null ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-amber-900 text-sm">
                <AlertCircle className="w-4 h-4 inline mr-2 -mt-0.5" />
                The server reported that exactly <strong>{actualCount}</strong> recipients will receive this email. Do you want to proceed?
              </div>
            ) : (
              <p className="text-sm">
                You are about to send this email to <strong>{currentCount}</strong> recipient{currentCount !== 1 ? 's' : ''}.
              </p>
            )}
            
            <div className="p-3 bg-muted rounded-md space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Mode:</span> <span>{mode === "template" ? "Template" : "Custom Message"}</span></div>
              {mode === "template" ? (
                <div className="flex justify-between"><span className="text-muted-foreground">Template:</span> <span>{templateKey}</span></div>
              ) : (
                <div className="flex justify-between"><span className="text-muted-foreground">Subject:</span> <span className="truncate max-w-[200px]">{subject}</span></div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirm(false)}>Cancel</Button>
            <Button onClick={() => sendEmail.mutate(currentCount)} disabled={sendEmail.isPending}>
              {sendEmail.isPending ? "Sending..." : "Confirm & Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AddStudentDialog({ classId }: { classId: number }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const [type, setType] = useState<"paid" | "complimentary">("paid");
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    code: "",
    plan: "Individual",
    verified: true,
    note: "",
    endDate: "",
  });

  const addStudent = useMutation({
    mutationFn: async () => {
      const payload: any = {
        fullName: form.fullName,
        email: form.email,
        phone: form.phone,
        verified: form.verified,
      };
      
      if (type === "complimentary") {
        payload.complimentary = true;
        payload.note = form.note;
        payload.endDate = form.endDate;
      } else {
        payload.code = form.code;
        payload.plan = form.plan;
      }
      
      const res = await apiRequest("POST", `/api/admin/classes/${classId}/members`, payload);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/classes/${classId}/members`] });
      setOpen(false);
      toast({ title: "Student Added", description: "The student has been added to the class." });
      setForm({ fullName: "", email: "", phone: "", code: "", plan: "Individual", verified: true, note: "", endDate: "" });
    },
    onError: (e: any) => toast({ title: "Error", description: apiErrorMessage(e), variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><UserPlus className="w-4 h-4 mr-2" /> Add Student</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Student</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label>Full Name</Label>
            <Input value={form.fullName} onChange={e => setForm({...form, fullName: e.target.value})} placeholder="Jane Doe" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="jane@example.com" />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="+254..." />
            </div>
          </div>

          <div className="pt-2">
            <Label className="mb-2 block">Membership Type</Label>
            <RadioGroup value={type} onValueChange={(v: "paid"|"complimentary") => setType(v)} className="flex gap-4">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="paid" id="paid" />
                <Label htmlFor="paid">Paid (M-PESA)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="complimentary" id="comp" />
                <Label htmlFor="comp">Complimentary</Label>
              </div>
            </RadioGroup>
          </div>

          {type === "paid" ? (
            <div className="grid grid-cols-2 gap-4 border rounded-md p-3 bg-muted/30">
              <div className="space-y-2">
                <Label>M-PESA Code</Label>
                <Input value={form.code} onChange={e => setForm({...form, code: e.target.value})} placeholder="e.g. QWE123RTY4" />
              </div>
              <div className="space-y-2">
                <Label>Plan</Label>
                <Select value={form.plan} onValueChange={v => setForm({...form, plan: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Individual">Individual</SelectItem>
                    <SelectItem value="Group">Group</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div className="space-y-4 border rounded-md p-3 bg-muted/30">
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input type="date" value={form.endDate} onChange={e => setForm({...form, endDate: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Note / Reason</Label>
                <Textarea value={form.note} onChange={e => setForm({...form, note: e.target.value})} placeholder="Reason for complimentary access..." className="h-20" />
              </div>
            </div>
          )}

          <div className="flex items-center space-x-2 pt-2">
            <Checkbox id="verified" checked={form.verified} onCheckedChange={(c) => setForm({...form, verified: !!c})} />
            <Label htmlFor="verified" className="text-sm font-normal">
              Mark as verified (grant immediate access)
            </Label>
          </div>
        </div>
        <DialogFooter className="mt-6">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => addStudent.mutate()} disabled={addStudent.isPending || !form.fullName || !form.email}>
            Add Student
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportCsvDialog({ classId }: { classId: number }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [step, setStep] = useState<1 | 2>(1);
  const [csvContent, setCsvContent] = useState("");
  const [previewData, setPreviewData] = useState<any>(null);
  const [verified, setVerified] = useState(true);

  const previewMutation = useMutation({
    mutationFn: async (csv: string) => {
      const res = await apiRequest("POST", `/api/admin/classes/${classId}/members/import-preview`, { csv });
      return await res.json();
    },
    onSuccess: (data) => {
      setPreviewData(data);
      setVerified(data.verifiedDefault ?? true);
      setStep(2);
    },
    onError: (e: any) => toast({ title: "Preview Error", description: apiErrorMessage(e), variant: "destructive" }),
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/classes/${classId}/members/import-confirm`, { 
        csv: csvContent, 
        verified 
      });
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/classes/${classId}/members`] });
      toast({ 
        title: "Import Complete", 
        description: `Successfully imported ${data.imported} members.` 
      });
      
      if (data.errorReport) {
        downloadErrorReport(data.errorReport);
      }
      
      handleClose();
    },
    onError: (e: any) => toast({ title: "Import Error", description: apiErrorMessage(e), variant: "destructive" }),
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvContent(text);
      previewMutation.mutate(text);
    };
    reader.readAsText(file);
  };

  const downloadErrorReport = (reportText: string) => {
    const blob = new Blob([reportText], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `import-errors-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleClose = () => {
    setOpen(false);
    setTimeout(() => {
      setStep(1);
      setCsvContent("");
      setPreviewData(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }, 200);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); else setOpen(true); }}>
      <DialogTrigger asChild>
        <Button variant="outline"><Upload className="w-4 h-4 mr-2" /> Import CSV</Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Import Members via CSV</DialogTitle>
        </DialogHeader>
        
        {step === 1 ? (
          <div className="py-12 flex flex-col items-center justify-center border-2 border-dashed rounded-lg bg-muted/10 mt-4">
            <Upload className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-1">Upload CSV File</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm text-center">
              The file must have exactly this header row:<br />
              <code className="bg-muted px-1.5 py-0.5 rounded text-xs mt-2 inline-block">full_name,email,phone,mpesa_code,plan</code>
            </p>
            <input 
              type="file" 
              accept=".csv" 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
            />
            <Button onClick={() => fileInputRef.current?.click()} disabled={previewMutation.isPending}>
              {previewMutation.isPending ? "Analyzing..." : "Select File"}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col flex-1 min-h-0 mt-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium">Preview ({previewData?.rows?.length || 0} rows found)</h3>
              {previewData?.errorReport && (
                <Button variant="outline" size="sm" onClick={() => downloadErrorReport(previewData.errorReport)}>
                  <Download className="w-4 h-4 mr-2" /> Download Error Report
                </Button>
              )}
            </div>

            <ScrollArea className="flex-1 border rounded-md">
              <Table>
                <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
                  <TableRow>
                    <TableHead className="w-[50px]">#</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email / Phone</TableHead>
                    <TableHead>Code / Plan</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewData?.rows?.map((row: any, i: number) => (
                    <TableRow key={i} className={row.classification === "Error" ? "bg-red-50/50 hover:bg-red-50" : ""}>
                      <TableCell className="text-muted-foreground">{row.rowNumber}</TableCell>
                      <TableCell className="font-medium">{row.full_name}</TableCell>
                      <TableCell>
                        <div className="text-sm">{row.email}</div>
                        <div className="text-xs text-muted-foreground">{row.phone}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{row.mpesa_code}</div>
                        <div className="text-xs text-muted-foreground">{row.plan}</div>
                      </TableCell>
                      <TableCell>
                        {row.classification === "Error" ? (
                          <div className="flex items-start text-red-600 gap-1.5">
                            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                            <span className="text-xs">{row.errors?.join(", ")}</span>
                          </div>
                        ) : row.classification === "Existing student" ? (
                          <div className="flex items-center text-blue-600 gap-1.5 text-xs font-medium">
                            <UserPlus className="w-4 h-4" /> Existing User
                          </div>
                        ) : (
                          <div className="flex items-center text-green-600 gap-1.5 text-xs font-medium">
                            <CheckCircle2 className="w-4 h-4" /> New User
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>

            <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 border-t pt-4">
              <div className="flex items-center space-x-2 bg-muted/30 p-2 rounded-md border">
                <Checkbox id="verify-all" checked={verified} onCheckedChange={(c) => setVerified(!!c)} />
                <Label htmlFor="verify-all" className="text-sm font-normal cursor-pointer">
                  Mark all valid rows as verified (grant immediate access)
                </Label>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <Button variant="outline" onClick={() => setStep(1)} className="flex-1 sm:flex-none">Back</Button>
                <Button onClick={() => confirmMutation.mutate()} disabled={confirmMutation.isPending} className="flex-1 sm:flex-none">
                  {confirmMutation.isPending ? "Importing..." : "Confirm Import"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ClassAnnouncements({ classId }: { classId: number }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ title: "", message: "", link: "" });

  const { data: announcements, isLoading } = useQuery<any[]>({
    queryKey: [`/api/admin/classes/${classId}/announcements`],
    enabled: !!classId,
  });

  const saveAnnouncement = useMutation({
    mutationFn: async () => {
      if (editingId) {
        const res = await apiRequest("PATCH", `/api/admin/classes/${classId}/announcements/${editingId}`, form);
        return await res.json();
      } else {
        const res = await apiRequest("POST", `/api/admin/classes/${classId}/announcements`, form);
        return await res.json();
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/classes/${classId}/announcements`] });
      setOpen(false);
      if (data.delivery) {
        toast({ 
          title: "Announcement Sent", 
          description: `Recipients: ${data.delivery.recipients}, Push Sent: ${data.delivery.pushSent}, Email Sent: ${data.delivery.emailSent}`
        });
      } else {
        toast({ title: "Announcement Updated" });
      }
      setForm({ title: "", message: "", link: "" });
      setEditingId(null);
    },
    onError: (e: any) => toast({ title: "Error", description: apiErrorMessage(e), variant: "destructive" }),
  });

  const deleteAnnouncement = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/admin/classes/${classId}/announcements/${id}`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/classes/${classId}/announcements`] });
      toast({ title: "Announcement Deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: apiErrorMessage(e), variant: "destructive" }),
  });

  const handleEdit = (ann: any) => {
    setForm({ title: ann.title, message: ann.message, link: ann.link || "" });
    setEditingId(ann.id);
    setOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">Announcements</h3>
          <p className="text-sm text-muted-foreground">Broadcast messages to class members.</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => {
          setOpen(o);
          if (!o) { setForm({ title: "", message: "", link: "" }); setEditingId(null); }
        }}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> New Announcement</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Announcement" : "Create Announcement"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="Important Update" />
              </div>
              <div className="space-y-2">
                <Label>Message</Label>
                <Textarea value={form.message} onChange={e => setForm({...form, message: e.target.value})} placeholder="Write your message here..." className="h-32" />
              </div>
              <div className="space-y-2">
                <Label>Link (Optional)</Label>
                <Input value={form.link} onChange={e => setForm({...form, link: e.target.value})} placeholder="https://..." />
              </div>
            </div>
            <DialogFooter className="mt-6">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => saveAnnouncement.mutate()} disabled={saveAnnouncement.isPending || !form.title || !form.message}>
                {saveAnnouncement.isPending ? "Saving..." : (editingId ? "Save Changes" : "Send Announcement")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-muted-foreground">Loading announcements...</div>
      ) : !announcements?.length ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground">
            No announcements yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {announcements.map((ann: any) => (
            <Card key={ann.id}>
              <CardHeader className="pb-3 flex flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle className="text-lg">{ann.title}</CardTitle>
                  <CardDescription>{new Date(ann.createdAt).toLocaleString()}</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="icon" onClick={() => handleEdit(ann)}>
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-destructive" onClick={() => {
                    if (confirm("Are you sure you want to delete this announcement?")) {
                      deleteAnnouncement.mutate(ann.id);
                    }
                  }}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm">{ann.message}</p>
                {ann.link && (
                  <a href={ann.link} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-sm inline-flex items-center gap-1 mt-4">
                    {ann.link}
                  </a>
                )}
                {ann.delivery && (
                  <div className="mt-4 pt-4 border-t text-xs text-muted-foreground grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div>Recipients: <span className="font-medium">{ann.delivery.recipients}</span></div>
                    <div>In-App: <span className="font-medium">{ann.delivery.inAppSent}</span></div>
                    <div>Push: <span className="font-medium">{ann.delivery.pushSent}</span></div>
                    <div>Email: <span className="font-medium">{ann.delivery.emailSent}</span></div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ClassFeedback({ classId }: { classId: number }) {
  const [type, setType] = useState<"all" | "general" | "exam">("all");
  const [examId, setExamId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const queryUrl = new URL(`/api/admin/classes/${classId}/feedback`, window.location.origin);
  if (type !== "all") queryUrl.searchParams.set("type", type);
  if (type === "exam" && examId) queryUrl.searchParams.set("examId", examId);
  if (dateFrom) queryUrl.searchParams.set("from", dateFrom);
  if (dateTo) queryUrl.searchParams.set("to", dateTo);

  const { data: feedback, isLoading } = useQuery<any[]>({
    queryKey: [queryUrl.pathname + queryUrl.search],
    enabled: !!classId,
  });
  
  const { data: exams } = useQuery<any[]>({
    queryKey: [`/api/admin/classes/${classId}/exams`],
    enabled: !!classId,
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-lg font-medium">Student Feedback</h3>
          <p className="text-sm text-muted-foreground">View feedback submitted by class members.</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="space-y-1">
          <Label>Type</Label>
          <Select value={type} onValueChange={(v: any) => { setType(v); if(v !== "exam") setExamId(""); }}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Feedback</SelectItem>
              <SelectItem value="general">General Only</SelectItem>
              <SelectItem value="exam">Exam Only</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {type === "exam" && (
          <div className="space-y-1">
            <Label>Exam</Label>
            <Select value={examId} onValueChange={setExamId}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="All exams" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Exams</SelectItem>
                {exams?.map(e => <SelectItem key={e.id} value={e.id.toString()}>{e.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1">
          <Label>From</Label>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-[150px]" />
        </div>
        <div className="space-y-1">
          <Label>To</Label>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-[150px]" />
        </div>
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-muted-foreground">Loading feedback...</div>
      ) : !feedback?.length ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground">
            No feedback matches your filters.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {feedback.map((fb: any) => (
            <Card key={fb.id}>
              <CardContent className="pt-6">
                <div className="flex justify-between items-start mb-2">
                  <div className="font-medium">{fb.studentName || "Anonymous"}</div>
                  <Badge variant="outline">{fb.type === "exam" ? "Exam" : "General"}</Badge>
                </div>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap mb-4">{fb.message}</p>
                <div className="text-xs text-muted-foreground flex gap-4">
                  <span>{new Date(fb.createdAt).toLocaleString()}</span>
                  {fb.examTitle && <span>Exam: {fb.examTitle}</span>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
