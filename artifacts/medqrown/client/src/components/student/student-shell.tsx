import React, { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useStudentMe, useLogout } from "@/hooks/use-student";
import { MedQrownBrand } from "@/components/MedQrownBrand";
import { getStudentAvatarUrl } from "@/lib/avatar";
import { StudentNotifications } from "@/components/student/student-notifications";
import { PushSubscriptionPrompt } from "@/components/student/push-subscription-prompt";
import { RenewalBanner } from "@/components/student/renewal-banner";
import { 
  LayoutDashboard, 
  BookOpen,
  BrainCircuit,
  Swords,
  History, 
  BarChart3,
  User, 
  LogOut, 
  Loader2 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { 
  Sheet, 
  SheetContent, 
  SheetTrigger 
} from "@/components/ui/sheet";
import { FEATURES } from "@/lib/feature-flags";
import { WelcomeTour } from "@/components/student/welcome-tour";
import { FeatureAnnouncement } from "@/components/student/feature-announcement";

const NAV_ITEMS = [
  { href: "/student/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/student/my-class", label: "My Class", icon: BookOpen },
  { href: "/student/results", label: "Results", icon: History },
  { href: "/student/profile", label: "Profile", icon: User },
];

export function StudentShell({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading, isError } = useStudentMe();
  const [location, setLocation] = useLocation();
  const logout = useLogout();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  // Lets page-wide styles (the floating theme button) make room for the phone tab bar.
  useEffect(() => {
    document.body.dataset.tabbar = "";
    return () => { delete document.body.dataset.tabbar; };
  }, []);

  useEffect(() => {
    if (!isLoading && (isError || !user)) {
      setLocation(`/portal?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    }
  }, [isLoading, isError, user, setLocation]);

  if (isLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        setLocation("/portal");
      }
    });
  };
  const avatarUrl = getStudentAvatarUrl(user.avatarKey, 96);

  const isActive = (href: string) => location === href || location.startsWith(href + "/");

  const NavLinks = ({ onClick }: { onClick?: () => void }) => (
    <nav className="flex-1 space-y-1.5 px-3 py-4">
      {NAV_ITEMS.map((item) => {
        const active = isActive(item.href);
        return (
          <Link 
            key={item.href} 
            href={item.href}
            onClick={onClick}
            data-tour={`nav-${item.href.split("/").pop()}`}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              active 
                ? "bg-primary/10 text-primary" 
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-[100dvh] flex-col md:flex-row bg-background">
      {/* Mobile Header */}
      <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b bg-background/95 px-4 backdrop-blur md:hidden">
        <Link href="/student/dashboard">
          <MedQrownBrand size="sm" />
        </Link>
        <div className="flex items-center gap-1">
          <span data-tour="bell"><StudentNotifications /></span>
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <button className="ml-1 h-9 w-9 overflow-hidden rounded-full border-2 border-primary/30 bg-primary/10" data-tour="menu" aria-label="Account menu">
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
              </button>
            </SheetTrigger>
          <SheetContent side="right" className="w-[280px] p-0 flex flex-col">
            <div className="p-4 border-b">
              <MedQrownBrand size="md" />
            </div>
            <NavLinks onClick={() => setMobileMenuOpen(false)} />
            <div className="border-t p-4">
              <div className="mb-4 flex items-center gap-3 px-3">
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-primary/15 bg-primary/10">
                  <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{user.name}</span>
                   {FEATURES.universityManagement && <span className="text-xs text-muted-foreground">{user.university}</span>}
                </div>
              </div>
              <Button 
                variant="ghost" 
                className="w-full justify-start text-muted-foreground hover:text-foreground"
                onClick={handleLogout}
              >
                <LogOut className="mr-3 h-5 w-5" />
                Sign out
              </Button>
            </div>
          </SheetContent>
        </Sheet>
        </div>
      </header>

      {/* Desktop Sidebar */}
      <aside className="hidden w-[280px] flex-col border-r bg-card/50 md:flex">
        <div className="flex h-16 items-center justify-between border-b px-6">
          <Link href="/student/dashboard">
            <MedQrownBrand size="md" />
          </Link>
          <span data-tour="bell"><StudentNotifications /></span>
        </div>
        <NavLinks />
        <div className="border-t p-4">
          <div className="mb-4 flex items-center gap-3 px-3">
            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-primary/15 bg-primary/10">
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="truncate text-sm font-medium">{user.name}</span>
               {FEATURES.universityManagement && <span className="truncate text-xs text-muted-foreground">{user.university}</span>}
            </div>
          </div>
          <Button 
            variant="ghost" 
            className="w-full justify-start text-muted-foreground hover:text-foreground"
            onClick={handleLogout}
          >
            <LogOut className="mr-3 h-5 w-5" />
            Sign out
          </Button>
        </div>
      </aside>

      {/* Main Content (extra bottom space on phones for the tab bar) */}
      <main className="flex-1 overflow-y-auto pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">
        <div className="mx-auto max-w-5xl p-4 md:p-8">
          <RenewalBanner />
          <PushSubscriptionPrompt />
          {children}
          <WelcomeTour user={user} />
          <FeatureAnnouncement user={user} />
        </div>
      </main>

      {/* Phone tab bar */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)] md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-4">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            return (
              <Link key={item.href} href={item.href} data-tour={`nav-${item.href.split("/").pop()}`}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors ${active ? "text-primary" : "text-muted-foreground"}`}>
                <span className={`rounded-full px-4 py-1 transition-colors ${active ? "bg-primary/15" : ""}`}>
                  <item.icon className="h-5 w-5" />
                </span>
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
