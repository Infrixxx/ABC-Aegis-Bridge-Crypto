"""
app/agents/supervisor.py
──────────────────────────
Public interface for triggering the ABC agent pipeline.

This module is the single entry point called by:
  - routes_ussd.py  → after a USSD payment confirmation
  - routes_machine.py → after an HTTP 402 M2M payment request

It builds the initial ABCState from the order in SQLite, invokes the
compiled LangGraph graph, and returns the final settled state.

Usage:
    from app.agents.supervisor import run_payment_pipeline
    result = run_payment_pipeline(order_id="47293841")
"""

import sqlite3
import logging

from app.agents.state import ABCState
from app.agents.graph_builder import abc_graph
from app.core.config import settings

logger = logging.getLogger("abc.agents.supervisor")


def run_payment_pipeline(
    order_id: str,
    channel_id: str | None = None,
) -> ABCState:
    """
    Loads order details from the Hybrid Ledger and runs the full
    Security → Guardian → Transaction agent pipeline.

    Args:
        order_id:    The unique order identifier (Destination Tag as string).
        channel_id:  XRPL Payment Channel ID for machine payments (None for USSD).

    Returns:
        The final ABCState after all agents have run.
        Check state["status"] for the outcome:
            "PAID"            → tx_hash and explorer_url are set
            "REJECTED"        → flagged, expired, or invalid order
            "BUDGET_EXCEEDED" → machine payment exceeds Payment Channel balance
            "FAILED"          → XRPL submission failed (network/wallet issue)
    """
    logger.info("[Supervisor] Starting pipeline for order=%s", order_id)

    # ── Load order from DB ────────────────────────────────────────────────────
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
    finally:
        conn.close()

    if not row:
        logger.error("[Supervisor] Order %s not found", order_id)
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

    # ── Build initial state ───────────────────────────────────────────────────
    initial_state: ABCState = {
        "order_id":           db_order_id,
        "phone_number":       phone_number,
        "merchant_address":   merchant_address or settings.TREASURY_WALLET_ADDRESS,
        "amount_usdc":        float(quoted_crypto),
        "destination_tag":    int(db_order_id),
        # Security agent will fill these in
        "is_flagged":         False,
        "fx_expired":         False,
        # Guardian agent will fill these in
        "channel_id":         channel_id,
        "channel_balance_xrp": 0.0,
        "budget_ok":          False,
        # Transaction agent will fill these in
        "tx_hash":            None,
        "explorer_url":       None,
        # Starting status
        "status":             "PENDING",
        "error":              None,
    }

    logger.info(
        "[Supervisor] Initial state: order=%s amount=%.6f merchant=%s channel=%s",
        order_id, quoted_crypto, merchant_address, channel_id,
    )

    # ── Run the pipeline ──────────────────────────────────────────────────────
    try:
        final_state = abc_graph.invoke(initial_state)
        logger.info(
            "[Supervisor] Pipeline complete: order=%s status=%s tx=%s",
            order_id,
            final_state.get("status"),
            final_state.get("tx_hash"),
        )
        return final_state

    except Exception as exc:
        logger.exception(
            "[Supervisor] Unhandled pipeline error for order=%s: %s", order_id, exc
        )
        return {
            **initial_state,
            "status": "FAILED",
            "error": f"Agent pipeline error: {exc}",
        }
