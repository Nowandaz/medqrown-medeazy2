import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Hourglass } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { trackEngagement } from "@/lib/engagement";

type SiteContent = { settings: Record<string, any> };

/**
 * Live countdown for the sign-up button: "Registration closes in" when a close time is scheduled
 * (Admin → Site), "Registration opens in" when closed with an opening time, otherwise
 * "Next cohort starts in" when the next cohort's start date is known. Renders nothing otherwise.
 */
export function RegistrationCountdown({ nextCohortStart, className = "" }: { nextCohortStart?: string | null; className?: string }) {
  const { data } = useQuery<SiteContent>({ queryKey: ["/api/site-content"] });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = data?.settings ?? {};
  const open = s.registrationOpen === true;
  const future = (value?: string | null) => {
    const t = value ? Date.parse(value) : NaN;
    return Number.isFinite(t) && t > now ? t : null;
  };
  // Cohorts start at midnight Nairobi time.
  const cohortStart = nextCohortStart ? future(`${nextCohortStart}T00:00:00+03:00`) : null;
  const target = open && future(s.registrationClosesAt)
    ? { label: "Registration closes in", at: future(s.registrationClosesAt)! }
    : !open && future(s.registrationOpensAt)
      ? { label: "Registration opens in", at: future(s.registrationOpensAt)! }
      : cohortStart ? { label: "Next cohort starts in", at: cohortStart } : null;
  if (!target) return null;
  const left = Math.floor((target.at - now) / 1000);
  const parts = [
    [Math.floor(left / 86400), "d"], [Math.floor(left / 3600) % 24, "h"], [Math.floor(left / 60) % 60, "m"], [left % 60, "s"],
  ] as const;
  return (
    <div className={`inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold ${className}`} role="timer">
      <Hourglass className="h-4 w-4" />
      <span>{target.label}</span>
      <span className="font-mono tabular-nums">
        {parts.filter(([v, u], i) => v > 0 || i >= 2 || u === "h").map(([v, u]) => `${String(v).padStart(2, "0")}${u}`).join(" ")}
      </span>
    </div>
  );
}

export function useRegistrationStatus() {
  const { data } = useQuery<SiteContent>({ queryKey: ["/api/site-content"] });
  const googleFormUrl: string = data?.settings?.googleFormUrl || "";
  return { registrationOpen: data?.settings?.registrationOpen === true && !!googleFormUrl, googleFormUrl };
}

/**
 * The one sign-up button used across public pages. Follows Admin → Site registration status:
 * Open → "Sign up for this cohort" (Google Form, tracked); Closed → "Join the waitlist".
 */
export function RegistrationCta({
  className, size = "lg", onNavigate,
}: { className?: string; size?: ButtonProps["size"]; onNavigate?: () => void }) {
  const { registrationOpen, googleFormUrl } = useRegistrationStatus();
  if (registrationOpen) {
    return (
      <a href={googleFormUrl} target="_blank" rel="noopener noreferrer"
        onClick={() => { trackEngagement("signup_click"); onNavigate?.(); }}>
        <Button size={size} className={`font-semibold gap-2 ${className ?? ""}`}>
          Sign up for this cohort <ArrowRight className="w-4 h-4" />
        </Button>
      </a>
    );
  }
  return (
    <Link href="/student/signup" onClick={onNavigate}>
      <Button size={size} className={`font-semibold gap-2 ${className ?? ""}`}>
        Join the waitlist <ArrowRight className="w-4 h-4" />
      </Button>
    </Link>
  );
}
