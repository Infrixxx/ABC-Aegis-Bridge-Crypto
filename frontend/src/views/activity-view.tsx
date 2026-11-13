import { useMemo } from "react"
import { RefreshCw } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Notice } from "@/components/notice"
import { ListenButton } from "@/components/listen-button"
import { StatusPill } from "@/components/status-pill"
import { CopyButton } from "@/components/copy-button"
import { OrderRow, type TimedOrder } from "@/components/order-row"
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table"
import { EXPLORER_TX } from "@/lib/api"
import { formatPhone, parseServerTime, rlusd, shortHash, zar } from "@/lib/format"
import { dayLabel, timeOfDay } from "@/lib/status"
import type { Mode } from "@/hooks/use-preferences"
import type { Order } from "@/lib/types"
import { OPEN_STATUSES } from "@/lib/types"

function stamp(o: Order): number {
  return parseServerTime(o.created_at) ?? (parseServerTime(o.fx_lock_expires_at) ?? Date.now()) - 60_000
}

export function ActivityView({
  orders,
  loading,
  error,
  refresh,
  mode,
  onRefund,
}: {
  orders: Order[]
  loading: boolean
  error: string | null
  refresh: () => void
  mode: Mode
  onRefund: (id: string) => Promise<void>
}) {
  const detail = mode === "pro"
  const timed = useMemo<TimedOrder[]>(
    () => orders.map((o) => ({ ...o, ts: stamp(o) })).sort((a, b) => b.ts - a.ts),
    [orders],
  )
  const today = timed.filter((o) => dayLabel(o.ts) === "Today")
  const paidToday = today.filter((o) => o.status === "PAID")
  const total = paidToday.reduce((s, o) => s + o.amount_zar, 0)
  const waiting = timed.filter((o) => OPEN_STATUSES.includes(o.status)).length

  const groups = useMemo(() => {
    const m = new Map<string, TimedOrder[]>()
    for (const o of timed) {
      const k = dayLabel(o.ts)
      m.set(k, [...(m.get(k) ?? []), o])
    }
    return [...m.entries()]
  }, [timed])

  const summary = `Today you received ${total.toFixed(2)} rand from ${paidToday.length} payments.`

  return (
    <div className="space-y-5">
      <Card className="reveal overflow-hidden">
        <div className="kasi-band" aria-hidden />
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-muted-foreground">Received today</p>
            <div className="flex items-center gap-1">
              <ListenButton text={summary} />
              <Button variant="ghost" size="icon" onClick={refresh} aria-label="Refresh">
                <RefreshCw className={loading ? "animate-spin" : ""} aria-hidden />
              </Button>
            </div>
          </div>
          <div className="font-display num text-5xl leading-none font-semibold tracking-tight sm:text-6xl">{zar(total)}</div>
          <p className="text-sm text-muted-foreground">
            {paidToday.length} {paidToday.length === 1 ? "payment" : "payments"}
            {waiting > 0 && ` · ${waiting} waiting`}
          </p>
        </CardContent>
      </Card>

      {error && <Notice>{error}</Notice>}

      {!loading && timed.length === 0 && !error && (
        <Card className="border-dashed bg-transparent shadow-none">
          <CardContent className="py-10 text-center text-muted-foreground">
            <p className="font-display text-xl text-foreground">No payments yet</p>
            <p className="mt-1 text-sm">They'll show up here as soon as you take one.</p>
          </CardContent>
        </Card>
      )}

      {detail && timed.length > 0 ? (
        <Card className="reveal overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>When</TH>
                  <TH>Order tag</TH>
                  <TH>Customer</TH>
                  <TH className="text-right">ZAR</TH>
                  <TH className="text-right">RLUSD</TH>
                  <TH>Status</TH>
                  <TH>Tx</TH>
                  <TH>
                    <span className="sr-only">Actions</span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {timed.map((o) => (
                  <TR key={o.order_id}>
                    <TD className="whitespace-nowrap text-muted-foreground">
                      {dayLabel(o.ts)} {timeOfDay(o.ts)}
                    </TD>
                    <TD className="font-mono">{o.order_id}</TD>
                    <TD className="whitespace-nowrap">{formatPhone(o.phone_number)}</TD>
                    <TD className="num text-right font-medium">{zar(o.amount_zar)}</TD>
                    <TD className="num text-right text-muted-foreground">{rlusd(o.quoted_crypto)}</TD>
                    <TD>
                      <StatusPill status={o.status} detail />
                    </TD>
                    <TD>
                      {o.tx_hash ? (
                        <span className="inline-flex items-center">
                          <a
                            className="font-mono text-link underline underline-offset-4"
                            href={`${EXPLORER_TX}/${o.tx_hash}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {shortHash(o.tx_hash)}
                          </a>
                          <CopyButton text={o.tx_hash} label="transaction hash" />
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TD>
                    <TD>
                      {o.status === "PAID" && (
                        <RefundCell id={o.order_id} amount={o.amount_zar} onRefund={onRefund} />
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </Card>
      ) : (
        groups.map(([day, rows], gi) => (
          <section key={day} className="reveal" style={{ "--i": gi } as React.CSSProperties} aria-label={day}>
            <h2 className="mb-1 px-1 font-display text-lg font-semibold">{day}</h2>
            <Card>
              <CardContent className="p-1.5 sm:p-2">
                {rows.map((o) => (
                  <OrderRow key={o.order_id} order={o} detail={false} onRefund={onRefund} />
                ))}
              </CardContent>
            </Card>
          </section>
        ))
      )}
    </div>
  )
}

import { ConfirmButton } from "@/components/confirm-button"
function RefundCell({ id, amount, onRefund }: { id: string; amount: number; onRefund: (id: string) => Promise<void> }) {
  return (
    <ConfirmButton confirmLabel={`Refund ${zar(amount)}?`} onConfirm={() => onRefund(id)}>
      Refund
    </ConfirmButton>
  )
}
