import { useEffect, useState } from "react"
import { ArrowLeft, CheckCircle2, KeyRound, Loader2, Phone, PhoneCall, PhoneOff, QrCode, Send, ShieldAlert, ShieldCheck, Smartphone, Volume2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input, Label } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Notice } from "@/components/notice"
import { api } from "@/lib/api"
import { rlusd, zar } from "@/lib/format"
import { useSpeech } from "@/hooks/use-speech"
import type { Order } from "@/lib/types"
import { errorMessage } from "@/lib/utils"

function extractSayText(xml: string): string {
  const matches = [...xml.matchAll(/<Say>([\s\S]*?)<\/Say>/gi)]
  if (!matches.length) return xml
  return matches.map((m) => m[1].trim()).join(" ")
}

export function CustomerPhoneView({
  initialOrderId,
  onBack,
}: {
  initialOrderId?: string | null
  onBack: () => void
}) {
  const { speak, stop } = useSpeech()
  const [tab, setTab] = useState<"ussd" | "qr" | "ivr">(initialOrderId ? "qr" : "ussd")
  const [phone, setPhone] = useState("+27821234567")

  // ── 1. USSD Interactive Session State ──────────────────────────────────────
  const [dialCode, setDialCode] = useState(initialOrderId ? `*123*${initialOrderId}#` : "*123#")
  const [ussdPath, setUssdPath] = useState<string[]>([])
  const [ussdScreen, setUssdScreen] = useState<string | null>(null)
  const [ussdEnded, setUssdEnded] = useState(false)
  const [ussdReply, setUssdReply] = useState("")
  const [ussdBusy, setUssdBusy] = useState(false)
  const [sessionId] = useState(() => `ussd-${Date.now()}`)

  // ── 2. QR / Direct Order + 4-Digit Custodial PIN State ─────────────────────
  const [orderTag, setOrderTag] = useState(initialOrderId ?? "")
  const [order, setOrder] = useState<Order | null>(null)
  const [pin, setPin] = useState("1234")
  const [qrBusy, setQrBusy] = useState(false)
  const [qrError, setQrError] = useState<string | null>(null)

  // ── 3. Toll-Free IVR Voice Simulator State (0800-AEGIS) ────────────────────
  const [ivrActive, setIvrActive] = useState(false)
  const [ivrStep, setIvrStep] = useState<"idle" | "order" | "pin" | "done">("idle")
  const [ivrPrompt, setIvrPrompt] = useState<string>("")
  const [ivrDigits, setIvrDigits] = useState<string>(initialOrderId ?? "")
  const [ivrOrderId, setIvrOrderId] = useState<string>(initialOrderId ?? "")
  const [ivrBusy, setIvrBusy] = useState(false)

  const loadOrder = async (id: string) => {
    const clean = id.replace(/\D/g, "")
    if (!clean) return
    setQrBusy(true)
    setQrError(null)
    try {
      const o = await api.getOrder(clean)
      setOrder(o)
      setOrderTag(clean)
      if (o.phone_number) setPhone(o.phone_number)
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

  // ── USSD Handlers ──────────────────────────────────────────────────────────
  const startUssdCall = async () => {
    setUssdBusy(true)
    try {
      const match = dialCode.match(/\*123\*(\d+)#/)
      const initialSteps = match ? [match[1]] : []
      const raw = await api.dialUssdSession(initialSteps.join("*"), phone, sessionId)
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

  // ── QR + 2FA PIN Handler ───────────────────────────────────────────────────
  const payQrOrder = async () => {
    if (!order) return
    if (pin.trim().length < 4) {
      setQrError("Please enter your 4-digit Custodial Wallet PIN (Demo PIN: 1234).")
      return
    }
    setQrBusy(true)
    setQrError(null)
    try {
      const reply = await api.simulateUssdConfirm(order.order_id, phone, pin.trim())
      if (/Security Block/i.test(reply) || /expired/i.test(reply)) {
        setQrError(reply.replace(/^(CON|END)\s+/i, ""))
        setQrBusy(false)
        return
      }
      for (let i = 0; i < 10; i++) {
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

  // ── Toll-Free IVR Voice Handlers (/api/voice/) ─────────────────────────────
  const startIvrCall = async () => {
    setIvrBusy(true)
    setIvrActive(true)
    try {
      const xml = await api.callVoiceIvr("", phone)
      const spoken = extractSayText(xml)
      setIvrPrompt(spoken)
      setIvrStep("order")
      speak(spoken)
    } catch (e) {
      setIvrPrompt(errorMessage(e))
      setIvrStep("done")
    } finally {
      setIvrBusy(false)
    }
  }

  const sendIvrDigits = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ivrDigits.trim()) return
    setIvrBusy(true)
    try {
      if (ivrStep === "order") {
        const cleanOrder = ivrDigits.replace(/\D/g, "")
        setIvrOrderId(cleanOrder)
        const xml = await api.callVoiceIvr(`${cleanOrder}#`, phone)
        const spoken = extractSayText(xml)
        setIvrPrompt(spoken)
        speak(spoken)
        if (xml.includes("callbackUrl=")) {
          setIvrStep("pin")
          setIvrDigits("1234")
        } else {
          setIvrStep("done")
        }
      } else if (ivrStep === "pin") {
        const xml = await api.confirmVoiceIvr(ivrOrderId, ivrDigits.trim(), phone)
        const spoken = extractSayText(xml)
        setIvrPrompt(spoken)
        speak(spoken)
        setIvrStep("done")
      }
    } catch (e) {
      setIvrPrompt(errorMessage(e))
      setIvrStep("done")
    } finally {
      setIvrBusy(false)
    }
  }

  const endIvrCall = () => {
    stop()
    setIvrActive(false)
    setIvrStep("idle")
    setIvrPrompt("")
  }

  return (
    <div className="mx-auto max-w-md px-4 py-6 space-y-5">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4" /> Merchant Terminal
        </Button>
        <Badge tone="success">Customer Phone (PIN + Caller ID Protected)</Badge>
      </div>

      {/* 3 Customer Channels: 2G USSD, QR + PIN, Toll-Free IVR Voice */}
      <div className="grid grid-cols-3 gap-1 rounded-2xl border border-border bg-card p-1">
        <button
          type="button"
          onClick={() => setTab("ussd")}
          className={`flex items-center justify-center gap-1 rounded-xl py-2.5 text-xs font-semibold transition-colors ${
            tab === "ussd" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Smartphone className="size-3.5" /> 2G USSD
        </button>
        <button
          type="button"
          onClick={() => setTab("qr")}
          className={`flex items-center justify-center gap-1 rounded-xl py-2.5 text-xs font-semibold transition-colors ${
            tab === "qr" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <QrCode className="size-3.5" /> QR + PIN
        </button>
        <button
          type="button"
          onClick={() => setTab("ivr")}
          className={`flex items-center justify-center gap-1 rounded-xl py-2.5 text-xs font-semibold transition-colors ${
            tab === "ivr" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Volume2 className="size-3.5" /> Toll-Free IVR
        </button>
      </div>

      {/* Shared Caller Phone Identity */}
      <Card>
        <CardContent className="py-3.5 space-y-1.5">
          <Label htmlFor="cust-phone" className="text-xs">
            Active SIM / Caller Phone Number (Must match Order Phone)
          </Label>
          <Input
            id="cust-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="font-mono h-10 text-sm"
          />
          <p className="text-[11px] text-muted-foreground">
            Demo Custodial PIN: <code>1234</code> · Try changing this number or PIN to test security blocks!
          </p>
        </CardContent>
      </Card>

      {/* TAB 1: INTERACTIVE 2G FEATURE PHONE USSD DIALER */}
      {tab === "ussd" && (
        <Card className="overflow-hidden border-2 border-foreground/20">
          <div className="bg-foreground px-4 py-2.5 text-background flex items-center justify-between text-xs font-mono">
            <span>MTN-SA / Vodacom 2G</span>
            <span>ZERO-DATA USSD + PIN</span>
          </div>
          <CardContent className="space-y-4 pt-5">
            {!ussdScreen ? (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="ussd-code">Dial USSD Shortcode</Label>
                  <Input
                    id="ussd-code"
                    value={dialCode}
                    onChange={(e) => setDialCode(e.target.value)}
                    placeholder="*123*67284850#"
                    className="font-mono text-xl font-semibold tracking-wider text-center"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Dial <code>*123#</code> for menu, or <code>*123*ORDER_TAG#</code> to jump straight to PIN prompt.
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
                      placeholder="Enter option, Order ID, or 4-digit PIN (1234)..."
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

      {/* TAB 2: QR SCAN + 4-DIGIT CUSTODIAL PIN VERIFICATION */}
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
                  Locked Quote: {rlusd(order.quoted_crypto)} {(order as any).currency || "XRP"} on XRPL Testnet
                </p>

                {order.status === "PAID" ? (
                  <div className="rounded-xl border border-success/40 bg-success-soft p-3 text-success-text flex items-center justify-center gap-2 font-semibold">
                    <CheckCircle2 className="size-5" /> Paid in Full on XRPL!
                  </div>
                ) : (
                  <div className="space-y-3 text-left border-t border-border pt-3">
                    <div>
                      <Label htmlFor="qr-pin" className="flex items-center justify-between text-xs">
                        <span>Enter 4-Digit Custodial Wallet PIN</span>
                        <span className="font-mono text-muted-foreground">Demo PIN: 1234</span>
                      </Label>
                      <Input
                        id="qr-pin"
                        type="password"
                        inputMode="numeric"
                        maxLength={4}
                        value={pin}
                        onChange={(e) => setPin(e.target.value)}
                        placeholder="••••"
                        className="font-mono text-center text-2xl tracking-[0.5em]"
                      />
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => setPin("1234")}
                      >
                        <KeyRound className="size-3" /> Use Valid PIN (1234)
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-xs h-7 text-danger-text"
                        onClick={() => setPin("9999")}
                      >
                        <ShieldAlert className="size-3" /> Test Wrong PIN (9999)
                      </Button>
                    </div>

                    <Button
                      size="lg"
                      className="w-full"
                      onClick={() => void payQrOrder()}
                      disabled={qrBusy || order.status === "PROCESSING"}
                    >
                      {qrBusy ? <Loader2 className="animate-spin" /> : <ShieldCheck className="size-5" />}
                      {order.status === "PROCESSING"
                        ? "Settling on XRPL Testnet..."
                        : `Verify PIN & Pay ${zar(order.amount_zar)}`}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* TAB 3: TOLL-FREE IVR VOICE CALL SIMULATOR (0800-AEGIS / /api/voice/) */}
      {tab === "ivr" && (
        <Card className="overflow-hidden border-2 border-primary/40">
          <div className="bg-primary px-4 py-2.5 text-primary-foreground flex items-center justify-between text-xs font-semibold">
            <span className="flex items-center gap-1.5">
              <PhoneCall className="size-3.5" /> Toll-Free Audio Line: 0800-234-47
            </span>
            <span>IVR XML + TTS</span>
          </div>
          <CardContent className="space-y-4 pt-5">
            <p className="text-xs text-muted-foreground">
              For visually impaired or low-literacy customers: dials <code>POST /api/voice/</code>, speaks the Africa&apos;s Talking Voice XML aloud, and verifies your 4-digit PIN via keypad tones.
            </p>

            {!ivrActive ? (
              <Button
                size="lg"
                className="w-full"
                onClick={() => void startIvrCall()}
                disabled={ivrBusy}
              >
                {ivrBusy ? <Loader2 className="animate-spin" /> : <Phone className="size-5" />}
                Call 0800-AEGIS (Toll-Free Audio Checkout)
              </Button>
            ) : (
              <div className="rounded-2xl border border-border bg-muted/60 p-4 space-y-4">
                <div className="flex items-center justify-between text-xs">
                  <Badge tone="success">Call Connected · 0800-AEGIS</Badge>
                  <Button variant="ghost" size="sm" onClick={() => speak(ivrPrompt)}>
                    <Volume2 className="size-3.5" /> Replay Audio
                  </Button>
                </div>

                <div className="rounded-xl bg-card p-3.5 text-sm italic text-foreground border border-border">
                  &ldquo;{ivrPrompt || "Connecting to voice gateway..."}&rdquo;
                </div>

                {ivrStep !== "done" ? (
                  <form onSubmit={sendIvrDigits} className="space-y-3">
                    <Label htmlFor="ivr-dtmf" className="text-xs">
                      {ivrStep === "order"
                        ? "Keypad: Dial 8-Digit Order Number + #"
                        : "Keypad: Dial 4-Digit Security PIN (Demo: 1234)"}
                    </Label>
                    <Input
                      id="ivr-dtmf"
                      value={ivrDigits}
                      onChange={(e) => setIvrDigits(e.target.value)}
                      placeholder={ivrStep === "order" ? "e.g. 64556290" : "1234"}
                      className="font-mono text-center text-xl font-semibold tracking-widest"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Button type="button" variant="danger" onClick={endIvrCall}>
                        <PhoneOff className="size-4" /> Hang Up
                      </Button>
                      <Button type="submit" disabled={ivrBusy || !ivrDigits.trim()}>
                        {ivrBusy ? <Loader2 className="animate-spin" /> : <Send className="size-4" />}
                        Send Keypad Tones
                      </Button>
                    </div>
                  </form>
                ) : (
                  <Button variant="secondary" className="w-full" onClick={endIvrCall}>
                    <PhoneOff className="size-4" /> End Call
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