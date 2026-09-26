import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowRight, AlertCircle, CalendarDays, Megaphone, PenLine, Sparkles, TrendingUp, Clock, ExternalLink } from "lucide-react";
import { useStage8Dashboard } from "@/hooks/use-stage8";
import { useStudentMe } from "@/hooks/use-student";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RenewMembershipDialog } from "@/components/student/renew-membership-dialog";
import { OccurrenceRow, useNow, useStudentTimetable } from "@/components/student/timetable-bits";
import { ScoreTrend } from "@/components/student/score-trend";
import { formatNairobi, formatCalendarDate } from "@/lib/datetime";

function Countdown({ target }: { target: string }) {
  const [left, setLeft] = useState("");
  useEffect(() => {
    const tick = () => {
      const ms = Date.parse(target) - Date.now();
      if (ms <= 0) { setLeft("Open now"); return; }
      const d = Math.floor(ms / 86400000), h = Math.floor(ms / 3600000) % 24, m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
      setLeft(d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [target]);
  return <span className="font-mono tabular-nums">{left}</span>;
}

function greeting(): string {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Nairobi", hour: "numeric", hour12: false }).format(new Date()));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

export default function StudentDashboard() {
  const { data: dashboard, isLoading } = useStage8Dashboard();
  const { data: me } = useStudentMe();
  const { data: timetable } = useStudentTimetable();
  const { data: history } = useQuery<any[]>({ queryKey: ["/api/student/results/history"] });
  const now = useNow();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-44" /><Skeleton className="h-44" /><Skeleton className="h-44" /><Skeleton className="h-44" /></div>
      </div>
    );
  }
  if (!dashboard) {
    return (
      <div className="text-center py-12">
        <h2 className="text-lg font-medium">We couldn't load your dashboard</h2>
        <p className="text-muted-foreground">Check your connection and refresh the page.</p>
      </div>
    );
  }

  const { membership, pendingPayment, nextExam, latestAnnouncement } = dashboard;
  const firstName = (me?.name || "").trim().split(/\s+/)[0];
  const nextSession = timetable?.upcoming?.[0];
  const results = [...(history || [])].reverse(); // oldest → newest for the trend
  const average = results.length ? Math.round(results.reduce((sum, r) => sum + Number(r.scorePercent), 0) / results.length) : null;
  const latest = history?.[0];
  const showRenew = membership && (membership.status !== "active" || (membership.daysRemaining ?? 0) <= 7);
  const examOpen = nextExam && Date.parse(nextExam.opensAt) <= now;

  const whatsNext = examOpen
    ? `${nextExam.title} is open now — good luck!`
    : nextSession
      ? `Next up: ${nextSession.title}, ${formatNairobi(nextSession.startsAt)}.`
      : nextExam
        ? `Your next Mock CAT opens ${formatNairobi(nextExam.opensAt)}.`
        : "Nothing scheduled right now — a great time to revise.";

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div data-tour="welcome">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{greeting()}{firstName ? `, ${firstName}` : ""} 👋</h1>
        <p className="text-muted-foreground mt-1">{whatsNext}</p>
      </div>

      {membership?.status === "grace" && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800 dark:text-amber-300 flex-1">
            Your membership has ended. Renew by {formatCalendarDate(membership.graceEndDate)} to keep access.
          </p>
          <div className="sm:w-48"><RenewMembershipDialog /></div>
        </div>
      )}
      {membership?.status === "expired" && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          <p className="text-sm text-red-800 dark:text-red-300 flex-1">
            Your membership has expired, so exams are locked. Your past results are still here. Renew to jump back in.
          </p>
          <div className="sm:w-48"><RenewMembershipDialog /></div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {/* Up next: class session */}
        <Card className="border-primary/20" data-tour="next-session">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><CalendarDays className="w-5 h-5 text-primary" />Next class</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {nextSession ? (
              <>
                <OccurrenceRow occ={nextSession} now={now} />
                {timetable?.linksHidden && <p className="text-xs text-muted-foreground">Meeting links appear here while your membership is active.</p>}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Your timetable will appear here once your class schedule is published.</p>
            )}
            <Link href="/student/my-class?tab=timetable">
              <Button variant="ghost" size="sm" className="px-0 text-primary">Full timetable <ArrowRight className="w-4 h-4 ml-1" /></Button>
            </Link>
          </CardContent>
        </Card>

        {/* Up next: exam */}
        <Card data-tour="next-exam">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><PenLine className="w-5 h-5 text-primary" />Next Mock CAT</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {nextExam ? (
              <>
                <div>
                  <p className="font-medium">{nextExam.title}</p>
                  <p className="text-sm text-muted-foreground">{nextExam.className}</p>
                </div>
                <div className="rounded-xl bg-primary/5 border border-primary/10 p-3 text-center">
                  <p className="text-xs text-muted-foreground">{examOpen ? `Closes ${formatNairobi(nextExam.closesAt)}` : `Opens ${formatNairobi(nextExam.opensAt)}`}</p>
                  <p className="text-2xl font-bold text-primary mt-1">{examOpen ? "Open now" : <Countdown target={nextExam.opensAt} />}</p>
                </div>
                <Link href="/student/my-class">
                  <Button className="w-full" variant={examOpen ? "default" : "outline"}>{examOpen ? "Start exam" : "Go to class"} <ArrowRight className="w-4 h-4 ml-1" /></Button>
                </Link>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No upcoming exams yet. Mock CATs usually open Saturdays at 8:00 pm.</p>
            )}
          </CardContent>
        </Card>

        {/* Progress */}
        <Card data-tour="progress">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="w-5 h-5 text-primary" />Your progress</CardTitle>
          </CardHeader>
          <CardContent>
            {results.length ? (
              <div className="space-y-3">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Latest</p>
                    <p className="text-sm font-medium truncate max-w-[180px]">{latest?.examTitle}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-primary">{latest?.scorePercent}%</p>
                    <p className="text-xs text-muted-foreground">average {average}%</p>
                  </div>
                </div>
                <ScoreTrend results={results} height={90} />
                <Link href="/student/results"><Button variant="ghost" size="sm" className="px-0 text-primary">All results <ArrowRight className="w-4 h-4 ml-1" /></Button></Link>
              </div>
            ) : (
              <div className="text-center py-4">
                <Sparkles className="w-8 h-8 text-primary/60 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Your scores will chart here after your first Mock CAT.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Membership */}
        <Card data-tour="membership">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><Clock className="w-5 h-5 text-primary" />Membership</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {membership ? (
              <>
                <div className="flex items-center justify-between">
                  <Badge variant={membership.status === "active" ? "default" : membership.status === "grace" ? "secondary" : "destructive"} className="capitalize">
                    {membership.status === "invited" ? "Starts soon" : membership.status}
                  </Badge>
                  <span className="text-sm text-muted-foreground">until {formatCalendarDate(membership.endDate)}</span>
                </div>
                {membership.status === "active" && (
                  <p className="text-sm"><span className="text-2xl font-bold">{membership.daysRemaining}</span> day{membership.daysRemaining === 1 ? "" : "s"} left</p>
                )}
                {pendingPayment && (
                  <p className="text-sm rounded-lg bg-muted p-2">Payment <span className="font-mono">{pendingPayment.code}</span> is being verified.</p>
                )}
                {showRenew && !pendingPayment && <RenewMembershipDialog />}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No membership yet. Contact us if you've paid.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {latestAnnouncement && (
        <Card data-tour="announcement">
          <CardContent className="p-4 flex items-start gap-3">
            <div className="rounded-lg bg-primary/10 p-2 text-primary"><Megaphone className="w-4 h-4" /></div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2">
                <p className="font-medium">{latestAnnouncement.title}</p>
                <span className="text-xs text-muted-foreground">{formatNairobi(latestAnnouncement.createdAt)}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap line-clamp-3">{latestAnnouncement.message}</p>
              {latestAnnouncement.link && (
                <a href={latestAnnouncement.link} target="_blank" rel="noopener noreferrer" className="text-sm text-primary inline-flex items-center gap-1 mt-1">
                  Open link <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
            <Link href="/student/my-class?tab=announcements"><Button variant="ghost" size="sm">All</Button></Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
