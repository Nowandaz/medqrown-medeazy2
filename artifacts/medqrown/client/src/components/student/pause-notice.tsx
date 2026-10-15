import { useQuery } from "@tanstack/react-query";
import { PauseCircle } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { formatCalendarDate } from "@/lib/datetime";

export type SubscriptionPause = { active: boolean; message: string | null; startedOn: string | null };

export function useSubscriptionPause() {
  return useQuery<SubscriptionPause>({ queryKey: ["/api/student/pause"], refetchOnMount: "always" });
}

/**
 * Shown while the admins have paused subscriptions (e.g. a lecturers' strike): their message,
 * plus the reassurance that the portal and CATs keep working.
 */
export function PauseNotice({ pause, compact = false }: { pause: SubscriptionPause; compact?: boolean }) {
  return (
    <div className="rounded-xl border border-amber-300/60 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30" role="status" data-testid="pause-notice">
      <div className="flex items-start gap-3">
        <PauseCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div className="min-w-0 space-y-1.5">
          <p className="font-semibold text-amber-900 dark:text-amber-200">
            Classes are paused{pause.startedOn && !compact ? ` since ${formatCalendarDate(pause.startedOn)}` : ""}
          </p>
          {pause.message && <p className="whitespace-pre-wrap text-sm text-amber-900/90 dark:text-amber-100/90">{pause.message}</p>}
          <p className="text-sm text-amber-900/80 dark:text-amber-100/80">
            You can still use your portal, take your CATs and reattempt past ones. Your membership days are kept while we're paused.
          </p>
          {!compact && (
            <Link href="/student/results">
              <Button variant="outline" size="sm" className="mt-1 border-amber-400/60 bg-transparent">Review past CATs</Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
