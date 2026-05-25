import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BookOpen, Plus, LogOut, Settings, Trash2, Play, Pause, Eye,
  Clock, FileText, GraduationCap, Users, Building2, Mail, CheckCircle, AlertCircle
} from "lucide-react";
import type { Exam } from "@shared/schema";
import logoPath from "@assets/medqrown_logo.png";
import AdminSignups from "@/pages/admin/signups";

function MasterStudentDatabase() {
  const { data: allStudents, isLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/all-students"],
  });

  const statusColors: Record<string, string> = {
    submitted: "text-green-600",
    in_progress: "text-amber-600",
    not_started: "text-muted-foreground",
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          Master Student Database
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">{allStudents?.length || 0} student{(allStudents?.length || 0) !== 1 ? "s" : ""} registered</p>
      </div>
      {!allStudents?.length ? (
        <Card className="border-dashed border-2 shadow-none">
          <CardContent className="py-14 text-center">
            <Users className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">No students yet. They appear here when added to any exam or approved via sign-up.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {allStudents.map((student: any) => (
            <Card key={student.id} className="shadow-sm">
              <CardContent className="py-3 px-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{student.name}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Mail className="w-3 h-3" />{student.email}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {student.exams.length === 0 ? (
                      <Badge variant="outline" className="text-xs gap-1">
                        <AlertCircle className="w-3 h-3" />No exams
                      </Badge>
                    ) : (
                      student.exams.map((e: any, i: number) => (
                        <Badge key={i} variant="secondary" className={`text-xs gap-1 ${statusColors[e.attemptStatus] || ""}`}>
                          {e.attemptStatus === "submitted" && <CheckCircle className="w-3 h-3" />}
                          {e.examTitle} · {e.attemptStatus?.replace("_", " ")}
                        </Badge>
                      ))
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"exams" | "signups" | "students">("exams");
  const [showCreate, setShowCreate] = useState(false);
  const [newExam, setNewExam] = useState({ title: "", timerMode: "none", perQuestionSeconds: 60, fullExamSeconds: 3600 });
  const [confirmDeleteExamId, setConfirmDeleteExamId] = useState<number | null>(null);

  const { data: admin, isLoading: adminLoading } = useQuery<any>({
    queryKey: ["/api/admin/me"],
  });

  const { data: exams, isLoading: examsLoading } = useQuery<Exam[]>({
    queryKey: ["/api/exams"],
  });

  const createExam = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/exams", {
        title: newExam.title,
        timerMode: newExam.timerMode,
        perQuestionSeconds: newExam.timerMode === "per_question" ? newExam.perQuestionSeconds : null,
        fullExamSeconds: newExam.timerMode === "full_exam" ? newExam.fullExamSeconds : null,
        status: "draft",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exams"] });
      setShowCreate(false);
      setNewExam({ title: "", timerMode: "none", perQuestionSeconds: 60, fullExamSeconds: 3600 });
      toast({ title: "Exam Created" });
    },
  });

  const deleteExam = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/exams/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exams"] });
      toast({ title: "Exam Deleted" });
    },
  });

  const toggleExamStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      await apiRequest("PATCH", `/api/exams/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exams"] });
    },
  });

  const handleLogout = async () => {
    await apiRequest("POST", "/api/admin/logout");
    setLocation("/admin");
  };

  if (adminLoading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <Skeleton className="h-8 w-48 mb-6" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (!admin) {
    setLocation("/admin");
    return null;
  }

  const statusConfig: Record<string, { variant: "default" | "secondary" | "outline"; dot: string }> = {
    active: { variant: "default", dot: "bg-green-500" },
    draft: { variant: "secondary", dot: "bg-yellow-500" },
    inactive: { variant: "outline", dot: "bg-gray-400" },
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-primary/3">
      <header className="border-b bg-card/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src={logoPath} alt="MedQrown" className="h-10 w-auto object-contain" data-testid="img-logo" />
            <div>
              <h1 className="text-lg font-bold" data-testid="text-dashboard-title">MedQrown MedEazy</h1>
              <p className="text-xs text-muted-foreground">Welcome, {admin.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-xs font-medium">{admin.role.replace("_", " ")}</Badge>
            <Button variant="ghost" size="icon" onClick={() => setLocation("/admin/settings")} data-testid="button-settings">
              <Settings className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleLogout} data-testid="button-logout">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Tab switcher */}
        <div className="flex gap-1 mb-6 bg-muted/50 p-1 rounded-lg w-fit">
          <button
            onClick={() => setActiveTab("exams")}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === "exams"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <BookOpen className="w-4 h-4" />
            Exams
          </button>
          <button
            onClick={() => setActiveTab("signups")}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === "signups"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <GraduationCap className="w-4 h-4" />
            Sign-Up Requests
          </button>
          <button
            onClick={() => setActiveTab("students")}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === "students"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Users className="w-4 h-4" />
            All Students
          </button>
        </div>

        {activeTab === "signups" && <AdminSignups />}
        {activeTab === "students" && <MasterStudentDatabase />}

        {activeTab === "exams" && <>
        <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
          <div>
            <h2 className="text-xl font-bold">Examiner Dashboard</h2>
            <p className="text-sm text-muted-foreground mt-0.5">{exams?.length || 0} exam{(exams?.length || 0) !== 1 ? "s" : ""} total</p>
          </div>
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button className="shadow-sm" data-testid="button-create-exam">
                <Plus className="w-4 h-4 mr-2" />
                Create Exam
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Exam</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>Exam Title</Label>
                  <Input
                    placeholder="e.g. Anatomy Mid-Term 2026"
                    value={newExam.title}
                    onChange={(e) => setNewExam({ ...newExam, title: e.target.value })}
                    className="h-11"
                    data-testid="input-exam-title"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Timer Mode</Label>
                  <Select value={newExam.timerMode} onValueChange={(v) => setNewExam({ ...newExam, timerMode: v })}>
                    <SelectTrigger data-testid="select-timer-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Timer</SelectItem>
                      <SelectItem value="per_question">Per Question</SelectItem>
                      <SelectItem value="full_exam">Full Exam</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {newExam.timerMode === "per_question" && (
                  <div className="space-y-2">
                    <Label>Seconds Per Question</Label>
                    <Input
                      type="number"
                      value={newExam.perQuestionSeconds}
                      onChange={(e) => setNewExam({ ...newExam, perQuestionSeconds: parseInt(e.target.value) || 60 })}
                      data-testid="input-per-question-seconds"
                    />
                  </div>
                )}
                {newExam.timerMode === "full_exam" && (
                  <div className="space-y-2">
                    <Label>Total Exam Seconds</Label>
                    <Input
                      type="number"
                      value={newExam.fullExamSeconds}
                      onChange={(e) => setNewExam({ ...newExam, fullExamSeconds: parseInt(e.target.value) || 3600 })}
                      data-testid="input-full-exam-seconds"
                    />
                    <p className="text-xs text-muted-foreground">{Math.floor(newExam.fullExamSeconds / 60)} minutes</p>
                  </div>
                )}
                <Button
                  className="w-full h-11"
                  onClick={() => createExam.mutate()}
                  disabled={!newExam.title || createExam.isPending}
                  data-testid="button-submit-exam"
                >
                  {createExam.isPending ? "Creating..." : "Create Exam"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {examsLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-44 rounded-xl" />)}
          </div>
        ) : !exams?.length ? (
          <Card className="border-dashed border-2 shadow-none">
            <CardContent className="py-14 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 mb-4">
                <BookOpen className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-1">No Exams Yet</h3>
              <p className="text-sm text-muted-foreground mb-4">Create your first exam to get started.</p>
              <Button onClick={() => setShowCreate(true)} className="shadow-sm" data-testid="button-create-exam-empty">
                <Plus className="w-4 h-4 mr-2" />Create Exam
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {exams.map((exam) => {
              const sc = statusConfig[exam.status] || statusConfig.draft;
              return (
                <Card key={exam.id} className="shadow-sm hover:shadow-md transition-shadow group overflow-hidden" data-testid={`card-exam-${exam.id}`}>
                  <div className={`h-1 ${exam.status === "active" ? "bg-green-500" : exam.status === "draft" ? "bg-yellow-500" : "bg-gray-300"}`} />
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/admin/exams/${exam.id}`} className="min-w-0 flex-1">
                        <h3 className="font-semibold truncate group-hover:text-primary transition-colors" data-testid={`text-exam-title-${exam.id}`}>{exam.title}</h3>
                      </Link>
                      <Badge variant={sc.variant} className="shrink-0 text-xs gap-1" data-testid={`badge-status-${exam.id}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                        {exam.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(exam.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-3">
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {exam.timerMode === "per_question" ? `${exam.perQuestionSeconds}s/q` :
                         exam.timerMode === "full_exam" ? `${Math.floor((exam.fullExamSeconds || 0) / 60)}min` :
                         "No timer"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                      <Link href={`/admin/exams/${exam.id}`}>
                        <Button variant="secondary" size="sm" className="h-8 text-xs" data-testid={`button-view-${exam.id}`}>
                          <Eye className="w-3 h-3 mr-1" />View
                        </Button>
                      </Link>
                      {exam.status !== "active" ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={(e) => { e.stopPropagation(); toggleExamStatus.mutate({ id: exam.id, status: "active" }); }}
                          data-testid={`button-activate-${exam.id}`}
                        >
                          <Play className="w-3 h-3 mr-1" />Activate
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={(e) => { e.stopPropagation(); toggleExamStatus.mutate({ id: exam.id, status: "inactive" }); }}
                          data-testid={`button-deactivate-${exam.id}`}
                        >
                          <Pause className="w-3 h-3 mr-1" />Deactivate
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-destructive hover:text-destructive ml-auto"
                        onClick={(e) => { e.stopPropagation(); setConfirmDeleteExamId(exam.id); }}
                        data-testid={`button-delete-${exam.id}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
        </>}
      </main>

      <AlertDialog open={confirmDeleteExamId !== null} onOpenChange={(open) => { if (!open) setConfirmDeleteExamId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete this exam?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">This will <strong>permanently delete</strong> the exam along with <strong>all questions, student enrolments, attempts, answers, and results</strong>.</span>
              <span className="block text-destructive font-medium">This cannot be undone.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (confirmDeleteExamId !== null) { deleteExam.mutate(confirmDeleteExamId); setConfirmDeleteExamId(null); } }}
            >
              Yes, delete everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
