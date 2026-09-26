import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Users, AlertCircle, CreditCard, Calendar, AlertTriangle } from "lucide-react";
import { AdminNav } from "@/components/admin/admin-nav";
import { cohortName, formatCalendarDate } from "@/lib/datetime";

function AdminFeedbackWidget({ feedback }: { feedback: any[] }) {
  return (
    <Card className="col-span-full xl:col-span-2">
      <CardHeader className="pb-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-primary" />
          Latest Student Feedback
        </h2>
      </CardHeader>
      <CardContent>
        {!feedback?.length ? (
          <p className="text-sm text-muted-foreground">No recent feedback.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {feedback.map(fb => (
              <div key={fb.id} className="bg-muted/50 p-3 rounded-lg text-sm flex flex-col gap-2">
                <div className="flex justify-between items-start">
                  <div className="font-medium">{fb.studentName || "Anonymous"}</div>
                  <Badge variant="outline" className="text-[10px]">
                    {fb.className || "General"}
                  </Badge>
                </div>
                <p className="line-clamp-3 text-muted-foreground">{fb.message}</p>
                <div className="text-[10px] text-muted-foreground mt-auto pt-2 flex justify-between">
                  <span>{new Date(fb.createdAt || Date.now()).toLocaleDateString()}</span>
                  <span>{fb.type === "exam" ? fb.examTitle : "General"}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminDashboard() {
  const [, setLocation] = useLocation();

  const { data: admin, isLoading: adminLoading } = useQuery<any>({
    queryKey: ["/api/admin/me"],
  });

  const { data: dashboard, isLoading: dashLoading } = useQuery<any>({
    queryKey: ["/api/admin/dashboard"],
    enabled: !!admin
  });

  useEffect(() => {
    if (!adminLoading && !admin) setLocation("/");
  }, [adminLoading, admin, setLocation]);

  if (adminLoading || dashLoading) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b h-14 bg-card/80 backdrop-blur-sm" />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          <Skeleton className="h-8 w-48 mb-6" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
          </div>
        </main>
      </div>
    );
  }

  if (!admin) return null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-primary/3">
      <AdminNav admin={admin} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Overview of your institution's status.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Current Cohort</p>
                  <p className="text-xl font-bold">{cohortName(dashboard?.currentCohort)}</p>
                </div>
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Calendar className="w-5 h-5 text-primary" />
                </div>
              </div>
              <div className="mt-4 text-xs text-muted-foreground">
                {dashboard?.currentCohort ? (dashboard.currentCohort.startDate > new Date().toISOString().slice(0, 10) ? "Starts " + formatCalendarDate(dashboard.currentCohort.startDate) : "In progress") : "Not configured"}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Active Members</p>
                  <p className="text-2xl font-bold">{dashboard?.activeMembers || 0}</p>
                </div>
                <div className="p-2 bg-green-500/10 rounded-lg">
                  <Users className="w-5 h-5 text-green-600" />
                </div>
              </div>
              <div className="mt-4 text-xs text-muted-foreground flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" />
                {dashboard?.graceMembers || 0} in grace period
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Pending Payments</p>
                  <p className="text-2xl font-bold">{dashboard?.pendingPayments || 0}</p>
                </div>
                <div className="p-2 bg-yellow-500/10 rounded-lg">
                  <CreditCard className="w-5 h-5 text-yellow-600" />
                </div>
              </div>
              <div className="mt-4 text-xs font-medium text-red-600 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {dashboard?.flaggedPayments || 0} flagged
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Upcoming Exams</p>
                  <p className="text-2xl font-bold">{dashboard?.upcomingExams?.length || 0}</p>
                </div>
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-blue-600" />
                </div>
              </div>
              <div className="mt-4 text-xs text-muted-foreground truncate">
                {dashboard?.upcomingExams?.[0] ? dashboard.upcomingExams[0].title : "No upcoming exams"}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 grid-cols-1 xl:grid-cols-3">
          <AdminFeedbackWidget feedback={dashboard?.latestFeedback || []} />
          
          <Card className="xl:col-span-1">
            <CardHeader className="pb-3">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Calendar className="w-5 h-5 text-primary" />
                Upcoming Exams
              </h2>
            </CardHeader>
            <CardContent>
              {!dashboard?.upcomingExams?.length ? (
                <p className="text-sm text-muted-foreground">No upcoming exams scheduled.</p>
              ) : (
                <div className="space-y-4">
                  {dashboard.upcomingExams.map((exam: any) => (
                    <div key={exam.id} className="flex justify-between items-center border-b pb-3 last:border-0 last:pb-0">
                      <div>
                        <p className="text-sm font-medium">{exam.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(exam.opensAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                        </p>
                      </div>
                      <Badge variant="secondary" className="text-[10px]">
                        {exam.className}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
