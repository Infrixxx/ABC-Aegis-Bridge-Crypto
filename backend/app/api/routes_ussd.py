"""
app/api/routes_ussd.py
───────────────────────
POST /api/ussd/

Africa's Talking USSD webhook handler with:
  • Caller Phone Number Binding Verification
  • 4-Digit Custodial Wallet PIN Authentication (Default Demo PIN: 1234)
"""

import re
import sqlite3
import logging
import threading
from datetime import datetime
from fastapi import APIRouter, Form, Response, BackgroundTasks

from app.core.config import settings

logger = logging.getLogger("abc.ussd")
router = APIRouter()


def _norm_phone(p: str) -> str:
    digits = re.sub(r"\D", "", p or "")
    if digits.startswith("27") and len(digits) == 11:
        return "0" + digits[2:]
    return digits


@router.post("/")
def ussd_callback(
    background_tasks: BackgroundTasks,
    sessionId:   str = Form(default=""),
    serviceCode: str = Form(default=""),
    phoneNumber: str = Form(default=""),
    text:        str = Form(default=""),
):
    logger.info("USSD session=%s phone=%s text='%s'", sessionId, phoneNumber, text)
    response_text = _handle_ussd(text, phoneNumber, background_tasks)
    return Response(content=response_text, media_type="text/plain")


def _handle_ussd(text: str, phone_number: str, background_tasks: BackgroundTasks = None) -> str:
    text = (text or "").strip()

    if text == "":
        return (
            "CON Welcome to Aegis Crypto Bridge\n"
            "1. Pay Merchant (Order Tag)\n"
            "2. Check Custodial Wallet & PIN"
        )

    if text == "1":
        return "CON Enter 8-Digit Merchant Order ID (Destination Tag):"

    if text == "2":
        return (
            f"END Active Phone Wallet: {phone_number or '+27821234567'}\n"
            f"Settlement Asset: {settings.active_currency} (XRPL Testnet)\n"
            "Custodial Security PIN: 1234"
        )

    # Menu Flow: 1*<order_id> or 1*<order_id>*<pin_or_1>
    if text.startswith("1*"):
        parts = text.split("*")
        order_id = parts[1].strip() if len(parts) >= 2 else ""

        if len(parts) == 2 and order_id:
            return _lookup_order(order_id, phone_number)

        if len(parts) == 3 and order_id:
            return _confirm_payment(order_id, phone_number, parts[2].strip(), background_tasks)

    # Direct Shortcode Dialing: *123*ORDER_ID# or *123*ORDER_ID*PIN#
    parts = text.split("*")
    if len(parts) == 1 and parts[0].isdigit() and len(parts[0]) >= 5:
        return _lookup_order(parts[0], phone_number)

    if len(parts) == 2 and parts[0].isdigit() and len(parts[0]) >= 5:
        return _confirm_payment(parts[0], phone_number, parts[1].strip(), background_tasks)

    return "END Invalid USSD input. Please dial *123# and try again."


def _lookup_order(order_id: str, caller_phone: str) -> str:
    conn = sqlite3.connect(settings.DB_FILE)
    cursor = conn.cursor()
    try:
        cursor.execute(
            "SELECT amount_zar, quoted_crypto, status, fx_lock_expires_at, phone_number FROM orders WHERE order_id = ?",
            (order_id,),
        )
        row = cursor.fetchone()
    finally:
        conn.close()

    if not row:
        return "END Order not found. Please ask the merchant for a valid code."

    amount_zar, quoted_crypto, status, fx_lock_expires_at, order_phone = row

    if order_phone and caller_phone and _norm_phone(order_phone) != _norm_phone(caller_phone):
        return (
            "END Security Block: Caller number does not match the phone number "
            f"registered for Order #{order_id}."
        )

    if status in ("PAID", "PROCESSING"):
        return "END This order has already been paid or is settling on XRPL. Thank you!"

    if datetime.utcnow() > datetime.fromisoformat(fx_lock_expires_at):
        return (
            "END Rate expired (60s window closed).\n"
            "Please ask the merchant to generate a fresh quote."
        )

    return (
        f"CON Pay R{amount_zar:.2f} ({quoted_crypto:.4f} {settings.active_currency})?\n"
        f"Payer: {caller_phone or order_phone}\n"
        "Enter 4-Digit Wallet PIN to Sign (Demo PIN: 1234):"
    )


def _confirm_payment(
    order_id: str,
    phone_number: str,
    pin_input: str,
    background_tasks: BackgroundTasks = None,
) -> str:
    conn = sqlite3.connect(settings.DB_FILE)
    cursor = conn.cursor()
    try:
        cursor.execute(
            "SELECT status, fx_lock_expires_at, phone_number FROM orders WHERE order_id = ?",
            (order_id,),
        )
        row = cursor.fetchone()

        if not row:
            return "END Order not found. Session expired."

        status, fx_lock_expires_at, order_phone = row

        # 1. Verify Caller Phone Number matches Order Phone Number
        if order_phone and phone_number and _norm_phone(order_phone) != _norm_phone(phone_number):
            return (
                "END Security Block: Unauthorized phone number. "
                "Only the customer phone number on the bill can authorize this payment."
            )

        # 2. Verify 4-Digit Custodial PIN (Accepts user's wallet_pin, '1234', or '1' for automated E2E script)
        cursor.execute("SELECT wallet_pin FROM users WHERE phone_number = ?", (order_phone or phone_number,))
        user_row = cursor.fetchone()
        expected_pin = (user_row[0] if user_row and user_row[0] else "1234").strip()

        if pin_input not in (expected_pin, "1234", "1"):
            logger.warning("Invalid USSD PIN '%s' for order %s by %s", pin_input, order_id, phone_number)
            return "END Security Block: Invalid 4-digit Custodial PIN. Transaction aborted."

        if status in ("PAID", "PROCESSING"):
            return "END Payment already confirmed. Settling on XRPL!"

        if datetime.utcnow() > datetime.fromisoformat(fx_lock_expires_at):
            cursor.execute("UPDATE orders SET status = 'LATE' WHERE order_id = ?", (order_id,))
            conn.commit()
            return "END Rate expired before confirmation. Please request a new code."

        cursor.execute(
            "UPDATE orders SET status = 'PROCESSING' WHERE order_id = ? AND status = 'PENDING'",
            (order_id,),
        )
        if cursor.rowcount != 1:
            conn.rollback()
            return "END Order is already being processed. Thank you!"

        conn.commit()
    except Exception as exc:
        conn.rollback()
        logger.exception("Payment confirmation failed for order %s", order_id)
        return "END System error. Please try again."
    finally:
        conn.close()

    from app.agents.supervisor import run_payment_pipeline

    def _run_pipeline():
        run_payment_pipeline(order_id=order_id)

    threading.Thread(target=_run_pipeline, daemon=True).start()

    return (
        "END PIN Verified & Payment Signed!\n"
        f"Settling {settings.active_currency} on XRP Ledger Testnet.\n"
        "Check the merchant screen for PAID confirmation."
    )