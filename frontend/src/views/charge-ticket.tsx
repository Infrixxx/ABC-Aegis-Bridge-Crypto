import { useEffect, type ReactNode } from "react"
import { QRCodeSVG } from "qrcode.react"
import { Ban, Loader2, QrCode, Smartphone, Sparkles, Timer, Undo2, XCircle, type LucideIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ConfirmButton } from "@/components/confirm-button"
import { CopyButton } from "@/components/copy-button"
import { ListenButton } from "@/components/listen-button"
import { Notice } from "@/components/notice"
import { RingTimer } from "@/components/ring-timer"
import { AgentTraceView } from "@/components/agent-trace-view"
import { TONE_CHIP } from "@/components/order-row"
import { EXPLORER_TX } from "@/lib/api"
import { formatPhone, rlusd, shortHash, spellDigits, zar } from "@/lib/format"
import { useNow } from "@/hooks/use-now"
import type { useCharge } from "@/hooks/use-charge"
import type { Tone } from "@/lib/status"
import { cn } from "@/lib/utils"

type Ctl = ReturnType<typeof useCharge>

function Amount({ value, sub }: { value: number; sub?: string }) {
  return (
    <div>
      <div className="font-display num text-5xl leading-none font-semibold tracking-tight sm:text-6xl">{zar(value)}</div>
      {sub && <div className="num mt-2 text-sm text-muted-foreground">{sub}</div>}
    </div>
  )
}

function Outcome({
  icon: Icon,
  tone,
  title,
  body,
  children,
}: {
  icon: LucideIcon
  tone: Tone
  title: string
  body: string
  children: ReactNode
}) {
  return (
    <Card className="reveal">
      <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
        <span className={cn("pop grid size-20 place-items-center rounded-full border-2", TONE_CHIP[tone])}>
          <Icon className="size-9" aria-hidden />
        </span>
        <div>
          <h2 className="font-display text-3xl font-semibold">{title}</h2>
          <p className="mx-auto mt-2 max-w-sm text-muted-foreground">{body}</p>
        </div>
        <div className="mt-2 flex w-full max-w-xs flex-col gap-2">{children}</div>
      </CardContent>
    </Card>
  )
}

