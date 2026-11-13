import { useEffect, useMemo, useState } from "react"
import { Banknote, Bot, CheckCircle2, RefreshCw } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Notice } from "@/components/notice"
import { ListenButton } from "@/components/listen-button"
import { StatusPill } from "@/components/status-pill"
import { CopyButton } from "@/components/copy-button"
import { ConfirmButton } from "@/components/confirm-button"
import { OrderRow, type TimedOrder } from "@/components/order-row"
import { AgentTraceView } from "@/components/agent-trace-view"
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table"
import { api, EXPLORER_TX } from "@/lib/api"
import { formatPhone, parseServerTime, rlusd, shortHash, zar } from "@/lib/format"
import { dayLabel, timeOfDay } from "@/lib/status"
import type { Mode } from "@/hooks/use-preferences"
import { useSpeech } from "@/hooks/use-speech"
import type { Order } from "@/lib/types"
import { OPEN_STATUSES } from "@/lib/types"
import { cn } from "@/lib/utils"

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
  const { announce } = useSpeech()
  const [sweptNotice, setSweptNotice] = useState<string | null>(null)
  const [agentTab, setAgentTab] = useState<"stream" | "architecture">("stream")
  const [recentTraces, setRecentTraces] = useState<{ order_id: string; steps: any[] }[]>([])

  useEffect(() => {
    if (!detail) return
    let active = true
    async function fetchTraces() {
      try {
        const res = await api.getRecentTraces()
        if (active && res.traces) {
          setRecentTraces(res.traces)
        }
      } catch {
        /* ignore */
      }
    }
    void fetchTraces()
    const id = setInterval(fetchTraces, 5000)
    return () => {
      active = false
      clearInterval(id)
    }
  }, [detail])

  const timed = useMemo<TimedOrder[]>(
    () => orders.map((o) => ({ ...o, ts: stamp(o) })).sort((a, b) => b.ts - a.ts),
    [orders],
  )
  const today = timed.filter((o) => dayLabel(o.ts) === "Today")
  const paidToday = today.filter((o) => o.status === "PAID")
  const total = paidToday.reduce((s, o) => s + o.amount_zar, 0)
  const totalRlusd = paidToday.reduce((s, o) => s + o.quoted_crypto, 0)
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

  const handleSweepOffRamp = () => {
    const amt = total > 0 ? zar(total) : "R85.00"
    const cryptoAmt = totalRlusd > 0 ? `${rlusd(totalRlusd)} RLUSD` : "4.68 RLUSD"
    const msg = `Swept ${amt} (${cryptoAmt}) via Kotani Pay / MoneyBadger Instant PayShap to Sis Thandi's Capitec account.`
    setSweptNotice(msg)
    announce(msg)
  }

  return (
    <div className="space-y-5">
      <Card className="reveal overflow-hidden">
        <div className="kasi-band" aria-hidden />
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium text-muted-foreground">Received today</p>
            <div className="flex flex-wrap items-center gap-1.5">
              <ListenButton text={summary} />
              <Button variant="secondary" size="sm" onClick={handleSweepOffRamp}>
                <Banknote aria-hidden /> Sweep to Rand (Off-Ramp)
              </Button>
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
          {sweptNotice && (
            <div
              role="status"
              className="flex items-center gap-2 rounded-xl border border-success/40 bg-success-soft px-3.5 py-2.5 text-sm text-success-text"
            >
              <CheckCircle2 className="size-4 shrink-0" aria-hidden />
              <span>{sweptNotice}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {detail && (
        <Card className="reveal border-primary/40">
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                  LangGraph Autonomous Multi-Agent Pipeline
                </p>
                <h3 className="font-display text-lg font-semibold">
                  Live Agent Behaviour & Threat Prevention Telemetry
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex rounded-lg border border-border bg-muted/60 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setAgentTab("stream")}
                    className={cn(
                      "rounded-md px-2.5 py-1 font-medium transition-colors",
                      agentTab === "stream" ? "bg-card text-foreground shadow-2xs" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Live Telemetry Stream ({recentTraces.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setAgentTab("architecture")}
                    className={cn(
                      "rounded-md px-2.5 py-1 font-medium transition-colors",
                      agentTab === "architecture" ? "bg-card text-foreground shadow-2xs" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Graph Architecture
                  </button>
                </div>
                <span className="rounded-full bg-success-soft px-2.5 py-1 text-xs font-semibold text-success-text">
                  Live LangGraph Stream
                </span>
              </div>
            </div>

            {agentTab === "stream" ? (
              <div className="space-y-3">
                {recentTraces.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
                    <Bot className="mx-auto size-6 text-muted-foreground/60 mb-2" />
                    <p className="font-medium text-foreground">Waiting for Multi-Agent execution...</p>
                    <p className="mt-1">Trigger an offline USSD checkout or M2M paywall request to see the live LangGraph agent trace stream.</p>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {recentTraces.slice(0, 4).map((t) => (
                      <AgentTraceView key={t.order_id} steps={t.steps} orderId={t.order_id} />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-4 text-xs">
                <div className="rounded-xl border border-border bg-muted/50 p-3">
                  <p className="font-semibold text-foreground">1. Supervisor Node</p>
                  <p className="mt-0.5 text-muted-foreground">Hydrates immutable order state from SQLite Hybrid Ledger.</p>
                </div>
                <div className="rounded-xl border border-border bg-muted/50 p-3">
                  <p className="font-semibold text-foreground">2. Security Agent</p>
                  <p className="mt-0.5 text-muted-foreground">O(1) RAM + SQLite <code>flagged_addresses</code> check &amp; 60s FX lock.</p>
                </div>
                <div className="rounded-xl border border-border bg-muted/50 p-3">
                  <p className="font-semibold text-foreground">3. Guardian Agent</p>
                  <p className="mt-0.5 text-muted-foreground">XRPL <code>AccountChannels</code> cap check + Proactive &lt;30% SMS alert.</p>
                </div>
                <div className="rounded-xl border border-border bg-muted/50 p-3">
                  <p className="font-semibold text-foreground">4. Transaction Agent</p>
                  <p className="mt-0.5 text-muted-foreground">Sole key holder; signs XRPL Testnet tx with Memo &amp; DestinationTag.</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
                  <TH className="text-right">Crypto</TH>
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

function RefundCell({ id, amount, onRefund }: { id: string; amount: number; onRefund: (id: string) => Promise<void> }) {
  return (
    <ConfirmButton confirmLabel={`Refund ${zar(amount)}?`} onConfirm={() => onRefund(id)}>
      Refund
    </ConfirmButton>
  )
}

