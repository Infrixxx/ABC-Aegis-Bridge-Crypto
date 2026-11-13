import { useEffect, useState } from "react"
import { api } from "@/lib/api"

export type HealthState = "checking" | "online" | "offline"

export function useHealth(): HealthState {
  const [state, setState] = useState<HealthState>("checking")
  useEffect(() => {
    let cancelled = false
    const check = async () => {
      try {
        const h = await api.health()
        if (!cancelled) setState(h.api === "ok" ? "online" : "offline")
      } catch {
        if (!cancelled) setState("offline")
      }
    }
    void check()
    const id = setInterval(check, 15_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])
  return state
}
