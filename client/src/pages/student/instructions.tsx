import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Clock, Timer, AlertTriangle, ChevronRight, FileText,
  HelpCircle, CheckCircle2, ArrowRight, Ban
} from "lucide-react";
import logoPath from "@assets/medqrown_logo.png";

function formatSeconds(secs: number): string {
  if (secs >= 3600) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  if (secs >= 60) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return s > 0 ? `${m}m ${s}s` : `${m} min`;
  }
  return `${secs}s`;
}

export default function StudentInstructions() {
  const [, setLocation] = useLocation();

  const { data: info, isLoading } = useQuery<{
    title: string;
    timerMode: string;
    perQuestionSeconds: number | null;
    fullExamSeconds: number | null;
    totalQuestions: number;
    mcqCount: number;
    saqCount: number;
  }>({
    queryKey: ["/api/student/exam-info"],
  });

  const handleStartExam = () => {
    setLocation("/student/exam");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading exam details...</p>
        </div>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5">
        <Card className="max-w-sm w-full mx-4">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="w-10 h-10 text-destructive mx-auto mb-3" />
            <p className="font-semibold">Unable to load exam</p>
            <p className="text-sm text-muted-foreground mt-1">Please log in again.</p>
            <Button className="mt-4 w-full" onClick={() => setLocation("/")}>Back to Login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isPerQuestion = info.timerMode === "per_question";
  const isFullExam = info.timerMode === "full_exam";
  const isTimed = isPerQuestion || isFullExam;

  const timerRules = isPerQuestion
    ? [
        {
          icon: <Timer className="w-4 h-4 text-amber-500" />,
          text: `Each question is individually timed — you have ${formatSeconds(info.perQuestionSeconds ?? 0)} per question`,
          highlight: true,
        },
        {
          icon: <ChevronRight className="w-4 h-4 text-amber-500" />,
          text: "When time runs out on a question, it automatically moves to the next one",
        },
      ]
    : isFullExam
    ? [
        {
          icon: <Clock className="w-4 h-4 text-amber-500" />,
          text: `The entire exam must be completed within ${formatSeconds(info.fullExamSeconds ?? 0)}`,
          highlight: true,
        },
        {
          icon: <ChevronRight className="w-4 h-4 text-amber-500" />,
          text: "When the total time runs out, the exam is automatically submitted",
        },
      ]
    : [];

  const generalRules = [
    {
      icon: <Ban className="w-4 h-4 text-destructive" />,
      text: "You cannot go back to a previous question once you move on",
    },
    ...(isTimed
      ? [
          {
            icon: <AlertTriangle className="w-4 h-4 text-destructive" />,
            text: "Do not refresh or close the browser tab during the exam — the timer keeps running",
          },
        ]
      : []),
    {
      icon: <CheckCircle2 className="w-4 h-4 text-primary" />,
      text: "Read each question carefully before answering",
    },
    {
      icon: <CheckCircle2 className="w-4 h-4 text-primary" />,
      text: "For multiple choice questions, select the single best answer",
    },
    ...(info.saqCount > 0
      ? [
          {
            icon: <CheckCircle2 className="w-4 h-4 text-primary" />,
            text: "For short answer questions, write a clear and concise response — AI will mark them",
          },
        ]
      : []),
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-start px-4 py-8 sm:py-12">

        <img
          src={logoPath}
          alt="MedQrown"
          className="h-20 sm:h-24 w-auto object-contain mb-6"
          data-testid="img-logo"
        />

        <div className="w-full max-w-lg space-y-5">

          <div className="text-center space-y-1">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary/70">Exam Instructions</p>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" data-testid="text-exam-title">
              {info.title}
            </h1>
          </div>

          <Card className="border-primary/10 shadow-md">
            <CardContent className="p-5 space-y-4">

              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5 bg-muted rounded-lg px-3 py-1.5">
                  <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-sm font-medium">{info.totalQuestions} Questions</span>
                </div>
                {info.mcqCount > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {info.mcqCount} MCQ
                  </Badge>
                )}
                {info.saqCount > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {info.saqCount} SAQ
                  </Badge>
                )}
                {isPerQuestion && (
                  <Badge className="text-xs bg-amber-500/10 text-amber-700 border-amber-500/20 hover:bg-amber-500/10">
                    <Timer className="w-3 h-3 mr-1" />
                    {formatSeconds(info.perQuestionSeconds ?? 0)} / question
                  </Badge>
                )}
                {isFullExam && (
                  <Badge className="text-xs bg-amber-500/10 text-amber-700 border-amber-500/20 hover:bg-amber-500/10">
                    <Clock className="w-3 h-3 mr-1" />
                    {formatSeconds(info.fullExamSeconds ?? 0)} total
                  </Badge>
                )}
                {!isTimed && (
                  <Badge variant="outline" className="text-xs">
                    No time limit
                  </Badge>
                )}
              </div>

              {timerRules.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-2.5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Timer Rules</p>
                    {timerRules.map((rule, i) => (
                      <div
                        key={i}
                        className={`flex items-start gap-2.5 p-2.5 rounded-lg ${rule.highlight ? "bg-amber-500/5 border border-amber-500/15" : ""}`}
                      >
                        <div className="mt-0.5 shrink-0">{rule.icon}</div>
                        <p className="text-sm leading-relaxed">{rule.text}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <Separator />

              <div className="space-y-2.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">General Rules</p>
                {generalRules.map((rule, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <div className="mt-0.5 shrink-0">{rule.icon}</div>
                    <p className="text-sm leading-relaxed text-muted-foreground">{rule.text}</p>
                  </div>
                ))}
              </div>

              <Separator />

              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-primary/5 border border-primary/10">
                <HelpCircle className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  If you experience any technical issues during the exam, contact your exam administrator immediately.
                </p>
              </div>

            </CardContent>
          </Card>

          <Button
            size="lg"
            className="w-full h-13 text-base font-semibold shadow-md"
            onClick={handleStartExam}
            data-testid="button-start-exam"
          >
            Start Exam
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>

          <p className="text-center text-xs text-muted-foreground pb-4">
            By clicking <strong>Start Exam</strong>, you confirm you have read and understood the instructions above.
          </p>

        </div>
      </div>
    </div>
  );
}
