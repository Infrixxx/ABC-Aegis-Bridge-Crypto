"""
app/agents/transaction_agent.py
─────────────────────────────────
Transaction Agent — final node in the LangGraph pipeline.
Executes XRPL Payment (consumer flow) or cryptographic PaymentChannelClaim (M2M flow).
Maps on-ledger channel overspend rejections directly to BUDGET_EXCEEDED (HTTP 402).
"""

import sqlite3
import logging

from app.agents.state import ABCState
from app.core.config import settings
from app.services import xrpl_service

logger = logging.getLogger("abc.agents.transaction")


def transaction_node(state: ABCState) -> ABCState:
    order_id = state["order_id"]
    merchant_address = state["merchant_address"]
    amount_usdc = state["amount_usdc"]
    destination_tag = state.get("destination_tag", int(order_id))
    channel_id = state.get("channel_id")
    asset_label = "XRP" if channel_id else settings.active_currency

    logger.info(
        "[Transaction] Settling order=%s amount=%.6f %s to=%s tag=%d",
        order_id, amount_usdc, asset_label, merchant_address, destination_tag,
    )

    conn_pre = sqlite3.connect(settings.DB_FILE)
    cursor_pre = conn_pre.cursor()
    try:
        cursor_pre.execute("SELECT status, tx_hash FROM orders WHERE order_id = ?", (order_id,))
        pre_row = cursor_pre.fetchone()
        if pre_row and pre_row[0] == "PAID":
            return {
                **state,
                "status": "PAID",
                "tx_hash": pre_row[1],
                "error": None,
            }
    finally:
        conn_pre.close()

    try:
        if channel_id:
            ch_info = xrpl_service.get_channel_balance(channel_id)
            already_claimed_xrp = float(ch_info.get("spent_xrp", 0.0))
            cumulative_xrp = already_claimed_xrp + float(amount_usdc)

            result = xrpl_service.sign_and_claim_payment_channel(
                channel_id=channel_id,
                cumulative_xrp=cumulative_xrp,
                order_id=order_id,
            )
        else:
            result = xrpl_service.send_payment(
                order_id=order_id,
                merchant_address=merchant_address,
                amount_rlusd=amount_usdc,
                destination_tag=destination_tag,
            )

        tx_hash = result["tx_hash"]
        explorer_url = result["explorer_url"]

        conn = sqlite3.connect(settings.DB_FILE)
        cursor = conn.cursor()
        try:
            cursor.execute(
                "UPDATE orders SET status = 'PAID', tx_hash = ? WHERE order_id = ?",
                (tx_hash, order_id),
            )
            if channel_id:
                cursor.execute(
                    "UPDATE machine_budgets SET current_spent = ? WHERE channel_id = ?",
                    (cumulative_xrp, channel_id),
                )
            conn.commit()
        finally:
            conn.close()

        phone_number = state.get("phone_number")
        if phone_number:
            try:
                from app.services.africas_talking_service import send_sms
                send_sms(
                    to_phone=phone_number,
                    message=f"Aegis Bridge: Order {order_id} settled on XRPL! {amount_usdc:.4f} {asset_label}. Tx: {tx_hash[:12]}...",
                )
            except Exception as sms_err:
                logger.warning("[Transaction] SMS notification skipped: %s", sms_err)

        return {
            **state,
            "tx_hash": tx_hash,
            "explorer_url": explorer_url,
            "status": "PAID",
            "error": None,
        }

    except xrpl_service.LedgerCapExceededError as cap_err:
        logger.warning("[Transaction] On-Ledger PaymentChannelClaim rejected: %s", cap_err)
        conn = sqlite3.connect(settings.DB_FILE)
        try:
            conn.execute("UPDATE orders SET status = 'BUDGET_EXCEEDED' WHERE order_id = ?", (order_id,))
            conn.commit()
        finally:
            conn.close()

        return {
            **state,
            "tx_hash": None,
            "explorer_url": None,
            "status": "BUDGET_EXCEEDED",
            "error": str(cap_err),
        }

    except Exception as exc:
        logger.exception("[Transaction] XRPL payment failed for order=%s: %s", order_id, exc)
        conn = sqlite3.connect(settings.DB_FILE)
        try:
            conn.execute("UPDATE orders SET status = 'FAILED' WHERE order_id = ?", (order_id,))
            conn.commit()
        finally:
            conn.close()

        return {
            **state,
            "tx_hash": None,
            "explorer_url": None,
            "status": "FAILED",
            "error": str(exc),
        }