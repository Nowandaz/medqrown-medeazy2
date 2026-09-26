import { useState } from "react";
import { useLocation } from "wouter";
import {
  useCreateLiveRoom, useLiveMatches, useLiveUnitLeaderboard, useLookupLiveRoomCode, useStudentUnits,
} from "@/hooks/use-student";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { BrainCircuit, Clock3, Loader2, Plus, Swords, Trophy, Users } from "lucide-react";
import { TEXT_LIMITS } from "@/lib/text-limits";
import { apiErrorMessage } from "@/lib/api-error";

function CreateLiveRoom() {
  const [, setLocation] = useLocation();
  const { data: units } = useStudentUnits();
  const { toast } = useToast();
  const create = useCreateLiveRoom();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ unitId: "", topic: "", difficulty: "mixed", contentStyle: "clinical", questionCount: "5", perQuestionSeconds: "30" });

  const submit = () => {
    create.mutate({
      unitId: Number(form.unitId), topic: form.topic.trim(), difficulty: form.difficulty as "easy" | "mixed" | "hard",
      contentStyle: form.contentStyle as "direct" | "clinical" | "mixed", questionCount: Number(form.questionCount),
      perQuestionSeconds: Number(form.perQuestionSeconds),
    }, {
      onSuccess: (room) => {
        setOpen(false);
        setLocation(`/student/live-rooms/${room.roomId}?code=${room.roomCode}`);
      },
      onError: (error: any) => toast({ title: "Could not create room", description: apiErrorMessage(error), variant: "destructive" }),
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="lg"><Plus className="mr-2 h-4 w-4" />Host a room</Button></DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Build a live AI challenge</DialogTitle>
          <DialogDescription>Your room is fresh, five-choice MCQs generated from your own clinical brief.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2"><Label>Unit</Label><Select value={form.unitId} onValueChange={(unitId) => setForm({ ...form, unitId })}><SelectTrigger><SelectValue placeholder="Choose a unit" /></SelectTrigger><SelectContent>{units?.map((unit) => <SelectItem key={unit.id} value={String(unit.id)}>{unit.code} — {unit.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label>Clinical topic</Label><Input maxLength={TEXT_LIMITS.selfTestFocus} value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} placeholder="e.g. acute asthma management in children" /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label>Difficulty</Label><Select value={form.difficulty} onValueChange={(difficulty) => setForm({ ...form, difficulty })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="easy">Foundation</SelectItem><SelectItem value="mixed">Mixed</SelectItem><SelectItem value="hard">Challenge</SelectItem></SelectContent></Select></div>
            <div className="space-y-2"><Label>Question style</Label><Select value={form.contentStyle} onValueChange={(contentStyle) => setForm({ ...form, contentStyle })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="clinical">Clinical cases</SelectItem><SelectItem value="direct">Direct recall</SelectItem><SelectItem value="mixed">Mixed</SelectItem></SelectContent></Select></div>
            <div className="space-y-2"><Label>Questions</Label><Select value={form.questionCount} onValueChange={(questionCount) => setForm({ ...form, questionCount })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[3, 5, 8, 10, 15, 20].map((count) => <SelectItem key={count} value={String(count)}>{count} questions</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label>Timer per question</Label><Select value={form.perQuestionSeconds} onValueChange={(perQuestionSeconds) => setForm({ ...form, perQuestionSeconds })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[15, 30, 45, 60, 90, 120].map((seconds) => <SelectItem key={seconds} value={String(seconds)}>{seconds} seconds</SelectItem>)}</SelectContent></Select></div>
          </div>
        </div>
        <DialogFooter><Button onClick={submit} disabled={create.isPending || !form.unitId || !form.topic.trim()}>{create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Generate room</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function JoinWithCode() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const lookup = useLookupLiveRoomCode();
  const [code, setCode] = useState("");
  const join = () => lookup.mutate(code, { onSuccess: ({ roomId, roomCode }) => setLocation(`/student/live-rooms/${roomId}?code=${roomCode}`), onError: (error: any) => toast({ title: "Room not found", description: apiErrorMessage(error), variant: "destructive" }) });
  return <Card><CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-end"><div className="flex-1 space-y-2"><Label htmlFor="room-code">Got a room code?</Label><Input id="room-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 12))} placeholder="ABCD2345EFGH" className="font-mono tracking-[0.14em]" /></div><Button variant="outline" onClick={join} disabled={lookup.isPending || code.length < 12}>{lookup.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Join friends</Button></CardContent></Card>;
}

export default function StudentLiveRooms() {
  const { data: matches } = useLiveMatches();
  const { data: units } = useStudentUnits();
  const [leaderboardUnit, setLeaderboardUnit] = useState<number | null>(null);
  const { data: leaderboard } = useLiveUnitLeaderboard(leaderboardUnit);
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <section className="relative overflow-hidden rounded-3xl border border-primary/15 bg-gradient-to-br from-primary/15 via-card to-card p-6 md:p-9">
        <div className="relative max-w-2xl space-y-4"><Badge className="bg-primary text-primary-foreground">Live competition</Badge><h1 className="text-3xl font-bold tracking-tight md:text-4xl">Challenge friends with a room built around your revision.</h1><p className="text-muted-foreground">Set the clinical focus, choose the pace, and let MedQrown create a fresh five-choice quiz for the room.</p><div className="flex flex-wrap gap-3"><CreateLiveRoom /><div className="flex items-center gap-2 self-center text-sm text-muted-foreground"><Swords className="h-4 w-4 text-primary" />Signed-in students only</div></div></div>
        <BrainCircuit className="absolute -right-6 -bottom-8 h-44 w-44 text-primary/10" />
      </section>
      <JoinWithCode />
      <section className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Trophy className="h-5 w-5 text-primary" />Recent live matches</CardTitle><CardDescription>Your completed challenges are kept here.</CardDescription></CardHeader><CardContent>{matches?.length ? <div className="space-y-3">{matches.map((match) => <div key={match.id} className="flex items-center justify-between rounded-xl border bg-muted/20 p-3"><div><p className="text-sm font-medium">{match.topic}</p><p className="text-xs text-muted-foreground">{match.unitName} · {new Date(match.finishedAt).toLocaleDateString()}</p></div><div className="text-right"><p className="font-semibold text-primary">{match.score} pts</p><p className="text-xs text-muted-foreground">#{match.rank} · {match.correctCount} correct</p></div></div>)}</div> : <div className="py-8 text-center text-sm text-muted-foreground">Your finished live rooms will appear here.</div>}</CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" />Unit standings</CardTitle><CardDescription>Scores across finished rooms in a unit.</CardDescription></CardHeader><CardContent className="space-y-4"><Select value={leaderboardUnit ? String(leaderboardUnit) : ""} onValueChange={(value) => setLeaderboardUnit(Number(value))}><SelectTrigger><SelectValue placeholder="Choose a unit to view standings" /></SelectTrigger><SelectContent>{units?.map((unit) => <SelectItem key={unit.id} value={String(unit.id)}>{unit.name}</SelectItem>)}</SelectContent></Select>{leaderboardUnit && <div className="space-y-2">{leaderboard?.length ? leaderboard.map((entry, index) => <div key={entry.name} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm"><span><span className="mr-2 font-semibold text-primary">{index + 1}</span>{entry.name}</span><span className="font-medium">{entry.score} pts</span></div>) : <p className="py-4 text-center text-sm text-muted-foreground">No finished rooms in this unit yet.</p>}</div>}</CardContent></Card>
      </section>
      <p className="flex items-center gap-2 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5" />Rooms expire two hours after they are created. Answers lock immediately and cannot be changed.</p>
    </div>
  );
}