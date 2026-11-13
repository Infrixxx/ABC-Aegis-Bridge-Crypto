"""
app/agents/transaction_agent.py
─────────────────────────────────
Transaction Agent — final node in the LangGraph pipeline.

Executes the actual XRPL Testnet payment after security and guardian
checks have both passed. On success:
  - Writes tx_hash to the orders table in SQLite.
  - Updates order status to PAID.
  - Returns explorer_url for the POS terminal to display.

On failure:
  - Updates order status to FAILED.
  - Returns error details for operator alerting.
"""

import sqlite3
import logging

from app.agents.state import ABCState
from app.core.config import settings
from app.services import xrpl_service

logger = logging.getLogger("abc.agents.transaction")


def transaction_node(state: ABCState) -> ABCState:
    """
    LangGraph node: submits the XRPL payment and writes the result to DB.

    Expects state to have:
      - order_id, merchant_address, amount_usdc, destination_tag
      - is_flagged=False, budget_ok=True (enforced by upstream nodes)
    """
    order_id = state["order_id"]
    merchant_address = state["merchant_address"]
    amount_usdc = state["amount_usdc"]
    destination_tag = state.get("destination_tag", int(order_id))

    logger.info(
        "[Transaction] Settling order=%s amount=%.6f to=%s tag=%d",
        order_id, amount_usdc, merchant_address, destination_tag,
    )

    try:
        # ── Execute on XRPL Testnet ───────────────────────────────────────────
        result = xrpl_service.send_payment(
            order_id=order_id,
            merchant_address=merchant_address,
            amount_rlusd=amount_usdc,
            destination_tag=destination_tag,
        )

        tx_hash = result["tx_hash"]
        explorer_url = result["explorer_url"]

        # ── Write tx_hash and PAID status to Hybrid Ledger ───────────────────
        conn = sqlite3.connect(settings.DB_FILE)
        cursor = conn.cursor()
        try:
            cursor.execute(
                "UPDATE orders SET status = 'PAID', tx_hash = ? WHERE order_id = ?",
                (tx_hash, order_id),
            )
            conn.commit()
            logger.info(
                "[Transaction] ✅ PAID order=%s tx_hash=%s", order_id, tx_hash
            )
        finally:
            conn.close()

        return {
            **state,
            "tx_hash": tx_hash,
            "explorer_url": explorer_url,
            "status": "PAID",
            "error": None,
        }

    except Exception as exc:
        # ── Settlement failed — write FAILED status to DB ─────────────────────
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
