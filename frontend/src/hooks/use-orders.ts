import { useCallback, useEffect, useState } from "react"
import { api } from "@/lib/api"
import { errorMessage } from "@/lib/utils"
import type { Order } from "@/lib/types"

export function useOrders() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setOrders(await api.listOrders(50))
      setError(null)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void refresh()
    }, 8000)
    return () => clearInterval(id)
  }, [refresh])

  return { orders, loading, error, refresh }
}
