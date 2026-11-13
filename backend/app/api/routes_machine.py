"""
app/api/routes_machine.py
──────────────────────────
HTTP 402 Machine-to-Machine (M2M) Payment API.
"""

import json
import sqlite3
import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List

from app.core.config import settings
from app.services import xrpl_service

logger = logging.getLogger("abc.machine")
router = APIRouter()


class RegisterDeviceRequest(BaseModel):
    device_id: str
    operator_phone: str
    max_budget_xrp: float
    approved_suppliers: List[str] = []


class TopUpBudgetRequest(BaseModel):
    top_up_xrp: float


class MachinePayRequest(BaseModel):
    order_id: str
    channel_id: str


@router.get("/")
def list_devices():
    """Returns all registered M2M devices from the Hybrid Ledger."""
    conn = sqlite3.connect(settings.DB_FILE)
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            SELECT device_id, operator_phone, channel_id, max_budget_cap,
                   current_spent, approved_suppliers, is_key_revoked
            FROM machine_budgets
            ORDER BY rowid DESC
            """
        )
        rows = cursor.fetchall()
    finally:
        conn.close()

    devices = []
    for row in rows:
        cap = float(row[3] or 0.0)
        spent = float(row[4] or 0.0)
        devices.append({
            "device_id": row[0],
            "operator_phone": row[1],
            "channel_id": row[2],
            "max_budget_cap_xrp": cap,
            "current_spent_xrp": spent,
            "remaining_xrp": max(0.0, cap - spent),
            "approved_suppliers": json.loads(row[5] or "[]"),
            "is_key_revoked": bool(row[6]),
        })
    return {"devices": devices}


@router.post("/register")
def register_device(request: RegisterDeviceRequest):
    if not settings.TREASURY_SEED:
        raise HTTPException(
            status_code=503,
            detail="TREASURY_SEED not configured. Cannot create Payment Channel.",
        )

    try:
        channel_result = xrpl_service.create_payment_channel(
            device_id=request.device_id,
            destination_address=settings.MERCHANT_WALLET_ADDRESS,
            max_budget_xrp=request.max_budget_xrp,
        )
        channel_id = channel_result["channel_id"]

        suppliers = list(
            dict.fromkeys(
                (request.approved_suppliers or [])
                + [settings.MERCHANT_WALLET_ADDRESS, "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe"]
            )
        )

        conn = sqlite3.connect(settings.DB_FILE)
        cursor = conn.cursor()
        try:
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
                    json.dumps(suppliers),
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
            "approved_suppliers": suppliers,
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

    ledger_balance = None
    if channel_id and settings.TREASURY_SEED:
        try:
            channel_info = xrpl_service.get_channel_balance(channel_id)
            ledger_balance = channel_info.get("remaining_xrp")
        except Exception as e:
            logger.warning("Could not fetch live XRPL channel balance: %s", e)

    cap = float(max_budget_cap or 0.0)
    spent = float(current_spent or 0.0)

    return {
        "device_id": db_device_id,
        "operator_phone": operator_phone,
        "channel_id": channel_id,
        "max_budget_cap_xrp": cap,
        "current_spent_xrp": spent,
        "remaining_xrp": max(0.0, cap - spent),
        "ledger_channel_remaining_xrp": ledger_balance,
        "approved_suppliers": json.loads(approved_suppliers_json or "[]"),
        "is_key_revoked": bool(is_key_revoked),
    }


@router.post("/{device_id}/budget")
def top_up_budget(device_id: str, request: TopUpBudgetRequest):
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
            status_code=402,
            headers={
                "WWW-Authenticate": f'Payment realm="AegisBridge", network="xrpl:testnet", channel="{request.channel_id}"',
                "PAYMENT-REQUIRED": f'scheme="x402-xrpl", currency="RLUSD", channel="{request.channel_id}"',
            },
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

