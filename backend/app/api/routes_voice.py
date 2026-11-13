"""
app/api/routes_voice.py
────────────────────────
POST /api/voice/

Africa's Talking IVR (Interactive Voice Response) webhook.
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
    logger.info("IVR voice session=%s caller=%s dtmf='%s'", sessionId, callerNumber, dtmfDigits)

    if isActive != "1":
        return Response(content="<Response/>", media_type="application/xml")

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

    digits = dtmfDigits.strip("#")

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

        if status in ("PAID", "PROCESSING"):
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
    if dtmfDigits == "1":
        conn = sqlite3.connect(settings.DB_FILE)
        cursor = conn.cursor()
        updated = False
        try:
            cursor.execute(
                "UPDATE orders SET status = 'PROCESSING' WHERE order_id = ? AND status = 'PENDING'",
                (order_id,),
            )
            if cursor.rowcount == 1:
                updated = True
                conn.commit()
            else:
                conn.rollback()
        finally:
            conn.close()

        if updated:
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
                '    <Say>This order is already being processed or has already been settled. Goodbye.</Say>\n'
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
