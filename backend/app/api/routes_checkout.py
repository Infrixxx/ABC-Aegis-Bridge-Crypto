"""
app/api/routes_checkout.py
───────────────────────────
POST /api/checkout/
"""

import sqlite3
import requests
import logging
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.config import settings

logger = logging.getLogger("abc.checkout")
router = APIRouter()


class CheckoutRequest(BaseModel):
    phone_number: str
    amount_zar: float
    merchant_address: str = settings.MERCHANT_WALLET_ADDRESS


def get_live_zar_to_usdc_rate() -> float:
    if not settings.API_NINJAS_KEY or settings.API_NINJAS_KEY == "your_api_ninjas_key_here":
        logger.warning("API_NINJAS_KEY not set — using fallback rate %.4f", settings.FX_FALLBACK_RATE)
        return settings.FX_FALLBACK_RATE

    try:
        response = requests.get(
            "https://api.api-ninjas.com/v1/exchangerate",
            params={"pair": "ZAR_USD"},
            headers={"X-Api-Key": settings.API_NINJAS_KEY},
            timeout=5,
        )
        response.raise_for_status()
        rate = response.json()["exchange_rate"]
        logger.info("Live FX rate fetched: %.6f ZAR/USD", rate)
        return rate

    except requests.exceptions.RequestException as exc:
        logger.error("FX fetch failed: %s — using fallback %.4f", exc, settings.FX_FALLBACK_RATE)
        return settings.FX_FALLBACK_RATE


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

    try:
        destination_tag = generate_unique_destination_tag(cursor)
        order_id = str(destination_tag)

        live_rate = get_live_zar_to_usdc_rate()
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
                 quoted_crypto, fx_lock_expires_at, status)
            VALUES (?, ?, ?, ?, ?, ?, 'PENDING')
            """,
            (
                order_id,
                request.phone_number,
                merchant_addr,
                request.amount_zar,
                quoted_crypto,
                expiry_time.isoformat(),
            ),
        )
        conn.commit()
        logger.info("Order %s created: R%.2f → %.6f RLUSD (expires %s)", order_id, request.amount_zar, quoted_crypto, expiry_time.isoformat())

    except Exception as exc:
        conn.rollback()
        logger.exception("Checkout creation failed")
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        conn.close()

    return {
        "status": "success",
        "order_id": order_id,
        "destination_tag": destination_tag,
        "amount_zar": request.amount_zar,
        "quoted_crypto": quoted_crypto,
        "currency": "RLUSD",
        "merchant_address": merchant_addr,
        "expires_at": expiry_time.isoformat(),
        "fx_lock_seconds": settings.FX_LOCK_SECONDS,
        "qr_payload": (
            f"xrpl://pay?to={merchant_addr}"
            f"&amount={quoted_crypto}&dt={destination_tag}"
        ),
        "ussd_shortcode": f"*123*{destination_tag}#",
    }


@router.get("/{order_id}")
def get_order_status(order_id: str):
    conn = sqlite3.connect(settings.DB_FILE)
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            SELECT order_id, phone_number, merchant_address, amount_zar,
                   quoted_crypto, fx_lock_expires_at, status, tx_hash
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
    }


@router.get("/")
def list_orders(limit: int = 20):
    conn = sqlite3.connect(settings.DB_FILE)
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            SELECT order_id, phone_number, merchant_address, amount_zar,
                   quoted_crypto, fx_lock_expires_at, status, tx_hash, created_at
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
        })
    return {"orders": orders}


class RefundRequest(BaseModel):
    order_id: str
    reason: str = "Merchant initiated refund"


@router.post("/refund")
def refund_order(request: RefundRequest):
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

        cursor.execute(
            "UPDATE orders SET status = 'REFUNDED' WHERE order_id = ?",
            (request.order_id,),
        )
        conn.commit()
        logger.info("Order %s marked REFUNDED. Reason: %s", request.order_id, request.reason)
        return {
            "status": "success",
            "order_id": request.order_id,
            "message": f"Order {request.order_id} successfully refunded.",
        }
    finally:
        conn.close()
