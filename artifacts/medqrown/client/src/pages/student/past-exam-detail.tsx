import { useStudentPastExam } from "@/hooks/use-student";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, Calendar, BookOpen, Target, Award } from "lucide-react";

export default function StudentPastExamDetail() {
  const { id } = useParams();
  const { data: exam, isLoading } = useStudentPastExam(id || "");

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-32" />
        <Card>
          <CardContent className="p-8 space-y-4">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <div className="grid grid-cols-3 gap-6 pt-6 mt-6 border-t">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!exam) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-20">
        <h2 className="text-xl font-semibold mb-2">Exam attempt not found</h2>
        <p className="text-muted-foreground mb-6">This record may not exist or you don't have permission to view it.</p>
        <Link href="/student/past-exams">
          <Button>Back to Past Exams</Button>
        </Link>
      </div>
    );
  }

  const isExcellent = exam.scorePercent >= 85;
  const isGood = exam.scorePercent >= 70 && exam.scorePercent < 85;
  const isPass = exam.scorePercent >= 50 && exam.scorePercent < 70;
  
  const scoreColor = isExcellent 
    ? "text-emerald-600 dark:text-emerald-500" 
    : isGood 
      ? "text-primary" 
      : isPass 
        ? "text-amber-600 dark:text-amber-500" 
        : "text-destructive";

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <Link href="/student/past-exams">
          <Button variant="ghost" size="sm" className="mb-4 -ml-3 text-muted-foreground">
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back to Past Exams
          </Button>
        </Link>
      </div>

      <Card className="overflow-hidden border-t-4 border-t-primary shadow-sm">
        <CardContent className="p-8 sm:p-10">
          <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-8">
            <div className="space-y-4 flex-1">
              <div>
                <span className="inline-flex items-center text-xs font-semibold uppercase tracking-wider text-primary bg-primary/10 px-2 py-1 rounded mb-3">
                  <BookOpen className="w-3 h-3 mr-1.5" />
                  {exam.unitName}
                </span>
                <h1 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight text-balance">
                  {exam.title}
                </h1>
              </div>
              
              <div className="flex items-center text-muted-foreground gap-2">
                <Calendar className="w-4 h-4" />
                <span>Submitted on {new Date(exam.submittedAt).toLocaleString(undefined, { 
                  weekday: 'long',
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}</span>
              </div>
            </div>
            
            <div className="flex-shrink-0 flex flex-col items-center justify-center p-6 bg-muted/30 rounded-2xl border border-dashed min-w-[200px]">
              <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Target className="w-4 h-4" /> Final Score
              </span>
              <span className={`text-6xl font-black tracking-tighter ${scoreColor}`}>
                {exam.scorePercent}%
              </span>
              <span className="text-sm font-medium mt-2 text-muted-foreground">
                {exam.earnedMarks} out of {exam.totalMarks} marks
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Award className="w-5 h-5 text-primary" />
            Review Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!exam.responses?.length ? (
            <div className="py-12 flex flex-col items-center justify-center text-center text-muted-foreground">
              <p className="max-w-md">There are no saved responses available for this submitted attempt.</p>
            </div>
          ) : (
            <div className="space-y-5">
              {exam.responses.map((response: any, index: number) => (
                <div key={`${response.question}-${index}`} className="rounded-xl border bg-card p-5">
                  <div className="flex items-start justify-between gap-4">
                    <p className="font-medium leading-relaxed">Question {index + 1}: {response.question}</p>
                    <span className={response.isCorrect ? "text-xs font-semibold text-emerald-600" : "text-xs font-semibold text-amber-600"}>
                      {response.marksAwarded ?? 0}/{response.marks ?? 0} marks
                    </span>
                  </div>
                     <div className="mt-4 rounded-lg bg-muted/50 p-3 text-sm">
                       <span className="text-muted-foreground">Your answer: </span>{response.answerDisplay || response.answer || "No answer submitted"}
                  </div>
                  {(response.explanation || response.aiFeedback) && (
                    <div className="mt-3 text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">Feedback: </span>
                      {response.aiFeedback || response.explanation}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
