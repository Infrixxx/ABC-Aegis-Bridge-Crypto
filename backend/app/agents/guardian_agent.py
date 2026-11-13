"""
app/agents/guardian_agent.py
──────────────────────────────
Guardian Agent — second node in the LangGraph pipeline.
"""

import json
import sqlite3
import logging

from app.agents.state import ABCState
from app.core.config import settings

logger = logging.getLogger("abc.agents.guardian")


def _update_order_status(order_id: str, new_status: str) -> None:
    conn = sqlite3.connect(settings.DB_FILE)
    cursor = conn.cursor()
    try:
        cursor.execute(
            "UPDATE orders SET status = ? WHERE order_id = ?",
            (new_status, order_id),
        )
        conn.commit()
    finally:
        conn.close()


def guardian_node(state: ABCState) -> ABCState:
    order_id = state["order_id"]
    channel_id = state.get("channel_id")
    amount_usdc = state["amount_usdc"]
    merchant_address = state["merchant_address"]

    if not channel_id:
        logger.info(
            "[Guardian] Consumer payment order=%s — no channel constraint", order_id
        )
        return {
            **state,
            "channel_balance_xrp": 0.0,
            "budget_ok": True,
        }

    logger.info(
        "[Guardian] M2M payment order=%s channel=%s amount=%.4f",
        order_id, channel_id, amount_usdc,
    )

    from app.services import xrpl_service

    try:
        channel_info = xrpl_service.get_channel_balance(channel_id)
        remaining_xrp = channel_info["remaining_xrp"]
    except Exception as exc:
        logger.error("[Guardian] Failed to fetch channel balance: %s", exc)
        _update_order_status(order_id, "BUDGET_EXCEEDED")
        return {
            **state,
            "channel_balance_xrp": 0.0,
            "budget_ok": False,
            "status": "BUDGET_EXCEEDED",
            "error": f"Could not verify Payment Channel balance: {exc}",
        }

    conn = sqlite3.connect(settings.DB_FILE)
    cursor = conn.cursor()
    try:
        cursor.execute(
            "SELECT approved_suppliers, is_key_revoked, current_spent FROM machine_budgets "
            "WHERE channel_id = ?",
            (channel_id,),
        )
        budget_row = cursor.fetchone()
    finally:
        conn.close()

    if budget_row:
        approved_suppliers = json.loads(budget_row[0] or "[]")
        is_revoked = bool(budget_row[1])
        db_spent = float(budget_row[2] or 0.0)
        effective_remaining = max(0.0, remaining_xrp - db_spent)

        if is_revoked:
            logger.warning("[Guardian] Device key is REVOKED for order=%s", order_id)
            _update_order_status(order_id, "REJECTED")
            return {
                **state,
                "channel_balance_xrp": effective_remaining,
                "budget_ok": False,
                "status": "REJECTED",
                "error": "Device API key has been revoked by operator (Kill-Switch active).",
            }

        allowed_defaults = {
            getattr(settings, "MERCHANT_WALLET_ADDRESS", ""),
            getattr(settings, "TREASURY_WALLET_ADDRESS", ""),
            "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
        }
        if (
            approved_suppliers
            and merchant_address not in approved_suppliers
            and merchant_address not in allowed_defaults
        ):
            logger.warning(
                "[Guardian] Merchant %s not in approved_suppliers for order=%s",
                merchant_address, order_id,
            )
            _update_order_status(order_id, "REJECTED")
            return {
                **state,
                "channel_balance_xrp": effective_remaining,
                "budget_ok": False,
                "status": "REJECTED",
                "error": f"Supplier {merchant_address} is not in operator's approved mandate allowlist.",
            }
    else:
        effective_remaining = remaining_xrp

    if amount_usdc > effective_remaining:
        logger.warning(
            "[Guardian] BUDGET EXCEEDED: order=%s need=%.4f remaining=%.4f",
            order_id, amount_usdc, effective_remaining,
        )
        _update_order_status(order_id, "BUDGET_EXCEEDED")
        return {
            **state,
            "channel_balance_xrp": effective_remaining,
            "budget_ok": False,
            "status": "BUDGET_EXCEEDED",
            "error": (
                f"Spend of {amount_usdc} RLUSD exceeds Payment Channel "
                f"balance of {effective_remaining:.4f} XRP. "
                "Operator must top up the channel."
            ),
        }

    logger.info("[Guardian] ✅ Order %s approved, channel has %.4f XRP", order_id, effective_remaining)
    return {
        **state,
        "channel_balance_xrp": effective_remaining,
        "budget_ok": True,
    }


def route_after_guardian(state: ABCState) -> str:
    if not state.get("budget_ok", False):
        logger.info(
            "[Guardian] Routing to END (blocked): %s", state.get("error")
        )
        return "block"
    return "proceed"
