import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, Clock, Calendar, AlertCircle, ArrowRight, Lock, Play, FileText, CheckCircle2, XCircle, Megaphone, MessageSquare } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { apiErrorMessage } from "@/lib/api-error";

function UpcomingCountdown({ targetDate }: { targetDate: string }) {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    const target = new Date(targetDate).getTime();
    const interval = setInterval(() => {
      const now = new Date().getTime();
      const distance = target - now;
      if (distance < 0) {
        setTimeLeft("Starts soon");
        clearInterval(interval);
        return;
      }
      const days = Math.floor(distance / (1000 * 60 * 60 * 24));
      const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      if (days > 0) setTimeLeft(`${days}d ${hours}h`);
      else if (hours > 0) setTimeLeft(`${hours}h ${minutes}m`);
      else setTimeLeft(`${minutes}m`);
    }, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  return <span className="font-mono text-sm">{timeLeft || "..."}</span>;
}

export default function StudentClassExams() {
  const [, params] = useRoute("/student/classes/:id");
  const [, setLocation] = useLocation();
  const classId = parseInt(params?.id || "0");
  const { toast } = useToast();

  const { data: exams, isLoading } = useQuery<any[]>({
    queryKey: [`/api/student/classes/${classId}/exams`],
  });
  
  const { data: classData } = useQuery<any>({
    queryKey: ["/api/student/classes"],
  });

  const enterExam = useMutation({
    mutationFn: async (examId: number) => {
      const res = await apiRequest("POST", `/api/student/exams/${examId}/enter`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to enter exam");
      }
      return res.json();
    },
    onSuccess: () => {
      setLocation("/student/instructions");
    },
    onError: (error: any) => {
      toast({ title: "Cannot start exam", description: apiErrorMessage(error), variant: "destructive" });
    },
  });

  const requestReattempt = useMutation({
    mutationFn: async ({ examId, reason }: { examId: number; reason: string }) => {
      const res = await apiRequest("POST", `/api/student/exams/${examId}/request-reattempt`, { reason });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to request reattempt");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/student/classes/${classId}/exams`] });
      toast({ title: "Reattempt requested successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Cannot request reattempt", description: apiErrorMessage(error), variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      </div>
    );
  }

  const currentClass = classData?.find((c: any) => c.id === classId);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Class Details</h1>
        <p className="text-muted-foreground mt-2">
          {currentClass?.name ? `Access exams and resources for ${currentClass.name}` : "View details for this class"}
        </p>
      </div>

      <Tabs defaultValue="exams" className="space-y-6">
        <TabsList>
          <TabsTrigger value="exams" className="gap-2"><BookOpen className="w-4 h-4" /> Exams</TabsTrigger>
          <TabsTrigger value="announcements" className="gap-2"><Megaphone className="w-4 h-4" /> Announcements</TabsTrigger>
          <TabsTrigger value="feedback" className="gap-2"><MessageSquare className="w-4 h-4" /> Feedback</TabsTrigger>
        </TabsList>

        <TabsContent value="exams" className="m-0 space-y-4">
          {!exams || exams.length === 0 ? (
            <Card className="border-dashed border-2 shadow-none">
              <CardContent className="py-14 text-center">
                <BookOpen className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-semibold mb-1">No Exams Available</h3>
                <p className="text-sm text-muted-foreground">
                  There are currently no active exams for this class.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              {exams.map((exam) => (
                <Card key={exam.id} className={`flex flex-col ${exam.membershipStatus === "expired" ? "opacity-75" : ""}`}>
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start gap-4">
                      <div>
                        <CardTitle className="text-lg leading-tight mb-1">{exam.title}</CardTitle>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {exam.durationMinutes} min
                          </span>
                          <span>•</span>
                          <span>
                            Attempts: {exam.attemptsUsed}
                          </span>
                        </div>
                      </div>
                      <Badge variant={
                        exam.state === "open" ? "default" :
                        exam.state === "upcoming" ? "secondary" :
                        exam.state === "results_available" ? "outline" :
                        "secondary"
                      } className={exam.state === "open" ? "bg-green-600" : ""}>
                        {exam.state.replace("_", " ").toUpperCase()}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col justify-end pt-2">
                    <div className="bg-muted/50 p-3 rounded-lg text-sm mb-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Opens:</span>
                        <span className="font-medium">{new Date(exam.opensAt).toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Closes:</span>
                        <span className="font-medium">{new Date(exam.closesAt).toLocaleString()}</span>
                      </div>
                    </div>

                    {exam.membershipStatus === "expired" ? (
                      <div className="flex items-center gap-2 text-destructive bg-destructive/10 p-3 rounded-lg text-sm mb-4">
                        <Lock className="w-4 h-4 shrink-0" />
                        <span>Membership expired. Please renew to access exams.</span>
                      </div>
                    ) : null}

                    <div className="flex gap-3">
                      {exam.state === "upcoming" && (
                        <div className="flex-1 bg-secondary/50 rounded-md flex items-center justify-center gap-2 text-sm text-muted-foreground p-2">
                          <Clock className="w-4 h-4" /> Opens in: <UpcomingCountdown targetDate={exam.opensAt} />
                        </div>
                      )}
                      {exam.state === "open" && exam.canOpen && exam.membershipStatus !== "expired" && (
                        <Button 
                          className="flex-1 gap-2" 
                          onClick={() => enterExam.mutate(exam.id)}
                          disabled={enterExam.isPending}
                        >
                          <Play className="w-4 h-4" />
                          {enterExam.isPending ? "Starting..." : "Start Exam"}
                        </Button>
                      )}
                      
                      {exam.state === "open" && !exam.canOpen && exam.attemptsUsed >= exam.maxAttempts && exam.membershipStatus !== "expired" && (
                        // Attempts used: lead with the result, keep the reattempt request small.
                        <div className="flex-1 space-y-1.5">
                          {exam.resultsReleased ? (
                            <Button variant="outline" className="w-full gap-2 border-primary text-primary hover:bg-primary/5" onClick={() => setLocation(`/student/results?examId=${exam.id}`)}>
                              <CheckCircle2 className="w-4 h-4" />
                              View Results
                            </Button>
                          ) : (
                            <Button variant="secondary" className="w-full gap-2" disabled>
                              <FileText className="w-4 h-4" />
                              Results Pending
                            </Button>
                          )}
                          <div className="text-center">
                            <button
                              type="button"
                              className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50"
                              onClick={() => requestReattempt.mutate({ examId: exam.id, reason: "Requested from dashboard" })}
                              disabled={requestReattempt.isPending}
                              data-testid={`button-request-reattempt-${exam.id}`}
                            >
                              Request a reattempt
                            </button>
                          </div>
                        </div>
                      )}
                      
                      {exam.state === "results_available" && (
                        <Button 
                          variant="outline" 
                          className="flex-1 gap-2 border-primary text-primary hover:bg-primary/5" 
                          onClick={() => setLocation(`/student/results?examId=${exam.id}`)}
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          View Results
                        </Button>
                      )}
                      
                      {exam.state === "missed" && (
                        <Button variant="secondary" className="flex-1 gap-2" disabled>
                          <XCircle className="w-4 h-4" />
                          Not attempted
                        </Button>
                      )}
                      {exam.state === "results_pending" && (
                        <Button variant="secondary" className="flex-1 gap-2" disabled>
                          <FileText className="w-4 h-4" />
                          Results Pending
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="announcements" className="m-0">
          <StudentAnnouncements classId={classId} />
        </TabsContent>

        <TabsContent value="feedback" className="m-0">
          <StudentFeedback classId={classId} exams={exams || []} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
function StudentAnnouncements({ classId }: { classId: number }) {
  const { data: announcements, isLoading } = useQuery<any[]>({
    queryKey: [`/api/student/classes/${classId}/announcements`],
    enabled: !!classId,
  });

  if (isLoading) {
    return <div className="py-8 text-center text-muted-foreground">Loading announcements...</div>;
  }

  if (!announcements?.length) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center text-muted-foreground">
          <Megaphone className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-semibold mb-1">No Announcements</h3>
          <p className="text-sm">There are no announcements for this class yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {announcements.map((ann) => (
        <Card key={ann.id}>
          <CardHeader className="pb-3">
            <div className="flex justify-between items-start gap-4">
              <CardTitle className="text-lg">{ann.title}</CardTitle>
              <div className="text-sm text-muted-foreground shrink-0">
                {new Date(ann.createdAt).toLocaleDateString()}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-foreground/90">{ann.message}</p>
            {ann.link && (
              <a href={ann.link} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-sm font-medium inline-flex items-center gap-1 mt-4">
                View Link <ArrowRight className="w-3 h-3" />
              </a>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function StudentFeedback({ classId, exams }: { classId: number, exams: any[] }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ message: "", examId: "general" });

  const submitFeedback = useMutation({
    mutationFn: async () => {
      const payload: any = { message: form.message };
      if (form.examId !== "general") {
        payload.examId = parseInt(form.examId);
      }
      const res = await apiRequest("POST", `/api/student/classes/${classId}/feedback`, payload);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Feedback Submitted", description: "Thank you for your feedback!" });
      setForm({ message: "", examId: "general" });
    },
    onError: (e: any) => {
      toast({ title: "Submission Failed", description: apiErrorMessage(e), variant: "destructive" });
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Submit Feedback</CardTitle>
        <CardDescription>
          Your feedback will be sent directly to the administrators along with your name.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Topic</Label>
          <Select value={form.examId} onValueChange={(v) => setForm({ ...form, examId: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="general">General Class Feedback</SelectItem>
              {exams.map(e => (
                <SelectItem key={e.id} value={e.id.toString()}>Exam: {e.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Message</Label>
          <Textarea 
            placeholder="Type your feedback here..." 
            className="h-32"
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
          />
        </div>
        <Button 
          onClick={() => submitFeedback.mutate()} 
          disabled={submitFeedback.isPending || !form.message.trim()}
          className="w-full sm:w-auto"
        >
          {submitFeedback.isPending ? "Submitting..." : "Submit Feedback"}
        </Button>
      </CardContent>
    </Card>
  );
}
