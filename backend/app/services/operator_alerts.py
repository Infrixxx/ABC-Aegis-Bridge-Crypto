"""
app/services/operator_alerts.py
────────────────────────────────
SMS alerts to the human operator who owns a machine (machine_budgets.operator_phone).
"""

import logging
import sqlite3
from typing import Optional

from app.core.config import settings

logger = logging.getLogger("abc.alerts")


def operator_phone_for_channel(channel_id: Optional[str]) -> Optional[str]:
    if not channel_id:
        return None
    conn = sqlite3.connect(settings.DB_FILE)
    try:
        row = conn.execute(
            "SELECT operator_phone FROM machine_budgets WHERE channel_id = ?", (channel_id,)
        ).fetchone()
    except Exception:
        return None
    finally:
        conn.close()
    return row[0] if row and row[0] else None


def alert_operator(channel_id: Optional[str], message: str) -> None:
    """Best-effort SMS to the operator. Never raises."""
    phone = operator_phone_for_channel(channel_id)
    if not phone:
        logger.warning("[Alert] No operator_phone for channel %s; alert not sent: %s", channel_id, message)
        return
    try:
        from app.services.africas_talking_service import send_sms
        send_sms(to_phone=phone, message=message)
    except Exception as exc:
        logger.warning("[Alert] SMS to operator failed: %s", exc)