import type { ReactNode } from "react"
import { AlertTriangle, Info } from "lucide-react"
import { cn } from "@/lib/utils"

export function Notice({
  tone = "danger",
  children,
  className,
}: {
  tone?: "danger" | "neutral"
  children: ReactNode
  className?: string
}) {
  const Icon = tone === "danger" ? AlertTriangle : Info
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm",
        tone === "danger"
          ? "border-danger/40 bg-danger-soft text-danger-text"
          : "border-border bg-muted text-muted-foreground",
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  )
}
