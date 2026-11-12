"""
app/api/routes_ussd.py
───────────────────────
POST /api/ussd/

Africa's Talking USSD webhook handler.
Processes the user's offline menu navigation and, on confirmation,
transitions the order from PENDING → PAID (which Phase 3 agents watch).

USSD Menu Flow:
  Dial *120*ABC#
  ├─ 1. Pay Merchant
  │   └─ Enter Order ID (Destination Tag)
  │       └─ Confirm payment details
  │           └─ ✅ Payment authorised → triggers XRPL settlement
  └─ 2. Check Balance (stub — Phase 3)

Security notes:
  - FX lock expiry is enforced: stale orders are rejected with a clear message.
  - Idempotency: already-PAID orders cannot be reconfirmed.
  - Africa's Talking request signature verification should be added before
    production (requires the AT webhook secret from the dashboard).
"""

import sqlite3
import logging
from datetime import datetime
from fastapi import APIRouter, Form, Response

from app.core.config import settings

logger = logging.getLogger("abc.ussd")
router = APIRouter()


@router.post("/")
def ussd_callback(
    sessionId:   str = Form(default=""),
    serviceCode: str = Form(default=""),
    phoneNumber: str = Form(default=""),
    text:        str = Form(default=""),
):
    """
    Africa's Talking sends USSD inputs as standard Form Data.
    The 'text' field accumulates the user's input, separated by asterisks.

    Examples:
      text=""        → User just dialled the shortcode (show main menu)
      text="1"       → User pressed 1 (Pay Merchant)
      text="1*79477" → User entered order ID 79477
      text="1*79477*1" → User confirmed payment
    """
    logger.info("USSD session=%s phone=%s text='%s'", sessionId, phoneNumber, text)
    response_text = _handle_ussd(text, phoneNumber)

    # Africa's Talking requires plain text starting with CON (keep session open)
    # or END (terminate the session)
    return Response(content=response_text, media_type="text/plain")


def _handle_ussd(text: str, phone_number: str) -> str:
    """Pure-function USSD state machine — easy to unit test."""

    # ── Level 0: Main Menu ────────────────────────────────────────────────────
    if text == "":
        return (
            "CON Welcome to Aegis Crypto Bridge\n"
            "1. Pay Merchant\n"
            "2. Check Balance"
        )

    # ── Level 1: User chose an option ─────────────────────────────────────────
    if text == "1":
        return "CON Enter Merchant Order ID (Destination Tag):"

    if text == "2":
        # Stub — Phase 3 will query custodial wallet balance via xrpl-py
        return "END Balance check coming soon. Visit abc.app for details."

    # ── Level 2+: Payment flow ────────────────────────────────────────────────
    if text.startswith("1*"):
        parts = text.split("*")

        # ── Level 2: User entered the Order ID → show payment details ─────────
        if len(parts) == 2:
            order_id = parts[1]
            return _lookup_order(order_id)

        # ── Level 3: User confirmed → trigger settlement ───────────────────────
        if len(parts) == 3 and parts[2] == "1":
            order_id = parts[1]
            return _confirm_payment(order_id, phone_number)

    return "END Invalid input. Please try again."


def _lookup_order(order_id: str) -> str:
    """Fetches order details and validates the FX lock is still active."""
    conn = sqlite3.connect(settings.DB_FILE)
    cursor = conn.cursor()
    try:
        cursor.execute(
            "SELECT amount_zar, quoted_crypto, status, fx_lock_expires_at FROM orders WHERE order_id = ?",
            (order_id,),
        )
        row = cursor.fetchone()
    finally:
        conn.close()

    if not row:
        return "END Order not found. Please ask the merchant for a new code."

    amount_zar, quoted_crypto, status, fx_lock_expires_at = row

    # Guard: already paid
    if status == "PAID":
        return "END This order has already been paid. Thank you!"

    # Guard: FX lock expired (the 60-second window has passed)
    if datetime.utcnow() > datetime.fromisoformat(fx_lock_expires_at):
        return (
            "END Rate expired. This quote was only valid for 60 seconds.\n"
            "Please ask the merchant to generate a new code."
        )

    return (
        f"CON Pay R{amount_zar:.2f} ({quoted_crypto:.4f} USDC)?\n"
        "1. Confirm & Sign Transaction"
    )


def _confirm_payment(order_id: str, phone_number: str) -> str:
    """
    Validates the order one final time and marks it PAID.
    Phase 3: This is the trigger point for the LangGraph Treasury Agent.
    """
    conn = sqlite3.connect(settings.DB_FILE)
    cursor = conn.cursor()
    try:
        cursor.execute(
            "SELECT status, fx_lock_expires_at FROM orders WHERE order_id = ?",
            (order_id,),
        )
        row = cursor.fetchone()

        if not row:
            return "END Order not found. Session expired."

        status, fx_lock_expires_at = row

        # Idempotency guard: already PAID (e.g. AT retried the webhook)
        if status == "PAID":
            return "END Payment already confirmed. All good!"

        # Final FX lock check before we write to the ledger
        if datetime.utcnow() > datetime.fromisoformat(fx_lock_expires_at):
            return (
                "END Rate expired before confirmation.\n"
                "Please ask the merchant for a new code."
            )

        # ✅ All checks passed — mark as PAID in the Hybrid Ledger
        cursor.execute(
            "UPDATE orders SET status = 'PAID' WHERE order_id = ?",
            (order_id,),
        )
        conn.commit()
        logger.info("Order %s confirmed PAID by %s — awaiting XRPL settlement", order_id, phone_number)

    except Exception as exc:
        conn.rollback()
        logger.exception("Payment confirmation failed for order %s", order_id)
        return f"END System error. Please try again. ({exc})"
    finally:
        conn.close()

    return (
        "END Payment Confirmed!\n"
        "Your USDC is being settled on-chain.\n"
        "You will receive an SMS confirmation shortly."
    )
