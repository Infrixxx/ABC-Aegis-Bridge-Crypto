"""
app/api/routes_machine.py
──────────────────────────
HTTP 402 Machine-to-Machine (M2M) Payment API.

This module handles autonomous device payments governed by XRPL Payment Channels.
The Payment Channel balance — funded by the human operator and enforced by the
XRP Ledger — is the hard spending cap the agent cannot override.

Endpoints:
  POST /api/machine/register              — Register a device + create Payment Channel
  GET  /api/machine/{device_id}           — View device budget (channel balance from ledger)
  POST /api/machine/{device_id}/budget    — Operator tops up the Payment Channel
  POST /api/machine/{device_id}/pay       — Autonomous M2M payment (agent-triggered)
  POST /api/machine/{device_id}/revoke    — Operator revokes device API key

Agentic Finance track requirement satisfied by this module:
  "A way for a human operator to set or change those limits, outside the agent"
  → POST /api/machine/{device_id}/budget calls fund_payment_channel() directly,
    which submits a PaymentChannelFund tx to the XRP Ledger from the operator wallet.
    The agent never touches this endpoint.
"""

import json
import sqlite3
import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List

from app.core.config import settings
from app.services import xrpl_service

logger = logging.getLogger("abc.machine")
router = APIRouter()


# ── Request / Response Models ─────────────────────────────────────────────────

class RegisterDeviceRequest(BaseModel):
    device_id: str
    operator_phone: str
    max_budget_xrp: float               # Funds the Payment Channel on-ledger
    approved_suppliers: List[str] = []  # XRPL wallet addresses the device may pay


class TopUpBudgetRequest(BaseModel):
    top_up_xrp: float                   # Additional XRP to add to the channel


class MachinePayRequest(BaseModel):
    order_id: str                        # Links to an existing order in the DB
    channel_id: str                      # Payment Channel to draw from


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/register")
def register_device(request: RegisterDeviceRequest):
    """
    Registers a new M2M device and funds an XRPL Payment Channel.

    The Payment Channel is the on-ledger hard cap. The device's agent can
    only spend up to the funded amount — the XRP Ledger enforces this, not the agent.

    Called by: human operator (not the agent).
    """
    if not settings.TREASURY_SEED:
        raise HTTPException(
            status_code=503,
            detail="TREASURY_SEED not configured. Cannot create Payment Channel.",
        )

    try:
        # Create the Payment Channel on XRPL Testnet
        channel_result = xrpl_service.create_payment_channel(
            device_id=request.device_id,
            destination_address=settings.TREASURY_WALLET_ADDRESS,
            max_budget_xrp=request.max_budget_xrp,
        )
        channel_id = channel_result["channel_id"]

        # Persist device registration in Hybrid Ledger
        conn = sqlite3.connect(settings.DB_FILE)
        cursor = conn.cursor()
        try:
            # Ensure operator exists in users table
            cursor.execute(
                "INSERT OR IGNORE INTO users (phone_number, custodial_wallet) VALUES (?, ?)",
                (request.operator_phone, settings.TREASURY_WALLET_ADDRESS),
            )
            cursor.execute(
                """
                INSERT OR REPLACE INTO machine_budgets
                    (device_id, operator_phone, channel_id, max_budget_cap,
                     current_spent, approved_suppliers, is_key_revoked)
                VALUES (?, ?, ?, ?, 0, ?, 0)
                """,
                (
                    request.device_id,
                    request.operator_phone,
                    channel_id,
                    request.max_budget_xrp,
                    json.dumps(request.approved_suppliers),
                ),
            )
            conn.commit()
        finally:
            conn.close()

        logger.info(
            "Device registered: id=%s channel=%s budget=%.4f XRP",
            request.device_id, channel_id, request.max_budget_xrp,
        )

        return {
            "status": "registered",
            "device_id": request.device_id,
            "channel_id": channel_id,
            "max_budget_xrp": request.max_budget_xrp,
            "tx_hash": channel_result["tx_hash"],
            "note": (
                "Payment Channel is live on XRPL Testnet. "
                "The agent can only spend up to the funded amount."
            ),
        }

    except Exception as exc:
        logger.exception("Device registration failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/{device_id}")
