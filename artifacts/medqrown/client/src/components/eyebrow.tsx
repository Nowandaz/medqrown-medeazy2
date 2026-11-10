/** Small uppercase label above a heading, set off by a short rule (used instead of pill badges). */
export function Eyebrow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] ${className}`}>
      <span aria-hidden="true" className="h-px w-8 bg-current opacity-60" />
      {children}
    </p>
  );
}

/** "3 questions | 5 min | KSh 0" style facts, separated by thin rules. */
export function FactRow({ facts, className = "" }: { facts: { value: string; label: string }[]; className?: string }) {
  return (
    <dl className={`grid grid-cols-3 ${className}`}>
      {facts.map((f, i) => (
        <div key={f.label} className={`px-4 first:pl-0 ${i > 0 ? "border-l" : ""}`}
          style={i > 0 ? { borderColor: "color-mix(in srgb, currentColor 25%, transparent)" } : undefined}>
          <dt className="sr-only">{f.label}</dt>
          <dd className="text-2xl font-black leading-none sm:text-3xl">{f.value}</dd>
          <dd className="mt-1.5 text-xs opacity-75 sm:text-sm">{f.label}</dd>
        </div>
      ))}
    </dl>
  );
}
