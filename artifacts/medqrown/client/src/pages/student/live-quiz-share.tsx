import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Trophy, Swords } from "lucide-react";

export default function LiveQuizShare() {
  const { token } = useParams<{ token: string }>();
  const [, setLocation] = useLocation();
  const [card, setCard] = useState<any>(null);
  const [error, setError] = useState("");
  useEffect(() => { fetch(`/api/live-share/${token}`).then(async (response) => response.ok ? setCard(await response.json()) : setError("This share card is no longer available.")).catch(() => setError("Could not load this share card.")); }, [token]);
  return <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/15 via-background to-background p-5"><Card className="w-full max-w-xl overflow-hidden border-primary/20 shadow-xl"><div className="relative overflow-hidden bg-primary px-7 py-10 text-primary-foreground"><Swords className="absolute -right-4 -bottom-7 h-40 w-40 text-white/15" /><p className="relative text-sm font-medium uppercase tracking-[0.24em]">MedQrown live room</p><h1 className="relative mt-3 text-3xl font-bold">Can you beat this score?</h1></div><CardContent className="space-y-5 p-7">{error ? <p className="text-muted-foreground">{error}</p> : !card ? <p className="text-muted-foreground">Loading challenge…</p> : <><div className="flex items-center gap-4"><div className="rounded-2xl bg-primary/10 p-3"><Trophy className="h-8 w-8 text-primary" /></div><div><p className="text-3xl font-bold">{card.score} points</p><p className="text-sm text-muted-foreground">{card.unitName} · leaderboard #{card.rank}</p></div></div><blockquote className="border-l-4 border-primary pl-4 text-lg font-medium">{card.challenge}</blockquote><p className="text-sm text-muted-foreground">Topic: {card.topic} · {card.correctCount} correct answers</p><div className="grid gap-3 sm:grid-cols-2"><Button onClick={() => setLocation("/student/live-rooms")}>Start your own battle</Button><Link href="/portal"><Button variant="outline" className="w-full">Sign in to MedQrown</Button></Link></div></>}</CardContent></Card></main>;
}