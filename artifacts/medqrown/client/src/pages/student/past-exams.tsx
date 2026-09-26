import { useStudentPastExams } from "@/hooks/use-student";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FEATURES } from "@/lib/feature-flags";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { History, ChevronRight, Target, Calendar } from "lucide-react";
import { Progress } from "@/components/ui/progress";

export default function StudentPastExams() {
  const { data: exams, isLoading } = useStudentPastExams();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="grid gap-4 mt-8">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Past Exams</h1>
        <p className="text-muted-foreground mt-2">
          Review your completed exam attempts and performance history.
        </p>
      </div>

      {!exams || exams.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed bg-card/50 text-center">
          <History className="h-10 w-10 text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-semibold">No past exams</h3>
          <p className="text-sm text-muted-foreground max-w-sm mt-1">
            You haven't completed any exams yet. Your exam history will appear here after you finish an exam.
          </p>
          {FEATURES.studentUnits && <Link href="/student/units" className="mt-6">
            <Button>Browse Units</Button>
          </Link>}
        </div>
      ) : (
        <div className="grid gap-4">
          {exams.map((exam) => (
            <Link key={exam.attemptId} href={`/student/past-exams/${exam.attemptId}`}>
              <Card className="group transition-all hover:shadow-md hover:border-primary/30 cursor-pointer">
                <CardContent className="p-6">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    
                    <div className="flex-1 space-y-1">
                      {FEATURES.studentUnits && <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-semibold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded">
                          {exam.unitName}
                        </span>
                      </div>}
                      <h3 className="text-lg font-semibold group-hover:text-primary transition-colors line-clamp-1">
                        {exam.title}
                      </h3>
                      <div className="flex items-center text-sm text-muted-foreground gap-4 mt-2">
                        <span className="flex items-center gap-1.5">
                          <Calendar className="w-4 h-4" />
                          {new Date(exam.submittedAt).toLocaleString(undefined, { 
                            dateStyle: 'medium', 
                            timeStyle: 'short' 
                          })}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="w-32 hidden sm:block">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-muted-foreground">Score</span>
                          <span className="font-medium">{exam.scorePercent}%</span>
                        </div>
                        <Progress value={exam.scorePercent} className="h-2" />
                      </div>
                      
                      <div className="flex flex-col items-end">
                        <span className="text-2xl font-bold tracking-tighter">
                          {exam.earnedMarks}
                          <span className="text-lg text-muted-foreground font-medium">/{exam.totalMarks}</span>
                        </span>
                        <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Marks</span>
                      </div>
                      
                      <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors hidden md:block" />
                    </div>

                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
