import { useStage8ResultsSummary, useStage8ResultsHistory } from "@/hooks/use-stage8";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Activity, ArrowRight, Award, BarChart3, CheckCircle2, Clock, Hash, Hourglass, Target, Trophy, TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Progress } from "@/components/ui/progress";
import { formatNairobi } from "@/lib/datetime";
import { ScoreTrend } from "@/components/student/score-trend";

export default function StudentResults() {
  const { data: summary, isLoading: loadingSummary } = useStage8ResultsSummary();
  const { data: history, isLoading: loadingHistory } = useStage8ResultsHistory();
  const { data: pending } = useQuery<{ attemptId: number; examId: number; examTitle: string; className: string; submittedAt: string }[]>({
    queryKey: ["/api/student/results/pending"], refetchOnMount: "always",
  });

  if (loadingSummary || loadingHistory) {
    return (
      <div className="space-y-8">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Results & Statistics</h1>
        <p className="text-muted-foreground mt-2">
          Track your performance and review past exam attempts.
        </p>
      </div>

      {summary && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Exams Completed</CardTitle>
              <Hash className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.totalResults}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Average Score</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.averageScore}%</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Best Score</CardTitle>
              <Trophy className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.bestScore}%</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Latest</CardTitle>
              <Target className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{history?.[0] ? `${history[0].scorePercent}%` : "—"}</div>
              <p className="text-xs text-muted-foreground mt-1 truncate">{history?.[0]?.examTitle ?? "No results yet"}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {history && history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary" /> Progress over time</CardTitle>
            <CardDescription>Each point is a Mock CAT; the dashed line is your average.</CardDescription>
          </CardHeader>
          <CardContent>
            <ScoreTrend results={[...history].reverse()} height={220} showAxes />
          </CardContent>
        </Card>
      )}

      {pending && pending.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Hourglass className="h-5 w-5 text-primary" /> Awaiting results</CardTitle>
            <CardDescription>Submitted — your score appears here once your tutors release it.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {pending.map((item) => (
              <Link key={item.attemptId} href={`/student/exam-review?examId=${item.examId}`}>
                <div className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors cursor-pointer">
                  <div className="min-w-0">
                    <p className="font-medium">{item.examTitle}</p>
                    <p className="text-xs text-muted-foreground">{item.className} · submitted {formatNairobi(item.submittedAt)}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">Results pending</span>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" /> Exam history
          </CardTitle>
          <CardDescription>Your released results. Tap one to see every answer and explanation.</CardDescription>
        </CardHeader>
        <CardContent>
          {!history || history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Activity className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <p className="text-lg font-medium">No released results yet</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                {pending?.length ? "Your submitted exams are listed above until results are released." : "Take your first Mock CAT to start building your history."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((result) => (
                <Link key={result.attemptId} href={`/student/exam-review?examId=${result.examId}`}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors cursor-pointer gap-3">
                    <div className="space-y-1 min-w-0">
                      <h4 className="font-semibold">{result.examTitle}</h4>
                      <p className="text-sm text-muted-foreground flex flex-wrap items-center gap-x-2">
                        <span>{result.className}</span>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{formatNairobi(result.submittedAt)}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-4 sm:min-w-[260px]">
                      <div className="flex-1 space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Score</span>
                          <span className="font-semibold">{result.scorePercent}%</span>
                        </div>
                        <Progress value={result.scorePercent} className="h-2" />
                        <p className="text-xs text-right text-muted-foreground">{result.earnedMarks} / {result.totalMarks} marks</p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
