"""
app/agents/security_agent.py
──────────────────────────────
Security Agent — first node in the LangGraph pipeline.

Checks performed (in order):
  1. FX lock expiry  — rejects orders where the 60-second rate window has closed.
  2. Flagged address — rejects transactions to wallets in the threat cache.

Both checks read from SQLite (the Hybrid Ledger), not from agent-internal state,
ensuring the security layer is data-driven and auditable.

If either check fails, the agent sets status=REJECTED and error=<reason>.
The supervisor routes to END, skipping settlement entirely.
"""

import sqlite3
import logging
from datetime import datetime

from app.agents.state import ABCState
from app.core.config import settings

logger = logging.getLogger("abc.agents.security")


def security_node(state: ABCState) -> ABCState:
    """
    LangGraph node: validates the order before allowing settlement.

    Returns an updated state dict. Sets is_flagged=True or fx_expired=True
    if any check fails, along with status=REJECTED and an error message.
    """
    order_id = state["order_id"]
    merchant_address = state["merchant_address"]

    logger.info(
        "[Security] Checking order=%s merchant=%s",
        order_id, merchant_address,
    )

    conn = sqlite3.connect(settings.DB_FILE)
    cursor = conn.cursor()

    try:
        # ── Check 1: FX Lock Expiry ───────────────────────────────────────────
        cursor.execute(
            "SELECT fx_lock_expires_at, status FROM orders WHERE order_id = ?",
            (order_id,),
        )
        row = cursor.fetchone()

        if not row:
            logger.warning("[Security] Order %s not found in DB", order_id)
            return {
                **state,
                "is_flagged": False,
                "fx_expired": True,
                "status": "REJECTED",
                "error": f"Order {order_id} not found.",
            }

        fx_lock_expires_at, current_status = row

        # Guard against re-processing already settled orders
        if current_status == "PAID":
            logger.info("[Security] Order %s already PAID — skipping", order_id)
            return {
                **state,
                "is_flagged": False,
                "fx_expired": False,
                "status": "PAID",
                "error": None,
            }

        if datetime.utcnow() > datetime.fromisoformat(fx_lock_expires_at):
            logger.warning(
                "[Security] FX lock expired for order=%s (expired=%s)",
                order_id, fx_lock_expires_at,
            )
            # Update DB so USSD handler reflects the correct status
            cursor.execute(
                "UPDATE orders SET status = 'LATE' WHERE order_id = ?",
                (order_id,),
            )
            conn.commit()
            return {
                **state,
                "is_flagged": False,
                "fx_expired": True,
                "status": "REJECTED",
                "error": "FX rate lock expired. Order must be re-created.",
            }

        # ── Check 2: Flagged Address ──────────────────────────────────────────
        cursor.execute(
            "SELECT flag_reason FROM flagged_addresses WHERE wallet_address = ?",
            (merchant_address,),
        )
        flag_row = cursor.fetchone()

        if flag_row:
            reason = flag_row[0]
            logger.warning(
                "[Security] FLAGGED merchant=%s reason=%s", merchant_address, reason,
            )
            cursor.execute(
                "UPDATE orders SET status = 'REJECTED' WHERE order_id = ?",
                (order_id,),
            )
            conn.commit()
            return {
                **state,
                "is_flagged": True,
                "fx_expired": False,
                "status": "REJECTED",
                "error": f"Merchant wallet is flagged: {reason}",
            }

    finally:
        conn.close()

    # ── All checks passed ─────────────────────────────────────────────────────
    logger.info("[Security] ✅ Order %s cleared all security checks", order_id)
    return {
        **state,
        "is_flagged": False,
        "fx_expired": False,
        "status": "PENDING",
        "error": None,
    }


def route_after_security(state: ABCState) -> str:
    """
    Conditional edge function: tells LangGraph where to go after the security node.
    Returns "proceed" (→ guardian) or "reject" (→ END).
    """
    if state["status"] == "REJECTED":
        logger.info(
            "[Security] Routing to END (rejected): %s", state.get("error")
        )
        return "reject"
    return "proceed"
