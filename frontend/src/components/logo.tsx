import { cn } from "@/lib/utils"

/** An arch over a deck: a bridge. */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "grid size-10 place-items-center rounded-2xl bg-foreground text-background shadow-[inset_0_-3px_0_rgb(0_0_0/0.25)]",
        className,
      )}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <path d="M4 17c0-5 3.6-9 8-9s8 4 8 9" />
        <path d="M2.5 17h19" />
        <path d="M12 8v9" opacity="0.55" />
      </svg>
    </span>
  )
}
