"""
app/services/ledger_watcher.py
───────────────────────────────
Background XRPL Ledger Watcher (`AccountTx` poller).
Checks SQLite first and only queries the XRPL Testnet RPC when there are
active PENDING or PROCESSING orders, preventing RPC rate-limiting.
Matches incoming transfers by DestinationTag and marks orders:
  • PAID      (delivered_amount >= quoted_crypto)
  • UNDERPAID (delivered_amount < quoted_crypto)
  • LATE      (payment arrived after the 60s FX lock window expired)
"""

import logging
import sqlite3
import threading
import time
from datetime import datetime, timezone
from xrpl.utils import drops_to_xrp

from app.core.config import settings
from app.services import xrpl_service

logger = logging.getLogger("abc.watcher")
_WATCHER_STARTED = False


def _extract_delivered_xrp_or_iou(meta: dict, tx: dict) -> float:
    delivered = meta.get("delivered_amount") or tx.get("Amount")
    if isinstance(delivered, str) and delivered.isdigit():
        return float(drops_to_xrp(delivered))
    if isinstance(delivered, dict) and "value" in delivered:
        return float(delivered["value"])
    return 0.0


def poll_ledger_once() -> None:
    # Fast local check: only hit XRPL network if at least one order is waiting
    conn = sqlite3.connect(settings.DB_FILE)
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT 1 FROM orders WHERE status IN ('PENDING', 'PROCESSING') LIMIT 1")
        has_open_orders = cursor.fetchone() is not None
    except Exception:
        has_open_orders = False
    finally:
        conn.close()

    if not has_open_orders:
        return

    tx_list = xrpl_service.fetch_recent_merchant_txs(limit=15)
    if not tx_list:
        return

    conn = sqlite3.connect(settings.DB_FILE)
    cursor = conn.cursor()
    try:
        for item in tx_list:
            tx = item.get("tx") or item.get("tx_json") or {}
            meta = item.get("meta") or {}
            if meta.get("TransactionResult") != "tesSUCCESS":
                continue

            tx_type = tx.get("TransactionType")
            if tx_type not in ("Payment", "PaymentChannelClaim"):
                continue

            dest_tag = tx.get("DestinationTag")
            if not dest_tag:
                continue

            order_id = str(dest_tag)
            tx_hash = tx.get("hash") or item.get("hash")
            delivered_val = _extract_delivered_xrp_or_iou(meta, tx)

            cursor.execute(
                "SELECT quoted_crypto, fx_lock_expires_at, status FROM orders WHERE order_id = ?",
                (order_id,),
            )
            row = cursor.fetchone()
            if not row:
                continue

            quoted_crypto, fx_lock_expires_at, current_status = row
            if current_status in ("PAID", "REFUNDED", "UNDERPAID"):
                continue

            if delivered_val > 0 and delivered_val < float(quoted_crypto) * 0.98:
                cursor.execute(
                    "UPDATE orders SET status = 'UNDERPAID', tx_hash = ? WHERE order_id = ?",
                    (tx_hash, order_id),
                )
                conn.commit()
                logger.warning(
                    "[Watcher] Order %s marked UNDERPAID (delivered=%.4f < quoted=%.4f) tx=%s",
                    order_id, delivered_val, float(quoted_crypto), tx_hash,
                )
                continue

            try:
                expires_dt = datetime.fromisoformat(fx_lock_expires_at)
                now_dt = datetime.now(timezone.utc) if expires_dt.tzinfo else datetime.utcnow()
                is_late = (now_dt > expires_dt) and (current_status == "PENDING")
            except Exception:
                is_late = False

            new_status = "LATE" if is_late else "PAID"
            cursor.execute(
                "UPDATE orders SET status = ?, tx_hash = ? WHERE order_id = ? AND status IN ('PENDING', 'PROCESSING')",
                (new_status, tx_hash, order_id),
            )
            if cursor.rowcount == 1:
                conn.commit()
                logger.info("[Watcher] Auto-matched on-chain tx=%s -> Order %s (%s)", tx_hash, order_id, new_status)
    except Exception as exc:
        logger.debug("[Watcher] Poll cycle error: %s", exc)
    finally:
        conn.close()


def start_ledger_watcher(interval_sec: float = 2.5) -> None:
    global _WATCHER_STARTED
    if _WATCHER_STARTED:
        return
    _WATCHER_STARTED = True

    def _loop():
        logger.info("[Watcher] XRPL AccountTx Ledger Watcher started (smart-polling every %.1fs)", interval_sec)
        while True:
            poll_ledger_once()
            time.sleep(interval_sec)

    t = threading.Thread(target=_loop, daemon=True, name="xrpl-ledger-watcher")
    t.start()