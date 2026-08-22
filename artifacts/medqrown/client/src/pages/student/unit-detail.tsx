import { useStudentUnit, useRequestExamAccess, useRequestReattempt, useEnterExam } from "@/hooks/use-student";
import { useParams, useLocation, Link } from "wouter";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, FileText, Lock, Unlock, Clock, RefreshCcw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

export default function StudentUnitDetail() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const { data: unit, isLoading } = useStudentUnit(id || "");
  const requestAccess = useRequestExamAccess();
  const requestReattempt = useRequestReattempt();
  const enterExam = useEnterExam();
  const { toast } = useToast();
  const [reattemptExam, setReattemptExam] = useState<{ id: string; title: string } | null>(null);
  const [reattemptReason, setReattemptReason] = useState("");

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-4 mt-8">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (!unit) {
    return (
      <div className="flex h-64 flex-col items-center justify-center text-center">
        <h2 className="text-xl font-semibold mb-2">Unit not found</h2>
        <p className="text-muted-foreground mb-6">This unit may not exist or you don't have access.</p>
        <Link href="/student/units">
          <Button>Back to Units</Button>
        </Link>
      </div>
    );
  }

  const handleRequestAccess = (examId: string, title: string) => {
    requestAccess.mutate(examId, {
      onSuccess: () => {
        toast({
          title: "Access Requested",
          description: `You have requested access to ${title}.`,
        });
      },
      onError: (err) => {
        toast({
          title: "Request Failed",
          description: err instanceof Error ? err.message : "Failed to request access.",
          variant: "destructive",
        });
      }
    });
  };

  const handleEnterExam = (examId: string) => {
    enterExam.mutate(examId, {
      onSuccess: (data) => {
        // Assume API returns some exam session ID or instructions, 
        // for now just navigate to a theoretical instructions page or exam run page.
        // The spec mentions /student/instructions
        setLocation(`/student/instructions?examId=${examId}`);
      },
      onError: (err) => {
        toast({
          title: "Failed to enter exam",
          description: err instanceof Error ? err.message : "An error occurred.",
          variant: "destructive",
        });
      }
    });
  };

  const handleRequestReattempt = () => {
    if (!reattemptExam) return;
    requestReattempt.mutate({ id: reattemptExam.id, reason: reattemptReason }, {
      onSuccess: () => {
        toast({ title: "Reattempt requested", description: "Your administrator will review your request." });
        setReattemptExam(null);
        setReattemptReason("");
      },
      onError: (err) => toast({
        title: "Could not request a reattempt",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      }),
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center gap-4">
        <Link href="/student/units">
          <Button variant="ghost" size="icon" className="shrink-0 h-10 w-10 rounded-full hover:bg-muted">
            <ChevronLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{unit.name}</h1>
            <Badge variant="secondary">{unit.code}</Badge>
          </div>
          <p className="text-muted-foreground mt-1">
            {unit.activeExamCount} Available Exams • {unit.completedAttempts} Completed Attempts
          </p>
        </div>
      </div>

      {unit.description && (
        <Card className="bg-muted/30 border-dashed">
          <CardContent className="pt-6">
            <p className="text-sm text-foreground/80">{unit.description}</p>
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="text-xl font-semibold mb-4">Official Exams</h2>
        
        {!unit.exams || unit.exams.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed text-center">
            <FileText className="h-8 w-8 text-muted-foreground/30 mb-4" />
            <p className="text-sm font-medium">No exams available</p>
            <p className="text-xs text-muted-foreground mt-1">
              There are currently no active exams for this unit.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {unit.exams.map((exam) => (
              <Card key={exam.id} className="flex flex-col">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start gap-4">
                    <CardTitle className="text-base font-semibold leading-tight line-clamp-2">
                      {exam.title}
                    </CardTitle>
                    {exam.accessStatus === 'approved' ? (
                      <Unlock className="w-4 h-4 text-primary shrink-0 mt-1" />
                    ) : (
                      <Lock className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                    )}
                  </div>
                  <CardDescription className="flex items-center gap-3 mt-2 text-xs">
                    <span className="flex items-center gap-1">
                      <FileText className="w-3 h-3" />
                      {exam.totalQuestions} Qs
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {exam.timerMode}
                    </span>
                  </CardDescription>
                   {exam.accessStatus === "approved" && (
                     <p className="mt-3 text-xs text-muted-foreground">
                       Attempts: {exam.attemptsUsed} of {exam.maxAttempts}
                     </p>
                   )}
                </CardHeader>
                <CardFooter className="pt-4 mt-auto border-t">
                   {exam.accessStatus === 'approved' && exam.canEnter ? (
                    <Button 
                      className="w-full shadow-sm" 
                      onClick={() => handleEnterExam(exam.id)}
                      disabled={enterExam.isPending}
                    >
                      {enterExam.isPending ? "Preparing..." : "Enter Exam"}
                    </Button>
                   ) : exam.accessStatus === "approved" && exam.reattemptStatus === "pending" ? (
                     <Button variant="secondary" className="w-full" disabled>
                       <Clock className="mr-2 h-4 w-4" />Reattempt Pending
                     </Button>
                   ) : exam.accessStatus === "approved" ? (
                     <Button
                       variant="outline"
                       className="w-full"
                       onClick={() => setReattemptExam({ id: exam.id, title: exam.title })}
                       disabled={requestReattempt.isPending}
                     >
                       <RefreshCcw className="mr-2 h-4 w-4" />Request Reattempt
                     </Button>
                  ) : exam.accessStatus === 'pending' ? (
                    <Button variant="secondary" className="w-full" disabled>
                      <Clock className="w-4 h-4 mr-2" />
                      Access Pending
                    </Button>
                  ) : (
                    <Button 
                      variant="outline" 
                      className="w-full hover:bg-primary hover:text-primary-foreground transition-colors" 
                      onClick={() => handleRequestAccess(exam.id, exam.title)}
                      disabled={requestAccess.isPending}
                    >
                      Request Access
                    </Button>
                  )}
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
      <Dialog open={!!reattemptExam} onOpenChange={(open) => !open && setReattemptExam(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request another attempt</DialogTitle>
            <DialogDescription>Explain why you need another attempt for {reattemptExam?.title}. Your administrator will review this request.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={reattemptReason}
            onChange={(event) => setReattemptReason(event.target.value)}
            placeholder="Optional explanation"
            maxLength={500}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReattemptExam(null)}>Cancel</Button>
            <Button onClick={handleRequestReattempt} disabled={requestReattempt.isPending}>
              {requestReattempt.isPending ? "Submitting..." : "Submit request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
