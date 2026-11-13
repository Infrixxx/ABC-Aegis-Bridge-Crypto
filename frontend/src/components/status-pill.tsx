import { Badge } from "@/components/ui/badge"
import { statusMeta } from "@/lib/status"
import { cn } from "@/lib/utils"
import type { OrderStatus } from "@/lib/types"

export function StatusPill({
  status,
  detail = false,
  className,
}: {
  status: OrderStatus | string
  detail?: boolean
  className?: string
}) {
  const m = statusMeta(status)
  const Icon = m.icon
  return (
    <Badge tone={m.tone} dashed={m.dashed} className={className}>
      <Icon className={cn(m.spin && "animate-spin")} aria-hidden />
      {detail ? m.code : m.plain}
    </Badge>
  )
}
