import { Progress } from "radix-ui"
import { cn } from "@/lib/utils"

export type MeterTone = "success" | "warning" | "danger"

export function Meter({
  value,
  max,
  tone = "success",
  label,
  className,
}: {
  value: number
  max: number
  tone?: MeterTone
  label: string
  className?: string
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  const fill = tone === "danger" ? "bg-danger" : tone === "warning" ? "bg-warning" : "bg-success"
  return (
    <Progress.Root
      value={pct}
      aria-label={label}
      className={cn("relative h-3 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      <Progress.Indicator
        className={cn("h-full rounded-full transition-[width] duration-500", fill)}
        style={{ width: `${pct}%` }}
      />
    </Progress.Root>
  )
}
