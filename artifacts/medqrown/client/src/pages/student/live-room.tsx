import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useAnswerLiveRoom, useCloseLiveRoom, useJoinLiveRoom, useLiveRoom, useLiveRoomShare, useStartLiveRoom } from "@/hooks/use-student";
import { getStudentAvatarUrl } from "@/lib/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, CheckCircle2, Clock3, Copy, Crown, Loader2, PartyPopper, ShieldCheck, Trophy, Users, XCircle } from "lucide-react";

const letters = ["A", "B", "C", "D", "E"];
const apiBase = import.meta.env.BASE_URL === "/" ? "" : import.meta.env.BASE_URL.replace(/\/$/, "");
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?";

function PlayerAvatar({ name, avatarKey, compact = false }: { name: string; avatarKey?: string | null; compact?: boolean }) {
  return <div className={`relative shrink-0 ${compact ? "h-7 w-7" : "h-10 w-10"}`} title={name}>
    <img className="h-full w-full rounded-full border-2 border-background bg-muted object-cover" src={getStudentAvatarUrl(avatarKey, compact ? 56 : 80)} alt="" />
    {!compact && <span className="absolute -bottom-1 -right-1 rounded-full border border-background bg-primary px-1 py-0.5 text-[8px] font-bold leading-none text-primary-foreground">{initials(name)}</span>}
  </div>;
}

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
  const serverOffset = useRef(0);
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
    if (room?.serverNow) serverOffset.current = room.serverNow - Date.now();
  }, [room?.serverNow]);
  useEffect(() => {
    if (!room?.questionDeadlineAt || room.status !== "running") { setTimeLeft(null); return; }
    const deadline = new Date(room.questionDeadlineAt).getTime();
    const tick = () => setTimeLeft(Math.max(0, Math.ceil((deadline - (Date.now() + serverOffset.current)) / 1000)));
    tick();
    const timer = window.setInterval(tick, 200);
    return () => window.clearInterval(timer);
  }, [room?.status, room?.questionDeadlineAt]);

  useEffect(() => {
    if (!id || !joined.isSuccess) return;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let disposed = false;
    const connect = async () => {
      try {
        const response = await fetch(`${apiBase}/api/student/live-rooms/${id}/ws-ticket`, { method: "POST", credentials: "include" });
        if (!response.ok || disposed) return;
        const { ticket } = await response.json();
        const protocol = location.protocol === "https:" ? "wss" : "ws";
        socket = new WebSocket(`${protocol}://${location.host}${apiBase}/ws/live-quiz?ticket=${encodeURIComponent(ticket)}`);
        socket.onmessage = () => client.invalidateQueries({ queryKey: [`/api/student/live-rooms/${id}`] });
        socket.onclose = () => { if (!disposed) reconnectTimer = window.setTimeout(connect, 1000); };
      } catch {
        if (!disposed) reconnectTimer = window.setTimeout(connect, 2000);
      }
    };
    connect();
    return () => { disposed = true; if (reconnectTimer) window.clearTimeout(reconnectTimer); socket?.close(); };
  }, [id, joined.isSuccess, client]);

  const shareRoom = async () => {
    if (!room) return;
    const card = await share.mutateAsync(room.id);
    await navigator.clipboard?.writeText(card.url).catch(() => undefined);
    toast({ title: "Share card copied", description: "Your link uses a short MedQrown challenge code." });
  };
  const submitAnswer = (selectedOptionIndex: number) => {
    if (!room || !question || answer.isPending || question.selectedOptionIndex !== null) return;
    answer.mutate({ roomId: room.id, questionId: question.id, selectedOptionIndex }, {
      onSuccess: (result) => {
        setAnswerMoment({ correct: result.isCorrect, points: result.points, rank: result.rank });
        window.setTimeout(() => setAnswerMoment(null), 1500);
      },
      onError: (error: any) => toast({ title: "Answer not saved", description: error.message, variant: "destructive" }),
    });
  };
  const copyInvite = async () => {
    if (!room) return;
    await navigator.clipboard?.writeText(`${location.origin}${apiBase}/join/${room.roomCode}`).catch(() => undefined);
    toast({ title: "Clean room link copied", description: `Room code: ${room.roomCode}` });
  };

  const myStudentId = state?.members.find((member) => member.id === state.me.memberId)?.studentId;
  const myRank = useMemo(() => state?.leaderboard.find((entry) => entry.studentId === myStudentId)?.rank, [state, myStudentId]);
  if (joined.isPending || roomQuery.isLoading || !state) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (roomQuery.isError || !room) return <Card className="m-5"><CardContent className="p-8 text-center"><p className="font-medium">This room is unavailable.</p><Button className="mt-4" onClick={() => setLocation("/student/live-rooms")}>Back to live rooms</Button></CardContent></Card>;

  const standings = <Card className="border-primary/10"><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Trophy className="h-4 w-4 text-primary" />Live standings</CardTitle><CardDescription>Scores, streaks, and ranks refresh for everyone as each answer locks.</CardDescription></CardHeader><CardContent className="space-y-2">{state.leaderboard.map((entry) => <div key={entry.studentId} className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm transition-all ${entry.studentId === myStudentId ? "bg-primary/10 ring-1 ring-primary/20" : "bg-muted/40"}`}><div className="flex min-w-0 items-center gap-2"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-background text-xs font-semibold text-primary">#{entry.rank || "—"}</span><PlayerAvatar name={entry.name} avatarKey={entry.avatarKey} compact /><span className="truncate font-medium">{entry.name}</span></div><div className="shrink-0 text-right"><p className="font-semibold">{entry.score ?? 0} pts</p><p className="text-[11px] text-muted-foreground">{entry.correctCount ?? 0} correct · {entry.answerCount > room.currentQuestionIndex ? "locked" : "thinking"}</p></div></div>)}</CardContent></Card>;

  return <div className="mx-auto max-w-6xl space-y-4 px-4 py-5 sm:space-y-6 sm:px-6 sm:py-8 animate-in fade-in duration-300">
    <section className="overflow-hidden rounded-3xl border border-primary/15 bg-gradient-to-br from-primary/15 via-card to-card p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3"><Button variant="ghost" size="sm" className="-ml-2" onClick={() => setLocation("/student/live-rooms")}><ArrowLeft className="mr-1 h-4 w-4" />Live rooms</Button><Button variant="outline" size="sm" onClick={copyInvite}><Copy className="mr-1.5 h-4 w-4" />Invite</Button></div>
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="mb-2 flex flex-wrap gap-2"><Badge>{room.unitName}</Badge><Badge variant="outline">{room.difficulty} · {room.contentStyle}</Badge></div><h1 className="break-words text-2xl font-bold sm:text-3xl">{room.topic}</h1><p className="mt-1 text-sm text-muted-foreground">Hosted by {room.hostName} · five choices per question</p></div><div className="self-start rounded-2xl border bg-background/80 px-4 py-2 text-center"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Room code</p><p className="font-mono text-lg font-bold tracking-[0.14em]">{room.roomCode}</p></div></div>
      <div className="mt-5 flex flex-wrap items-center gap-3 text-sm"><span className="flex items-center gap-1.5 text-muted-foreground"><Users className="h-4 w-4" />{state.members.filter((member) => member.status === "joined").length} competing</span>{room.status === "running" && <span className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 font-semibold text-primary"><Clock3 className="h-4 w-4" />{timeLeft ?? room.perQuestionSeconds}s</span>}</div>
    </section>

    {room.status === "generating" && <Card><CardContent className="flex flex-col items-center gap-3 p-10 text-center"><Loader2 className="h-9 w-9 animate-spin text-primary" /><h2 className="font-semibold">Creating your fresh challenge</h2><p className="max-w-md text-sm text-muted-foreground">The AI is writing {room.questionCount} clinically focused five-choice questions. You can share the clean room link now.</p></CardContent></Card>}
    {room.status === "generation_failed" && <Card className="border-destructive/30"><CardContent className="p-8 text-center"><XCircle className="mx-auto h-8 w-8 text-destructive" /><h2 className="mt-3 font-semibold">Generation did not finish</h2><p className="mt-1 text-sm text-muted-foreground">{room.generationError || "Try creating a new room with a shorter topic."}</p><Button className="mt-4" onClick={() => setLocation("/student/live-rooms")}>Create another room</Button></CardContent></Card>}
    {room.status === "ready" && <Card><CardHeader><CardTitle>Waiting room</CardTitle><CardDescription>Everyone here? The host controls when the server-synchronised countdown begins.</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-3">{state.me.isHost ? <><Button onClick={() => start.mutate(room.id)} disabled={start.isPending}>{start.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Start challenge</Button><Button variant="outline" onClick={() => close.mutate(room.id)}>Close room</Button></> : <p className="flex items-center gap-2 text-sm text-muted-foreground"><Clock3 className="h-4 w-4" />Waiting for {room.hostName} to start the room.</p>}</CardContent></Card>}

    {room.status === "running" && <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start"><div className="min-w-0 space-y-4">{question ? <><div className="space-y-2"><div className="flex items-center justify-between text-sm font-medium"><span>Question {room.currentQuestionIndex + 1} of {room.questionCount}</span><span>{timeLeft ?? room.perQuestionSeconds}s</span></div><Progress value={progress} /></div><Card className="overflow-hidden border-primary/15"><CardHeader className="bg-primary/5 p-5 sm:p-6"><CardTitle className="text-base leading-relaxed sm:text-lg">{question.content}</CardTitle><CardDescription>Choose once. Your answer locks immediately; everyone moves on together.</CardDescription></CardHeader><CardContent className="space-y-2 p-3 sm:space-y-3 sm:p-5">{question.options.map((option, index) => <button key={`${question.id}-${index}`} onClick={() => submitAnswer(index)} disabled={answer.isPending || question.selectedOptionIndex !== null} className={`flex min-h-14 w-full items-center gap-3 rounded-xl border-2 p-3 text-left transition-all sm:p-4 ${question.selectedOptionIndex === index ? "border-primary bg-primary/10" : "border-transparent bg-muted/50 hover:border-primary/30 hover:bg-primary/5"} disabled:cursor-not-allowed`}><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background font-semibold text-primary">{letters[index]}</span><span className="flex-1 text-sm leading-snug">{option}</span>{question.selectedOptionIndex === index && <CheckCircle2 className="h-5 w-5 text-primary" />}</button>)}</CardContent></Card>{question.selectedOptionIndex !== null && <p className="rounded-xl bg-muted/50 px-4 py-3 text-center text-sm text-muted-foreground">Answer locked. Waiting for the rest of the room or the shared timer…</p>}</> : <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Loading the next shared question…</CardContent></Card>}</div><aside className="lg:sticky lg:top-4">{standings}</aside></div>}
    {room.status === "finished" && <section className="space-y-5"><Card className="overflow-hidden border-primary/20"><div className="bg-gradient-to-br from-primary via-primary to-indigo-600 p-6 text-primary-foreground sm:p-8"><Trophy className="h-9 w-9" /><p className="mt-3 text-sm font-medium uppercase tracking-[0.18em]">Match complete</p><h2 className="mt-1 text-3xl font-bold">You finished #{myRank || "—"}</h2><p className="mt-2 text-primary-foreground/80">Review every question, learn from the explanations, then send a challenge.</p></div><CardContent className="flex flex-wrap gap-3 p-5 sm:p-6"><Button onClick={shareRoom} disabled={share.isPending}>{share.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}<Copy className="mr-2 h-4 w-4" />Copy share card</Button><Button variant="outline" onClick={() => setLocation("/student/live-rooms")}><ArrowLeft className="mr-2 h-4 w-4" />Back to live rooms</Button></CardContent></Card>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start"><div className="space-y-4"><h2 className="text-xl font-bold">Question review</h2>{state.results?.map((result) => <Card key={result.id} className="overflow-hidden"><CardHeader className="space-y-2 p-5"><div className="flex items-center justify-between gap-3"><Badge variant="outline">Question {result.orderIndex + 1}</Badge><Badge variant={result.isCorrect ? "default" : "secondary"}>{result.isCorrect ? `Correct · +${result.points || 0}` : result.selectedOptionIndex === null ? "Not answered" : "Review this one"}</Badge></div><CardTitle className="text-base leading-relaxed">{result.content}</CardTitle></CardHeader><CardContent className="space-y-2 p-4 sm:p-5">{result.options.map((option, index) => { const choices = result.selections.filter((selection) => selection.selectedOptionIndex === index); const correct = index === result.correctOptionIndex; const mine = index === result.selectedOptionIndex; return <div key={index} className={`flex items-center gap-3 rounded-xl border p-3 text-sm ${correct ? "border-emerald-500/40 bg-emerald-500/10" : mine ? "border-destructive/30 bg-destructive/5" : "bg-muted/30"}`}><span className="font-semibold text-primary">{letters[index]}</span><span className="min-w-0 flex-1">{option}{correct && <span className="ml-2 text-xs font-semibold text-emerald-700">Correct answer</span>}</span>{choices.length > 0 && <div className="flex -space-x-2">{choices.map((choice) => <PlayerAvatar key={choice.studentId} name={choice.name} avatarKey={choice.avatarKey} compact />)}</div>}</div>; })}<div className="mt-3 rounded-xl bg-primary/5 p-3 text-sm"><p className="font-semibold text-primary">Why this is the answer</p><p className="mt-1 text-muted-foreground">{result.explanation || "No additional explanation was provided for this question."}</p></div></CardContent></Card>)}</div><aside className="lg:sticky lg:top-4"><Card><CardHeader><CardTitle>Final standings</CardTitle></CardHeader><CardContent className="space-y-2">{state.leaderboard.map((entry) => <div key={entry.studentId} className="flex items-center justify-between gap-2 rounded-xl bg-muted/40 px-3 py-3"><div className="flex min-w-0 items-center gap-2"><PlayerAvatar name={entry.name} avatarKey={entry.avatarKey} compact /><span className="truncate font-medium">{entry.rank === 1 && <Crown className="mr-1 inline h-4 w-4 text-amber-500" />}#{entry.rank} {entry.name}</span></div><span className="shrink-0 text-sm"><strong>{entry.score ?? 0}</strong> pts</span></div>)}</CardContent></Card></aside></div></section>}
    {["closed", "expired"].includes(room.status) && <Card><CardContent className="p-8 text-center"><XCircle className="mx-auto h-8 w-8 text-muted-foreground" /><h2 className="mt-3 font-semibold">This room has closed</h2><Button className="mt-4" onClick={() => setLocation("/student/live-rooms")}>Find another room</Button></CardContent></Card>}
    {room.status !== "finished" && <Card><CardHeader><CardTitle className="text-base">In the room</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-3">{state.members.map((member) => <div key={member.id} className="flex items-center gap-2 rounded-full bg-muted/50 py-1.5 pl-1.5 pr-3 text-sm"><PlayerAvatar name={member.name} avatarKey={member.avatarKey} compact /><span>{member.role === "host" && <Crown className="mr-1 inline h-3.5 w-3.5 text-amber-500" />}{member.name}</span></div>)}</CardContent></Card>}
    {answerMoment && <div className={`fixed inset-x-4 bottom-5 z-50 mx-auto max-w-sm rounded-2xl border p-4 text-center shadow-xl animate-in slide-in-from-bottom-4 ${answerMoment.correct ? "border-emerald-500/30 bg-emerald-500 text-white" : "border-card bg-card"}`}>{answerMoment.correct ? <PartyPopper className="mx-auto mb-1 h-6 w-6" /> : <ShieldCheck className="mx-auto mb-1 h-6 w-6 text-primary" />}<p className="font-bold">{answerMoment.correct ? `Correct · +${answerMoment.points}` : "Answer locked"}</p>{answerMoment.rank && <p className="text-xs opacity-80">You’re now #{answerMoment.rank}</p>}</div>}
  </div>;
}