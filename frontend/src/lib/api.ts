import type {
  CheckoutResponse,
  DeviceInfo,
  HealthResponse,
  Order,
  RegisterDeviceBody,
  RegisterDeviceResponse,
} from "./types"

export const API_BASE: string =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") ??
  "http://localhost:8000"

export const EXPLORER_TX = "https://testnet.xrpl.org/transactions"

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

/** FastAPI errors arrive as {detail: string | {message} | [{msg}]}. */
function extractDetail(data: unknown): string | null {
  if (!data || typeof data !== "object") return null
  const detail = (data as { detail?: unknown }).detail
  if (typeof detail === "string") return detail
  if (Array.isArray(detail)) {
    const msgs = detail
      .map((d) => (d && typeof d === "object" ? (d as { msg?: string }).msg : null))
      .filter(Boolean)
    return msgs.length ? msgs.join("; ") : null
  }
  if (detail && typeof detail === "object") {
    const m = (detail as { message?: unknown }).message
    if (typeof m === "string") return m
  }
  return null
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, init)
  } catch {
    throw new ApiError("Can't reach the payment server. Check your connection.", 0)
  }
  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }
  if (!res.ok) {
    throw new ApiError(extractDetail(data) ?? `Request failed (${res.status})`, res.status)
  }
  return data as T
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
})

export const api = {
  health: () => request<HealthResponse>("/health"),

  createCharge: (phone: string, amountZar: number) =>
    request<CheckoutResponse>("/api/checkout/", json({ phone_number: phone, amount_zar: amountZar })),

  getOrder: (orderId: string) => request<Order>(`/api/checkout/${encodeURIComponent(orderId)}`),

  listOrders: (limit = 50) =>
    request<{ orders: Order[] }>(`/api/checkout/?limit=${limit}`).then((r) => r.orders ?? []),

  refund: (orderId: string, reason = "Merchant POS refund") =>
    request<{ status: string; message: string }>("/api/checkout/refund", json({ order_id: orderId, reason })),

  /** Demo shortcut: replays what Africa's Talking would POST after the customer confirms. */
  simulateUssdConfirm: async (orderId: string, phone: string) => {
    const body = new URLSearchParams({
      sessionId: `demo-${orderId}`,
      serviceCode: "*120*123#",
      phoneNumber: phone,
      text: `1*${orderId}*1`,
    })
    let res: Response
    try {
      res = await fetch(`${API_BASE}/api/ussd/`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      })
    } catch {
      throw new ApiError("Can't reach the payment server. Check your connection.", 0)
    }
    if (!res.ok) throw new ApiError(`USSD simulation failed (${res.status})`, res.status)
    return res.text()
  },

  getDevice: (deviceId: string) => request<DeviceInfo>(`/api/machine/${encodeURIComponent(deviceId)}`),

  registerDevice: (body: RegisterDeviceBody) =>
    request<RegisterDeviceResponse>("/api/machine/register", json(body)),

  topUpDevice: (deviceId: string, amountXrp: number) =>
    request<{ new_max_budget_cap_xrp: number; tx_hash: string | null }>(
      `/api/machine/${encodeURIComponent(deviceId)}/budget`,
      json({ top_up_xrp: amountXrp }),
    ),

  revokeDevice: (deviceId: string) =>
    request<{ status: string }>(`/api/machine/${encodeURIComponent(deviceId)}/revoke`, {
      method: "POST",
    }),
}
