import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, Clock, Calendar, AlertCircle, ArrowRight, Lock, Play, FileText, CheckCircle2, XCircle, Megaphone, MessageSquare, ListFilter } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { RenewMembershipDialog } from "@/components/student/renew-membership-dialog";
import { formatNairobi } from "@/lib/datetime";
import { apiErrorMessage } from "@/lib/api-error";
import { ClassTimetableView } from "@/components/student/class-timetable-view";

function UpcomingCountdown({ targetDate }: { targetDate: string }) {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    const target = new Date(targetDate).getTime();
    const tick = () => {
      const distance = target - Date.now();
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
      else setTimeLeft(`${Math.max(minutes, 1)}m`);
    };
    const interval = setInterval(tick, 30000);
    tick();
    return () => clearInterval(interval);
  }, [targetDate]);

  return <span className="font-mono text-sm">{timeLeft || "..."}</span>;
}

function ExamCard({ exam, enterExamFn, requestReattemptFn, classIdNum }: { exam: any, enterExamFn: any, requestReattemptFn: any, classIdNum: number }) {
  const [, setLocation] = useLocation();
  const [isEntering, setIsEntering] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);

  const handleEnter = async () => {
    setIsEntering(true);
    try {
      await enterExamFn(exam.id);
    } finally {
      setIsEntering(false);
    }
  };

  const handleRequest = async () => {
    setIsRequesting(true);
    try {
      await requestReattemptFn({ examId: exam.id, reason: "Requested from class page" });
    } finally {
      setIsRequesting(false);
    }
  };

  return (
    <Card className={`flex flex-col ${exam.membershipStatus === "expired" ? "opacity-75" : ""}`}>
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start gap-4">
          <div>
            <CardTitle className="text-lg leading-tight mb-1">{exam.title}</CardTitle>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {exam.timerMode === "per_question" ? `${exam.perQuestionSeconds}s per question` : `${exam.durationMinutes} min`}
              </span>
              <span>•</span>
              <span>
                Attempts: {exam.attemptsUsed} of {exam.maxAttempts}
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
            <span className="font-medium">{formatNairobi(exam.opensAt)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Closes:</span>
            <span className="font-medium">{formatNairobi(exam.closesAt)}</span>
          </div>
        </div>

        {exam.membershipStatus === "expired" ? (
          <div className="flex items-center justify-between gap-2 text-destructive bg-destructive/10 p-3 rounded-lg text-sm mb-4">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 shrink-0" />
              <span>Membership expired.</span>
            </div>
            <RenewMembershipDialog />
          </div>
        ) : null}

        <div className="flex gap-3">
          {exam.state === "upcoming" && (
            <div className="flex-1 bg-secondary/50 rounded-md flex items-center justify-center gap-2 text-sm text-muted-foreground p-2">
              <Clock className="w-4 h-4" /> Opens {formatNairobi(exam.opensAt)} · <UpcomingCountdown targetDate={exam.opensAt} />
            </div>
          )}
          {exam.state === "open" && exam.canOpen && exam.membershipStatus !== "expired" && (
            <Button 
              className="flex-1 gap-2" 
              onClick={handleEnter}
              disabled={isEntering}
            >
              <Play className="w-4 h-4" />
              {isEntering ? "Starting..." : "Start Exam"}
            </Button>
          )}
          
          {exam.state === "open" && !exam.canOpen && exam.attemptsUsed >= exam.maxAttempts && exam.membershipStatus !== "expired" && (
            <Button 
              variant="secondary"
              className="flex-1 gap-2" 
              onClick={handleRequest}
              disabled={isRequesting}
            >
              Request Reattempt
            </Button>
          )}
          
          {exam.state === "results_available" && (
            <Button 
              variant="outline" 
              className="flex-1 gap-2 border-primary text-primary hover:bg-primary/5" 
              onClick={() => setLocation(`/student/exam-review?examId=${exam.id}`)}
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
  );
}

export default function StudentMyClass() {
  const [, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const urlClassId = searchParams.get("classId");
  const { toast } = useToast();

  const { data: classes, isLoading: classesLoading } = useQuery<any[]>({
    queryKey: ["/api/student/classes"],
  });

  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);

  useEffect(() => {
    if (classes && classes.length > 0 && !selectedClassId) {
      if (urlClassId && classes.some(c => c.id.toString() === urlClassId)) {
        setSelectedClassId(urlClassId);
      } else {
        setSelectedClassId(classes[0].id.toString());
      }
    }
  }, [classes, selectedClassId, urlClassId]);

  const classIdNum = selectedClassId ? parseInt(selectedClassId) : 0;
  const [tab, setTab] = useState(() => {
    const wanted = new URLSearchParams(window.location.search).get("tab");
    return wanted && ["exams", "timetable", "announcements", "feedback"].includes(wanted) ? wanted : "exams";
  });
  const currentClass = classes?.find(c => c.id === classIdNum);

  const { data: exams, isLoading: examsLoading } = useQuery<any[]>({
    queryKey: [`/api/student/classes/${classIdNum}/exams`],
    enabled: !!classIdNum,
    refetchOnMount: "always",
  });

  // Refresh the exam list the moment an exam opens or closes, so nobody has to reload the page.
  useEffect(() => {
    if (!exams?.length) return;
    const now = Date.now();
    const moments = exams
      .flatMap((exam) => [Date.parse(exam.opensAt), Date.parse(exam.closesAt)])
      .filter((t) => Number.isFinite(t) && t > now && t - now < 24 * 60 * 60 * 1000);
    if (!moments.length) return;
    const timer = setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: [`/api/student/classes/${classIdNum}/exams`] });
    }, Math.min(...moments) - now + 1000);
    return () => clearTimeout(timer);
  }, [exams, classIdNum]);

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
      queryClient.invalidateQueries({ queryKey: [`/api/student/classes/${classIdNum}/exams`] });
      toast({ title: "Reattempt requested successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Cannot request reattempt", description: apiErrorMessage(error), variant: "destructive" });
    },
  });

  if (classesLoading) {
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

  if (!classes || classes.length === 0) {
    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Class</h1>
          <p className="text-muted-foreground mt-2">
            You are not currently assigned to any active classes.
          </p>
        </div>
        <Card className="border-dashed border-2 shadow-none max-w-2xl">
          <CardContent className="py-14 text-center flex flex-col items-center">
            <BookOpen className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Classes Found</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Please contact your administrator or tutor if you believe this is a mistake and should have access to a class.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="space-y-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">My Class</h1>
          <p className="text-muted-foreground mt-1">
            {classes.length > 1 ? `You're in ${classes.length} classes — pick one below.` : currentClass?.name}
          </p>
        </div>
        {classes.length > 1 && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1" role="tablist" aria-label="Your classes" data-tour="class-switcher">
            {classes.map((c) => {
              const active = c.id.toString() === selectedClassId;
              return (
                <button
                  key={c.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSelectedClassId(c.id.toString())}
                  className={`shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                    active ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-card hover:bg-muted"
                  }`}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-6">
        <TabsList className="w-full sm:w-auto overflow-x-auto no-scrollbar justify-start" data-tour="class-tabs">
          <TabsTrigger value="exams" className="gap-2"><BookOpen className="w-4 h-4" /> Exams</TabsTrigger>
          <TabsTrigger value="timetable" className="gap-2"><Calendar className="w-4 h-4" /> Timetable</TabsTrigger>
          <TabsTrigger value="announcements" className="gap-2"><Megaphone className="w-4 h-4" /> Announcements</TabsTrigger>
          <TabsTrigger value="feedback" className="gap-2"><MessageSquare className="w-4 h-4" /> Feedback</TabsTrigger>
        </TabsList>

        <TabsContent value="timetable" className="m-0">
          <ClassTimetableView classId={classIdNum} />
        </TabsContent>

        <TabsContent value="exams" className="m-0 space-y-4">
          {examsLoading ? (
            <div className="grid gap-6 md:grid-cols-2">
              {[1, 2].map(i => <Skeleton key={i} className="h-40 rounded-xl" />)}
            </div>
          ) : !exams || exams.length === 0 ? (
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
                <ExamCard key={exam.id} exam={exam} enterExamFn={enterExam.mutateAsync} requestReattemptFn={requestReattempt.mutateAsync} classIdNum={classIdNum} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="announcements" className="m-0">
          <StudentAnnouncements classId={classIdNum} />
        </TabsContent>

        <TabsContent value="feedback" className="m-0">
          <StudentFeedback classId={classIdNum} exams={exams || []} />
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
    return <div className="py-8 text-center text-muted-foreground"><Skeleton className="h-32 w-full max-w-2xl mx-auto" /></div>;
  }

  if (!announcements?.length) {
    return (
      <Card className="border-dashed max-w-2xl">
        <CardContent className="py-12 text-center text-muted-foreground">
          <Megaphone className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-semibold mb-1">No Announcements</h3>
          <p className="text-sm">There are no announcements for this class yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 max-w-3xl">
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
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitFeedback = useMutation({
    mutationFn: async () => {
      setIsSubmitting(true);
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
    },
    onSettled: () => {
      setIsSubmitting(false);
    }
  });

  return (
    <Card className="max-w-2xl">
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
          disabled={isSubmitting || !form.message.trim()}
          className="w-full sm:w-auto"
        >
          {isSubmitting ? "Submitting..." : "Submit Feedback"}
        </Button>
      </CardContent>
    </Card>
  );
}