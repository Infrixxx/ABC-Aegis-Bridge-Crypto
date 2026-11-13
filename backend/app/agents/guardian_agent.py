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
        logger.info(
            "[Guardian] Channel %s has %.4f XRP remaining, need %.4f",
            channel_id, remaining_xrp, amount_usdc,
        )
    except Exception as exc:
        logger.error("[Guardian] Failed to fetch channel balance: %s", exc)
        return {
            **state,
            "channel_balance_xrp": 0.0,
            "budget_ok": False,
            "status": "BUDGET_EXCEEDED",
            "error": f"Could not verify Payment Channel balance: {exc}",
        }

    if amount_usdc > remaining_xrp:
        logger.warning(
            "[Guardian] BUDGET EXCEEDED: order=%s need=%.4f remaining=%.4f",
            order_id, amount_usdc, remaining_xrp,
        )
        return {
            **state,
            "channel_balance_xrp": remaining_xrp,
            "budget_ok": False,
            "status": "BUDGET_EXCEEDED",
            "error": (
                f"Spend of {amount_usdc} RLUSD exceeds Payment Channel "
                f"balance of {remaining_xrp:.4f} XRP. "
                "Operator must top up the channel."
            ),
        }

    conn = sqlite3.connect(settings.DB_FILE)
    cursor = conn.cursor()
    try:
        cursor.execute(
            "SELECT approved_suppliers, is_key_revoked FROM machine_budgets "
            "WHERE channel_id = ?",
            (channel_id,),
        )
        budget_row = cursor.fetchone()
    finally:
        conn.close()

    if budget_row:
        approved_suppliers = json.loads(budget_row[0] or "[]")
        is_revoked = bool(budget_row[1])

        if is_revoked:
            logger.warning("[Guardian] Device key is REVOKED for order=%s", order_id)
            return {
                **state,
                "channel_balance_xrp": remaining_xrp,
                "budget_ok": False,
                "status": "REJECTED",
                "error": "Device API key has been revoked by operator.",
            }

        allowed_defaults = {
            settings.MERCHANT_WALLET_ADDRESS,
            settings.TREASURY_WALLET_ADDRESS,
            "rTreasuryWalletPlaceholder",
            "rMerchantStoreAddress1",
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
            return {
                **state,
                "channel_balance_xrp": remaining_xrp,
                "budget_ok": False,
                "status": "REJECTED",
                "error": f"Merchant {merchant_address} is not an approved supplier.",
            }

    logger.info("[Guardian] ✅ Order %s approved, channel has %.4f XRP", order_id, remaining_xrp)
    return {
        **state,
        "channel_balance_xrp": remaining_xrp,
        "budget_ok": True,
    }


def route_after_guardian(state: ABCState) -> str:
    if not state.get("budget_ok", False):
        logger.info(
            "[Guardian] Routing to END (blocked): %s", state.get("error")
        )
        return "block"
    return "proceed"
