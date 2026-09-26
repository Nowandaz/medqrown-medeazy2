import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { trackEngagement } from "@/lib/engagement";

type SiteContent = { settings: Record<string, any> };

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
