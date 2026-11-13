import { useState, type CSSProperties, type FormEvent } from "react"
import { Cpu, Loader2, Plus, RefreshCw, ShieldOff, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Disclosure } from "@/components/ui/disclosure"
import { Input, Label } from "@/components/ui/input"
import { Meter } from "@/components/ui/meter"
import { ConfirmButton } from "@/components/confirm-button"
import { Notice } from "@/components/notice"
import type { useMachines } from "@/hooks/use-machines"
import type { DeviceInfo } from "@/lib/types"
import { xrp } from "@/lib/format"
import { errorMessage } from "@/lib/utils"

type Ctl = ReturnType<typeof useMachines>

function MachineCard({ id, info, error, ctl, detail }: { id: string; info: DeviceInfo | null; error: string | null; ctl: Ctl; detail: boolean }) {
  const [amount, setAmount] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  if (!info) {
    return (
      <Card>
        <CardContent className="flex items-center justify-between gap-3">
          <div>
            <p className="font-display text-xl font-semibold">{id}</p>
            <p className="text-sm text-muted-foreground">{error ?? "Loading…"}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => ctl.forget(id)} aria-label={`Remove ${id} from this list`}>
            <X aria-hidden />
          </Button>
        </CardContent>
      </Card>
    )
  }

  const cap = info.max_budget_cap_xrp
  const left = info.remaining_xrp
  const pct = cap > 0 ? left / cap : 0
  const tone = info.is_key_revoked ? "danger" : pct < 0.1 ? "danger" : pct < 0.3 ? "warning" : "success"

  const topUp = async (e: FormEvent) => {
    e.preventDefault()
    const n = parseFloat(amount)
    if (!(n > 0)) return
    setBusy(true)
    setErr(null)
    try {
      await ctl.topUp(id, n)
      setAmount("")
    } catch (x) {
      setErr(errorMessage(x))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-display truncate text-2xl font-semibold">{info.device_id}</h3>
            <p className="text-sm text-muted-foreground">Alerts go to {info.operator_phone}</p>
          </div>
          {info.is_key_revoked ? (
            <Badge tone="danger">
              <ShieldOff aria-hidden /> Stopped
            </Badge>
          ) : (
            <Badge tone="success">Allowed to pay</Badge>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <span className="font-display num text-4xl font-semibold">{xrp(left)}</span>
            <span className="num text-sm text-muted-foreground">of {xrp(cap)} XRP left to spend</span>
          </div>
          <Meter value={left} max={cap} tone={tone} label={`${Math.round(pct * 100)} percent of the limit left`} />
        </div>

        {!info.is_key_revoked && (
          <form onSubmit={topUp} className="flex items-end gap-2">
            <div className="flex-1">
              <Label htmlFor={`top-${id}`}>Raise the limit by (XRP)</Label>
              <Input id={`top-${id}`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 10" />
            </div>
            <Button type="submit" disabled={busy || !(parseFloat(amount) > 0)}>
              {busy && <Loader2 className="animate-spin" aria-hidden />} Add
            </Button>
          </form>
        )}
        {err && <Notice>{err}</Notice>}

        {detail && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 rounded-xl bg-muted/60 p-3 text-sm">
            <dt className="text-muted-foreground">Spent</dt>
            <dd className="num">{xrp(info.current_spent_xrp)} XRP</dd>
            <dt className="text-muted-foreground">Channel</dt>
            <dd className="font-mono break-all">{info.channel_id ?? "none"}</dd>
            {info.ledger_channel_remaining_xrp !== null && (
              <>
                <dt className="text-muted-foreground">On-ledger left</dt>
                <dd className="num">{xrp(info.ledger_channel_remaining_xrp)} XRP</dd>
              </>
            )}
            <dt className="text-muted-foreground">Suppliers</dt>
            <dd className="font-mono break-all">{info.approved_suppliers.join(", ") || "none"}</dd>
          </dl>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          {!info.is_key_revoked && (
            <ConfirmButton confirmLabel="Yes, stop it — can't be undone here" onConfirm={() => ctl.revoke(id)}>
              Stop this machine
            </ConfirmButton>
          )}
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => ctl.forget(id)}>
            Remove from list
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function AddMachine({ ctl }: { ctl: Ctl }) {
  const [id, setId] = useState("")
  const [phone, setPhone] = useState("")
  const [limit, setLimit] = useState("50")
  const [supplier, setSupplier] = useState("")
  const [existing, setExisting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      if (existing) await ctl.connect(id.trim())
      else
        await ctl.register({
          device_id: id.trim(),
          operator_phone: phone.trim(),
          max_budget_xrp: parseFloat(limit),
          approved_suppliers: supplier.trim() ? [supplier.trim()] : [],
        })
      setId("")
      setPhone("")
      setSupplier("")
    } catch (x) {
      setErr(errorMessage(x))
    } finally {
      setBusy(false)
    }
  }

  const ok = id.trim() && (existing || (phone.trim() && parseFloat(limit) > 0))

  return (
    <Card>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <h2 className="font-display text-2xl font-semibold">{existing ? "Find a machine" : "Add a machine"}</h2>
          <div>
            <Label htmlFor="m-id">Machine name</Label>
            <Input id="m-id" value={id} onChange={(e) => setId(e.target.value)} placeholder="e.g. Charger-01" />
          </div>
          {!existing && (
            <>
              <div>
                <Label htmlFor="m-phone">Your phone number (for alerts)</Label>
                <Input id="m-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+27821234567" />
              </div>
              <div>
                <Label htmlFor="m-limit">Spending limit (XRP)</Label>
                <Input id="m-limit" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} />
              </div>
              <Disclosure label="Only allow payments to one address">
                <Label htmlFor="m-sup">Supplier address (optional)</Label>
                <Input id="m-sup" className="font-mono" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="r…" />
              </Disclosure>
            </>
          )}
          {err && <Notice>{err}</Notice>}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="lg" disabled={busy || !ok}>
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
              {existing ? "Find machine" : "Add machine"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setExisting((v) => !v)}>
              {existing ? "Add a new one instead" : "Already added? Find it"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export function MachinesView({ ctl, detail }: { ctl: Ctl; detail: boolean }) {
  return (
    <div className="space-y-5">
      <div className="reveal flex items-end justify-between gap-3 px-1">
        <div>
          <h2 className="font-display text-3xl font-semibold tracking-tight">Your machines</h2>
          <p className="text-sm text-muted-foreground">Each machine can only spend up to the limit you set.</p>
        </div>
        {ctl.ids.length > 0 && (
          <Button variant="ghost" size="icon" onClick={() => void ctl.refresh()} aria-label="Refresh machines">
            <RefreshCw className={ctl.loading ? "animate-spin" : ""} aria-hidden />
          </Button>
        )}
      </div>
      {ctl.ids.length === 0 && (
        <Card className="border-dashed bg-transparent shadow-none">
          <CardContent className="py-8 text-center text-muted-foreground">
            <Cpu className="mx-auto mb-3 size-10 opacity-40" aria-hidden />
            <p className="font-display text-xl text-foreground">No machines yet</p>
            <p className="mt-1 text-sm">Add one below to give it a spending limit.</p>
          </CardContent>
        </Card>
      )}
      <div className="grid gap-5 md:grid-cols-2">
        {ctl.ids.map((id, i) => (
          <div key={id} className="reveal" style={{ "--i": i } as CSSProperties}>
            <MachineCard id={id} info={ctl.entries[id]?.info ?? null} error={ctl.entries[id]?.error ?? null} ctl={ctl} detail={detail} />
          </div>
        ))}
      </div>
      <AddMachine ctl={ctl} />
    </div>
  )
}
