import { CalendarDays, MapPin, Video } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { KIND_META, OccurrenceRow, useNow, useStudentTimetable } from "@/components/student/timetable-bits";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const REPEAT: Record<string, string> = { weekly: "Every", biweekly: "Every other" };

const to12h = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
};

/** My Class → Timetable: coming up next, then the weekly schedule with join links. */
export function ClassTimetableView({ classId }: { classId: number }) {
  const { data, isLoading } = useStudentTimetable();
  const now = useNow();
  if (isLoading) return <Skeleton className="h-48 rounded-xl" />;

  const sessions = (data?.sessions || []).filter((s) => s.classId === classId);
  const upcoming = (data?.upcoming || []).filter((o) => sessions.some((s) => s.id === o.sessionId)).slice(0, 4);

  if (!sessions.length) {
    return (
      <Card className="border-dashed border-2 shadow-none">
        <CardContent className="py-12 text-center">
          <CalendarDays className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="font-semibold">No timetable yet</p>
          <p className="text-sm text-muted-foreground">Your tutors will publish this class's sessions here.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Coming up</h3>
        <Card>
          <CardContent className="p-4 space-y-4 divide-y">
            {upcoming.map((occ, i) => (
              <div key={`${occ.sessionId}-${occ.startsAt}`} className={i ? "pt-4" : ""}><OccurrenceRow occ={occ} now={now} compact /></div>
            ))}
          </CardContent>
        </Card>
        {data?.linksHidden && <p className="text-xs text-muted-foreground">Meeting links appear while your membership is active.</p>}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Weekly schedule</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {sessions.map((s) => {
            const meta = KIND_META[s.kind] ?? KIND_META.other;
            const Icon = meta.icon;
            return (
              <Card key={s.id}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start gap-3">
                    <div className={`rounded-lg p-2 ${meta.tone}`}><Icon className="w-4 h-4" /></div>
                    <div className="min-w-0">
                      <p className="font-semibold leading-tight">{s.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {s.recurrence === "once" ? s.startDate : `${REPEAT[s.recurrence]} ${DAYS[s.dayOfWeek ?? 0]}`} · {to12h(s.startTime)}–{to12h(s.endTime)}
                      </p>
                    </div>
                  </div>
                  {s.notes && <p className="text-sm text-muted-foreground">{s.notes}</p>}
                  {s.location && <p className="text-sm inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{s.location}</p>}
                  {s.link && (
                    <a href={s.link} target="_blank" rel="noopener noreferrer" className="block">
                      <Button variant="outline" size="sm" className="w-full"><Video className="w-4 h-4 mr-1" />Open meeting link</Button>
                    </a>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}
