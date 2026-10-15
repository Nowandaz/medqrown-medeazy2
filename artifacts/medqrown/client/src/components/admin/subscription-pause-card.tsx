import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { PauseCircle, PlayCircle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatCalendarDate } from "@/lib/datetime";

type PauseInfo = {
  active: boolean;
  message: string | null;
  startedOn: string | null;
  pausedDaysSoFar: number;
  history: { id: number; message: string; startedOn: string; endedOn: string | null; pausedDays: number | null; membershipsExtended: number | null }[];
};

const PAUSE_KEY = ["/api/admin/pause"];

/** Settings → Cohorts & Pause: pause/resume all subscriptions with a message students see. */
export function SubscriptionPauseCard() {
  const { toast } = useToast();
  const { data: pause, isLoading } = useQuery<PauseInfo>({ queryKey: PAUSE_KEY });
  const [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState<"pause" | "resume" | null>(null);
  const [extendDates, setExtendDates] = useState(true);

  useEffect(() => { setMessage(pause?.message ?? ""); }, [pause?.message]);

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: PAUSE_KEY });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/cohorts"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/students"] });
  };

  const savePause = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/pause", { message: message.trim() }),
    onSuccess: () => {
      refreshAll();
      setConfirm(null);
      toast({ title: pause?.active ? "Pause message updated" : "Subscriptions paused" });
    },
    onError: (e) => toast({ title: "Could not save", description: apiErrorMessage(e), variant: "destructive" }),
  });

  const resume = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/admin/pause/resume", { extendDates })).json(),
    onSuccess: (result: any) => {
      refreshAll();
      setConfirm(null);
      toast({
        title: "Subscriptions resumed",
        description: result.pausedDays && extendDates
          ? `${result.membershipsExtended} membership${result.membershipsExtended === 1 ? "" : "s"} and the cohort calendar moved ${result.pausedDays} day${result.pausedDays === 1 ? "" : "s"} later.`
          : "No dates were changed.",
      });
    },
    onError: (e) => toast({ title: "Could not resume", description: apiErrorMessage(e), variant: "destructive" }),
  });

  if (isLoading) return <div className="h-40 bg-muted/20 animate-pulse rounded-lg" />;
  const active = !!pause?.active;
  const days = pause?.pausedDaysSoFar ?? 0;

  return (
    <Card className={active ? "border-amber-500/50" : undefined} data-testid="card-subscription-pause">
      <CardContent className="py-5 px-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-medium flex items-center gap-2">
              {active ? <PauseCircle className="w-4 h-4 text-amber-600" /> : <PlayCircle className="w-4 h-4 text-primary" />}
              Subscription pause
              {active && <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-400">Paused</Badge>}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {active
                ? `Paused since ${formatCalendarDate(pause!.startedOn!)} (${days} day${days === 1 ? "" : "s"} so far). Nobody's membership is running down.`
                : "Pause everyone's subscription, for example during a lecturers' strike. Students keep full access to the portal and their CATs."}
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pause-message">Message students see on their dashboard and timetable</Label>
          <Textarea
            id="pause-message"
            value={message}
            maxLength={1000}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="e.g. Lecturers are on strike, so classes are paused until they resume. Your remaining membership days are kept."
            className="min-h-[90px]"
          />
          <p className="text-xs text-muted-foreground">
            Students also see: “You can still use your portal and take and reattempt your CATs.”
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {active ? (
            <>
              <Button variant="outline" disabled={!message.trim() || message.trim() === pause?.message || savePause.isPending} onClick={() => savePause.mutate()}>
                {savePause.isPending ? "Saving..." : "Update message"}
              </Button>
              <Button onClick={() => { setExtendDates(true); setConfirm("resume"); }}>Resume subscriptions</Button>
            </>
          ) : (
            <Button className="bg-amber-600 hover:bg-amber-700 text-white" disabled={!message.trim()} onClick={() => setConfirm("pause")}>
              Pause subscriptions
            </Button>
          )}
        </div>

        {!!pause?.history?.length && (
          <div className="border-t pt-3 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Past pauses</p>
            {pause.history.filter((item) => item.endedOn).slice(0, 5).map((item) => (
              <p key={item.id} className="text-xs text-muted-foreground">
                {formatCalendarDate(item.startedOn)} – {formatCalendarDate(item.endedOn!)}: {item.pausedDays} day{item.pausedDays === 1 ? "" : "s"}
                {item.membershipsExtended ? `, ${item.membershipsExtended} memberships extended` : ", no dates changed"}
              </p>
            ))}
          </div>
        )}
      </CardContent>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          {confirm === "pause" ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Pause all subscriptions?</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-2">
                    <p>From today, nobody's membership runs down, moves into grace or expires, and renewal reminders stop.</p>
                    <p>Students keep using the portal, taking CATs and reattempting them. Your message replaces the timetable and shows on their dashboard.</p>
                    <p>When you resume, everyone's end date and the cohort calendar move later by the number of paused days.</p>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction className="bg-amber-600 hover:bg-amber-700 text-white" onClick={(e) => { e.preventDefault(); savePause.mutate(); }}>
                  {savePause.isPending ? "Pausing..." : "Pause subscriptions"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          ) : (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Resume subscriptions?</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-3">
                    <p>The pause message disappears and memberships start running again from today.</p>
                    <label className="flex items-start gap-2 text-sm text-foreground">
                      <Checkbox checked={extendDates} onCheckedChange={(v) => setExtendDates(v === true)} className="mt-0.5" />
                      <span>
                        Give back the {days} paused day{days === 1 ? "" : "s"}
                        <span className="block text-xs text-muted-foreground">
                          Moves every membership that wasn't already expired when the pause began, and the current and later cohorts, {days} day{days === 1 ? "" : "s"} later. Each change is recorded in the membership audit log.
                        </span>
                      </span>
                    </label>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={(e) => { e.preventDefault(); resume.mutate(); }}>
                  {resume.isPending ? "Resuming..." : "Resume"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
