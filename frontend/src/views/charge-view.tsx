import { useCallback, useEffect, useState, type CSSProperties } from "react"
import { Loader2, Mic, MicOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Disclosure } from "@/components/ui/disclosure"
import { Input, Label } from "@/components/ui/input"
import { Keypad, type KeypadKey } from "@/components/keypad"
import { Notice } from "@/components/notice"
import { Ticket } from "./charge-ticket"
import type { useCharge } from "@/hooks/use-charge"
import { useVoiceInput } from "@/hooks/use-voice-input"
import { formatPhone, zar } from "@/lib/format"
import { parseSpokenAmount } from "@/lib/parse-amount"
import { cn } from "@/lib/utils"

const QUICK = [10, 20, 50, 100, 200]

function applyKey(a: string, k: KeypadKey): string {
  if (k === "back") return a.slice(0, -1)
  if (k === ".") return a.includes(".") ? a : a === "" ? "0." : `${a}.`
  if (a.includes(".")) return a.split(".")[1].length >= 2 ? a : a + k
  if (a.length >= 6) return a
  return a === "0" ? k : a + k
}

function showAmount(a: string): string {
  if (!a) return "0"
  const [int, dec] = a.split(".")
  const head = Number(int).toLocaleString("en-GB")
  return dec === undefined ? head : `${head}.${dec}`
}

export function ChargeView({ ctl, detail }: { ctl: ReturnType<typeof useCharge>; detail: boolean }) {
  const [amount, setAmount] = useState("")
  const [phone, setPhone] = useState("+27821234567")
  const [voiceNote, setVoiceNote] = useState<string | null>(null)

  const onHeard = useCallback((text: string) => {
    const n = parseSpokenAmount(text)
    if (n) {
      setAmount(String(n))
      setVoiceNote(`Heard “${text}”`)
    } else {
      setVoiceNote(`Couldn't find an amount in “${text}”`)
    }
  }, [])
  const voice = useVoiceInput(onHeard)

  const press = useCallback((k: KeypadKey) => setAmount((a) => applyKey(a, k)), [])
  const hasCharge = ctl.charge !== null

  // Physical keyboard works too (handy on laptops and tablets with a keyboard).
  useEffect(() => {
    if (hasCharge) return
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el?.closest("input, textarea, select, [contenteditable='true']")) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (/^[0-9]$/.test(e.key)) press(e.key as KeypadKey)
      else if (e.key === "." || e.key === ",") press(".")
      else if (e.key === "Backspace") press("back")
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [hasCharge, press])

  const value = parseFloat(amount)
  const valid = Number.isFinite(value) && value > 0

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-start">
      <Card className={cn("reveal", hasCharge && "hidden lg:block")}>
        <CardContent className="space-y-5">
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault()
              if (valid && !ctl.creating) void ctl.create(phone.trim(), value)
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-2xl font-semibold tracking-tight">How much?</h2>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant={voice.listening ? "danger" : "secondary"}
                  size="sm"
                  onClick={voice.toggle}
                  aria-pressed={voice.listening}
                  className={cn(voice.listening && "animate-pulse")}
                >
                  {voice.listening ? <MicOff className="size-4 animate-bounce" aria-hidden /> : <Mic className="size-4" aria-hidden />}
                  {voice.listening ? "Listening…" : "Speak"}
                </Button>
              </div>
            </div>

            {voice.listening && (
              <div className="flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-3.5 py-2 text-xs font-medium text-foreground">
                <span className="relative flex size-2.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-danger opacity-75" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-danger" />
                </span>
                <span>
                  {voice.interimTranscript
                    ? `Heard: “${voice.interimTranscript}”`
                    : "Listening for amount… (e.g., “Fifty rand”, “Bread 18 rand”, or “Pinkie”)"}
                </span>
              </div>
            )}

            <div className="rounded-2xl bg-muted/70 px-5 py-5" role="group" aria-label={`Amount ${valid ? zar(value) : "not set"}`}>
              <div className="flex items-baseline gap-2 overflow-hidden">
                <span className="font-display text-3xl text-muted-foreground">R</span>
                <span className={cn("font-display num text-6xl leading-none font-semibold tracking-tight sm:text-7xl", !amount && "text-muted-foreground/50")}>
                  {showAmount(amount)}
                </span>
                <span className="caret h-12 w-[3px] self-center rounded bg-primary" aria-hidden />
              </div>
            </div>

            {(voiceNote || voice.error) && !voice.listening && (
              <p role="status" className="-mt-2 text-sm text-muted-foreground">
                {voice.error ?? voiceNote}
              </p>
            )}

            {/* Quick-add chips + Spaza voice test prompts */}
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                {QUICK.map((q) => (
                  <Button key={q} type="button" variant="secondary" size="sm" className="rounded-full" onClick={() => setAmount(String(q))} aria-label={`Set amount to ${q} rand`}>
                    R{q}
                  </Button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs text-muted-foreground">
                <span>Voice test:</span>
                <button
                  type="button"
                  onClick={() => voice.simulate("Bread eighteen rand")}
                  className="rounded-md bg-muted px-2 py-0.5 font-medium hover:bg-muted/80 hover:text-foreground"
                >
                  🎙️ Bread R18
                </button>
                <button
                  type="button"
                  onClick={() => voice.simulate("Fifty rand")}
                  className="rounded-md bg-muted px-2 py-0.5 font-medium hover:bg-muted/80 hover:text-foreground"
                >
                  🎙️ 50 Rand
                </button>
                <button
                  type="button"
                  onClick={() => voice.simulate("Airtime one hundred rand")}
                  className="rounded-md bg-muted px-2 py-0.5 font-medium hover:bg-muted/80 hover:text-foreground"
                >
                  🎙️ Airtime R100
                </button>
                <button
                  type="button"
                  onClick={() => voice.simulate("Two fifty")}
                  className="rounded-md bg-muted px-2 py-0.5 font-medium hover:bg-muted/80 hover:text-foreground"
                >
                  🎙️ 250 Rand
                </button>
              </div>
            </div>

            <Keypad onKey={press} disabled={ctl.creating} />

            <Disclosure label={`Receipt SMS to ${formatPhone(phone) || "no one"}`} defaultOpen={detail}>
              <Label htmlFor="receipt-phone">Customer's phone number</Label>
              <Input id="receipt-phone" inputMode="tel" autoComplete="off" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+27821234567" />
            </Disclosure>

            {ctl.error && !hasCharge && <Notice>{ctl.error}</Notice>}

            <Button type="submit" size="lg" className="w-full" disabled={!valid || ctl.creating}>
              {ctl.creating ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {ctl.creating ? "Getting a price…" : valid ? `Charge ${zar(value)}` : "Enter an amount"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="reveal" style={{ "--i": 1 } as CSSProperties}>
        <Ticket ctl={ctl} detail={detail} />
      </div>
    </div>
  )
}
