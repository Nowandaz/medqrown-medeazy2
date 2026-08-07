import { Link } from "wouter";
import { Home } from "lucide-react";
import { MedQrownBrand } from "@/components/MedQrownBrand";

interface AppHeaderProps {
  showHomeLink?: boolean;
}

export function AppHeader({ showHomeLink = true }: AppHeaderProps) {
  return (
    <header className="px-4 sm:px-6 py-4 flex items-center justify-between border-b border-border/40 bg-background/80 backdrop-blur-sm">
      <Link href="/" className="flex items-center gap-2 group">
        <MedQrownBrand size="sm" />
      </Link>
      {showHomeLink && (
        <Link
          href="/"
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors font-medium"
        >
          <Home className="w-3.5 h-3.5" /> Home
        </Link>
      )}
    </header>
  );
}
