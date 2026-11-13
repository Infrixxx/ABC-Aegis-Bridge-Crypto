"""
app/services/africas_talking_service.py
────────────────────────────────────────
Africa's Talking Telecom Integration Service.

Provides helper methods for:
  - Sending SMS payment confirmation receipts to feature phone users
  - USSD & Voice utilities
"""

import logging
import requests
from app.core.config import settings

logger = logging.getLogger("abc.africastalking")


def send_sms(to_phone: str, message: str) -> dict:
    """
    Sends an SMS receipt via Africa's Talking SMS API.
    Falls back gracefully in sandbox or when API keys are not configured.
    """
    if not settings.AT_API_KEY or settings.AT_USERNAME == "sandbox":
        logger.info(
            "[SMS Simulated] To: %s | Message: %s",
            to_phone, message,
        )
        return {
            "status": "simulated",
            "to": to_phone,
            "message": message,
        }

    url = "https://api.africastalking.com/version1/messaging"
    if settings.AT_USERNAME == "sandbox":
        url = "https://api.sandbox.africastalking.com/version1/messaging"

    headers = {
        "ApiKey": settings.AT_API_KEY,
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
    }
    data = {
        "username": settings.AT_USERNAME,
        "to": to_phone,
        "message": message,
    }

    try:
        response = requests.post(url, headers=headers, data=data, timeout=5)
        response.raise_for_status()
        res_json = response.json()
        logger.info("[SMS Sent] To: %s | Response: %s", to_phone, res_json)
        return res_json
    except Exception as exc:
        logger.warning("[SMS Failed] To: %s | Error: %s", to_phone, exc)
        return {"status": "error", "error": str(exc)}
