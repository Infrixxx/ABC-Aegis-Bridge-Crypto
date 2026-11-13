import type {
  AuthResponse,
  CheckoutResponse,
  DeviceInfo,
  HealthResponse,
  LoginBody,
  Order,
  RegisterBody,
  RegisterDeviceBody,
  RegisterDeviceResponse,
  User,
} from "./types"

export const API_BASE: string =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") ?? ""

export const EXPLORER_TX = "https://testnet.xrpl.org/transactions"

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

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
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("abc.auth.token.v1") : null
  const headers = new Headers(init?.headers)
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`)
  }

  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers })
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
  // ── Authentication ──────────────────────────────────────────────────────────
  login: (body: LoginBody) => request<AuthResponse>("/api/auth/login", json(body)),
  register: (body: RegisterBody) => request<AuthResponse>("/api/auth/register", json(body)),
  me: () => request<User>("/api/auth/me"),
  logout: () => request<{ message: string }>("/api/auth/logout", { method: "POST" }),

  // ── Health ──────────────────────────────────────────────────────────────────
  health: () => request<HealthResponse>("/health"),

  // ── Checkout & Orders ───────────────────────────────────────────────────────
  createCharge: (phone: string, amountZar: number, merchantAddress?: string) =>
    request<CheckoutResponse>(
      "/api/checkout/",
      json({
        phone_number: phone,
        amount_zar: amountZar,
        ...(merchantAddress ? { merchant_address: merchantAddress } : {}),
      }),
    ),

  getOrder: (orderId: string) => request<Order>(`/api/checkout/${encodeURIComponent(orderId)}`),

  listOrders: (limit = 50) =>
    request<{ orders: Order[] }>(`/api/checkout/?limit=${limit}`).then((r) => r.orders ?? []),

  refund: (orderId: string, reason = "Merchant POS refund") =>
    request<{ status: string; message: string }>("/api/checkout/refund", json({ order_id: orderId, reason })),

  dialUssdSession: async (text: string, phone = "+27821234567", sessionId = "live-phone-session") => {
    const body = new URLSearchParams({
      sessionId,
      serviceCode: "*123#",
      phoneNumber: phone,
      text,
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
    if (!res.ok) throw new ApiError(`USSD request failed (${res.status})`, res.status)
    return res.text()
  },

  getRecentTraces: () =>
    request<{
      traces: { order_id: string; steps: { agent: string; status: string; latency_ms: number; detail: string; timestamp: string }[] }[]
      threat_cache: { wallet_address: string; flag_reason: string }[]
    }>("/api/checkout/traces/recent"),

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

  // ── Machines & IoT ──────────────────────────────────────────────────────────
  listDevices: () =>
    request<{ devices: DeviceInfo[] }>("/api/machine/").then((r) => r.devices ?? []),

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

  payDevice: (deviceId: string, orderId: string, channelId: string) =>
    request<{ status: string; tx_hash: string; explorer_url: string }>(
      `/api/machine/${encodeURIComponent(deviceId)}/pay`,
      json({ order_id: orderId, channel_id: channelId }),
    ),
}

