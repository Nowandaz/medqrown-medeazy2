import { useState } from "react";
import { AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStage8Dashboard } from "@/hooks/use-stage8";
import { RenewMembershipDialog } from "@/components/student/renew-membership-dialog";
import { formatCalendarDate } from "@/lib/datetime";

const DISMISS_KEY = "medqrown-renewal-banner-dismissed";

/**
 * Renewal reminder across the top of every portal page (the exam screens live outside the portal
 * layout, so it never shows mid-exam): from 7 days before the end, through grace, and after expiry.
 * Hidden while a payment is being verified or subscriptions are paused.
 */
export function RenewalBanner() {
  const { data } = useStage8Dashboard();
  const membership = data?.membership;
  const key = `${DISMISS_KEY}:${membership?.endDate ?? ""}:${membership?.status ?? ""}`;
  const [hiddenNow, setHiddenNow] = useState(false);
  let dismissed = hiddenNow;
  try { dismissed ||= sessionStorage.getItem(key) === "1"; } catch { /* storage blocked */ }
  if (!membership || data?.pendingPayment || membership.paused) return null;

  const { status, daysRemaining, endDate, graceEndDate } = membership;
  const due = status === "grace" || status === "expired" || (status === "active" && (daysRemaining ?? 99) <= 7);
  // An expired membership can't be dismissed: exams are locked until they renew.
  if (!due || (dismissed && status !== "expired")) return null;

  const loseOn = formatCalendarDate(graceEndDate);
  const message = status === "expired"
    ? "Your MedQrown access has ended and exams are locked. Renew to get back in."
    : status === "grace"
      ? `Your membership has ended. You will lose your MedQrown access on ${loseOn}.`
      : `Your membership ends ${daysRemaining === 0 ? "today" : `on ${formatCalendarDate(endDate)}`}. Renew now or you will lose your MedQrown access on ${loseOn}.`;
  const urgent = status !== "active";

  const dismiss = () => {
    try { sessionStorage.setItem(key, "1"); } catch { /* private mode: hide for this page only */ }
    setHiddenNow(true);
  };

  return (
    <div role="alert" className={`mb-6 flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center ${urgent
      ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-900/20"
      : "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-900/20"}`}>
      <div className="flex flex-1 items-start gap-3">
        <AlertCircle className={`mt-0.5 h-5 w-5 shrink-0 ${urgent ? "text-red-600" : "text-amber-600"}`} />
        <div className={`text-sm ${urgent ? "text-red-800 dark:text-red-300" : "text-amber-900 dark:text-amber-200"}`}>
          <p className="font-bold">Renew your subscription</p>
          <p>{message}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 sm:w-44">
          <RenewMembershipDialog trigger={<Button className="w-full font-semibold">Renew now</Button>} />
        </div>
        {status !== "expired" && (
          <Button variant="ghost" size="icon" onClick={dismiss} aria-label="Hide this reminder for now" className="shrink-0">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
