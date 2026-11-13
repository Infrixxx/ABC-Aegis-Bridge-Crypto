"""
app/agents/security_agent.py
──────────────────────────────
Security Agent — first node in the LangGraph pipeline.
Uses an O(1) in-memory threat cache synced with SQLite `flagged_addresses`.
"""

import time
import sqlite3
import logging
from datetime import datetime, timezone

from app.agents.state import ABCState
from app.core.config import settings

logger = logging.getLogger("abc.agents.security")

_THREAT_CACHE: dict[str, str] = {
    "rFlaggedSanctionedDrainerWallet666": "OFAC / Sanctioned Crypto Drainer",
    "rKnownPhishingExploitAddress999": "Known Phishing & Replay Exploit Actor",
    "rSybilBotnetAggregatorWallet000": "Automated Sybil Botnet Drain Address",
}
_CACHE_LOADED = False


def _check_threat(wallet_address: str, cursor) -> str | None:
    global _CACHE_LOADED
    if not _CACHE_LOADED:
        try:
            cursor.execute("SELECT wallet_address, flag_reason FROM flagged_addresses")
            for addr, reason in cursor.fetchall():
                _THREAT_CACHE[addr] = reason
            _CACHE_LOADED = True
        except Exception:
            pass

    if wallet_address in _THREAT_CACHE:
        return _THREAT_CACHE[wallet_address]

    cursor.execute(
        "SELECT flag_reason FROM flagged_addresses WHERE wallet_address = ?",
        (wallet_address,),
    )
    row = cursor.fetchone()
    if row:
        _THREAT_CACHE[wallet_address] = row[0]
        return row[0]
    return None


def security_node(state: ABCState) -> ABCState:
    t0 = time.perf_counter()
    order_id = state["order_id"]
    merchant_address = state["merchant_address"]

    logger.info(
        "[Security] Checking order=%s merchant=%s",
        order_id, merchant_address,
    )

    conn = sqlite3.connect(settings.DB_FILE)
    cursor = conn.cursor()

    try:
        # ── Check 1: O(1) In-Memory Threat Cache & SQLite Blacklist ───────────
        flag_reason = _check_threat(merchant_address, cursor)
        if flag_reason:
            elapsed_ms = (time.perf_counter() - t0) * 1000
            logger.warning(
                "[Security] THREAT CACHE BLOCK (%.2fms) merchant=%s reason=%s",
                elapsed_ms, merchant_address, flag_reason,
            )
            cursor.execute(
                "UPDATE orders SET status = 'REJECTED' WHERE order_id = ?",
                (order_id,),
            )
            conn.commit()
            return {
                **state,
                "is_flagged": True,
                "fx_expired": False,
                "status": "REJECTED",
                "error": f"Security Agent Threat Block ({elapsed_ms:.2f}ms): {flag_reason}",
            }

        # ── Check 2: Order Existence, Replay Guard & 60s FX Expiry ────────────
        cursor.execute(
            "SELECT fx_lock_expires_at, status FROM orders WHERE order_id = ?",
            (order_id,),
        )
        row = cursor.fetchone()

        if not row:
            logger.warning("[Security] Order %s not found in DB", order_id)
            return {
                **state,
                "is_flagged": False,
                "fx_expired": True,
                "status": "REJECTED",
                "error": f"Order {order_id} not found.",
            }

        fx_lock_expires_at, current_status = row

        if current_status in ("PAID", "REFUNDED", "FAILED"):
            logger.warning(
                "[Security] Order %s already in terminal state '%s' — blocking replay",
                order_id, current_status,
            )
            return {
                **state,
                "is_flagged": False,
                "fx_expired": False,
                "status": "REJECTED",
                "error": f"Order {order_id} already {current_status}. Duplicate settlement blocked.",
            }

        try:
            expires_dt = datetime.fromisoformat(fx_lock_expires_at)
            now_dt = datetime.now(timezone.utc) if expires_dt.tzinfo else datetime.utcnow()
            is_expired = now_dt > expires_dt
        except Exception:
            is_expired = False

        if is_expired:
            logger.warning(
                "[Security] FX lock expired for order=%s (expired=%s)",
                order_id, fx_lock_expires_at,
            )
            cursor.execute(
                "UPDATE orders SET status = 'LATE' WHERE order_id = ?",
                (order_id,),
            )
            conn.commit()
            return {
                **state,
                "is_flagged": False,
                "fx_expired": True,
                "status": "REJECTED",
                "error": "FX rate lock expired. Order must be re-created.",
            }

    finally:
        conn.close()

    elapsed_ms = (time.perf_counter() - t0) * 1000
    logger.info("[Security] Order %s cleared security checks in %.2fms", order_id, elapsed_ms)
    return {
        **state,
        "is_flagged": False,
        "fx_expired": False,
        "status": "PENDING",
        "error": None,
    }


def route_after_security(state: ABCState) -> str:
    if state.get("is_flagged") or state.get("fx_expired") or state.get("status") != "PENDING":
        logger.info(
            "[Security] Routing to END (rejected/blocked): status=%s error=%s",
            state.get("status"), state.get("error"),
        )
        return "reject"
    return "proceed"