export function Ticket({ ctl, detail }: { ctl: Ctl; detail: boolean }) {
  const { charge, status, markExpired } = ctl
  const now = useNow(250, status === "PENDING")
  const remaining = charge ? charge.lockEndsAt - now : 0

  useEffect(() => {
    if (status === "PENDING" && remaining <= 0) markExpired()
  }, [status, remaining, markExpired])

  if (!charge || !status) {
    return (
      <Card className="reveal hidden min-h-[28rem] place-items-center border-dashed bg-transparent shadow-none lg:grid" style={{ "--i": 1 } as React.CSSProperties}>
        <div className="max-w-xs px-6 text-center text-muted-foreground">
          <QrCode className="mx-auto mb-4 size-14 opacity-40" aria-hidden />
          <p className="font-display text-xl text-foreground">Ready when you are</p>
          <p className="mt-1 text-sm">Type an amount and the customer's payment code will appear here.</p>
        </div>
      </Card>
    )
  }

  const { order } = charge
  const sub = detail ? `${rlusd(order.quoted_crypto)} ${order.currency}` : undefined

  if (status === "PENDING") {
    const secs = Math.max(0, Math.ceil(remaining / 1000))
    return (
      <Card className="reveal">
        <CardContent className="space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-3">
              <Badge tone="neutral" dashed>
                <span className="pulse-dot size-2 rounded-full bg-primary" aria-hidden />
                Waiting for customer
              </Badge>
              <Amount value={order.amount_zar} sub={sub} />
            </div>
            <RingTimer remainingMs={Math.max(0, remaining)} totalMs={order.fx_lock_seconds * 1000} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-background/50 p-4">
              <div className="rounded-xl bg-white p-3">
                <QRCodeSVG value={(window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") ? (order.web_pay_url || `${window.location.origin}/?pay=${order.order_id}`) : `${window.location.origin}/?pay=${order.order_id}`} size={156} level="M" bgColor="#ffffff" fgColor="#111111" />
              </div>
              <p className="text-center text-sm text-muted-foreground">
                <QrCode className="mr-1 inline size-4 align-[-0.15em]" aria-hidden />
                Scan with phone camera (opens live checkout)
              </p>
            </div>
            <div className="flex flex-col justify-center gap-2 rounded-2xl border border-border bg-background/50 p-4">
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Smartphone className="size-4" aria-hidden />
                Or dial on any phone
              </p>
              <p className="font-mono text-2xl leading-tight font-semibold tracking-wide break-all">{order.ussd_shortcode}</p>
              <div className="flex items-center gap-1">
                <CopyButton text={order.ussd_shortcode} label="dial code" />
                <span className="text-xs text-muted-foreground">No data or smartphone needed</span>
              </div>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            The price is held for {order.fx_lock_seconds} seconds so the customer pays exactly {zar(order.amount_zar)}.
          </p>

          {ctl.error && <Notice>{ctl.error}</Notice>}

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <ListenButton
              text={`Charge ${order.amount_zar} rand. The customer can scan the code, or dial ${spellDigits(order.ussd_shortcode)} on any phone. The price is held for ${secs} more seconds.`}
            />
            <Button variant="outline" size="sm" onClick={() => void ctl.simulate()} disabled={ctl.busy === "simulate"} className="border-dashed">
              {ctl.busy === "simulate" ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
              Demo: customer pays
            </Button>
            <Button variant="ghost" size="sm" onClick={ctl.reset} className="ml-auto">
              Cancel
            </Button>
          </div>

          {detail && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 rounded-xl bg-muted/60 p-3 text-sm">
              <dt className="text-muted-foreground">Order tag</dt>
              <dd className="font-mono">{order.destination_tag}</dd>
              <dt className="text-muted-foreground">Receipt SMS</dt>
              <dd>{formatPhone(charge.phone) || "None"}</dd>
              <dt className="text-muted-foreground">Pays to</dt>
              <dd className="font-mono break-all">{order.merchant_address}</dd>
            </dl>
          )}
        </CardContent>
      </Card>
    )
  }

  if (status === "PROCESSING") {
    return (
      <Card className="reveal" aria-busy="true">
        <CardContent className="flex flex-col items-center gap-6 py-14 text-center">
          <Loader2 className="size-12 animate-spin text-muted-foreground" aria-hidden />
          <div>
            <h2 className="font-display text-3xl font-semibold">Confirming payment...</h2>
            <p className="mt-2 text-muted-foreground">This usually takes a few seconds.</p>
          </div>
          <Amount value={order.amount_zar} sub={sub} />
          <div className="relative h-1.5 w-56 overflow-hidden rounded-full bg-muted">
            <div className="sweep absolute inset-y-0 w-1/3 rounded-full bg-primary" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (status === "PAID") {
    return (
      <Card className="reveal overflow-hidden border-success/60 bg-success-soft">
        <CardContent className="flex flex-col items-center gap-5 py-10 text-center">
          <div className="relative grid size-28 place-items-center">
            {[0, 1, 2].map((d) => (
              <span key={d} className="burst absolute size-24 rounded-full border-2 border-success" style={{ "--d": d } as React.CSSProperties} aria-hidden />
            ))}
            <span className="pop relative grid size-24 place-items-center rounded-full bg-success text-card">
              <svg viewBox="0 0 24 24" className="size-12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path className="check-draw" d="M5.5 12.5l4.2 4.2L18.5 7.5" />
              </svg>
            </span>
          </div>
          <div>
            <h2 className="font-display text-6xl leading-none font-semibold tracking-tight text-success-text">Paid</h2>
            <p className="num mt-3 text-2xl font-medium">{zar(order.amount_zar)} received</p>
            {sub && <p className="num mt-1 text-sm text-muted-foreground">{sub}</p>}
          </div>
          {charge.txHash && (
            <p className="flex flex-wrap items-center justify-center gap-1 text-sm">
              <a
                href={`${EXPLORER_TX}/${charge.txHash}`}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-success-text underline underline-offset-4"
              >
                {detail ? (
                  <>
                    Tx <span className="font-mono">{shortHash(charge.txHash)}</span>
                  </>
                ) : (
                  "See proof of payment"
                )}
              </a>
              {detail && <CopyButton text={charge.txHash} label="transaction hash" />}
              {detail && <span className="text-muted-foreground">· tag {order.destination_tag}</span>}
            </p>
          )}

          {/* LangGraph Multi-Agent Telemetry */}
          <AgentTraceView
            steps={charge.agentTrace}
            orderId={order.order_id}
            className="w-full text-left"
          />

          <div className="flex w-full max-w-xs flex-col items-stretch gap-2">
            <Button size="lg" onClick={ctl.reset}>
              Next customer
            </Button>
            <ConfirmButton
              variant="ghost"
              confirmLabel={`Yes, refund ${zar(order.amount_zar)}`}
              onConfirm={() => ctl.refund(order.order_id)}
              className="flex justify-center"
            >
              <Undo2 aria-hidden /> Refund this payment
            </ConfirmButton>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (status === "LATE") {
    return (
      <Outcome
        icon={Timer}
        tone="warning"
        title="Price expired"
        body={`The ${order.fx_lock_seconds}-second price window ran out before the customer paid. Start again for a fresh price.`}
      >
        <Button size="lg" onClick={() => void ctl.create(charge.phone, charge.amount)} disabled={ctl.creating}>
          {ctl.creating && <Loader2 className="animate-spin" aria-hidden />}
          Charge {zar(charge.amount)} again
        </Button>
        <Button variant="ghost" onClick={ctl.reset}>
          Start over
        </Button>
      </Outcome>
    )
  }

  if (status === "REFUNDED") {
    return (
      <Outcome icon={Undo2} tone="neutral" title="Refunded" body={`${zar(order.amount_zar)} was refunded on-chain to the payer's XRPL wallet.`}>
        <Button size="lg" onClick={ctl.reset}>
          Next customer
        </Button>
      </Outcome>
    )
  }

  return (
    <Outcome
      icon={status === "REJECTED" || status === "BUDGET_EXCEEDED" ? Ban : XCircle}
      tone="danger"
      title="Payment didn't go through"
      body="Ask the customer to check their phone, then try again."
    >
      <Button size="lg" onClick={() => void ctl.create(charge.phone, charge.amount)} disabled={ctl.creating}>
        Try again
      </Button>
      <Button variant="ghost" onClick={ctl.reset}>
        Start over
      </Button>
    </Outcome>
  )
}

