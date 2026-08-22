import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useAnswerLiveRoom, useCloseLiveRoom, useJoinLiveRoom, useLiveRoom, useLiveRoomShare, useStartLiveRoom } from "@/hooks/use-student";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Clock3, Copy, Crown, Loader2, PartyPopper, ShieldCheck, Trophy, Users, XCircle } from "lucide-react";

const letters = ["A", "B", "C", "D", "E"];
const apiBase = import.meta.env.BASE_URL === "/" ? "" : import.meta.env.BASE_URL.replace(/\/$/, "");

export default function StudentLiveRoom() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const client = useQueryClient();
  const joined = useJoinLiveRoom();
  const roomQuery = useLiveRoom(id || "", joined.isSuccess);
  const start = useStartLiveRoom();
  const close = useCloseLiveRoom();
  const answer = useAnswerLiveRoom();
  const share = useLiveRoomShare();
  const [answerMoment, setAnswerMoment] = useState<{ correct: boolean; points: number; rank?: number | null } | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  const inviteCode = new URLSearchParams(window.location.search).get("code")?.toUpperCase() || "";
  const inviteToken = new URLSearchParams(window.location.search).get("invite") || "";
  useEffect(() => {
    if (!inviteCode && !inviteToken) setLocation("/student/live-rooms");
  }, [inviteCode, inviteToken, setLocation]);
  useEffect(() => {
    if (id && (inviteCode || inviteToken) && !joined.isPending && !joined.isSuccess && !joined.isError) {
      joined.mutate({ roomId: Number(id), roomCode: inviteCode || undefined, inviteToken: inviteToken || undefined });
    }
  }, [id, inviteCode, inviteToken, joined]);
  useEffect(() => { if (joined.isError) setLocation("/student/live-rooms"); }, [joined.isError, setLocation]);

  const state = roomQuery.data;
  const room = state?.room;
  const question = state?.question;
  const progress = room ? Math.max(0, ((room.currentQuestionIndex + 1) / room.questionCount) * 100) : 0;

  useEffect(() => {
    if (!room?.questionStartedAt || room.status !== "running") { setTimeLeft(null); return; }
    const tick = () => setTimeLeft(Math.max(0, room.perQuestionSeconds - Math.floor((Date.now() - new Date(room.questionStartedAt!).getTime()) / 1000)));
    tick(); const timer = window.setInterval(tick, 250); return () => window.clearInterval(timer);
  }, [room?.status, room?.questionStartedAt, room?.perQuestionSeconds]);

  useEffect(() => {
    if (!id || !joined.isSuccess) return;
    let socket: WebSocket | null = null; let disposed = false;
    const connect = async () => {
      try {
        const response = await fetch(`${apiBase}/api/student/live-rooms/${id}/ws-ticket`, { method: "POST", credentials: "include" });
        if (!response.ok || disposed) return;
        const { ticket } = await response.json();
        const protocol = location.protocol === "https:" ? "wss" : "ws";
        socket = new WebSocket(`${protocol}://${location.host}${apiBase}/ws/live-quiz?ticket=${encodeURIComponent(ticket)}`);
        socket.onmessage = () => client.invalidateQueries({ queryKey: [`/api/student/live-rooms/${id}`] });
        socketRef.current = socket;
      } catch { /* polling remains the reconnect fallback */ }
    };
    connect();
    return () => { disposed = true; socket?.close(); };
  }, [id, joined.isSuccess, client]);

  const shareRoom = async () => {
    if (!room) return;
    const card = await share.mutateAsync(room.id);
    await navigator.clipboard?.writeText(card.url).catch(() => undefined);
    toast({ title: "Challenge card copied", description: "Send it to friends and see who can top your score." });
  };

  const submitAnswer = (selectedOptionIndex: number) => {
    if (!room || !question || answer.isPending || question.selectedOptionIndex !== null) return;
    answer.mutate({ roomId: room.id, questionId: question.id, selectedOptionIndex }, {
      onSuccess: (result) => {
        setAnswerMoment({ correct: result.isCorrect, points: result.points, rank: result.rank });
        window.setTimeout(() => setAnswerMoment(null), 1200);
      },
      onError: (error: any) => toast({ title: "Answer not saved", description: error.message, variant: "destructive" }),
    });
  };

  const copyInvite = async () => {
    if (!room) return;
    const credential = room.inviteToken ? `invite=${room.inviteToken}` : `code=${room.roomCode}`;
    await navigator.clipboard?.writeText(`${location.origin}${apiBase}/student/live-rooms/${room.id}?${credential}`).catch(() => undefined);
    toast({ title: "Invite link copied", description: `Room code: ${room.roomCode}` });
  };

  const myStudentId = state?.members.find((member) => member.id === state.me.memberId)?.studentId;
  const myRank = useMemo(() => state?.leaderboard.find((entry) => entry.studentId === myStudentId)?.rank, [state, myStudentId]);
  if (joined.isPending || roomQuery.isLoading || !state) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (roomQuery.isError) return <Card><CardContent className="p-8 text-center"><p className="font-medium">This room is unavailable.</p><Button className="mt-4" onClick={() => setLocation("/student/live-rooms")}>Back to live rooms</Button></CardContent></Card>;
  if (!room) return <Card><CardContent className="p-8 text-center"><p className="font-medium">This room is unavailable.</p><Button className="mt-4" onClick={() => setLocation("/student/live-rooms")}>Back to live rooms</Button></CardContent></Card>;

  return <div className="mx-auto max-w-4xl space-y-6 animate-in fade-in duration-300">
    <section className="overflow-hidden rounded-3xl border border-primary/15 bg-gradient-to-r from-primary/15 via-card to-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="mb-2 flex flex-wrap gap-2"><Badge>{room.unitName}</Badge><Badge variant="outline">{room.difficulty} · {room.contentStyle}</Badge></div><h1 className="text-2xl font-bold">{room.topic}</h1><p className="mt-1 text-sm text-muted-foreground">Hosted by {room.hostName} · five choices per question</p></div><div className="rounded-2xl border bg-background/80 px-4 py-2 text-center"><p className="text-xs text-muted-foreground">Room code</p><p className="font-mono text-xl font-bold tracking-[0.16em]">{room.roomCode}</p></div></div>
      <div className="mt-5 flex flex-wrap items-center gap-3 text-sm"><Button variant="outline" size="sm" onClick={copyInvite}><Copy className="mr-2 h-4 w-4" />Copy invite</Button><span className="flex items-center gap-1.5 text-muted-foreground"><Users className="h-4 w-4" />{state.members.filter((member) => member.status === "joined").length} in room</span>{room.status === "running" && <span className="flex items-center gap-1.5 font-medium text-primary"><Clock3 className="h-4 w-4" />{timeLeft ?? room.perQuestionSeconds}s</span>}</div>
    </section>

    {room.status === "generating" && <Card><CardContent className="flex flex-col items-center gap-3 p-10 text-center"><Loader2 className="h-9 w-9 animate-spin text-primary" /><h2 className="font-semibold">Creating your fresh challenge</h2><p className="max-w-md text-sm text-muted-foreground">The AI is writing {room.questionCount} clinically focused five-choice questions. Your room is ready to share now.</p></CardContent></Card>}
    {room.status === "generation_failed" && <Card className="border-destructive/30"><CardContent className="p-8 text-center"><XCircle className="mx-auto h-8 w-8 text-destructive" /><h2 className="mt-3 font-semibold">Generation did not finish</h2><p className="mt-1 text-sm text-muted-foreground">{room.generationError || "Try creating a new room with a shorter topic."}</p><Button className="mt-4" onClick={() => setLocation("/student/live-rooms")}>Create another room</Button></CardContent></Card>}
    {room.status === "ready" && <Card><CardHeader><CardTitle>Waiting room</CardTitle><CardDescription>Everyone is here? The host controls when the countdown begins. Late joins are available until the room closes.</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-3">{state.me.isHost ? <><Button onClick={() => start.mutate(room.id)} disabled={start.isPending}>{start.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Start challenge</Button><Button variant="outline" onClick={() => close.mutate(room.id)}>Close room</Button></> : <p className="flex items-center gap-2 text-sm text-muted-foreground"><Clock3 className="h-4 w-4" />Waiting for {room.hostName} to start the room.</p>}</CardContent></Card>}
    {room.status === "running" && question && <><div className="space-y-2"><div className="flex items-center justify-between text-sm font-medium"><span>Question {room.currentQuestionIndex + 1} of {room.questionCount}</span><span>{timeLeft ?? room.perQuestionSeconds}s</span></div><Progress value={progress} /></div><Card className="overflow-hidden border-primary/15"><CardHeader className="bg-primary/5"><CardTitle className="text-lg leading-relaxed">{question.content}</CardTitle><CardDescription>Choose once — your answer locks immediately and the room advances automatically.</CardDescription></CardHeader><CardContent className="space-y-3 p-5">{question.options.map((option, index) => <button key={`${question.id}-${index}`} onClick={() => submitAnswer(index)} disabled={answer.isPending || question.selectedOptionIndex !== null} className={`flex w-full items-center gap-3 rounded-xl border-2 p-4 text-left transition-all ${question.selectedOptionIndex === index ? "border-primary bg-primary/10" : "border-transparent bg-muted/50 hover:border-primary/30 hover:bg-primary/5"} disabled:cursor-not-allowed`}><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background font-semibold text-primary">{letters[index]}</span><span className="flex-1 text-sm">{option}</span></button>)}</CardContent></Card>{answerMoment && <div className={`fixed inset-x-4 bottom-6 z-50 mx-auto max-w-sm rounded-2xl border p-4 text-center shadow-xl animate-in slide-in-from-bottom-4 ${answerMoment.correct ? "border-emerald-500/30 bg-emerald-500 text-white" : "border-card bg-card"}`}>{answerMoment.correct ? <PartyPopper className="mx-auto mb-1 h-6 w-6" /> : <ShieldCheck className="mx-auto mb-1 h-6 w-6 text-primary" />}<p className="font-bold">{answerMoment.correct ? `Correct · +${answerMoment.points}` : "Locked in"}</p>{answerMoment.rank && <p className="text-xs opacity-80">You’re now #{answerMoment.rank}</p>}</div>}</>}
    {room.status === "running" && !question && <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Waiting for the next question…</CardContent></Card>}
    {room.status === "running" && <Card className="border-primary/10"><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Trophy className="h-4 w-4 text-primary" />Live standings</CardTitle><CardDescription>Rank updates as answers arrive. Scores and correct answers stay hidden until the match ends.</CardDescription></CardHeader><CardContent className="space-y-2">{state.leaderboard.map((entry) => <div key={entry.studentId} className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm transition-all ${entry.studentId === myStudentId ? "bg-primary/10 ring-1 ring-primary/20" : "bg-muted/40"}`}><span className="flex items-center gap-2 font-medium"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-background text-xs text-primary">#{entry.rank || "—"}</span>{entry.name}</span><span className="text-xs text-muted-foreground">{entry.answerCount > room.currentQuestionIndex ? "Answered" : "Thinking…"}</span></div>)}</CardContent></Card>}
    {room.status === "finished" && <section className="space-y-6"><Card className="overflow-hidden border-primary/20"><div className="bg-gradient-to-br from-primary via-primary to-indigo-600 p-8 text-primary-foreground"><Trophy className="h-9 w-9" /><p className="mt-3 text-sm font-medium uppercase tracking-[0.18em]">Match complete</p><h2 className="mt-1 text-3xl font-bold">You finished #{myRank || "—"}</h2><p className="mt-2 text-primary-foreground/80">Turn this result into a friendly challenge.</p></div><CardContent className="p-6"><Button onClick={shareRoom} disabled={share.isPending}>{share.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}<Copy className="mr-2 h-4 w-4" />Copy share card</Button></CardContent></Card><Card><CardHeader><CardTitle>Final standings</CardTitle></CardHeader><CardContent className="space-y-2">{state.leaderboard.map((entry) => <div key={entry.studentId} className="flex items-center justify-between rounded-xl bg-muted/40 px-4 py-3"><span className="flex items-center gap-2 font-medium">{entry.rank === 1 && <Crown className="h-4 w-4 text-amber-500" />}#{entry.rank} {entry.name}</span><span className="text-sm"><strong>{entry.score ?? 0}</strong> pts · {entry.correctCount ?? 0} correct</span></div>)}</CardContent></Card></section>}
    {["closed", "expired"].includes(room.status) && <Card><CardContent className="p-8 text-center"><XCircle className="mx-auto h-8 w-8 text-muted-foreground" /><h2 className="mt-3 font-semibold">This room has closed</h2><Button className="mt-4" onClick={() => setLocation("/student/live-rooms")}>Find another room</Button></CardContent></Card>}
    <Card><CardHeader><CardTitle className="text-base">In the room</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">{state.members.map((member) => <Badge key={member.id} variant={member.role === "host" ? "default" : "secondary"}>{member.role === "host" && <Crown className="mr-1 h-3 w-3" />}{member.name}</Badge>)}</CardContent></Card>
  </div>;
}