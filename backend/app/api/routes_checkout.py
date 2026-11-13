"""
app/api/routes_checkout.py
───────────────────────────
Checkout creation, live ZAR/USD FX quoting, order polling, and atomic on-chain refunds.
"""

import socket
import sqlite3
import requests
import logging
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.config import settings
from app.api.routes_auth import get_current_user, UserPublic
from app.agents.supervisor import get_order_trace, RECENT_TRACES

logger = logging.getLogger("abc.checkout")
router = APIRouter()


def get_lan_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.2)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


class CheckoutRequest(BaseModel):
    phone_number: str
    amount_zar: float
    merchant_address: str = settings.MERCHANT_WALLET_ADDRESS


def get_live_zar_to_usdc_rate() -> tuple[float, str]:
    """
    Fetches live ZAR/USD exchange rate:
      1. Uses API Ninjas if API_NINJAS_KEY is configured.
      2. Otherwise queries open.er-api.com (free, zero API key required).
      3. Falls back to settings.FX_FALLBACK_RATE (0.055) if offline.
    """
    if settings.API_NINJAS_KEY and settings.API_NINJAS_KEY != "your_api_ninjas_key_here":
        try:
            response = requests.get(
                "https://api.api-ninjas.com/v1/exchangerate",
                params={"pair": "ZAR_USD"},
                headers={"X-Api-Key": settings.API_NINJAS_KEY},
                timeout=3,
            )
            response.raise_for_status()
            rate = float(response.json()["exchange_rate"])
            return rate, "live (api-ninjas)"
        except Exception as exc:
            logger.warning("API Ninjas FX failed (%s) — trying open.er-api.com", exc)

    try:
        res = requests.get("https://open.er-api.com/v6/latest/ZAR", timeout=3)
        res.raise_for_status()
        rate = float(res.json()["rates"]["USD"])
        return rate, "live (open.er-api)"
    except Exception as exc:
        logger.warning("Live FX fetch failed (%s) — using fallback %.4f", exc, settings.FX_FALLBACK_RATE)
        return settings.FX_FALLBACK_RATE, "fallback (0.055)"


def generate_unique_destination_tag(cursor) -> int:
    import random
    for _ in range(10):
        tag = random.randint(100_000, 99_999_999)
        cursor.execute("SELECT 1 FROM orders WHERE order_id = ?", (str(tag),))
        if cursor.fetchone() is None:
            return tag
    raise RuntimeError("Could not generate a unique Destination Tag after 10 attempts.")


@router.post("/")
def create_checkout(request: CheckoutRequest):
    conn = sqlite3.connect(settings.DB_FILE)
    cursor = conn.cursor()

    merchant_addr = request.merchant_address or settings.MERCHANT_WALLET_ADDRESS
    active_curr = settings.active_currency

    try:
        destination_tag = generate_unique_destination_tag(cursor)
        order_id = str(destination_tag)

        live_rate, fx_source = get_live_zar_to_usdc_rate()
        quoted_crypto = round(request.amount_zar * live_rate, 6)
        expiry_time = datetime.utcnow() + timedelta(seconds=settings.FX_LOCK_SECONDS)

        cursor.execute(
            "INSERT OR IGNORE INTO users (phone_number, custodial_wallet) VALUES (?, ?)",
            (request.phone_number, "rPendingCustodialWallet"),
        )

        cursor.execute(
            """
            INSERT INTO orders
                (order_id, phone_number, merchant_address, amount_zar,
                 quoted_crypto, currency, fx_source, fx_lock_expires_at, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
            """,
            (
                order_id,
                request.phone_number,
                merchant_addr,
                request.amount_zar,
                quoted_crypto,
                active_curr,
                fx_source,
                expiry_time.isoformat(),
            ),
        )
        conn.commit()
    except Exception as exc:
        conn.rollback()
        logger.exception("Checkout creation failed")
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        conn.close()

    lan_ip = get_lan_ip()
    return {
        "status": "success",
        "order_id": order_id,
        "destination_tag": destination_tag,
        "amount_zar": request.amount_zar,
        "quoted_crypto": quoted_crypto,
        "currency": active_curr,
        "fx_source": fx_source,
        "merchant_address": merchant_addr,
        "expires_at": expiry_time.isoformat(),
        "fx_lock_seconds": settings.FX_LOCK_SECONDS,
        "lan_ip": lan_ip,
        "web_pay_url": f"http://{lan_ip}:5173/?pay={order_id}",
        "qr_payload": (
            f"xrpl://pay?to={merchant_addr}"
            f"&amount={quoted_crypto}&dt={destination_tag}"
        ),
        "ussd_shortcode": f"*123*{destination_tag}#",
    }


