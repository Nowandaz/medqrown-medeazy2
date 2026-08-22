import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useReportSelfTestQuestion, useStudentMe } from "@/hooks/use-student";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Clock, AlertTriangle, ArrowLeft, Loader2, TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { MedQrownBrand } from "@/components/MedQrownBrand";
import { Skeleton } from "@/components/ui/skeleton";

const ReportDialog = ({ questionId }: { questionId: number }) => {
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);
  const reportMutation = useReportSelfTestQuestion();
  const { toast } = useToast();

  const handleReport = () => {
    reportMutation.mutate({ questionId, reason }, {
      onSuccess: () => {
        setOpen(false);
        setReason("");
        toast({ title: "Issue reported. Thank you!" });
      },
      onError: () => {
        toast({ title: "Failed to submit report", variant: "destructive" });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive h-8 px-2">
          <AlertTriangle className="w-3.5 h-3.5 mr-1.5" /> Report Issue
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report Question Issue</DialogTitle>
          <DialogDescription>Let us know if there is a problem with the AI generated question content, options, or marking.</DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <Textarea 
            value={reason} 
            onChange={e => setReason(e.target.value)} 
            placeholder="Describe the issue..."
            rows={4}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleReport} disabled={!reason || reportMutation.isPending} variant="destructive">
            {reportMutation.isPending ? "Submitting..." : "Submit Report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default function StudentSelfTestResults() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { data: user } = useStudentMe();
  
  const { data: results, isLoading } = useQuery<any>({
    queryKey: [`/api/student/self-test-attempts/${id}/results`],
    enabled: !!id,
    refetchInterval: (query) => {
      const data = query.state?.data as any;
      if (data?.markingInProgress) return 3000;
      return false;
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-3xl mx-auto space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!results) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Results not found.</p>
      </div>
    );
  }

  if (results.markingInProgress) {
    const progressPercent = results.totalSAQ > 0 ? (results.markedSAQ / results.totalSAQ) * 100 : 0;
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-primary/3">
        <header className="border-b bg-card/80 backdrop-blur-sm">
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <MedQrownBrand size="sm" />
              <p className="text-xs text-muted-foreground ml-2 border-l border-border pl-2 truncate hidden sm:block">Self-Test Evaluation</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setLocation("/student/self-tests")}>
              <ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Back to Tests
            </Button>
          </div>
        </header>

        <main className="max-w-3xl mx-auto px-4 py-6">
          <Card className="border-primary/10 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-primary/5 to-transparent p-1" />
            <CardContent className="py-14 text-center space-y-6">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 mb-2">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
              </div>
              <div>
                <h2 className="text-xl font-bold mb-2">AI Evaluation in Progress</h2>
                <p className="text-muted-foreground max-w-sm mx-auto">
                  Your answers are being evaluated against clinical standards. This takes just a moment.
                </p>
              </div>
              {results.totalSAQ > 0 && (
                <div className="max-w-xs mx-auto space-y-2">
                  <Progress value={progressPercent} className="h-2" />
                  <p className="text-sm text-muted-foreground">
                    {results.markedSAQ} of {results.totalSAQ} responses reviewed
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  const passed = results.percentage >= 50;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-primary/3">
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <MedQrownBrand size="sm" />
            <div className="ml-2 pl-2 border-l border-border min-w-0 hidden sm:block">
              <p className="text-xs text-muted-foreground">Self-Test Results</p>
              <p className="text-sm font-semibold truncate">{user?.name}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setLocation("/student/self-tests")}>
            <ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Back to Tests
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <Card className="border-primary/10 shadow-sm overflow-hidden">
          <div className={`h-1.5 ${passed ? "bg-gradient-to-r from-green-500 to-emerald-400" : "bg-gradient-to-r from-red-500 to-orange-400"}`} />
          <CardContent className="pt-6 pb-5">
            <div className="text-center mb-6">
              <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-3 ${
                passed ? "bg-green-500/10 border border-green-500/20" : "bg-red-500/10 border border-red-500/20"
              }`}>
                {passed ? <TrendingUp className="w-8 h-8 text-green-600" /> : <TrendingDown className="w-8 h-8 text-red-500" />}
              </div>
              <h2 className="text-xl font-bold">{results.testTitle || "Self-Test Results"}</h2>
              <p className="text-sm text-muted-foreground mt-1">Review your AI-generated feedback</p>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 rounded-xl bg-primary/5 border border-primary/10">
                <p className="text-3xl font-bold text-primary">{results.totalScore}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Score</p>
              </div>
              <div className="text-center p-3 rounded-xl bg-muted/50 border">
                <p className="text-3xl font-bold">{results.maxScore}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Max Score</p>
              </div>
              <div className={`text-center p-3 rounded-xl border ${passed ? "bg-green-500/5 border-green-500/15" : "bg-red-500/5 border-red-500/15"}`}>
                <p className={`text-3xl font-bold ${passed ? "text-green-600" : "text-destructive"}`}>
                  {results.percentage?.toFixed(1)}%
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Performance</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider px-1">Detailed Review</h3>
          
          {results.questions?.map((q: any, idx: number) => (
            <Card key={q.id} className="shadow-sm overflow-hidden border-primary/5">
              <div className="bg-gradient-to-r from-primary/5 to-transparent px-4 py-2 border-b border-primary/5 flex justify-between items-center">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {idx + 1}
                  </span>
                  <Badge variant="outline" className="text-xs bg-background uppercase">{q.type}</Badge>
                  <span className="text-xs text-muted-foreground">{q.marks} mark{q.marks > 1 ? "s" : ""}</span>
                </div>
                <ReportDialog questionId={q.id} />
              </div>
              
              <CardContent className="p-4 space-y-4">
                <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap">{q.content}</p>
                
                <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5 shrink-0">
                      {q.isCorrect === true ? (
                        <div className="w-5 h-5 rounded-full bg-green-500/10 flex items-center justify-center">
                          <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                        </div>
                      ) : q.isCorrect === false ? (
                        <div className="w-5 h-5 rounded-full bg-red-500/10 flex items-center justify-center">
                          <XCircle className="w-3.5 h-3.5 text-destructive" />
                        </div>
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center">
                          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      {q.type === "mcq" && q.options ? (
                        <div className="space-y-1.5">
                          {q.studentAnswer == null && <p className="text-xs italic text-muted-foreground mb-1">No answer selected</p>}
                          {q.options.map((o: any, oi: number) => {
                            const label = String.fromCharCode(65 + oi);
                            const isStudentPick = String(o.id) === q.studentAnswer;
                            const isCorrectOpt = o.isCorrect;
                            const isWrongPick = isStudentPick && !isCorrectOpt;
                            const isCorrectPick = isStudentPick && isCorrectOpt;
                            
                            return (
                              <div key={o.id} className={`flex items-start gap-2 rounded-md px-2.5 py-1.5 border text-sm transition-colors
                                ${isCorrectPick ? "bg-green-50 border-green-400 dark:bg-green-950/30 dark:border-green-600" :
                                  isWrongPick ? "bg-red-50 border-red-400 dark:bg-red-950/30 dark:border-red-600" :
                                  isCorrectOpt ? "bg-green-50/60 border-green-300 dark:bg-green-950/20 dark:border-green-700" :
                                  "bg-background border-transparent"}`}>
                                <span className={`font-bold text-xs mt-0.5 shrink-0 w-4 ${isCorrectOpt ? "text-green-700 dark:text-green-400" : isWrongPick ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
                                  {label}
                                </span>
                                <span className={`flex-1 leading-snug ${isCorrectOpt ? "font-medium" : ""}`}>{o.content}</span>
                                <span className="shrink-0 flex items-center gap-1">
                                  {isCorrectPick && <><CheckCircle className="w-3.5 h-3.5 text-green-600" /><span className="text-xs text-green-600 font-medium">Your answer ✓</span></>}
                                  {isWrongPick && <><XCircle className="w-3.5 h-3.5 text-red-500" /><span className="text-xs text-red-500 font-medium">Your answer</span></>}
                                  {!isStudentPick && isCorrectOpt && <><CheckCircle className="w-3.5 h-3.5 text-green-600" /><span className="text-xs text-green-600 font-medium">Correct</span></>}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-sm">
                            <span className="text-muted-foreground block mb-0.5">Your answer:</span>
                            {q.studentAnswer == null ? (
                              <span className="italic text-muted-foreground">No answer provided</span>
                            ) : (
                              <span className="font-medium bg-background px-2 py-1 rounded-sm border block whitespace-pre-wrap">{q.studentAnswer}</span>
                            )}
                          </p>
                          
                          {q.modelAnswer && (
                            <div className="bg-primary/5 rounded-md px-3 py-2 border border-primary/15 mt-3">
                              <span className="text-xs font-semibold text-primary block mb-1">Model Answer:</span>
                              <p className="text-sm text-foreground/90 whitespace-pre-wrap">{q.modelAnswer}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    
                    {q.marksAwarded != null && (
                      <Badge variant={q.marksAwarded > 0 ? "default" : "destructive"} className="text-xs shrink-0 self-start">
                        {q.marksAwarded}/{q.marks}
                      </Badge>
                    )}
                  </div>

                  {q.explanation && (
                    <div className="bg-primary/5 rounded-md px-3 py-2.5 border border-primary/15 flex gap-2 mt-3 ml-7">
                      <span className="text-xs font-semibold text-primary shrink-0 mt-0.5">Explanation:</span>
                      <p className="text-xs text-foreground/80 leading-relaxed">{q.explanation}</p>
                    </div>
                  )}

                  {q.aiFeedback && (
                    <div className="bg-background rounded-md px-3 py-2.5 border border-primary/10 mt-3 ml-7">
                      <span className="text-xs font-semibold text-muted-foreground shrink-0 block mb-0.5">AI Feedback:</span>
                      <p className="text-xs text-foreground/80 italic leading-relaxed">{q.aiFeedback}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
