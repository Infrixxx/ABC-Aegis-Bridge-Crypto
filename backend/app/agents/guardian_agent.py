"""
app/agents/guardian_agent.py
──────────────────────────────
Guardian Agent — second node in the LangGraph pipeline.

Responsibilities:
  1. For machine (M2M) payments:
       - Queries the XRP Ledger Payment Channel balance directly.
       - Blocks any spend that would exceed the channel's funded amount.
       - The ledger balance is the source of truth — not the SQLite DB.

  2. For USSD/consumer payments:
       - No channel constraint (channel_id is None).
       - Simply passes through with budget_ok=True.

  3. Supplier allowlist check (machine payments):
       - Verifies the destination merchant is in the device's
         approved_suppliers JSON list in machine_budgets.

This node is what satisfies the Agentic Finance track requirement:
"Limits enforced somewhere the agent doesn't control."
The Payment Channel balance lives on the XRP Ledger — the agent
cannot manipulate it, only claim from it up to the funded amount.
"""

import json
import sqlite3
import logging

from app.agents.state import ABCState
from app.core.config import settings

logger = logging.getLogger("abc.agents.guardian")


def guardian_node(state: ABCState) -> ABCState:
    """
    LangGraph node: enforces spending limits before settlement.

    For machine payments (channel_id present):
      - Checks ledger Payment Channel balance via xrpl_service.
      - Checks supplier allowlist in machine_budgets table.

    For consumer USSD payments (no channel_id):
      - Passes through — no spending cap applies.
    """
    order_id = state["order_id"]
    channel_id = state.get("channel_id")
    amount_usdc = state["amount_usdc"]
    merchant_address = state["merchant_address"]

    # ── USSD / Consumer Payment: No channel constraint ────────────────────────
    if not channel_id:
        logger.info(
            "[Guardian] Consumer payment order=%s — no channel constraint", order_id
        )
        return {
            **state,
            "channel_balance_xrp": 0.0,
            "budget_ok": True,
        }

    # ── Machine Payment: Enforce ledger-side channel balance ──────────────────
    logger.info(
        "[Guardian] M2M payment order=%s channel=%s amount=%.4f",
        order_id, channel_id, amount_usdc,
    )

    # Import here to avoid circular issues and keep service layer clean
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

    # ── Budget check: amount must fit within remaining channel balance ─────────
    # Note: amount_usdc is treated as equivalent XRP value for the cap check.
    # In production, an XRP/RLUSD rate would be applied here.
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
                f"Spend of {amount_usdc} USDC exceeds Payment Channel "
                f"balance of {remaining_xrp:.4f} XRP. "
                "Operator must top up the channel."
            ),
        }

    # ── Supplier allowlist check ──────────────────────────────────────────────
    conn = sqlite3.connect(settings.DB_FILE)
    cursor = conn.cursor()
    try:
        cursor.execute(
            "SELECT approved_suppliers, is_key_revoked FROM machine_budgets "
            "WHERE device_id = (SELECT device_id FROM machine_budgets LIMIT 1)",
        )
        # TODO: Associate device_id with order in Phase 3 M2M API
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

        if approved_suppliers and merchant_address not in approved_suppliers:
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

    # ── All guardian checks passed ────────────────────────────────────────────
    logger.info("[Guardian] ✅ Order %s approved, channel has %.4f XRP", order_id, remaining_xrp)
    return {
        **state,
        "channel_balance_xrp": remaining_xrp,
        "budget_ok": True,
    }


def route_after_guardian(state: ABCState) -> str:
    """
    Conditional edge: proceed to transaction or block at guardian.
    """
    if not state.get("budget_ok", False):
        logger.info(
            "[Guardian] Routing to END (blocked): %s", state.get("error")
        )
        return "block"
    return "proceed"
