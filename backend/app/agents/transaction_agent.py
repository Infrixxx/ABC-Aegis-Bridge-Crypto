"""
app/agents/transaction_agent.py
─────────────────────────────────
Transaction Agent — final node in the LangGraph pipeline.
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

    logger.info(
        "[Transaction] Settling order=%s amount=%.6f to=%s tag=%d",
        order_id, amount_usdc, merchant_address, destination_tag,
    )

    try:
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
                    "UPDATE machine_budgets SET current_spent = current_spent + ? WHERE channel_id = ?",
                    (amount_usdc, channel_id),
                )
            conn.commit()
            logger.info(
                "[Transaction] [PAID] order=%s tx_hash=%s", order_id, tx_hash
            )
        finally:
            conn.close()

        phone_number = state.get("phone_number")
        if phone_number:
            try:
                from app.services.africas_talking_service import send_sms
                send_sms(
                    to_phone=phone_number,
                    message=f"Aegis Bridge: Order {order_id} settled on-chain! {amount_usdc:.2f} RLUSD. Tx: {tx_hash[:12]}...",
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

    except Exception as exc:
        logger.exception(
            "[Transaction] ❌ XRPL payment failed for order=%s: %s", order_id, exc
        )

        conn = sqlite3.connect(settings.DB_FILE)
        cursor = conn.cursor()
        try:
            cursor.execute(
                "UPDATE orders SET status = 'FAILED' WHERE order_id = ?",
                (order_id,),
            )
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
