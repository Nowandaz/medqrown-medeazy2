import { useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { Loader2, Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useLookupLiveRoomCode, useStudentMe } from "@/hooks/use-student";

export default function LiveRoomJoin() {
  const { roomCode = "" } = useParams<{ roomCode: string }>();
  const [, setLocation] = useLocation();
  const normalizedCode = roomCode.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 12);
  const me = useStudentMe();
  const lookup = useLookupLiveRoomCode();

  useEffect(() => {
    if (!me.data || lookup.isPending || lookup.isSuccess || lookup.isError || normalizedCode.length !== 12) return;
    lookup.mutate(normalizedCode, {
      onSuccess: ({ roomId, roomCode: verifiedCode }) => setLocation(`/student/live-rooms/${roomId}?code=${verifiedCode}`),
    });
  }, [lookup, me.data, normalizedCode, setLocation]);

  if (me.isLoading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!me.data) {
    return <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/15 via-background to-background p-5">
      <Card className="w-full max-w-md border-primary/20 shadow-xl"><CardContent className="space-y-5 p-7 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10"><Swords className="h-7 w-7 text-primary" /></div>
        <div><h1 className="text-xl font-bold">A live room is waiting</h1><p className="mt-2 text-sm text-muted-foreground">Sign in with your student account to join this MedQrown battle.</p></div>
        <Button className="w-full" onClick={() => setLocation(`/portal?next=${encodeURIComponent(`/join/${normalizedCode}`)}`)}>Sign in and join</Button>
      </CardContent></Card>
    </main>;
  }
  if (lookup.isError || normalizedCode.length !== 12) return <main className="flex min-h-screen items-center justify-center p-5"><Card className="w-full max-w-md"><CardContent className="space-y-4 p-7 text-center"><h1 className="font-bold">This room is unavailable</h1><p className="text-sm text-muted-foreground">Ask the host for a current room link or code.</p><Button onClick={() => setLocation("/student/live-rooms")}>Browse live rooms</Button></CardContent></Card></main>;
  return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
}