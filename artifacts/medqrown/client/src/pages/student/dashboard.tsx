import { useStudentDashboard } from "@/hooks/use-student";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { BookOpen, Trophy, Target, ArrowRight, Activity, Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function StudentDashboard() {
  const { data: dashboard, isLoading } = useStudentDashboard();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-[400px] w-full" />
          <Skeleton className="h-[400px] w-full" />
        </div>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="text-center py-12">
        <h2 className="text-lg font-medium">Unable to load dashboard</h2>
        <p className="text-muted-foreground">Please try refreshing the page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
        <p className="text-muted-foreground mt-2">
          Track your academic progress and jump back into your current units.
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Score</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboard.averageScore.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground mt-1">Across all completed exams</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Units</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboard.enrolledUnits.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Currently enrolled</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Exams Completed</CardTitle>
            <Trophy className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboard.totalExamsCompleted}</div>
            <p className="text-xs text-muted-foreground mt-1">Total submitted</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Enrolled Units */}
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              Your Units
            </CardTitle>
            <CardDescription>Units you are currently studying.</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            {dashboard.enrolledUnits.length === 0 ? (
              <div className="flex h-[200px] flex-col items-center justify-center text-center">
                <BookOpen className="h-10 w-10 text-muted-foreground/30 mb-4" />
                <p className="text-sm font-medium">No active units</p>
                <p className="text-xs text-muted-foreground mt-1 mb-4">
                  Browse the unit catalog to enrol in your subjects.
                </p>
                <Link href="/student/units">
                  <Button size="sm">Browse Units</Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {dashboard.enrolledUnits.slice(0, 4).map((unit) => (
                  <Link key={unit.id} href={`/student/units/${unit.id}`}>
                    <div className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted/50 cursor-pointer">
                      <div className="space-y-1">
                        <p className="text-sm font-medium leading-none">{unit.code}</p>
                        <p className="text-sm text-muted-foreground">{unit.name}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-sm font-medium">{unit.activeExamCount}</p>
                          <p className="text-xs text-muted-foreground">Exams</p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
          {dashboard.enrolledUnits.length > 4 && (
            <div className="p-4 border-t">
              <Link href="/student/units">
                <Button variant="ghost" className="w-full">View all units</Button>
              </Link>
            </div>
          )}
        </Card>

        {/* Recent Activity */}
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Recent Activity
            </CardTitle>
            <CardDescription>Your latest completed exams.</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            {dashboard.recentActivity.length === 0 ? (
              <div className="flex h-[200px] flex-col items-center justify-center text-center">
                <Activity className="h-10 w-10 text-muted-foreground/30 mb-4" />
                <p className="text-sm font-medium">No recent activity</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Complete an exam to see your results here.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {dashboard.recentActivity.slice(0, 4).map((exam) => (
                  <Link key={exam.examStudentId} href={`/student/past-exams/${exam.examStudentId}`}>
                    <div className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted/50 cursor-pointer">
                      <div className="space-y-1">
                        <p className="text-sm font-medium leading-none line-clamp-1">{exam.title}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="truncate">{exam.unitName}</span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(exam.submittedAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <div className="ml-4 flex items-center justify-center shrink-0 w-12 h-12 rounded-full bg-primary/10 text-primary font-bold text-sm">
                        {exam.scorePercent}%
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
          {dashboard.recentActivity.length > 4 && (
            <div className="p-4 border-t">
              <Link href="/student/past-exams">
                <Button variant="ghost" className="w-full">View all history</Button>
              </Link>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
