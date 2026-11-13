import { cn } from "@/lib/utils"

/** Circular countdown for the rate lock. Shows seconds as text as well as the ring. */
export function RingTimer({ remainingMs, totalMs, size = 72 }: { remainingMs: number; totalMs: number; size?: number }) {
  const r = 30
  const c = 2 * Math.PI * r
  const frac = totalMs > 0 ? Math.min(1, Math.max(0, remainingMs / totalMs)) : 0
  const secs = Math.max(0, Math.ceil(remainingMs / 1000))
  const urgent = secs <= 15
  return (
    <div
      className={cn("relative grid shrink-0 place-items-center", urgent ? "text-danger" : "text-success")}
      style={{ width: size, height: size }}
      role="timer"
      aria-label={`Price held for ${secs} more seconds`}
    >
      <svg viewBox="0 0 72 72" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="36" cy="36" r={r} fill="none" stroke="var(--muted)" strokeWidth="6" />
        <circle
          cx="36"
          cy="36"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          style={{ transition: "stroke-dashoffset 300ms linear" }}
        />
      </svg>
      <div className="num relative text-center leading-none text-foreground">
        <div className="font-display text-xl font-semibold">{secs}</div>
        <div className="mt-0.5 text-[0.6rem] tracking-wide text-muted-foreground uppercase">sec</div>
      </div>
    </div>
  )
}
