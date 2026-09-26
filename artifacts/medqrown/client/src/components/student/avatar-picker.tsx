import { useState } from "react";
import { Check } from "lucide-react";
import { AVATAR_OPTIONS, AVATAR_STYLES, getStudentAvatarUrl, type AvatarStyle } from "@/lib/avatar";

/** Style filter + avatar grid, used on the profile page and in the first-login walkthrough. */
export function AvatarPicker({
  value, onSelect, disabled, columns = 3,
}: { value: string | null | undefined; onSelect: (key: string) => void; disabled?: boolean; columns?: 3 | 4 | 5 }) {
  const [filter, setFilter] = useState<"all" | AvatarStyle>("all");
  const visible = filter === "all" ? AVATAR_OPTIONS : AVATAR_OPTIONS.filter((avatar) => avatar.style === filter);
  const grid = columns === 5 ? "grid-cols-4 sm:grid-cols-5" : columns === 4 ? "grid-cols-3 sm:grid-cols-4" : "grid-cols-3";

  return (
    <div className="w-full">
      <div className="mb-3 flex gap-1 overflow-x-auto no-scrollbar rounded-lg bg-muted/60 p-1">
        {[{ value: "all" as const, label: "All" }, ...AVATAR_STYLES].map((style) => (
          <button
            key={style.value}
            type="button"
            onClick={() => setFilter(style.value)}
            className={`shrink-0 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
              filter === style.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {style.label}
          </button>
        ))}
      </div>
      <div className={`grid ${grid} gap-2.5 max-h-[340px] overflow-y-auto p-0.5`}>
        {visible.map((avatar) => {
          const selected = value === avatar.key;
          return (
            <button
              key={avatar.key}
              type="button"
              disabled={disabled}
              aria-label={`Choose ${avatar.name} avatar`}
              aria-pressed={selected}
              onClick={() => onSelect(avatar.key)}
              className={`group relative aspect-square overflow-hidden rounded-xl border-2 bg-muted/40 transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md ${
                selected ? "border-primary bg-primary/10 shadow-md ring-2 ring-primary/20" : "border-transparent"
              } ${disabled ? "cursor-not-allowed opacity-70" : ""}`}
            >
              <img src={getStudentAvatarUrl(avatar.key)} alt="" loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
              {selected && (
                <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
                  <Check className="h-3 w-3" />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
