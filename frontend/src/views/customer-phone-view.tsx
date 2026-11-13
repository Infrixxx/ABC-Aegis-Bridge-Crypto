import { useEffect, useState } from "react"
import { ArrowLeft, CheckCircle2, Loader2, Phone, PhoneOff, QrCode, Send, ShieldCheck, Smartphone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input, Label } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Notice } from "@/components/notice"
import { api } from "@/lib/api"
import { rlusd, zar } from "@/lib/format"
import type { Order } from "@/lib/types"
import { errorMessage } from "@/lib/utils"

export function CustomerPhoneView({
  initialOrderId,
  onBack,
}: {
  initialOrderId?: string | null
  onBack: () => void
}) {
  const [tab, setTab] = useState<"ussd" | "qr">(initialOrderId ? "qr" : "ussd")
  const [phone, setPhone] = useState("+27821234567")

  // USSD Interactive Session State
  const [dialCode, setDialCode] = useState(initialOrderId ? `*123*${initialOrderId}#` : "*123#")
  const [ussdPath, setUssdPath] = useState<string[]>([])
  const [ussdScreen, setUssdScreen] = useState<string | null>(null)
  const [ussdEnded, setUssdEnded] = useState(false)
  const [ussdReply, setUssdReply] = useState("")
  const [ussdBusy, setUssdBusy] = useState(false)
  const [sessionId] = useState(() => `ussd-${Date.now()}`)

  // QR / Direct Order Lookup State
  const [orderTag, setOrderTag] = useState(initialOrderId ?? "")
  const [order, setOrder] = useState<Order | null>(null)
  const [qrBusy, setQrBusy] = useState(false)
  const [qrError, setQrError] = useState<string | null>(null)

  const loadOrder = async (id: string) => {
    const clean = id.replace(/\D/g, "")
    if (!clean) return
    setQrBusy(true)
    setQrError(null)
    try {
      const o = await api.getOrder(clean)
      setOrder(o)
      setOrderTag(clean)
    } catch (e) {
      setQrError(errorMessage(e))
      setOrder(null)
    } finally {
      setQrBusy(false)
    }
  }

  useEffect(() => {
    if (initialOrderId) {
      void loadOrder(initialOrderId)
    }
  }, [initialOrderId])

  // Dial initial USSD shortcode (e.g. *123# or *123*67284850#)
  const startUssdCall = async () => {
    setUssdBusy(true)
    try {
      const match = dialCode.match(/\*123\*(\d+)#/)
      const initialSteps = match ? [match[1]] : []
      const textParam = initialSteps.join("*")
      const raw = await api.dialUssdSession(textParam, phone, sessionId)
      setUssdPath(initialSteps)
      setUssdEnded(raw.startsWith("END"))
      setUssdScreen(raw.replace(/^(CON|END)\s+/, ""))
      setUssdReply("")
    } catch (e) {
      setUssdEnded(true)
      setUssdScreen(errorMessage(e))
    } finally {
      setUssdBusy(false)
    }
  }

  const sendUssdStep = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ussdReply.trim()) return
    setUssdBusy(true)
    try {
      const nextPath = [...ussdPath, ussdReply.trim()]
      const raw = await api.dialUssdSession(nextPath.join("*"), phone, sessionId)
      setUssdPath(nextPath)
      setUssdEnded(raw.startsWith("END"))
      setUssdScreen(raw.replace(/^(CON|END)\s+/, ""))
      setUssdReply("")
    } catch (e) {
      setUssdEnded(true)
      setUssdScreen(errorMessage(e))
    } finally {
      setUssdBusy(false)
    }
  }

  const payQrOrder = async () => {
    if (!order) return
    setQrBusy(true)
    setQrError(null)
    try {
      await api.simulateUssdConfirm(order.order_id, phone)
      // Poll briefly to show settled state on phone too
      for (let i = 0; i < 8; i++) {
        await new Promise((r) => setTimeout(r, 1200))
        const updated = await api.getOrder(order.order_id)
        setOrder(updated)
        if (updated.status === "PAID" || updated.status === "REJECTED" || updated.status === "FAILED") {
          break
        }
      }
    } catch (e) {
      setQrError(errorMessage(e))
    } finally {
      setQrBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-6 space-y-5">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4" /> Merchant Login
        </Button>
        <Badge tone="success">Customer Phone (No Login Needed)</Badge>
      </div>

      <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-border bg-card p-1">
        <button
          type="button"
          onClick={() => setTab("ussd")}
          className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold transition-colors ${
            tab === "ussd" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Smartphone className="size-4" /> 2G USSD Dialer
        </button>
        <button
          type="button"
          onClick={() => setTab("qr")}
          className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold transition-colors ${
            tab === "qr" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <QrCode className="size-4" /> QR / Order Tag Pay
        </button>
      </div>

      {/* MODE 1: INTERACTIVE 2G FEATURE PHONE USSD DIALER */}
      {tab === "ussd" && (
        <Card className="overflow-hidden border-2 border-foreground/20">
          <div className="bg-foreground px-4 py-2.5 text-background flex items-center justify-between text-xs font-mono">
            <span>MTN-SA / Vodacom 2G</span>
            <span>ZERO-DATA USSD</span>
          </div>
          <CardContent className="space-y-4 pt-5">
            <div>
              <Label htmlFor="cust-phone">Your Mobile Number (Custodial Wallet ID)</Label>
              <Input
                id="cust-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="font-mono"
              />
            </div>

            {!ussdScreen ? (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="ussd-code">Dial USSD Shortcode (from Merchant Screen)</Label>
                  <Input
                    id="ussd-code"
                    value={dialCode}
                    onChange={(e) => setDialCode(e.target.value)}
                    placeholder="*123*67284850#"
                    className="font-mono text-xl font-semibold tracking-wider text-center"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Tip: Dial <code>*123#</code> for the main menu, or <code>*123*ORDER_TAG#</code> to jump straight to a bill.
                  </p>
                </div>

                <Button
                  size="lg"
                  className="w-full bg-success text-white hover:brightness-105"
                  onClick={() => void startUssdCall()}
                  disabled={ussdBusy}
                >
                  {ussdBusy ? <Loader2 className="animate-spin" /> : <Phone className="size-5" />}
                  Dial USSD Code
                </Button>
              </div>
            ) : (
              /* Active Telecom USSD Popup Modal */
              <div className="rounded-2xl border-2 border-foreground/30 bg-muted/80 p-4 space-y-4 shadow-inner">
                <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                  {ussdEnded ? "USSD Session Ended" : "USSD Service · Reply Required"}
                </p>
                <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-foreground">
                  {ussdScreen}
                </pre>

                {!ussdEnded ? (
                  <form onSubmit={sendUssdStep} className="space-y-3">
                    <Input
                      autoFocus
                      value={ussdReply}
                      onChange={(e) => setUssdReply(e.target.value)}
                      placeholder="Type option (e.g. 1 or Order ID)..."
                      className="font-mono text-center text-lg"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setUssdScreen(null)
                          setUssdPath([])
                        }}
                      >
                        <PhoneOff className="size-4" /> Cancel
                      </Button>
                      <Button type="submit" disabled={ussdBusy || !ussdReply.trim()}>
                        {ussdBusy ? <Loader2 className="animate-spin" /> : <Send className="size-4" />}
                        Send
                      </Button>
                    </div>
                  </form>
                ) : (
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => {
                      setUssdScreen(null)
                      setUssdPath([])
                    }}
                  >
                    Dismiss
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* MODE 2: QR SCAN / ORDER TAG INSTANT WEB WALLET */}
      {tab === "qr" && (
        <Card>
          <CardContent className="space-y-4 pt-5">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void loadOrder(orderTag)
              }}
              className="flex gap-2"
            >
              <Input
                value={orderTag}
                onChange={(e) => setOrderTag(e.target.value)}
                placeholder="Enter 8-digit Order Tag (or scan QR)"
                className="font-mono"
              />
              <Button type="submit" variant="secondary" disabled={qrBusy}>
                {qrBusy ? <Loader2 className="animate-spin" /> : "Load Bill"}
              </Button>
            </form>

            {qrError && <Notice>{qrError}</Notice>}

            {order && (
              <div className="rounded-2xl border border-border bg-muted/40 p-4 space-y-4 text-center">
                <Badge tone={order.status === "PAID" ? "success" : "neutral"}>
                  Order #{order.order_id} · {order.status}
                </Badge>
                <div className="font-display num text-5xl font-semibold">
                  {zar(order.amount_zar)}
                </div>
                <p className="num text-sm text-muted-foreground">
                  Locked Quote: {rlusd(order.quoted_crypto)} RLUSD on XRPL Testnet
                </p>

                {order.status === "PAID" ? (
                  <div className="rounded-xl border border-success/40 bg-success-soft p-3 text-success-text flex items-center justify-center gap-2 font-semibold">
                    <CheckCircle2 className="size-5" /> Paid in Full on XRPL!
                  </div>
                ) : (
                  <Button
                    size="lg"
                    className="w-full"
                    onClick={() => void payQrOrder()}
                    disabled={qrBusy || order.status === "PROCESSING"}
                  >
                    {qrBusy ? <Loader2 className="animate-spin" /> : <ShieldCheck className="size-5" />}
                    {order.status === "PROCESSING"
                      ? "Settling on XRPL Testnet..."
                      : `Approve & Pay ${zar(order.amount_zar)}`}
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
