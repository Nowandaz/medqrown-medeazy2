import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { MedQrownBrand } from "@/components/MedQrownBrand";
import { ArrowLeft, Search, Edit, History, AlertCircle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiErrorMessage } from "@/lib/api-error";

export default function AdminMemberships() {
  const [, setLocation] = useLocation();
  
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const queryParams = new URLSearchParams();
  if (search) queryParams.set("search", search);
  if (statusFilter !== "all") queryParams.set("status", statusFilter);

  const { data: memberships, isLoading } = useQuery<any[]>({
    queryKey: [`/api/admin/memberships?${queryParams.toString()}`],
  });

  const { data: cohorts } = useQuery<any>({ queryKey: ["/api/admin/cohorts"] });

  const statusColors: Record<string, string> = {
    active: "bg-green-500/10 text-green-700 border-green-200 dark:border-green-900",
    grace: "bg-yellow-500/10 text-yellow-700 border-yellow-200 dark:border-yellow-900",
    expired: "bg-red-500/10 text-red-700 border-red-200 dark:border-red-900",
    invited: "bg-blue-500/10 text-blue-700 border-blue-200 dark:border-blue-900",
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-primary/3">
      <header className="border-b bg-card/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <MedQrownBrand size="sm" />
          <Link href="/admin/dashboard">
            <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
          </Link>
          <h1 className="text-lg font-bold flex-1">Membership Management</h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">Memberships</h2>
            <p className="text-sm text-muted-foreground">Manage student memberships, cohorts, and validity.</p>
          </div>
          <div className="flex gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search name or email..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-32"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="invited">Invited</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="grace">Grace</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Cohort</TableHead>
                  <TableHead>Validity</TableHead>
                  <TableHead>Classes</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8">Loading...</TableCell></TableRow>
                ) : memberships?.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No memberships found matching the criteria.</TableCell></TableRow>
                ) : memberships?.map(m => (
                  <TableRow key={m.studentId}>
                    <TableCell>
                      <p className="font-medium">{m.studentName}</p>
                      <p className="text-xs text-muted-foreground">{m.studentEmail}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">{m.cohortId ? `Cohort ${m.cohortId}` : "Unassigned"}</Badge>
                    </TableCell>
                    <TableCell>
                      {m.startDate && m.endDate ? (
                        <div className="text-xs">
                          <p className="whitespace-nowrap">From: <span className="font-medium">{m.startDate}</span></p>
                          <p className="whitespace-nowrap">To: <span className="font-medium">{m.endDate}</span></p>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Not set</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {m.classes?.length > 0 ? m.classes.map((c: any) => <Badge key={c.id} variant="secondary" className="text-[10px] truncate max-w-[150px]">{c.name}</Badge>) : <span className="text-xs text-muted-foreground">None</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColors[m.status] || "bg-muted text-muted-foreground border-transparent"}>{m.status.toUpperCase()}</Badge>
                      {m.pendingPayment && <Badge variant="outline" className="ml-2 border-orange-200 text-orange-600 bg-orange-50 dark:bg-orange-950/30 text-[10px]">Pending Payment</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm">Manage</Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                          <DialogHeader><DialogTitle>Manage Membership: {m.studentName}</DialogTitle></DialogHeader>
                          <ManageMembershipTabs m={m} cohorts={cohorts} />
                        </DialogContent>
                      </Dialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      </main>
    </div>
  );
}

function ManageMembershipTabs({ m, cohorts }: { m: any, cohorts: any }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    cohortId: m.cohortId ? String(m.cohortId) : "",
    startDate: m.startDate || "",
    endDate: m.endDate || "",
    reason: ""
  });

  const updateMembership = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", `/api/admin/memberships/${m.studentId}`, {
        cohortId: parseInt(form.cohortId),
        startDate: form.startDate,
        endDate: form.endDate,
        reason: form.reason
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [/\/api\/admin\/memberships/] });
      toast({ title: "Membership updated" });
      setForm({ ...form, reason: "" });
    },
    onError: (e: any) => toast({ title: "Error", description: apiErrorMessage(e), variant: "destructive" }),
  });

  const handleCohortChange = (val: string) => {
    const cId = parseInt(val);
    let start = form.startDate;
    let end = form.endDate;
    if (cohorts) {
      const selected = [cohorts.current, cohorts.next, ...(cohorts.history || [])].find(c => c && c.id === cId);
      if (selected) {
        start = selected.startDate;
        end = selected.endDate;
      }
    }
    setForm({ ...form, cohortId: val, startDate: start, endDate: end });
  };

  const { data: auditLogs, isLoading: auditLoading } = useQuery<any[]>({
    queryKey: [`/api/admin/memberships/${m.studentId}/audit`],
  });

  return (
    <Tabs defaultValue="edit" className="mt-4">
      <TabsList className="mb-4 w-full grid grid-cols-2">
        <TabsTrigger value="edit"><Edit className="w-4 h-4 mr-2" />Edit Details</TabsTrigger>
        <TabsTrigger value="audit"><History className="w-4 h-4 mr-2" />Audit Log</TabsTrigger>
      </TabsList>
      <TabsContent value="edit" className="space-y-4">
        {m.pendingPayment && (
          <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900 rounded p-3 flex gap-2 text-sm text-orange-800 dark:text-orange-400">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <p>This student has a pending payment. You may want to review payments before adjusting dates manually.</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Cohort Assignment</Label>
            <Select value={form.cohortId} onValueChange={handleCohortChange}>
              <SelectTrigger><SelectValue placeholder="Select cohort" /></SelectTrigger>
              <SelectContent>
                {cohorts?.current && <SelectItem value={String(cohorts.current.id)}>Current (Cohort {cohorts.current.id})</SelectItem>}
                {cohorts?.next && <SelectItem value={String(cohorts.next.id)}>Next (Cohort {cohorts.next.id})</SelectItem>}
                {cohorts?.history?.map((h: any) => <SelectItem key={h.id} value={String(h.id)}>History (Cohort {h.id})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Computed Status</Label>
            <div className="pt-2"><Badge variant="outline">{m.status.toUpperCase()}</Badge></div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Start Date Override (YYYY-MM-DD)</Label>
            <Input type="date" value={form.startDate} onChange={e => setForm({...form, startDate: e.target.value})} />
          </div>
          <div className="space-y-2">
            <Label>End Date Override (YYYY-MM-DD)</Label>
            <Input type="date" value={form.endDate} onChange={e => setForm({...form, endDate: e.target.value})} />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Reason for Change (Required)</Label>
          <Input value={form.reason} onChange={e => setForm({...form, reason: e.target.value})} placeholder="Mandatory audit reason..." />
        </div>
        <Button className="w-full" onClick={() => updateMembership.mutate()} disabled={!form.reason || !form.cohortId || updateMembership.isPending}>
          {updateMembership.isPending ? "Saving..." : "Save Membership Updates"}
        </Button>
      </TabsContent>
      <TabsContent value="audit">
        <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
          {auditLoading ? <p className="text-sm text-muted-foreground text-center py-4">Loading audit log...</p> : 
           auditLogs?.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">No audit entries found.</p> :
           auditLogs?.map(log => (
            <Card key={log.id} className="shadow-sm">
              <CardContent className="p-4 space-y-3">
                <div className="flex justify-between items-start border-b pb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                      {log.adminName.charAt(0)}
                    </div>
                    <span className="font-medium text-sm">{log.adminName}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">"{log.reason}"</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="bg-muted/50 rounded p-2">
                    <p className="text-[10px] uppercase text-muted-foreground mb-1 font-sans font-semibold">Previous State</p>
                    <pre className="whitespace-pre-wrap">{JSON.stringify(log.previousValues, null, 2)}</pre>
                  </div>
                  <div className="bg-primary/5 rounded p-2 border border-primary/10">
                    <p className="text-[10px] uppercase text-primary mb-1 font-sans font-semibold">New State</p>
                    <pre className="whitespace-pre-wrap">{JSON.stringify(log.newValues, null, 2)}</pre>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </TabsContent>
    </Tabs>
  );
}