import { useState, useEffect } from "react";
import { X, Zap } from "lucide-react";

const STORAGE_KEY = "banner-dismissed-record-time";

export function AnnouncementBanner() {
  const [dismissed, setDismissed] = useState(true); // start hidden to avoid flash

  useEffect(() => {
    setDismissed(localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  function scrollToDemo() {
    document.getElementById("demo-section")?.scrollIntoView({ behavior: "smooth" });
  }

  function dismiss(e: React.MouseEvent) {
    e.stopPropagation();
    localStorage.setItem(STORAGE_KEY, "1");
    setDismissed(true);
  }

  return (
    <>
      {/* Fixed banner — sits immediately below the fixed navbar (top-16 = 64px) */}
      {!dismissed && (
        <div
          role="banner"
          className="fixed top-16 left-0 right-0 z-40 flex items-center h-11"
          style={{ backgroundColor: "#0d9488" }}
        >
          {/* Click-to-scroll area */}
          <button
            onClick={scrollToDemo}
            aria-label="Try the free demo question"
            className="flex-1 flex items-center justify-center gap-2 h-full px-4 text-white text-sm font-semibold
                       hover:brightness-110 active:brightness-90 transition-[filter] duration-150 focus:outline-none
                       focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-inset truncate"
          >
            <Zap className="w-3.5 h-3.5 shrink-0 fill-white text-white" />
            <span className="truncate">
              One free question, no signup — think you can beat the clock?
            </span>
            <span className="shrink-0 ml-1 font-bold opacity-90">Try it →</span>
          </button>

          {/* Dismiss — stopPropagation keeps it from triggering scroll */}
          <button
            onClick={dismiss}
            aria-label="Dismiss announcement"
            className="h-full px-4 flex items-center justify-center text-white/70 hover:text-white
                       hover:bg-white/10 transition-colors duration-150 focus:outline-none
                       focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-inset shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* In-flow spacer — reserves the exact banner height so the hero doesn't slide under it.
          Animates out on dismiss so the page doesn't jump. */}
      <div
        aria-hidden
        className="transition-all duration-200 ease-out"
        style={{ height: dismissed ? 0 : "44px" }}
      />
    </>
  );
}
