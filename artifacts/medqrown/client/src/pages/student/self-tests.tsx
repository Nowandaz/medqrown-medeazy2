import { useState } from "react";
import { Link, useLocation } from "wouter";
import { 
  useStudentUnits, useSelfTests, useCreateSelfTest, 
  useGenerateSelfTest, useStartSelfTest, SelfTestSummary 
  , useDeleteSelfTest
} from "@/hooks/use-student";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { 
  Dialog, DialogContent, DialogDescription, DialogHeader, 
  DialogTitle, DialogTrigger, DialogFooter 
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Play, Brain, RefreshCw, AlertTriangle, Clock, BrainCircuit, CheckCircle, Trash2 } from "lucide-react";

function CreateSelfTestDialog() {
  const [open, setOpen] = useState(false);
  const { data: units } = useStudentUnits();
  const [setup, setSetup] = useState({
    unitId: "",
    title: "",
    focus: "",
    questionType: "mixed",
    contentStyle: "mixed",
    questionCount: "10",
    useTimer: false,
    timerMinutes: "15"
  });
  const createMutation = useCreateSelfTest();
  const { toast } = useToast();

  const handleCreate = (saveOnly: boolean) => {
    createMutation.mutate({
      unitId: parseInt(setup.unitId),
      title: setup.title || undefined,
      focus: setup.focus || undefined,
      questionType: setup.questionType as "mcq" | "saq" | "mixed",
      contentStyle: setup.contentStyle as "direct" | "clinical" | "mixed",
      questionCount: parseInt(setup.questionCount),
      timerSeconds: setup.useTimer ? parseInt(setup.timerMinutes) * 60 : null,
      saveOnly
    }, {
      onSuccess: () => {
        setOpen(false);
        toast({ title: "Self-test created successfully" });
        setSetup({ ...setup, title: "", focus: "" });
      },
      onError: (e: any) => {
        toast({ title: "Failed to create test", description: e.message, variant: "destructive" });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="shadow-sm"><Plus className="w-4 h-4 mr-2" /> New Self-Test</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create AI Self-Test</DialogTitle>
          <DialogDescription>Target your weak points and practice with custom AI-generated questions.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Unit <span className="text-destructive">*</span></Label>
            <Select value={setup.unitId} onValueChange={(v) => setSetup({...setup, unitId: v})}>
              <SelectTrigger><SelectValue placeholder="Select a unit" /></SelectTrigger>
              <SelectContent>
                {units?.map(u => <SelectItem key={u.id} value={String(u.id)}>{u.code} - {u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label>Title (Optional)</Label>
            <Input placeholder="e.g. Endocrine System Review" value={setup.title} onChange={e => setSetup({...setup, title: e.target.value})} />
          </div>
          
          <div className="space-y-2">
            <Label>Focus Area (Optional)</Label>
            <Textarea placeholder="What specific topics should the AI focus on?" value={setup.focus} onChange={e => setSetup({...setup, focus: e.target.value})} rows={2} />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Question Type</Label>
              <Select value={setup.questionType} onValueChange={(v) => setSetup({...setup, questionType: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mcq">Multiple Choice</SelectItem>
                  <SelectItem value="saq">Short Answer</SelectItem>
                  <SelectItem value="mixed">Mixed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Content Style</Label>
              <Select value={setup.contentStyle} onValueChange={(v) => setSetup({...setup, contentStyle: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="direct">Direct Knowledge</SelectItem>
                  <SelectItem value="clinical">Clinical Scenarios</SelectItem>
                  <SelectItem value="mixed">Mixed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Question Count</Label>
               <Input type="number" min="3" max="20" value={setup.questionCount} onChange={e => setSetup({...setup, questionCount: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2 mb-2">
                <Checkbox checked={setup.useTimer} onCheckedChange={(c) => setSetup({...setup, useTimer: !!c})} />
                Enable Timer
              </Label>
              {setup.useTimer && (
                 <div className="flex items-center gap-2">
                   <Input type="number" min="1" max="180" value={setup.timerMinutes} onChange={e => setSetup({...setup, timerMinutes: e.target.value})} />
                   <span className="text-sm text-muted-foreground">mins</span>
                 </div>
              )}
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => handleCreate(true)} disabled={createMutation.isPending || !setup.unitId}>
            Save as Draft
          </Button>
          <Button onClick={() => handleCreate(false)} disabled={createMutation.isPending || !setup.unitId}>
            {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <BrainCircuit className="w-4 h-4 mr-2" />}
            Generate Questions
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TestStatusBadges({ test }: { test: SelfTestSummary }) {
  if (test.status === "draft") return <Badge variant="secondary">Draft</Badge>;
  if (test.status === "generating") return <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20"><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Generating</Badge>;
  if (test.status === "generation_failed") return <Badge variant="destructive">Generation Failed</Badge>;
  
  if (test.latestAttemptStatus === "submitted") {
    return (
      <div className="flex gap-2">
        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:border-green-800 dark:text-green-400">Completed</Badge>
        {test.scorePercent != null && <Badge variant="secondary">{test.scorePercent.toFixed(0)}%</Badge>}
      </div>
    );
  }
  if (test.latestAttemptStatus === "in_progress") {
    return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-400">In Progress</Badge>;
  }

  return <Badge variant="default" className="bg-primary hover:bg-primary/90">Ready to Start</Badge>;
}

function SelfTestCard({ test }: { test: SelfTestSummary }) {
  const [, setLocation] = useLocation();
  const generateMutation = useGenerateSelfTest();
  const startMutation = useStartSelfTest();
  const deleteMutation = useDeleteSelfTest();
  const { toast } = useToast();

  const handleStart = () => {
    startMutation.mutate(test.id, {
      onSuccess: (data) => setLocation(`/student/self-tests/${data.attemptId}/run`),
      onError: (e: any) => toast({ title: "Failed to start", description: e.message, variant: "destructive" })
    });
  };

  const handleGenerate = () => {
    generateMutation.mutate(test.id, {
      onError: (e: any) => toast({ title: "Generation failed", description: e.message, variant: "destructive" })
    });
  };

  const handleDelete = () => {
    if (!window.confirm(`Delete “${test.title}”? This removes its saved questions and attempt history.`)) return;
    deleteMutation.mutate(test.id, {
      onSuccess: () => toast({ title: "Self-test deleted" }),
      onError: (e: any) => toast({ title: "Could not delete self-test", description: e.message, variant: "destructive" }),
    });
  };

  return (
    <Card className="flex flex-col overflow-hidden transition-all hover:shadow-md border-primary/10">
      <CardHeader className="bg-muted/30 border-b pb-4">
        <div className="flex justify-between items-start gap-4 mb-2">
          <div className="space-y-1 min-w-0">
            <CardTitle className="text-lg leading-tight truncate" title={test.title}>{test.title || `${test.unitName} Practice`}</CardTitle>
            <CardDescription className="text-xs font-medium text-primary/80 truncate">{test.unitName}</CardDescription>
          </div>
          <div className="shrink-0"><TestStatusBadges test={test} /></div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 pt-4 pb-2 space-y-4">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline" className="text-[10px] uppercase tracking-wider">{test.questionCount} Questions</Badge>
          <Badge variant="outline" className="text-[10px] uppercase tracking-wider">{test.questionType}</Badge>
          <Badge variant="outline" className="text-[10px] uppercase tracking-wider">{test.contentStyle}</Badge>
          {test.timerSeconds && (
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider bg-primary/5">
              <Clock className="w-3 h-3 mr-1" /> {test.timerSeconds / 60}m limit
            </Badge>
          )}
        </div>
        
        {test.focus && (
          <div className="bg-background rounded-md border p-2.5">
            <span className="text-xs font-semibold text-muted-foreground block mb-0.5">Focus Area:</span>
            <p className="text-sm text-foreground/90 line-clamp-2">{test.focus}</p>
          </div>
        )}

        {test.generationError && (
          <div className="p-2.5 bg-destructive/10 text-destructive rounded-md text-xs border border-destructive/20 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="leading-tight">{test.generationError}</p>
          </div>
        )}
        {test.attempts && test.attempts.filter((attempt) => attempt.status === "submitted").length > 1 && (
          <div className="rounded-md border bg-background p-2.5">
            <span className="text-xs font-semibold text-muted-foreground block mb-1.5">Previous attempts</span>
            <div className="flex flex-wrap gap-1.5">
              {test.attempts.filter((attempt) => attempt.status === "submitted").map((attempt, index) => (
                <Link key={attempt.attemptId} href={`/student/self-tests/${attempt.attemptId}/results`}>
                  <Badge variant="outline" className="cursor-pointer hover:bg-muted">
                    Attempt {test.attempts!.filter((item) => item.status === "submitted").length - index} · {attempt.scorePercent ?? 0}%
                  </Badge>
                </Link>
              ))}
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter className="pt-2 pb-4 bg-muted/10 gap-2 flex-wrap">
        <Button onClick={handleDelete} size="sm" variant="ghost" className="ml-auto text-muted-foreground hover:text-destructive" disabled={deleteMutation.isPending}>
          {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1.5" />}
          Delete
        </Button>
        {test.status === "draft" && (
          <Button onClick={handleGenerate} size="sm" className="w-full" disabled={generateMutation.isPending}>
            {generateMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <BrainCircuit className="w-4 h-4 mr-2" />}
            Generate Questions
          </Button>
        )}
        
        {test.status === "generating" && (
          <Button disabled size="sm" className="w-full" variant="secondary">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" /> AI is generating...
          </Button>
        )}
        
        {test.status === "generation_failed" && (
          <Button onClick={handleGenerate} size="sm" variant="destructive" className="w-full" disabled={generateMutation.isPending}>
            <RefreshCw className="w-4 h-4 mr-2" /> Retry Generation
          </Button>
        )}

        {test.status === "ready" && test.latestAttemptStatus === "in_progress" && test.latestAttemptId && (
          <Button onClick={() => setLocation(`/student/self-tests/${test.latestAttemptId}/run`)} size="sm" className="w-full">
            <Play className="w-4 h-4 mr-2" /> Resume Test
          </Button>
        )}

        {test.status === "ready" && test.latestAttemptStatus === "submitted" && test.latestAttemptId && (
          <div className="grid grid-cols-2 gap-2 w-full">
            <Button onClick={() => setLocation(`/student/self-tests/${test.latestAttemptId}/results`)} size="sm" variant="outline">
              <CheckCircle className="w-4 h-4 mr-2 text-green-600" /> Results
            </Button>
            <Button onClick={handleStart} size="sm" disabled={startMutation.isPending}>
              {startMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Re-take
            </Button>
          </div>
        )}

        {test.status === "ready" && !test.latestAttemptStatus && (
          <Button onClick={handleStart} size="sm" className="w-full" disabled={startMutation.isPending}>
            {startMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
            Start Test
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

function SelfTestList() {
  const { data: tests, isLoading } = useSelfTests();

  if (isLoading) {
    return (
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-64 w-full rounded-xl" />)}
      </div>
    );
  }

  if (!tests?.length) {
    return (
      <div className="flex h-[300px] flex-col items-center justify-center text-center rounded-xl border border-dashed">
        <Brain className="h-10 w-10 text-muted-foreground/30 mb-4" />
        <p className="text-sm font-medium">No self-tests yet</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm">
          Create your first AI-generated self-test to practice clinical scenarios or review your weak areas.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {tests.map(test => (
        <SelfTestCard key={test.id} test={test} />
      ))}
    </div>
  );
}

export default function StudentSelfTests() {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Self-Tests</h1>
          <p className="text-muted-foreground mt-2">
            Practice with custom AI-generated medical scenarios and questions.
          </p>
        </div>
        <CreateSelfTestDialog />
      </div>
      <SelfTestList />
    </div>
  );
}
