import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { MedQrownBrand } from "@/components/MedQrownBrand";
import { apiRequest } from "@/lib/queryClient";

export function AdminNav({ admin }: { admin: any }) {
  const [location, setLocation] = useLocation();

  const handleLogout = async () => {
    await apiRequest("POST", "/api/admin/logout");
    setLocation("/medmin");
  };

  const navItems = [
    { label: "Dashboard", path: "/admin/dashboard" },
    { label: "Classes", path: "/admin/classes" },
    { label: "Students", path: "/admin/students" },
    { label: "Payments", path: "/admin/payments" },
    { label: "Waitlist", path: "/admin/waitlist" },
    { label: "Site", path: "/admin/site" },
    { label: "Settings", path: "/admin/settings" },
  ];

  const links = (compact: boolean) => navItems.map((item) => (
    <Link key={item.path} href={item.path}>
      <Button
        variant={location.startsWith(item.path) ? "secondary" : "ghost"}
        size="sm"
        className={compact ? "text-xs shrink-0" : "text-sm font-medium"}
      >
        {item.label}
      </Button>
    </Link>
  ));

  return (
    <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-6 min-w-0">
          <div className="min-w-0">
            <MedQrownBrand size="sm" />
            {admin && <p className="text-xs text-muted-foreground mt-0.5 truncate">Welcome, {admin.name}</p>}
          </div>
          <nav className="hidden md:flex items-center gap-1">{links(false)}</nav>
        </div>
        <Button variant="ghost" size="icon" onClick={handleLogout} title="Logout" aria-label="Logout">
          <LogOut className="w-4 h-4" />
        </Button>
      </div>
      {/* Phones: a full-width row that scrolls sideways instead of widening the page. */}
      <nav className="md:hidden flex items-center gap-1 overflow-x-auto no-scrollbar px-4 pb-2">{links(true)}</nav>
    </header>
  );
}
