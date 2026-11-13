import { useCallback, useEffect, useRef, useState } from "react"
import { api } from "@/lib/api"
import { errorMessage } from "@/lib/utils"
import { spellDigits } from "@/lib/format"
import type { AgentTraceStep, CheckoutResponse, OrderStatus } from "@/lib/types"
import { useSpeech } from "./use-speech"

const POLL_MS = 1500
/** Keep polling briefly after the rate lock ends, in case a confirm landed in the last second. */
const EXPIRY_GRACE_MS = 10_000

export interface ChargeState {
  order: CheckoutResponse
  serverStatus: OrderStatus
  txHash: string | null
  agentTrace?: AgentTraceStep[] | null
  /** Local deadline: receive time + fx_lock_seconds. Immune to a wrong device clock or server timezone. */
  lockEndsAt: number
  expired: boolean
  phone: string
  amount: number
}

/**
 * The active POS charge. Lives at app level so polling survives tab switches.
 * Fixes the original UI, where the poll interval was reset every second and never fired.
 */
export function useCharge(onChanged: () => void) {
  const { announce } = useSpeech()
  const [charge, setCharge] = useState<ChargeState | null>(null)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState<"simulate" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const announced = useRef("")

  const status: OrderStatus | null = !charge
    ? null
    : charge.serverStatus === "PENDING" && charge.expired
      ? "LATE"
      : charge.serverStatus

  const orderId = charge?.order.order_id
  const serverStatus = charge?.serverStatus
  const expired = charge?.expired
  const lockEndsAt = charge?.lockEndsAt

  // Poll the order while it can still change.
  useEffect(() => {
    if (!orderId || (serverStatus !== "PENDING" && serverStatus !== "PROCESSING")) return
    let cancelled = false
    const tick = async () => {
      if (serverStatus === "PENDING" && expired && lockEndsAt && Date.now() > lockEndsAt + EXPIRY_GRACE_MS) return
      try {
        const o = await api.getOrder(orderId)
        if (cancelled) return
        setCharge((prev) =>
          prev && prev.order.order_id === orderId && (prev.serverStatus !== o.status || prev.txHash !== o.tx_hash || prev.agentTrace !== o.agent_trace)
            ? { ...prev, serverStatus: o.status, txHash: o.tx_hash, agentTrace: o.agent_trace }
            : prev,
        )
      } catch {
        /* transient network error: next tick retries */
      }
    }
    const id = setInterval(tick, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [orderId, serverStatus, expired, lockEndsAt])

  // Announce transitions once each.
  useEffect(() => {
    if (!charge || !status) return
    const key = `${charge.order.order_id}:${status}`
    if (announced.current === key) return
    announced.current = key
    switch (status) {
      case "PROCESSING":
        announce("Payment confirmed. Settling on the ledger.")
        break
      case "PAID":
        announce(`Paid in full. ${charge.order.amount_zar} rand received.`)
        onChanged()
        break
      case "LATE":
        announce("The rate lock expired. Create a new charge.")
        break
      case "FAILED":
      case "REJECTED":
      case "BUDGET_EXCEEDED":
      case "UNDERPAID":
        announce("The payment did not go through.")
        onChanged()
        break
      default:
        break
    }
  }, [charge, status, announce, onChanged])

  const create = useCallback(
    async (phone: string, amount: number) => {
      setCreating(true)
      setError(null)
      try {
        const order = await api.createCharge(phone, amount)
        announced.current = `${order.order_id}:PENDING`
        setCharge({
          order,
          serverStatus: "PENDING",
          txHash: null,
          lockEndsAt: Date.now() + order.fx_lock_seconds * 1000,
          expired: false,
          phone,
          amount,
        })
        announce(
          `Charge created for ${amount} rand. Dial ${spellDigits(order.ussd_shortcode)}, or scan the code. ` +
            `The rate is locked for ${order.fx_lock_seconds} seconds.`,
        )
        onChanged()
      } catch (e) {
        setError(errorMessage(e))
        announce("Could not create the charge.")
      } finally {
        setCreating(false)
      }
    },
    [announce, onChanged],
  )

  const markExpired = useCallback(() => {
    setCharge((p) => (p && !p.expired && p.serverStatus === "PENDING" ? { ...p, expired: true } : p))
  }, [])

  const simulate = useCallback(async () => {
    if (!charge) return
    setBusy("simulate")
    setError(null)
    try {
      const reply = await api.simulateUssdConfirm(charge.order.order_id, charge.phone)
      if (/^END Payment Confirmed/i.test(reply) || /already/i.test(reply)) {
        setCharge((p) => (p && p.serverStatus === "PENDING" ? { ...p, serverStatus: "PROCESSING" } : p))
      } else {
        setError(reply.replace(/^(CON|END)\s+/i, "").replace(/\n/g, " "))
      }
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }, [charge])

  /** Throws on failure so the calling button can show the message inline. */
  const refund = useCallback(
    async (id: string) => {
      await api.refund(id)
      setCharge((p) => (p && p.order.order_id === id ? { ...p, serverStatus: "REFUNDED" } : p))
      announce("Order refunded.")
      onChanged()
    },
    [announce, onChanged],
  )

  const reset = useCallback(() => {
    setCharge(null)
    setError(null)
  }, [])

  return { charge, status, creating, busy, error, create, simulate, refund, reset, markExpired }
}
