import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * (i) button overlaid on a question image in the results review. Shows the
 * image description on mouse hover or on tap/click; tapping outside or
 * pressing Escape closes it. Not used while an exam is being taken.
 */
export function ImageDescriptionInfo({ description }: { description: string }) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPointer = useRef<string>("mouse");
  // Clicking pins the popup open until the student clicks outside or presses Escape.
  const pinned = useRef(false);

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  // Hover handlers only react to a real mouse; touch devices use tap to toggle.
  const hoverOpen = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    cancelClose();
    setOpen(true);
  };
  const hoverClose = (e: PointerEvent) => {
    if (e.pointerType !== "mouse" || pinned.current) return;
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  };
  useEffect(() => cancelClose, []);

  return (
    <Popover open={open} onOpenChange={(next) => { cancelClose(); if (!next) pinned.current = false; setOpen(next); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Show image description"
          className="absolute top-2 right-2 inline-flex h-8 w-8 items-center justify-center rounded-full border bg-background/90 text-primary shadow-sm backdrop-blur hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onPointerDown={(e) => { lastPointer.current = e.pointerType; }}
          onPointerEnter={hoverOpen}
          onPointerLeave={hoverClose}
          onClick={(e) => {
            // Take over Radix's toggle: a mouse click pins a hover-opened popup open,
            // a tap toggles it.
            e.preventDefault();
            cancelClose();
            const next = lastPointer.current === "mouse" ? true : !open;
            pinned.current = next;
            setOpen(next);
          }}
          data-testid="button-image-info"
        >
          <Info className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-72 max-w-[calc(100vw-2rem)] text-sm whitespace-pre-wrap"
        onPointerEnter={hoverOpen} onPointerLeave={hoverClose} data-testid="text-image-description">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Image description</p>
        {description}
      </PopoverContent>
    </Popover>
  );
}
