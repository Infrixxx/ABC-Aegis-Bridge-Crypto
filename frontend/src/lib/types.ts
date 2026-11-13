export type OrderStatus =
  | "PENDING"
  | "PROCESSING"
  | "PAID"
  | "LATE"
  | "REJECTED"
  | "FAILED"
  | "REFUNDED"
  | "UNDERPAID"
  | "BUDGET_EXCEEDED"

export interface CheckoutResponse {
  status: string
  order_id: string
  destination_tag: number
  amount_zar: number
  quoted_crypto: number
  currency: string
  merchant_address: string
  expires_at: string
  fx_lock_seconds: number
  qr_payload: string
  ussd_shortcode: string
}

export interface Order {
  order_id: string
  phone_number: string
  merchant_address: string
  amount_zar: number
  quoted_crypto: number
  fx_lock_expires_at: string
  status: OrderStatus
  tx_hash: string | null
  created_at?: string
}

export interface DeviceInfo {
  device_id: string
  operator_phone: string
  channel_id: string | null
  max_budget_cap_xrp: number
  current_spent_xrp: number
  remaining_xrp: number
  ledger_channel_remaining_xrp: number | null
  approved_suppliers: string[]
  is_key_revoked: boolean
}

export interface RegisterDeviceBody {
  device_id: string
  operator_phone: string
  max_budget_xrp: number
  approved_suppliers: string[]
}

export interface RegisterDeviceResponse {
  status: string
  device_id: string
  channel_id: string
  max_budget_xrp: number
  tx_hash: string
}

export interface HealthResponse {
  api: string
  db: string
  xrpl: string
}

export const OPEN_STATUSES: OrderStatus[] = ["PENDING", "PROCESSING"]
export const FAILED_STATUSES: OrderStatus[] = [
  "LATE",
  "REJECTED",
  "FAILED",
  "UNDERPAID",
  "BUDGET_EXCEEDED",
]
