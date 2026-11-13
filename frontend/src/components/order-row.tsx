import { Collapsible } from "radix-ui"
import { ChevronDown, ExternalLink } from "lucide-react"
import { ConfirmButton } from "@/components/confirm-button"
import { CopyButton } from "@/components/copy-button"
import { StatusPill } from "@/components/status-pill"
import { AgentTraceView } from "@/components/agent-trace-view"
import { EXPLORER_TX } from "@/lib/api"
import { formatPhone, rlusd, shortHash, zar } from "@/lib/format"
import { statusMeta, timeOfDay, type Tone } from "@/lib/status"
import type { Order } from "@/lib/types"
import { cn } from "@/lib/utils"

export const TONE_CHIP: Record<Tone, string> = {
  success: "border-success/40 bg-success-soft text-success-text",
  warning: "border-warning/40 bg-warning-soft text-warning-text",
  danger: "border-danger/40 bg-danger-soft text-danger-text",
  neutral: "border-border bg-muted text-muted-foreground",
}

export type TimedOrder = Order & { ts: number }

export function OrderRow({
  order,
  detail,
  onRefund,
}: {
  order: TimedOrder
  detail: boolean
  onRefund: (id: string) => Promise<void>
}) {
  const m = statusMeta(order.status)
  const Icon = m.icon
  return (
    <Collapsible.Root className="group rounded-2xl border border-transparent transition-colors data-[state=open]:border-border data-[state=open]:bg-background/60">
      <Collapsible.Trigger className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left hover:bg-muted/60 sm:px-4">
        <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl border", TONE_CHIP[m.tone], m.dashed && "border-dashed")}>
          <Icon className={cn("size-5", m.spin && "animate-spin")} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="font-display num block text-xl leading-tight font-semibold">{zar(order.amount_zar)}</span>
          <span className="block truncate text-sm text-muted-foreground">
            {timeOfDay(order.ts)} Â· {formatPhone(order.phone_number) || "No number"}
          </span>
        </span>
        <StatusPill status={order.status} detail={detail} className="hidden sm:inline-flex" />
        <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" aria-hidden />
      </Collapsible.Trigger>
      <Collapsible.Content className="disclosure overflow-hidden">
        <div className="space-y-3 px-3 pt-1 pb-4 sm:px-4">
          <StatusPill status={order.status} detail={detail} className="sm:hidden" />
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Customer</dt>
            <dd>{formatPhone(order.phone_number) || "Not given"}</dd>
            {detail && (
              <>
                <dt className="text-muted-foreground">Order tag</dt>
                <dd className="font-mono">{order.order_id}</dd>
                <dt className="text-muted-foreground">Settled as</dt>
                <dd className="num">{rlusd(order.quoted_crypto)} {(order as any).currency || 'XRP'}</dd>
              </>
            )}
            <dt className="text-muted-foreground">Proof</dt>
            <dd>
              {order.tx_hash ? (
                <span className="inline-flex items-center gap-1">
                  <a
                    href={`${EXPLORER_TX}/${order.tx_hash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-link underline underline-offset-4"
                  >
                    {detail ? <span className="font-mono">{shortHash(order.tx_hash)}</span> : "View proof of payment"}
                    <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                  {detail && <CopyButton text={order.tx_hash} label="transaction hash" />}
                </span>
              ) : (
                <span className="text-muted-foreground">Not available yet</span>
              )}
            </dd>
          </dl>

          {/* LangGraph Multi-Agent Execution Telemetry */}
          <AgentTraceView steps={order.agent_trace} orderId={order.order_id} />

          {order.status === "PAID" && (
            <ConfirmButton confirmLabel={`Yes, refund ${zar(order.amount_zar)}`} onConfirm={() => onRefund(order.order_id)}>
              Refund
            </ConfirmButton>
          )}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  )
}
