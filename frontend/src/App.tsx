import { useEffect, useState } from "react"
import { Loader2, Smartphone } from "lucide-react"
import { AppHeader } from "@/components/app-header"
import { Welcome } from "@/components/welcome"
import { ActivityView } from "@/views/activity-view"
import { ChargeView } from "@/views/charge-view"
import { MachinesView } from "@/views/machines-view"
import { LoginView } from "@/views/login-view"
import { CustomerPhoneView } from "@/views/customer-phone-view"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/use-auth"
import { useCharge } from "@/hooks/use-charge"
import { useHealth } from "@/hooks/use-health"
import { useMachines } from "@/hooks/use-machines"
import { useOrders } from "@/hooks/use-orders"
import { usePreferences } from "@/hooks/use-preferences"
import { MODES, type TabId } from "@/lib/modes"
import { api } from "@/lib/api"

export default function App() {
  const { user, isAuthenticated, loading } = useAuth()
  const { prefs, setPref } = usePreferences()
  const health = useHealth()
  const orders = useOrders()
  const machines = useMachines()
  const charge = useCharge(orders.refresh)
  const [tab, setTab] = useState<TabId>("charge")

  // If opened on a phone via QR scan (?pay=ORDER_ID) or customer dialer button, no login required!
  const [payParam, setPayParam] = useState<string | null>(() => {
    if (typeof window === "undefined") return null
    return new URLSearchParams(window.location.search).get("pay")
  })
  const [customerPhoneOpen, setCustomerPhoneOpen] = useState<boolean>(() => Boolean(payParam))

  const mode = prefs.mode ?? user?.role ?? null

  useEffect(() => {
    if (mode && !MODES[mode].tabs.includes(tab)) {
      setTab(MODES[mode].tabs[0])
    }
  }, [mode, tab])

  if (customerPhoneOpen) {
    return (
      <CustomerPhoneView
        initialOrderId={payParam}
        onBack={() => {
          setCustomerPhoneOpen(false)
          setPayParam(null)
          if (typeof window !== "undefined" && window.location.search) {
            window.history.replaceState({}, "", window.location.pathname)
          }
        }}
      />
    )
  }

  if (loading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="font-display text-sm font-semibold tracking-wide text-muted-foreground">
            Connecting to Aegis Bridge…
          </p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div>
        <div className="mx-auto max-w-4xl px-4 pt-4 flex justify-end">
          <Button variant="secondary" size="sm" onClick={() => setCustomerPhoneOpen(true)}>
            <Smartphone className="size-4" /> Open Customer Phone (Live USSD Dialer & QR Pay)
          </Button>
        </div>
        <LoginView />
      </div>
    )
  }

  if (!mode) {
    return (
      <Welcome
        onPick={(m) => {
          setPref("mode", m)
          setTab(MODES[m].tabs[0])
        }}
      />
    )
  }

  const refund = async (id: string) => {
    await api.refund(id)
    await orders.refresh()
  }
  const detail = mode === "pro"

  return (
    <div className="min-h-dvh pb-24 sm:pb-10">
      <AppHeader mode={mode} tab={tab} setTab={setTab} health={health} />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-4 flex justify-end">
          <Button variant="outline" size="sm" onClick={() => setCustomerPhoneOpen(true)}>
            <Smartphone className="size-4" /> Launch Customer Phone Simulator (USSD / QR)
          </Button>
        </div>
        {tab === "charge" && <ChargeView ctl={charge} detail={detail} />}
        {tab === "activity" && (
          <ActivityView {...orders} mode={mode} onRefund={refund} />
        )}
        {tab === "machines" && <MachinesView ctl={machines} detail={detail} />}
      </main>
    </div>
  )
}
