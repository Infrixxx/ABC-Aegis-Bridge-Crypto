"""
app/api/routes_checkout.py
───────────────────────────
POST /api/checkout/

Accepts a ZAR amount and phone number, fetches the live FX rate,
locks it for 60 seconds, and returns a unique XRPL Destination Tag
(the "Two Ice Creams" solution) alongside QR and USSD payloads.
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


# ── Request Schema ────────────────────────────────────────────────────────────

class CheckoutRequest(BaseModel):
    phone_number: str
    amount_zar: float
    merchant_address: str = settings.TREASURY_WALLET_ADDRESS  # Optional override


# ── FX Rate Helper ────────────────────────────────────────────────────────────

def get_live_zar_to_usdc_rate() -> float:
    """
    Fetches the live ZAR→USD exchange rate from API Ninjas.
    Falls back to a cached rate if the API key is missing or the call fails.
    """
    if not settings.API_NINJAS_KEY:
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


# ── Destination Tag Generator (Collision-Safe) ────────────────────────────────

def generate_unique_destination_tag(cursor) -> int:
    """
    Generates a unique 32-bit XRPL Destination Tag.
    Retries until a tag is found that does not exist in the orders table,
    eliminating the collision risk of a bare random.randint() call.
    """
    import random
    for _ in range(10):  # 10 attempts is astronomically safe (1-in-99M chance)
        tag = random.randint(100_000, 99_999_999)
        cursor.execute("SELECT 1 FROM orders WHERE order_id = ?", (str(tag),))
        if cursor.fetchone() is None:
            return tag
    raise RuntimeError("Could not generate a unique Destination Tag after 10 attempts.")


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.post("/")
def create_checkout(request: CheckoutRequest):
    """
    Creates a new PENDING order with a 60-second FX-locked USDC quote.

    Returns:
      - order_id / destination_tag  → used by all downstream channels
      - qr_payload                  → scanned by XRPL-compatible wallets
      - ussd_shortcode              → dialled by feature phone users
      - expires_at                  → POS timer countdown target
    """
    conn = sqlite3.connect(settings.DB_FILE)
    cursor = conn.cursor()

    try:
        # 1. Generate a collision-safe Destination Tag
        destination_tag = generate_unique_destination_tag(cursor)
        order_id = str(destination_tag)

        # 2. Lock live FX rate for FX_LOCK_SECONDS
        live_rate = get_live_zar_to_usdc_rate()
        quoted_crypto = round(request.amount_zar * live_rate, 6)  # 6dp for USDC precision
        expiry_time = datetime.utcnow() + timedelta(seconds=settings.FX_LOCK_SECONDS)

        # 3. Upsert user into the custodial identity layer (placeholder wallet for now)
        cursor.execute(
            "INSERT OR IGNORE INTO users (phone_number, custodial_wallet) VALUES (?, ?)",
            (request.phone_number, "rPendingCustodialWallet"),
        )

        # 4. Write the locked order into the Hybrid Ledger
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
                request.merchant_address,
                request.amount_zar,
                quoted_crypto,
                expiry_time.isoformat(),
            ),
        )
        conn.commit()
        logger.info("Order %s created: R%.2f → %.6f USDC (expires %s)", order_id, request.amount_zar, quoted_crypto, expiry_time.isoformat())

    except Exception as exc:
        conn.rollback()
        logger.exception("Checkout creation failed")
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        conn.close()

    # 5. Return unified payload for POS, QR renderer, and USSD menu builder
    return {
        "status": "success",
        "order_id": order_id,
        "destination_tag": destination_tag,
        "amount_zar": request.amount_zar,
        "quoted_crypto": quoted_crypto,
        "currency": "USDC",
        "merchant_address": request.merchant_address,
        "expires_at": expiry_time.isoformat(),
        "fx_lock_seconds": settings.FX_LOCK_SECONDS,
        "qr_payload": (
            f"xrpl://pay?to={request.merchant_address}"
            f"&amount={quoted_crypto}&dt={destination_tag}"
        ),
        "ussd_shortcode": f"*123*{destination_tag}#",
    }


# ── Order Status Polling Endpoint (for React POS) ─────────────────────────────

@router.get("/{order_id}")
def get_order_status(order_id: str):
    """
    Polls the status of an existing order.
    The React POS calls this every 2 seconds to show the PAID confirmation.
    """
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
        "order_id":          row[0],
        "phone_number":      row[1],
        "merchant_address":  row[2],
        "amount_zar":        row[3],
        "quoted_crypto":     row[4],
        "fx_lock_expires_at": row[5],
        "status":            row[6],
        "tx_hash":           row[7],
    }
