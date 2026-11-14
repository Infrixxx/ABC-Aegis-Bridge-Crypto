"""
app/agents/guardian_agent.py
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Guardian Agent â€” second node in the LangGraph pipeline.
Enforces operator kill-switch and supplier allowlists, queries live XRPL
Payment Channel state without double-counting SQLite spend, and delegates
hard cap rejection to on-ledger `PaymentChannelClaim` when live on XRPL.
"""

import json
import sqlite3
import logging

from app.agents.state import ABCState
from app.core.config import settings
from app.services import xrpl_service

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
        logger.info("[Guardian] Consumer payment order=%s â€” no channel constraint", order_id)
        return {
            **state,
            "channel_balance_xrp": 0.0,
            "budget_ok": True,
        }

    try:
        channel_info = xrpl_service.get_channel_balance(channel_id)
        # Ledger remaining_xrp already subtracts on-chain claimed balance! No double-subtraction.
        effective_remaining = float(channel_info["remaining_xrp"])
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
            "SELECT approved_suppliers, is_key_revoked FROM machine_budgets WHERE channel_id = ?",
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
            logger.warning("[Guardian] Merchant %s not in approved_suppliers", merchant_address)
            _update_order_status(order_id, "REJECTED")
            return {
                **state,
                "channel_balance_xrp": effective_remaining,
                "budget_ok": False,
                "status": "REJECTED",
                "error": f"Supplier {merchant_address} is not in operator's approved mandate allowlist.",
            }

    # If running without a live seed (simulation mode), block in software.
    # When live on XRPL Testnet, allow the claim to hit `sign_and_claim_payment_channel`
    # so the XRP Ledger itself enforces the cap and returns a real XRPL result code!
    if not xrpl_service._is_real_seed_configured() and amount_usdc > effective_remaining:
        _update_order_status(order_id, "BUDGET_EXCEEDED")
        from app.services.operator_alerts import alert_operator
        alert_operator(
            channel_id,
            f"ABC Guardian: payment of {amount_usdc:.2f} XRP BLOCKED for order {order_id} "
            f"(only {effective_remaining:.2f} XRP left). Top up in the console to allow it.",
        )
        return {
            **state,
            "channel_balance_xrp": effective_remaining,
            "budget_ok": False,
            "status": "BUDGET_EXCEEDED",
            "error": (
                f"Spend of {amount_usdc:.4f} XRP exceeds Payment Channel "
                f"remaining balance of {effective_remaining:.4f} XRP."
            ),
        }

    logger.info(
        "[Guardian] Mandate cleared for order=%s (channel remaining=%.4f XRP, claim=%.4f XRP)",
        order_id, effective_remaining, amount_usdc,
    )
    return {
        **state,
        "channel_balance_xrp": effective_remaining,
        "budget_ok": True,
    }


def route_after_guardian(state: ABCState) -> str:
    if not state.get("budget_ok", False):
        return "block"
    return "proceed"