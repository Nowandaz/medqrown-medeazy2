import { useStudentStats } from "@/hooks/use-student";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Award, BarChart3, CheckCircle2, Target, TrendingUp } from "lucide-react";

export default function StudentStats() {
  const { data: stats, isLoading } = useStudentStats();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-40" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-28" />)}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  if (!stats) {
    return <p className="py-12 text-center text-muted-foreground">Your statistics are unavailable right now. Please refresh and try again.</p>;
  }

  const summary = [
    { label: "Completed attempts", value: stats.totalAttempts, icon: CheckCircle2, note: "Submitted official exams" },
    { label: "Average score", value: `${stats.averageScore}%`, icon: Target, note: "Across all attempts" },
    { label: "Best score", value: `${stats.bestScore}%`, icon: Award, note: "Your highest result" },
    { label: "Pass rate", value: `${stats.passRate}%`, icon: TrendingUp, note: "Scores of 50% or higher" },
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Stats</h1>
        <p className="mt-2 text-muted-foreground">A focused view of your exam performance and study progress.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summary.map((item) => (
          <Card key={item.label} className="border-primary/10">
            <CardContent className="pt-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{item.label}</p>
                  <p className="mt-1 text-3xl font-bold">{item.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.note}</p>
                </div>
                <div className="rounded-xl bg-primary/10 p-2.5"><item.icon className="h-5 w-5 text-primary" /></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {stats.totalAttempts === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex min-h-56 flex-col items-center justify-center px-6 text-center">
            <BarChart3 className="mb-4 h-10 w-10 text-muted-foreground/40" />
            <h2 className="font-semibold">Your stats will appear here</h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">Complete an official exam to start tracking your scores, pass rate, and unit progress.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg"><TrendingUp className="h-5 w-5 text-primary" />Recent results</CardTitle>
              <CardDescription>Your latest completed attempts.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {stats.recentScores.map((attempt) => (
                <div key={attempt.attemptId} className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{attempt.title}</p>
                      <p className="text-xs text-muted-foreground">{attempt.unitName} · {new Date(attempt.submittedAt).toLocaleDateString()}</p>
                    </div>
                    <span className="shrink-0 text-sm font-bold text-primary">{attempt.scorePercent}%</span>
                  </div>
                  <Progress value={attempt.scorePercent} className="h-2" />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg"><BarChart3 className="h-5 w-5 text-primary" />Performance by unit</CardTitle>
              <CardDescription>Average score across completed attempts.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {stats.unitPerformance.map((unit) => (
                <div key={unit.unitName} className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{unit.unitName}</p>
                      <p className="text-xs text-muted-foreground">{unit.total} completed attempt{unit.total === 1 ? "" : "s"}</p>
                    </div>
                    <span className="text-sm font-bold">{unit.averageScore}%</span>
                  </div>
                  <Progress value={unit.averageScore} className="h-2" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}