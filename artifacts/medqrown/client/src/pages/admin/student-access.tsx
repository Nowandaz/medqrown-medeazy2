import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Check, ClipboardCheck, Globe2, Plus, ShieldCheck, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Domain = { id: number; domain: string; label?: string; isActive: boolean };
type Unit = { id: number; code: string; name: string; description?: string; isActive: boolean; enrolmentCount: number; examCount: number };
type Exam = { id: number; title: string; unitId?: number | null };
type ExamRequest = { id: number; status: string; createdAt: string; examId: number; examTitle: string; unitCode?: string; studentName: string; studentEmail: string; university?: string };
type ProfileRequest = { id: number; status: string; createdAt: string; studentName: string; studentEmail: string; fieldName: string; requestedValue: string; reason?: string };

const request = (method: string, url: string, body?: unknown) => apiRequest(method, url, body).then((r) => r.json());

export default function AdminStudentAccess() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [domain, setDomain] = useState("");
  const [label, setLabel] = useState("");
  const [unitCode, setUnitCode] = useState("");
  const [unitName, setUnitName] = useState("");
  const [unitDescription, setUnitDescription] = useState("");

  const { data: domains = [] } = useQuery<Domain[]>({ queryKey: ["/api/admin/allowed-domains"] });
  const { data: units = [] } = useQuery<Unit[]>({ queryKey: ["/api/admin/units"] });
  const { data: exams = [] } = useQuery<Exam[]>({ queryKey: ["/api/exams"] });
  const { data: examRequests = [] } = useQuery<ExamRequest[]>({ queryKey: ["/api/admin/exam-access-requests"] });
  const { data: profileRequests = [] } = useQuery<ProfileRequest[]>({ queryKey: ["/api/admin/profile-change-requests"] });
  const refresh = () => queryClient.invalidateQueries();

  const addDomain = useMutation({
    mutationFn: () => request("POST", "/api/admin/allowed-domains", { domain, label }),
    onSuccess: () => { setDomain(""); setLabel(""); refresh(); toast({ title: "School email domain saved" }); },
    onError: (error: Error) => toast({ title: "Could not save domain", description: error.message, variant: "destructive" }),
  });
  const addUnit = useMutation({
    mutationFn: () => request("POST", "/api/admin/units", { code: unitCode, name: unitName, description: unitDescription }),
    onSuccess: () => { setUnitCode(""); setUnitName(""); setUnitDescription(""); refresh(); toast({ title: "Unit created" }); },
    onError: (error: Error) => toast({ title: "Could not create unit", description: error.message, variant: "destructive" }),
  });
  const changeExamUnit = useMutation({
    mutationFn: ({ examId, unitId }: { examId: number; unitId?: number }) => request("PATCH", `/api/admin/exams/${examId}/unit`, { unitId }),
    onSuccess: refresh,
  });
  const handleExamRequest = useMutation({
    mutationFn: ({ id, decision }: { id: number; decision: "approve" | "reject" }) => request("POST", `/api/admin/exam-access-requests/${id}/${decision}`),
    onSuccess: () => { refresh(); toast({ title: "Exam request updated" }); },
  });
  const handleProfileRequest = useMutation({
    mutationFn: ({ id, decision }: { id: number; decision: "approve" | "reject" }) => request("POST", `/api/admin/profile-change-requests/${id}/${decision}`),
    onSuccess: () => { refresh(); toast({ title: "Profile request updated" }); },
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-primary/5">
      <header className="border-b bg-card/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-4 sm:px-6">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/admin/dashboard")} aria-label="Back to dashboard"><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <h1 className="text-lg font-bold">Student Access</h1>
            <p className="text-xs text-muted-foreground">School eligibility, units, and approval queues</p>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <Tabs defaultValue="domains">
          <TabsList className="mb-6 grid w-full max-w-2xl grid-cols-3">
            <TabsTrigger value="domains">Eligibility</TabsTrigger>
            <TabsTrigger value="units">Units & exams</TabsTrigger>
            <TabsTrigger value="requests">Requests</TabsTrigger>
          </TabsList>

          <TabsContent value="domains" className="space-y-6">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Globe2 className="h-5 w-5 text-primary" />Approved school domains</CardTitle><CardDescription>Only verified emails from active domains can create student accounts.</CardDescription></CardHeader>
              <CardContent>
                <form className="grid gap-3 md:grid-cols-[1fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); addDomain.mutate(); }}>
                  <Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="school.edu or medschool.ac.ke" required />
                  <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Optional school name" />
                  <Button disabled={addDomain.isPending}><Plus className="mr-2 h-4 w-4" />Add domain</Button>
                </form>
                <div className="mt-6 divide-y rounded-lg border">
                  {!domains.length && <p className="p-5 text-sm text-muted-foreground">No approved domains yet. Add one before opening student registration.</p>}
                  {domains.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-4 p-4">
                      <div><p className="font-medium">{item.domain}</p><p className="text-xs text-muted-foreground">{item.label || "No label"}</p></div>
                      <div className="flex items-center gap-2">
                        <Badge variant={item.isActive ? "default" : "secondary"}>{item.isActive ? "Active" : "Paused"}</Badge>
                        <Button size="sm" variant="outline" onClick={() => request("PATCH", `/api/admin/allowed-domains/${item.id}`, { isActive: !item.isActive }).then(refresh)}>{item.isActive ? "Pause" : "Activate"}</Button>
                        <Button size="icon" variant="ghost" onClick={() => request("DELETE", `/api/admin/allowed-domains/${item.id}`).then(refresh)} aria-label={`Delete ${item.domain}`}><X className="h-4 w-4" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="units" className="space-y-6">
            <Card>
              <CardHeader><CardTitle>Publish a unit</CardTitle><CardDescription>Students can freely enrol in active units; individual official exams still require approval.</CardDescription></CardHeader>
              <CardContent>
                <form className="grid gap-3 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); addUnit.mutate(); }}>
                  <div><Label>Unit code</Label><Input value={unitCode} onChange={(e) => setUnitCode(e.target.value)} placeholder="MED 301" required /></div>
                  <div><Label>Unit name</Label><Input value={unitName} onChange={(e) => setUnitName(e.target.value)} placeholder="Internal Medicine" required /></div>
                  <div className="md:col-span-2"><Label>Description</Label><Input value={unitDescription} onChange={(e) => setUnitDescription(e.target.value)} placeholder="Optional summary for students" /></div>
                  <Button className="w-fit" disabled={addUnit.isPending}>Create unit</Button>
                </form>
              </CardContent>
            </Card>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card><CardHeader><CardTitle className="text-base">Units</CardTitle></CardHeader><CardContent className="space-y-3">
                {!units.length && <p className="text-sm text-muted-foreground">No units created yet.</p>}
                {units.map((unit) => <div key={unit.id} className="rounded-lg border p-3"><div className="flex justify-between gap-3"><div><p className="font-semibold">{unit.code} · {unit.name}</p><p className="text-xs text-muted-foreground">{unit.enrolmentCount} students · {unit.examCount} exams</p></div><Badge variant={unit.isActive ? "default" : "secondary"}>{unit.isActive ? "Active" : "Paused"}</Badge></div></div>)}
              </CardContent></Card>
              <Card><CardHeader><CardTitle className="text-base">Attach official exams</CardTitle><CardDescription>Only exams attached to a unit appear to enrolled students.</CardDescription></CardHeader><CardContent className="space-y-3">
                {!exams.length && <p className="text-sm text-muted-foreground">Create an exam first.</p>}
                {exams.map((exam) => <div key={exam.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"><span className="text-sm font-medium">{exam.title}</span><Select value={exam.unitId ? String(exam.unitId) : "none"} onValueChange={(value) => changeExamUnit.mutate({ examId: exam.id, unitId: value === "none" ? undefined : Number(value) })}><SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="No unit" /></SelectTrigger><SelectContent><SelectItem value="none">No unit</SelectItem>{units.map((unit) => <SelectItem value={String(unit.id)} key={unit.id}>{unit.code}</SelectItem>)}</SelectContent></Select></div>)}
              </CardContent></Card>
            </div>
          </TabsContent>

          <TabsContent value="requests" className="space-y-6">
            <Card><CardHeader><CardTitle className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-primary" />Exam access requests</CardTitle><CardDescription>Approve access to create the student’s individual official-exam enrolment.</CardDescription></CardHeader><CardContent className="space-y-3">
              {!examRequests.length && <p className="text-sm text-muted-foreground">No exam-access requests yet.</p>}
              {examRequests.map((item) => <div key={item.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">{item.studentName} <span className="font-normal text-muted-foreground">· {item.studentEmail}</span></p><p className="text-sm text-muted-foreground">{item.unitCode ? `${item.unitCode} · ` : ""}{item.examTitle}</p></div><div className="flex items-center gap-2"><Badge variant={item.status === "approved" ? "default" : item.status === "rejected" ? "destructive" : "secondary"}>{item.status}</Badge>{item.status === "pending" && <><Button size="sm" onClick={() => handleExamRequest.mutate({ id: item.id, decision: "approve" })}><Check className="mr-1 h-4 w-4" />Approve</Button><Button size="sm" variant="outline" onClick={() => handleExamRequest.mutate({ id: item.id, decision: "reject" })}>Decline</Button></>}</div></div>)}
            </CardContent></Card>
            <Card><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" />Identity change requests</CardTitle><CardDescription>Approved requests update the verified student identity record.</CardDescription></CardHeader><CardContent className="space-y-3">
              {!profileRequests.length && <p className="text-sm text-muted-foreground">No profile-change requests yet.</p>}
              {profileRequests.map((item) => <div key={item.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">{item.studentName} <span className="font-normal text-muted-foreground">· {item.studentEmail}</span></p><p className="text-sm text-muted-foreground">Change {item.fieldName} to <span className="font-medium text-foreground">{item.requestedValue}</span></p>{item.reason && <p className="mt-1 text-xs text-muted-foreground">{item.reason}</p>}</div><div className="flex items-center gap-2"><Badge variant={item.status === "approved" ? "default" : item.status === "rejected" ? "destructive" : "secondary"}>{item.status}</Badge>{item.status === "pending" && <><Button size="sm" onClick={() => handleProfileRequest.mutate({ id: item.id, decision: "approve" })}><Check className="mr-1 h-4 w-4" />Approve</Button><Button size="sm" variant="outline" onClick={() => handleProfileRequest.mutate({ id: item.id, decision: "reject" })}>Decline</Button></>}</div></div>)}
            </CardContent></Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}