@router.get("/traces/recent")
def list_recent_traces():
    conn = sqlite3.connect(settings.DB_FILE)
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT wallet_address, flag_reason FROM flagged_addresses")
        threats = [{"wallet_address": r[0], "flag_reason": r[1]} for r in cursor.fetchall()]
    finally:
        conn.close()

    items = [
        {"order_id": oid, "steps": steps}
        for oid, steps in list(RECENT_TRACES.items())[-15:]
    ]
    items.reverse()
    return {"traces": items, "threat_cache": threats}


@router.get("/{order_id}")
def get_order_status(order_id: str):
    conn = sqlite3.connect(settings.DB_FILE)
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            SELECT order_id, phone_number, merchant_address, amount_zar,
                   quoted_crypto, fx_lock_expires_at, status, tx_hash,
                   refund_tx_hash, currency, fx_source
            FROM orders WHERE order_id = ?
            """,
            (order_id,),
        )
        row = cursor.fetchone()
    finally:
        conn.close()

    if not row:
        raise HTTPException(status_code=404, detail=f"Order '{order_id}' not found.")

    return {
        "order_id":           row[0],
        "phone_number":       row[1],
        "merchant_address":   row[2],
        "amount_zar":         row[3],
        "quoted_crypto":      row[4],
        "fx_lock_expires_at": row[5],
        "status":             row[6],
        "tx_hash":            row[7],
        "refund_tx_hash":     row[8],
        "currency":           row[9] or settings.active_currency,
        "fx_source":          row[10] or "live",
        "agent_trace":        get_order_trace(row[0]),
    }


@router.get("/")
def list_orders(limit: int = 20):
    conn = sqlite3.connect(settings.DB_FILE)
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            SELECT order_id, phone_number, merchant_address, amount_zar,
                   quoted_crypto, fx_lock_expires_at, status, tx_hash,
                   created_at, refund_tx_hash, currency, fx_source
            FROM orders
            ORDER BY created_at DESC LIMIT ?
            """,
            (limit,),
        )
        rows = cursor.fetchall()
    finally:
        conn.close()

    orders = []
    for row in rows:
        orders.append({
            "order_id": row[0],
            "phone_number": row[1],
            "merchant_address": row[2],
            "amount_zar": row[3],
            "quoted_crypto": row[4],
            "fx_lock_expires_at": row[5],
            "status": row[6],
            "tx_hash": row[7],
            "created_at": row[8],
            "refund_tx_hash": row[9],
            "currency": row[10] or settings.active_currency,
            "fx_source": row[11] or "live",
            "agent_trace": get_order_trace(row[0]),
        })
    return {"orders": orders}


class RefundRequest(BaseModel):
    order_id: str
    reason: str = "Merchant initiated refund"


@router.post("/refund")
def refund_order(
    request: RefundRequest,
    current_user: UserPublic = Depends(get_current_user),
):
    conn = sqlite3.connect(settings.DB_FILE)
    cursor = conn.cursor()
    try:
        cursor.execute(
            "SELECT order_id, amount_zar, quoted_crypto, status FROM orders WHERE order_id = ?",
            (request.order_id,),
        )
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Order not found")
        if row[3] != "PAID":
            raise HTTPException(status_code=400, detail=f"Cannot refund order with status '{row[3]}'")

        # Atomic lock to prevent double-refund race condition
        cursor.execute(
            "UPDATE orders SET status = 'PROCESSING' WHERE order_id = ? AND status = 'PAID'",
            (request.order_id,),
        )
        if cursor.rowcount != 1:
            conn.rollback()
            raise HTTPException(status_code=409, detail="Refund already in progress for this order.")
        conn.commit()
    finally:
        conn.close()

    try:
        from app.services import xrpl_service
        refund_tx = xrpl_service.send_refund(order_id=request.order_id, amount_crypto=float(row[2]))

        conn2 = sqlite3.connect(settings.DB_FILE)
        conn2.execute(
            "UPDATE orders SET status = 'REFUNDED', refund_tx_hash = ? WHERE order_id = ?",
            (refund_tx["tx_hash"], request.order_id),
        )
        conn2.commit()
        conn2.close()

        logger.info("Order %s refunded on-chain by %s: refund_tx=%s", request.order_id, current_user.email, refund_tx["tx_hash"])
        return {
            "status": "success",
            "order_id": request.order_id,
            "refund_tx_hash": refund_tx["tx_hash"],
            "explorer_url": refund_tx["explorer_url"],
            "message": f"Order {request.order_id} refunded on-chain (tx: {refund_tx['tx_hash'][:12]}...).",
        }
    except Exception as exc:
        conn_err = sqlite3.connect(settings.DB_FILE)
        conn_err.execute("UPDATE orders SET status = 'PAID' WHERE order_id = ?", (request.order_id,))
        conn_err.commit()
        conn_err.close()
        logger.exception("On-chain refund failed for order %s", request.order_id)
        raise HTTPException(status_code=500, detail=f"On-chain refund failed: {exc}")