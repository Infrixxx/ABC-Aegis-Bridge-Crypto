import { useCallback, useEffect, useState } from "react"
import { api } from "@/lib/api"
import { errorMessage } from "@/lib/utils"
import type { DeviceInfo, RegisterDeviceBody } from "@/lib/types"

const KEY = "abc.machines.v1"

export interface MachineEntry {
  info: DeviceInfo | null
  error: string | null
}

function loadIds(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []
  } catch {
    return []
  }
}

export function useMachines() {
  const [ids, setIds] = useState<string[]>(loadIds)
  const [entries, setEntries] = useState<Record<string, MachineEntry>>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(ids))
    } catch {
      /* ignore */
    }
  }, [ids])

  const load = useCallback(async (id: string) => {
    try {
      const info = await api.getDevice(id)
      setEntries((e) => ({ ...e, [id]: { info, error: null } }))
    } catch (err) {
      setEntries((e) => ({ ...e, [id]: { info: null, error: errorMessage(err) } }))
    }
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const serverDevices = await api.listDevices()
      const serverIds = serverDevices.map((d) => d.device_id)
      const mergedIds = Array.from(new Set([...serverIds, ...ids]))
      if (mergedIds.length !== ids.length) {
        setIds(mergedIds)
      }
      await Promise.all(mergedIds.map(load))
    } catch {
      await Promise.all(ids.map(load))
    } finally {
      setLoading(false)
    }
  }, [ids, load])

  useEffect(() => {
    void refresh()
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void refresh()
    }, 15_000)
    return () => clearInterval(t)
  }, [refresh])

  const remember = (id: string) => setIds((p) => (p.includes(id) ? p : [id, ...p]))

  return {
    ids,
    entries,
    loading,
    refresh,
    forget: (id: string) => setIds((p) => p.filter((x) => x !== id)),
    register: async (body: RegisterDeviceBody) => {
      await api.registerDevice(body)
      remember(body.device_id)
      await load(body.device_id)
    },
    connect: async (id: string) => {
      await api.getDevice(id)
      remember(id)
      await load(id)
    },
    topUp: async (id: string, amount: number) => {
      await api.topUpDevice(id, amount)
      await load(id)
    },
    revoke: async (id: string) => {
      await api.revokeDevice(id)
      await load(id)
    },
  }
}
