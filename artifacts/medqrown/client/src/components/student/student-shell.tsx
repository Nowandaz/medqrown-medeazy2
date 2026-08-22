import React, { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useStudentMe, useLogout } from "@/hooks/use-student";
import { MedQrownBrand } from "@/components/MedQrownBrand";
import { 
  LayoutDashboard, 
  BookOpen, 
  History, 
  User, 
  LogOut, 
  Menu, 
  Loader2 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { 
  Sheet, 
  SheetContent, 
  SheetTrigger 
} from "@/components/ui/sheet";

const NAV_ITEMS = [
  { href: "/student/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/student/units", label: "My Units", icon: BookOpen },
  { href: "/student/past-exams", label: "Past Exams", icon: History },
  { href: "/student/profile", label: "Profile", icon: User },
];

export function StudentShell({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading, isError } = useStudentMe();
  const [location, setLocation] = useLocation();
  const logout = useLogout();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  useEffect(() => {
    if (!isLoading && (isError || !user)) {
      setLocation("/portal");
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

  const NavLinks = ({ onClick }: { onClick?: () => void }) => (
    <nav className="flex-1 space-y-1.5 px-3 py-4">
      {NAV_ITEMS.map((item) => {
        const isActive = location === item.href || location.startsWith(item.href + "/");
        return (
          <Link 
            key={item.href} 
            href={item.href}
            onClick={onClick}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive 
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
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Toggle menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[280px] p-0 flex flex-col">
            <div className="p-4 border-b">
              <MedQrownBrand size="md" />
            </div>
            <NavLinks onClick={() => setMobileMenuOpen(false)} />
            <div className="border-t p-4">
              <div className="mb-4 flex items-center gap-3 px-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">
                  {user.name.charAt(0)}
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{user.name}</span>
                  <span className="text-xs text-muted-foreground">{user.university}</span>
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
      </header>

      {/* Desktop Sidebar */}
      <aside className="hidden w-[280px] flex-col border-r bg-card/50 md:flex">
        <div className="flex h-16 items-center border-b px-6">
          <Link href="/student/dashboard">
            <MedQrownBrand size="md" />
          </Link>
        </div>
        <NavLinks />
        <div className="border-t p-4">
          <div className="mb-4 flex items-center gap-3 px-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">
              {user.name.charAt(0)}
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="truncate text-sm font-medium">{user.name}</span>
              <span className="truncate text-xs text-muted-foreground">{user.university}</span>
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

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl p-4 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
