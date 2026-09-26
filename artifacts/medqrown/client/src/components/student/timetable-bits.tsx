import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FlaskConical, MapPin, Video, BookOpen, PenLine, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatNairobi } from "@/lib/datetime";

export type Occurrence = {
  startsAt: string; endsAt: string; sessionId: number; title: string; kind: string;
  className: string; link: string | null; location: string | null; notes: string | null;
};
export type TimetableSession = {
  id: number; classId: number; className: string; title: string; kind: string; recurrence: string;
  dayOfWeek: number | null; startDate: string; startTime: string; endTime: string;
  location: string | null; link: string | null; notes: string | null;
  upcoming: { startsAt: string; endsAt: string }[];
};
export type StudentTimetable = { sessions: TimetableSession[]; upcoming: Occurrence[]; linksHidden: boolean };

export function useStudentTimetable() {
  return useQuery<StudentTimetable>({ queryKey: ["/api/student/timetable"], staleTime: 60_000 });
}

export const KIND_META: Record<string, { label: string; icon: typeof Video; tone: string }> = {
  online: { label: "Online session", icon: Video, tone: "bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  mock_cat: { label: "Mock CAT", icon: PenLine, tone: "bg-violet-500/10 text-violet-700 dark:text-violet-300" },
  revision: { label: "Revision", icon: BookOpen, tone: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  lab: { label: "Anatomy lab", icon: FlaskConical, tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  other: { label: "Session", icon: CalendarDays, tone: "bg-muted text-muted-foreground" },
};

/** Re-renders every 30 s so "Live now" / "in 2h" labels stay current. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function relativeStart(startsAt: string, endsAt: string, now: number): string {
  const start = Date.parse(startsAt);
  if (start <= now && now < Date.parse(endsAt)) return "Live now";
  const minutes = Math.round((start - now) / 60000);
  if (minutes < 60) return `in ${Math.max(minutes, 1)} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.round(hours / 24);
  return days === 1 ? "tomorrow" : `in ${days} days`;
}

/** One upcoming occurrence with its join link / location. */
export function OccurrenceRow({ occ, now, compact }: { occ: Occurrence; now: number; compact?: boolean }) {
  const meta = KIND_META[occ.kind] ?? KIND_META.other;
  const Icon = meta.icon;
  const live = Date.parse(occ.startsAt) <= now && now < Date.parse(occ.endsAt);
  const joinable = occ.link && Date.parse(occ.startsAt) - now < 30 * 60000;
  return (
    <div className="flex items-start gap-3">
      <div className={`mt-0.5 rounded-lg p-2 ${meta.tone}`}><Icon className="w-4 h-4" /></div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2">
          <p className="font-medium leading-tight">{occ.title}</p>
          <span className={`text-xs font-medium ${live ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
            {live ? "● Live now" : relativeStart(occ.startsAt, occ.endsAt, now)}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">{formatNairobi(occ.startsAt)}{compact ? "" : ` · ${occ.className}`}</p>
        {occ.location && <p className="text-xs text-muted-foreground inline-flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3" />{occ.location}</p>}
      </div>
      {occ.link && (
        <a href={occ.link} target="_blank" rel="noopener noreferrer" className="shrink-0">
          <Button size="sm" variant={joinable ? "default" : "outline"}><Video className="w-4 h-4 mr-1" />Join</Button>
        </a>
      )}
    </div>
  );
}
