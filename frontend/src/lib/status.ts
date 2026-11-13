import {
  Ban,
  CheckCircle2,
  Clock,
  Loader2,
  ShieldAlert,
  Timer,
  Undo2,
  XCircle,
  type LucideIcon,
} from "lucide-react"
import type { OrderStatus } from "./types"

export type Tone = "success" | "warning" | "danger" | "neutral"

export interface StatusMeta {
  /** Plain-language label for shop owners. */
  plain: string
  /** Raw status code, shown in the detailed view. */
  code: string
  tone: Tone
  icon: LucideIcon
  dashed?: boolean
  spin?: boolean
}

const META: Record<OrderStatus, StatusMeta> = {
  PAID: { plain: "Paid", code: "PAID", tone: "success", icon: CheckCircle2 },
  PENDING: { plain: "Waiting", code: "PENDING", tone: "neutral", icon: Clock, dashed: true },
  PROCESSING: { plain: "Confirming", code: "PROCESSING", tone: "neutral", icon: Loader2, dashed: true, spin: true },
  LATE: { plain: "Expired", code: "LATE", tone: "warning", icon: Timer },
  FAILED: { plain: "Didn't go through", code: "FAILED", tone: "danger", icon: XCircle },
  REJECTED: { plain: "Declined", code: "REJECTED", tone: "danger", icon: Ban },
  BUDGET_EXCEEDED: { plain: "Over limit", code: "BUDGET_EXCEEDED", tone: "danger", icon: ShieldAlert },
  UNDERPAID: { plain: "Short paid", code: "UNDERPAID", tone: "warning", icon: XCircle },
  REFUNDED: { plain: "Refunded", code: "REFUNDED", tone: "neutral", icon: Undo2 },
}

export function statusMeta(s: OrderStatus | string): StatusMeta {
  return (
    META[s as OrderStatus] ?? { plain: String(s), code: String(s), tone: "neutral", icon: Clock }
  )
}

export function dayLabel(ts: number, now = Date.now()): string {
  const d = new Date(ts)
  const today = new Date(now)
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((startOf(today) - startOf(d)) / 86_400_000)
  if (diff === 0) return "Today"
  if (diff === 1) return "Yesterday"
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
}

export function timeOfDay(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
}
