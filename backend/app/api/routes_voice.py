"""
app/api/routes_voice.py
────────────────────────
POST /api/voice/

Africa's Talking IVR (Interactive Voice Response) webhook.
Provides an audio-guided payment flow for visually impaired and low-literacy users.

Returns Africa's Talking XML (<Response><Say>...</Say></Response>) prompts:
  1. Initial call: Prompts user to dial their Order ID (Destination Tag).
  2. Order lookup: Reads out the Rand amount and RLUSD quote aloud.
  3. Keypad press "1": Confirms payment and triggers the LangGraph agent pipeline.
"""

import sqlite3
import logging
import threading
from datetime import datetime
from fastapi import APIRouter, Form, Response

from app.core.config import settings
from app.agents.supervisor import run_payment_pipeline

logger = logging.getLogger("abc.voice")
router = APIRouter()


@router.post("/")
def voice_callback(
    sessionId: str = Form(default=""),
    isActive: str = Form(default="1"),
    callerNumber: str = Form(default=""),
    dtmfDigits: str = Form(default=""),
):
    """
    Africa's Talking IVR webhook handler.
    Receives caller number, session status, and DTMF (touch-tone) keypad digits.
    """
    logger.info("IVR voice session=%s caller=%s dtmf='%s'", sessionId, callerNumber, dtmfDigits)

    if isActive != "1":
        # Call has ended
        return Response(content="<Response/>", media_type="application/xml")

    # Step 1: Initial greeting — ask for the Order ID
    if not dtmfDigits:
        xml = (
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<Response>\n'
            '    <GetDigits finishOnKey="#" timeout="25" numDigits="8">\n'
            '        <Say>Welcome to Aegis Crypto Bridge audio checkout. '
            'Please dial your eight-digit merchant order number, followed by the pound key.</Say>\n'
            '    </GetDigits>\n'
            '    <Say>We did not receive your input. Goodbye.</Say>\n'
            '</Response>'
        )
        return Response(content=xml, media_type="application/xml")

    # Step 2: User entered order number or confirmation
    # If dtmfDigits is e.g. "79477624" (order ID)
    digits = dtmfDigits.strip("#")

    # Check if this is a confirmation digit (1) after order lookup in session
    # In AT IVR, multi-turn flows pass dtmfDigits. We handle order ID lookup:
    conn = sqlite3.connect(settings.DB_FILE)
    cursor = conn.cursor()
    try:
        cursor.execute(
            "SELECT order_id, amount_zar, quoted_crypto, status, fx_lock_expires_at "
            "FROM orders WHERE order_id = ?",
            (digits,),
        )
        row = cursor.fetchone()
    finally:
        conn.close()

    if row:
        order_id, amount_zar, quoted_crypto, status, fx_lock_expires_at = row

        if status == "PAID":
            xml = (
                '<?xml version="1.0" encoding="UTF-8"?>\n'
                '<Response>\n'
                '    <Say>This order has already been paid. Thank you. Goodbye.</Say>\n'
                '</Response>'
            )
            return Response(content=xml, media_type="application/xml")

        if datetime.utcnow() > datetime.fromisoformat(fx_lock_expires_at):
            xml = (
                '<?xml version="1.0" encoding="UTF-8"?>\n'
                '<Response>\n'
                '    <Say>This price quote has expired. Please ask the merchant for a new order code. Goodbye.</Say>\n'
                '</Response>'
            )
            return Response(content=xml, media_type="application/xml")

        # Order found — prompt to press 1 to confirm payment
        xml = (
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<Response>\n'
            f'    <GetDigits finishOnKey="#" timeout="20" numDigits="1" callbackUrl="/api/voice/confirm?order_id={order_id}">\n'
            f'        <Say>Order {order_id} found. Total amount is {int(amount_zar)} Rand, '
            f'quoted at {quoted_crypto:.2f} RLUSD. To authorize payment, press 1 now.</Say>\n'
            '    </GetDigits>\n'
            '    <Say>No confirmation received. Transaction cancelled. Goodbye.</Say>\n'
            '</Response>'
        )
        return Response(content=xml, media_type="application/xml")

    # Fallback for unrecognized digits
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<Response>\n'
        '    <Say>Invalid order number or order not found. Please verify with the merchant and call back. Goodbye.</Say>\n'
        '</Response>'
    )
    return Response(content=xml, media_type="application/xml")


@router.post("/confirm")
def voice_confirm(
    order_id: str,
    dtmfDigits: str = Form(default=""),
    callerNumber: str = Form(default=""),
):
    """Callback for confirming payment via keypad press 1."""
    if dtmfDigits == "1":
        conn = sqlite3.connect(settings.DB_FILE)
        cursor = conn.cursor()
        try:
            cursor.execute(
                "UPDATE orders SET status = 'PAID' WHERE order_id = ? AND status = 'PENDING'",
                (order_id,),
            )
            conn.commit()
        finally:
            conn.close()

        # Fire pipeline asynchronously
        def _run_pipeline():
            run_payment_pipeline(order_id=order_id)

        thread = threading.Thread(target=_run_pipeline, daemon=True)
        thread.start()

        xml = (
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<Response>\n'
            '    <Say>Thank you. Your payment is confirmed and is now settling on the XRP Ledger. Goodbye.</Say>\n'
            '</Response>'
        )
    else:
        xml = (
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<Response>\n'
            '    <Say>Payment cancelled. Goodbye.</Say>\n'
            '</Response>'
        )

    return Response(content=xml, media_type="application/xml")
