import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle2, Flag, Loader2, XCircle } from "lucide-react";
import { MedQrownBrand } from "@/components/MedQrownBrand";
import { useToast } from "@/hooks/use-toast";

type Report = {
  id: number;
  reason: string;
  status: "pending" | "reviewed" | "dismissed";
  createdAt: string;
  studentName: string;
  studentEmail: string;
  questionId: number;
  type: string;
  content: string;
  modelAnswer?: string | null;
  selfTestTitle: string;
  unitName: string;
};

export default function AdminSelfTestReports() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: admin } = useQuery<any>({ queryKey: ["/api/admin/me"] });
  const { data: reports, isLoading } = useQuery<Report[]>({ queryKey: ["/api/admin/self-test-question-reports"] });
  const updateReport = useMutation({
    mutationFn: ({ id, status }: { id: number; status: "reviewed" | "dismissed" }) =>
      apiRequest("PATCH", `/api/admin/self-test-question-reports/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/self-test-question-reports"] });
      toast({ title: "Report status updated" });
    },
    onError: () => toast({ title: "Could not update the report", variant: "destructive" }),
  });

  if (!admin) {
    setLocation("/admin");
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-primary/3">
      <header className="border-b bg-card/80 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <MedQrownBrand size="sm" />
          <Link href="/admin/dashboard"><Button variant="ghost" size="icon" aria-label="Back to dashboard"><ArrowLeft className="w-4 h-4" /></Button></Link>
          <div>
            <h1 className="text-lg font-bold">Self-test reports</h1>
            <p className="text-xs text-muted-foreground">Student feedback on AI-generated questions</p>
          </div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
        ) : !reports?.length ? (
          <Card className="border-dashed"><CardContent className="py-16 text-center">
            <Flag className="w-9 h-9 mx-auto mb-3 text-muted-foreground/40" />
            <p className="font-medium">No question reports yet</p>
            <p className="text-sm text-muted-foreground mt-1">Student-reported self-test questions will appear here.</p>
          </CardContent></Card>
        ) : (
          <div className="space-y-4">
            {reports.map((report) => (
              <Card key={report.id} className={report.status === "pending" ? "border-amber-300/60" : ""}>
                <CardHeader className="pb-3">
                  <div className="flex justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">{report.selfTestTitle}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-1">{report.unitName} · {report.studentName} ({report.studentEmail})</p>
                    </div>
                    <Badge variant={report.status === "pending" ? "secondary" : "outline"} className="capitalize h-fit">{report.status}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-md bg-muted/50 p-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Reported question</p>
                    <p className="text-sm whitespace-pre-wrap">{report.content}</p>
                    {report.modelAnswer && <p className="text-xs text-muted-foreground mt-2">Model answer: {report.modelAnswer}</p>}
                  </div>
                  <div className="rounded-md border border-destructive/15 bg-destructive/5 p-3">
                    <p className="text-xs font-semibold text-destructive mb-1">Student report</p>
                    <p className="text-sm whitespace-pre-wrap">{report.reason}</p>
                  </div>
                  {report.status === "pending" && (
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" disabled={updateReport.isPending} onClick={() => updateReport.mutate({ id: report.id, status: "dismissed" })}>
                        <XCircle className="w-4 h-4 mr-1.5" /> Dismiss
                      </Button>
                      <Button size="sm" disabled={updateReport.isPending} onClick={() => updateReport.mutate({ id: report.id, status: "reviewed" })}>
                        <CheckCircle2 className="w-4 h-4 mr-1.5" /> Mark reviewed
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}