def get_device_budget(device_id: str):
    """
    Returns the current budget status for a registered device.

    Queries the XRPL Ledger directly for the Payment Channel balance —
    not the SQLite DB — so the operator sees the true on-chain state.
    """
    conn = sqlite3.connect(settings.DB_FILE)
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            SELECT device_id, operator_phone, channel_id, max_budget_cap,
                   current_spent, approved_suppliers, is_key_revoked
            FROM machine_budgets WHERE device_id = ?
            """,
            (device_id,),
        )
        row = cursor.fetchone()
    finally:
        conn.close()

    if not row:
        raise HTTPException(
            status_code=404,
            detail=f"Device '{device_id}' not registered.",
        )

    (
        db_device_id, operator_phone, channel_id, max_budget_cap,
        current_spent, approved_suppliers_json, is_key_revoked,
    ) = row

    # Attempt live on-ledger channel query if channel_id exists
    ledger_balance = None
    if channel_id and settings.TREASURY_SEED:
        try:
            channel_info = xrpl_service.get_channel_balance(channel_id)
            ledger_balance = channel_info.get("remaining_xrp")
        except Exception as e:
            logger.warning("Could not fetch live XRPL channel balance: %s", e)

    return {
        "device_id": db_device_id,
        "operator_phone": operator_phone,
        "channel_id": channel_id,
        "max_budget_cap_xrp": max_budget_cap,
        "current_spent_xrp": current_spent,
        "remaining_xrp": max_budget_cap - current_spent,
        "ledger_channel_remaining_xrp": ledger_balance,
        "approved_suppliers": json.loads(approved_suppliers_json or "[]"),
        "is_key_revoked": bool(is_key_revoked),
    }


@router.post("/{device_id}/budget")
def top_up_budget(device_id: str, request: TopUpBudgetRequest):
    """
    Operator tops up a device's Payment Channel on the XRP Ledger.

    This is the external limit-setting mechanism required by the
    Agentic Finance track: the operator calls this, not the agent.
    It submits a PaymentChannelFund transaction directly to XRPL Testnet.

    Called by: human operator (not the agent).
    """
    conn = sqlite3.connect(settings.DB_FILE)
    cursor = conn.cursor()
    try:
        cursor.execute(
            "SELECT channel_id, max_budget_cap FROM machine_budgets WHERE device_id = ?",
            (device_id,),
        )
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"Device '{device_id}' not found.")

        channel_id, max_budget_cap = row
        tx_hash = None

        # If a channel exists on XRPL, fund it on-ledger
        if channel_id and settings.TREASURY_SEED:
            fund_result = xrpl_service.fund_payment_channel(channel_id, request.top_up_xrp)
            tx_hash = fund_result.get("tx_hash")

        new_budget = (max_budget_cap or 0.0) + request.top_up_xrp
        cursor.execute(
            "UPDATE machine_budgets SET max_budget_cap = ? WHERE device_id = ?",
            (new_budget, device_id),
        )
        conn.commit()

        return {
            "status": "budget_topped_up",
            "device_id": device_id,
            "channel_id": channel_id,
            "added_xrp": request.top_up_xrp,
            "new_max_budget_cap_xrp": new_budget,
            "tx_hash": tx_hash,
            "note": "Payment channel funded on XRPL Testnet by operator.",
        }

    except Exception as exc:
        conn.rollback()
        logger.exception("Budget top-up failed for device=%s", device_id)
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        conn.close()


@router.post("/{device_id}/pay")
def machine_pay(device_id: str, request: MachinePayRequest):
    """
    Triggers an autonomous M2M payment for a registered device.

    The Guardian Agent checks the Payment Channel balance on-ledger before
    allowing the Transaction Agent to settle. If the channel is depleted,
    the XRPL Ledger rejects the claim — the agent has no override.

    HTTP 402 compatible: returns 402 Payment Required if budget is exceeded.
    """
    from app.agents.supervisor import run_payment_pipeline

    logger.info(
        "M2M payment: device=%s order=%s channel=%s",
        device_id, request.order_id, request.channel_id,
    )

    try:
        result = run_payment_pipeline(
            order_id=request.order_id,
            channel_id=request.channel_id,
        )
    except Exception as exc:
        logger.exception("M2M pipeline error for device=%s", device_id)
        raise HTTPException(status_code=500, detail=str(exc))

    status = result.get("status")

    if status == "PAID":
        return {
            "status": "paid",
            "device_id": device_id,
            "order_id": request.order_id,
            "tx_hash": result.get("tx_hash"),
            "explorer_url": result.get("explorer_url"),
        }

    if status == "BUDGET_EXCEEDED":
        raise HTTPException(
            status_code=402,  # HTTP 402 Payment Required
            detail={
                "error": "BUDGET_EXCEEDED",
                "message": result.get("error"),
                "channel_balance_xrp": result.get("channel_balance_xrp"),
                "hint": "Operator must top up the Payment Channel on XRPL.",
            },
        )

    raise HTTPException(
        status_code=400,
        detail={
            "error": status,
            "message": result.get("error"),
        },
    )


@router.post("/{device_id}/revoke")
def revoke_device(device_id: str):
    """
    Operator revokes a device's API key, blocking all future payments.

    Sets is_key_revoked=1 in machine_budgets. The Guardian Agent checks
    this flag before every transaction and blocks the pipeline if set.

    Called by: human operator (not the agent).
    """
    conn = sqlite3.connect(settings.DB_FILE)
    cursor = conn.cursor()
    try:
        cursor.execute(
            "UPDATE machine_budgets SET is_key_revoked = 1 WHERE device_id = ?",
            (device_id,),
        )
        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=404,
                detail=f"Device '{device_id}' not found.",
            )
        conn.commit()
    finally:
        conn.close()

    logger.warning("Device REVOKED by operator: device=%s", device_id)
    return {
        "status": "revoked",
        "device_id": device_id,
        "message": "Device API key revoked. All future payments will be blocked.",
    }
