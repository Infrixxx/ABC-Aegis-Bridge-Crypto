"""
app/agents/supervisor.py
──────────────────────────
Triggers the ABC LangGraph pipeline using `.stream()` to measure real
per-node execution latencies (ms) and honest currency labels.
"""

import json
import sqlite3
import logging
import time
from datetime import datetime, timezone

from app.agents.state import ABCState
from app.agents.graph_builder import abc_graph
from app.core.config import settings

logger = logging.getLogger("abc.agents.supervisor")

RECENT_TRACES: dict[str, list[dict]] = {}


def get_order_trace(order_id: str) -> list[dict]:
    if str(order_id) in RECENT_TRACES:
        return RECENT_TRACES[str(order_id)]
    try:
        conn = sqlite3.connect(settings.DB_FILE)
        row = conn.execute("SELECT agent_trace FROM orders WHERE order_id = ?", (str(order_id),)).fetchone()
        conn.close()
        if row and row[0]:
            return json.loads(row[0])
    except Exception:
        pass
    return []


def run_payment_pipeline(
    order_id: str,
    channel_id: str | None = None,
) -> ABCState:
    t_start = time.perf_counter()
    now_iso = datetime.now(timezone.utc).strftime("%H:%M:%S")
    trace: list[dict] = []

    conn = sqlite3.connect(settings.DB_FILE)
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            SELECT order_id, phone_number, merchant_address,
                   amount_zar, quoted_crypto, fx_lock_expires_at, status
            FROM orders WHERE order_id = ?
            """,
            (order_id,),
        )
        row = cursor.fetchone()
        max_cap = 0.0
        if channel_id:
            cap_row = cursor.execute(
                "SELECT max_budget_cap FROM machine_budgets WHERE channel_id = ?",
                (channel_id,),
            ).fetchone()
            if cap_row:
                max_cap = float(cap_row[0] or 0.0)
    finally:
        conn.close()

    if not row:
        return ABCState(
            order_id=order_id,
            phone_number="",
            merchant_address="",
            amount_usdc=0.0,
            destination_tag=0,
            is_flagged=False,
            fx_expired=False,
            channel_id=channel_id,
            channel_balance_xrp=0.0,
            budget_ok=False,
            tx_hash=None,
            explorer_url=None,
            status="REJECTED",
            error=f"Order {order_id} not found in database.",
        )

    (
        db_order_id, phone_number, merchant_address,
        amount_zar, quoted_crypto, fx_lock_expires_at, status,
    ) = row

    asset_unit = "XRP" if channel_id else settings.active_currency
    mode_label = f"M2M PayChannel ({channel_id[:10]}...)" if channel_id else "USSD / Consumer POS"

    sup_ms = round((time.perf_counter() - t_start) * 1000, 2)
    trace.append({
        "agent": "LangGraph Supervisor",
        "status": "OK",
        "latency_ms": sup_ms,
        "detail": f"Hydrated Order #{db_order_id} (R{amount_zar:.2f} -> {quoted_crypto:.4f} {asset_unit}) via {mode_label}.",
        "timestamp": now_iso,
    })

    initial_state: ABCState = {
        "order_id":            db_order_id,
        "phone_number":        phone_number,
        "merchant_address":    merchant_address or settings.MERCHANT_WALLET_ADDRESS,
        "amount_usdc":         float(quoted_crypto),
        "destination_tag":     int(db_order_id),
        "is_flagged":          False,
        "fx_expired":          False,
        "channel_id":          channel_id,
        "channel_balance_xrp": 0.0,
        "budget_ok":           False,
        "tx_hash":             None,
        "explorer_url":        None,
        "status":              "PENDING",
        "error":               None,
    }

    final_state: ABCState = dict(initial_state)  # type: ignore
    try:
        t_node = time.perf_counter()
        for event in abc_graph.stream(initial_state):
            elapsed_ms = round((time.perf_counter() - t_node) * 1000, 2)
            for node_name, node_state in event.items():
                final_state = node_state
                if node_name == "security":
                    if node_state.get("is_flagged"):
                        trace.append({
                            "agent": "Security Agent (Threat Cache)",
                            "status": "BLOCKED",
                            "latency_ms": elapsed_ms,
                            "detail": node_state.get("error") or "Sanctioned wallet blocked by local threat cache.",
                            "timestamp": now_iso,
                        })
                    elif node_state.get("fx_expired") or node_state.get("status") == "REJECTED":
                        trace.append({
                            "agent": "Security Agent (FX Lock & Replay Guard)",
                            "status": "BLOCKED",
                            "latency_ms": elapsed_ms,
                            "detail": node_state.get("error") or "Order expired or already settled.",
                            "timestamp": now_iso,
                        })
                    else:
                        trace.append({
                            "agent": "Security Agent (Threat Cache + FX Lock)",
                            "status": "CLEARED",
                            "latency_ms": elapsed_ms,
                            "detail": f"Wallet {initial_state['merchant_address'][:10]}... cleared threat cache & 60s FX window.",
                            "timestamp": now_iso,
                        })

                elif node_name == "guardian":
                    if not node_state.get("budget_ok"):
                        trace.append({
                            "agent": "Guardian Agent (Mandate Gate)",
                            "status": "BLOCKED",
                            "latency_ms": elapsed_ms,
                            "detail": node_state.get("error") or "Blocked by operator mandate.",
                            "timestamp": now_iso,
                        })
                    else:
                        rem = float(node_state.get("channel_balance_xrp", 0.0))
                        note = (
                            f"Mandate verified ({rem:.2f} XRP remaining on-ledger). Forwarding CLM\\0 claim to XRPL."
                            if channel_id
                            else "Consumer USSD flow approved."
                        )
                        if channel_id and max_cap > 0 and ((rem - float(quoted_crypto)) / max_cap) < 0.30 and (rem >= float(quoted_crypto)):
                            pct_left = max(0.0, ((rem - float(quoted_crypto)) / max_cap) * 100)
                            note += f" [PROACTIVE ALERT: Channel at {pct_left:.0f}% (<30% threshold) — SMS alert dispatched!]"
                            try:
                                from app.services.africas_talking_service import send_sms
                                send_sms(
                                    to_phone=phone_number or "+27839998888",
                                    message=f"ABC Guardian Alert: Channel {channel_id[:8]}... at {pct_left:.0f}% ({rem - float(quoted_crypto):.2f} XRP left).",
                                )
                            except Exception:
                                pass
                        trace.append({
                            "agent": "Guardian Agent (Mandate & Channel Monitor)",
                            "status": "APPROVED",
                            "latency_ms": elapsed_ms,
                            "detail": note,
                            "timestamp": now_iso,
                        })

                elif node_name == "transaction":
                    st = node_state.get("status")
                    if st == "PAID":
                        tx_kind = "PaymentChannelClaim" if channel_id else "Payment"
                        trace.append({
                            "agent": f"Transaction Agent (XRPL {tx_kind})",
                            "status": "SETTLED",
                            "latency_ms": elapsed_ms,
                            "detail": f"Validated on XRPL Testnet ({quoted_crypto:.4f} {asset_unit}, Tag #{db_order_id}). Tx: {(node_state.get('tx_hash') or '')[:14]}...",
                            "timestamp": now_iso,
                        })
                    elif st == "BUDGET_EXCEEDED":
                        trace.append({
                            "agent": "Transaction Agent (XRPL PaymentChannelClaim)",
                            "status": "HTTP 402 BLOCK",
                            "latency_ms": elapsed_ms,
                            "detail": node_state.get("error") or "XRP Ledger rejected overspend claim.",
                            "timestamp": now_iso,
                        })
                    else:
                        trace.append({
                            "agent": "Transaction Agent (XRPL Signer)",
                            "status": "FAILED",
                            "latency_ms": elapsed_ms,
                            "detail": node_state.get("error") or "Settlement failed.",
                            "timestamp": now_iso,
                        })
            t_node = time.perf_counter()

        RECENT_TRACES[str(order_id)] = trace
        conn_t = sqlite3.connect(settings.DB_FILE)
        conn_t.execute("UPDATE orders SET agent_trace = ? WHERE order_id = ?", (json.dumps(trace), str(order_id)))
        conn_t.commit()
        conn_t.close()
        return final_state

    except Exception as exc:
        logger.exception("[Supervisor] Pipeline error for order=%s: %s", order_id, exc)
        return {
            **initial_state,
            "status": "FAILED",
            "error": f"Agent pipeline error: {exc}",
        }