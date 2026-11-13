"""
app/api/routes_ussd.py
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
POST /api/ussd/

Africa's Talking USSD webhook handler.
"""

import sqlite3
import logging
import threading
from datetime import datetime
from fastapi import APIRouter, Form, Response, BackgroundTasks

from app.core.config import settings

logger = logging.getLogger("abc.ussd")
router = APIRouter()


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
            "1. Pay Merchant\n"
            "2. Check Balance"
        )

    if text == "1":
        return "CON Enter Merchant Order ID (Destination Tag):"

    if text == "2":
        return "END Custodial Account Active. Visit POS terminal for live XRPL balance."

    # Standard Menu: 1*<order_id> or 1*<order_id>*1
    if text.startswith("1*"):
        parts = text.split("*")
        order_id = parts[1].strip() if len(parts) >= 2 else ""

        if len(parts) == 2 and order_id:
            return _lookup_order(order_id)

        if len(parts) == 3 and parts[2].strip() == "1" and order_id:
            return _confirm_payment(order_id, phone_number, background_tasks)

    # Direct Shortcode Dialing: e.g. dialed *123*ORDER_ID# directly
    parts = text.split("*")
    if len(parts) == 1 and parts[0].isdigit() and len(parts[0]) >= 5:
        # User dialed direct order ID
        return _lookup_order(parts[0])

    if len(parts) == 2 and parts[0].isdigit() and parts[1] == "1":
        # User confirmed direct order payment
        return _confirm_payment(parts[0], phone_number, background_tasks)

    return "END Invalid input. Please try again."


def _lookup_order(order_id: str) -> str:
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

    if status in ("PAID", "PROCESSING"):
        return "END This order has already been paid or is currently settling. Thank you!"

    if datetime.utcnow() > datetime.fromisoformat(fx_lock_expires_at):
        return (
            "END Rate expired. This quote was only valid for 60 seconds.\n"
            "Please ask the merchant to generate a new code."
        )

    return (
        f"CON Pay R{amount_zar:.2f} ({quoted_crypto:.4f} {settings.active_currency})?\n"
        "1. Confirm & Sign Transaction"
    )


def _confirm_payment(
    order_id: str,
    phone_number: str,
    background_tasks: BackgroundTasks = None,
) -> str:
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

        if status in ("PAID", "PROCESSING"):
            return "END Payment already confirmed. All good!"

        if datetime.utcnow() > datetime.fromisoformat(fx_lock_expires_at):
            cursor.execute(
                "UPDATE orders SET status = 'LATE' WHERE order_id = ?",
                (order_id,),
            )
            conn.commit()
            return (
                "END Rate expired before confirmation.\n"
                "Please ask the merchant for a new code."
            )

        # Atomic status update: only update if still PENDING
        cursor.execute(
            "UPDATE orders SET status = 'PROCESSING' WHERE order_id = ? AND status = 'PENDING'",
            (order_id,),
        )
        if cursor.rowcount != 1:
            conn.rollback()
            return "END Order is already being processed or has been paid. Thank you!"

        conn.commit()
        logger.info(
            "Order %s atomically locked to PROCESSING by %s â€” dispatching to LangGraph pipeline",
            order_id, phone_number,
        )

    except Exception as exc:
        conn.rollback()
        logger.exception("Payment confirmation failed for order %s", order_id)
        return "END System error. Please try again."
    finally:
        conn.close()

    from app.agents.supervisor import run_payment_pipeline

    def _run_pipeline():
        result = run_payment_pipeline(order_id=order_id)
        logger.info(
            "Agent pipeline result: order=%s status=%s tx=%s",
            order_id, result.get("status"), result.get("tx_hash"),
        )

    thread = threading.Thread(target=_run_pipeline, daemon=True)
    thread.start()

    return (
        "END Payment Confirmed!\n"
        "Your payment is being settled on the XRP Ledger.\n"
        "Check your merchant screen for the confirmation."
    )
