import { useEffect, useState } from "react"
import { AppHeader } from "@/components/app-header"
import { Welcome } from "@/components/welcome"
import { ActivityView } from "@/views/activity-view"
import { ChargeView } from "@/views/charge-view"
import { MachinesView } from "@/views/machines-view"
import { useCharge } from "@/hooks/use-charge"
import { useHealth } from "@/hooks/use-health"
import { useMachines } from "@/hooks/use-machines"
import { useOrders } from "@/hooks/use-orders"
import { usePreferences } from "@/hooks/use-preferences"
import { MODES, type TabId } from "@/lib/modes"
import { api } from "@/lib/api"

export default function App() {
  const { prefs, setPref } = usePreferences()
  const mode = prefs.mode
  const health = useHealth()
  const orders = useOrders()
  const machines = useMachines()
  const charge = useCharge(orders.refresh)
  const [tab, setTab] = useState<TabId>("charge")

  useEffect(() => {
    if (mode && !MODES[mode].tabs.includes(tab)) setTab(MODES[mode].tabs[0])
  }, [mode, tab])

  if (!mode) return <Welcome onPick={(m) => { setPref("mode", m); setTab(MODES[m].tabs[0]) }} />

  const refund = async (id: string) => {
    await api.refund(id)
    await orders.refresh()
  }
  const detail = mode === "pro"

  return (
    <div className="min-h-dvh pb-24 sm:pb-10">
      <AppHeader mode={mode} tab={tab} setTab={setTab} health={health} />
      <main className="mx-auto max-w-5xl px-4 py-6">
        {tab === "charge" && <ChargeView ctl={charge} detail={detail} />}
        {tab === "activity" && (
          <ActivityView {...orders} mode={mode} onRefund={refund} />
        )}
        {tab === "machines" && <MachinesView ctl={machines} detail={detail} />}
      </main>
    </div>
  )
}
