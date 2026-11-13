"""
app/services/xrpl_service.py
─────────────────────────────
All XRP Ledger interactions for the ABC engine.
"""

import logging
import binascii
import hashlib
import sqlite3
from datetime import datetime

from xrpl.clients import JsonRpcClient
from xrpl.wallet import Wallet
from xrpl.models.transactions import (
    Payment,
    PaymentChannelCreate,
    PaymentChannelFund,
)
from xrpl.models.requests import AccountChannels, AccountInfo
from xrpl.transaction import submit_and_wait
from xrpl.utils import xrp_to_drops, drops_to_xrp
from xrpl.models.amounts import IssuedCurrencyAmount
from xrpl.models.transactions import Memo

from app.core.config import settings

logger = logging.getLogger("abc.xrpl")


def _is_real_seed_configured() -> bool:
    seed = (settings.TREASURY_SEED or "").strip()
    return bool(seed) and not seed.startswith("sXXX") and seed != "your_treasury_seed_here"


def _get_client() -> JsonRpcClient:
    return JsonRpcClient(settings.XRPL_JSON_RPC_URL)


def _get_treasury_wallet() -> Wallet:
    if not _is_real_seed_configured():
        raise ValueError(
            "TREASURY_SEED is not configured with a real XRPL Testnet seed."
        )
    return Wallet.from_seed(settings.TREASURY_SEED.strip())


def _resolve_destination(treasury_address: str, requested_destination: str) -> str:
    """
    Guarantees Account != Destination on XRPL to prevent temREDUNDANT and temDST_IS_SRC.
    """
    dest = (requested_destination or "").strip()
    if not dest or dest == treasury_address or dest.startswith("rXXX"):
        fallback = settings.MERCHANT_WALLET_ADDRESS
        if fallback == treasury_address:
            return "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe"
        return fallback
    return dest


def _hex_encode(text: str) -> str:
    return binascii.hexlify(text.encode()).decode().upper()


def _build_payment_amount(amount_rlusd: float):
    clean_amount = round(float(amount_rlusd), 6)
    if settings.RLUSD_ISSUER and not settings.RLUSD_ISSUER.startswith("rXXX"):
        return IssuedCurrencyAmount(
            currency=settings.RLUSD_CURRENCY,
            issuer=settings.RLUSD_ISSUER.strip(),
            value=str(clean_amount),
        )
    logger.warning(
        "RLUSD_ISSUER not set — sending %.6f XRP on Testnet instead.",
        clean_amount,
    )
    return xrp_to_drops(clean_amount)


def send_payment(
    order_id: str,
    merchant_address: str,
    amount_rlusd: float,
    destination_tag: int,
) -> dict:
    # Graceful fallback if .env still has placeholder seed during local testing
    if not _is_real_seed_configured():
        sim_hash = hashlib.sha256(f"{order_id}:{datetime.utcnow().isoformat()}".encode()).hexdigest().upper()
        logger.warning(
            "[XRPL Simulated] Real TREASURY_SEED not set. Generated demo hash=%s", sim_hash
        )
        return {
            "tx_hash": sim_hash,
            "explorer_url": f"{settings.XRPL_EXPLORER_BASE}/{sim_hash}",
            "engine_result": "tesSUCCESS",
        }

    client = _get_client()
    treasury = _get_treasury_wallet()
    destination = _resolve_destination(treasury.address, merchant_address)

    tx = Payment(
        account=treasury.address,
        destination=destination,
        amount=_build_payment_amount(amount_rlusd),
        destination_tag=int(destination_tag),
        memos=[
            Memo(
                memo_data=_hex_encode(str(order_id)),
                memo_type=_hex_encode("ABC/order_id"),
                memo_format=_hex_encode("text/plain"),
            )
        ],
    )

    logger.info(
        "Submitting XRPL payment: order=%s amount=%.6f from=%s to=%s tag=%d",
        order_id, amount_rlusd, treasury.address, destination, destination_tag,
    )

    response = submit_and_wait(tx, client, treasury)
    result = response.result

    if result.get("meta", {}).get("TransactionResult") != "tesSUCCESS":
        engine_result = result.get("meta", {}).get("TransactionResult", "UNKNOWN")
        raise RuntimeError(
            f"XRPL payment failed for order {order_id}: {engine_result}"
        )

    tx_hash = result["hash"]
    explorer_url = f"{settings.XRPL_EXPLORER_BASE}/{tx_hash}"

    logger.info("✅ Payment settled on XRPL: order=%s tx_hash=%s", order_id, tx_hash)
    return {
        "tx_hash": tx_hash,
        "explorer_url": explorer_url,
        "engine_result": "tesSUCCESS",
    }


def create_payment_channel(
    device_id: str,
    destination_address: str,
    max_budget_xrp: float,
    settle_delay_seconds: int = 86400,
) -> dict:
    if not _is_real_seed_configured():
        sim_channel = hashlib.sha256(f"chan:{device_id}".encode()).hexdigest().upper()
        sim_tx = hashlib.sha256(f"tx:{device_id}:{datetime.utcnow().isoformat()}".encode()).hexdigest().upper()
        return {
            "channel_id": sim_channel,
            "tx_hash": sim_tx,
            "max_budget_xrp": max_budget_xrp,
            "device_id": device_id,
        }

    client = _get_client()
    treasury = _get_treasury_wallet()
    destination = _resolve_destination(treasury.address, destination_address)

    tx = PaymentChannelCreate(
        account=treasury.address,
        destination=destination,
        amount=xrp_to_drops(round(float(max_budget_xrp), 6)),
        settle_delay=settle_delay_seconds,
        public_key=treasury.public_key,
    )

    logger.info(
        "Creating Payment Channel: device=%s budget=%.4f XRP to=%s",
        device_id, max_budget_xrp, destination,
    )

    response = submit_and_wait(tx, client, treasury)
    result = response.result

    if result.get("meta", {}).get("TransactionResult") != "tesSUCCESS":
        raise RuntimeError(
            f"PaymentChannelCreate failed for device {device_id}: "
            f"{result.get('meta', {}).get('TransactionResult')}"
        )

    channel_id = None
    for node in result.get("meta", {}).get("AffectedNodes", []):
        created = node.get("CreatedNode", {})
        if created.get("LedgerEntryType") == "PayChannel":
            channel_id = created.get("LedgerIndex")
            break

    logger.info(
        "✅ Payment Channel created: device=%s channel_id=%s",
        device_id, channel_id,
    )
    return {
        "channel_id": channel_id,
        "tx_hash": result["hash"],
        "max_budget_xrp": max_budget_xrp,
        "device_id": device_id,
    }


def get_channel_balance(channel_id: str) -> dict:
    if not _is_real_seed_configured():
        conn = sqlite3.connect(settings.DB_FILE)
        cursor = conn.cursor()
        try:
            cursor.execute(
                "SELECT max_budget_cap, current_spent FROM machine_budgets WHERE channel_id = ?",
                (channel_id,),
            )
            row = cursor.fetchone()
            if row:
                cap, spent = float(row[0] or 0), float(row[1] or 0)
                return {
                    "channel_id": channel_id,
                    "amount_xrp": cap,
                    "spent_xrp": spent,
                    "remaining_xrp": max(0.0, cap - spent),
                }
        finally:
            conn.close()

    client = _get_client()
    treasury = _get_treasury_wallet()

    request = AccountChannels(account=treasury.address)
    response = client.request(request)
    channels = response.result.get("channels", [])

    for ch in channels:
        if ch.get("channel_id") == channel_id:
            amount_drops = int(ch.get("amount", 0))
            balance_drops = int(ch.get("balance", 0))
            remaining_drops = amount_drops - balance_drops
            return {
                "channel_id": channel_id,
                "amount_xrp": float(drops_to_xrp(str(amount_drops))),
                "spent_xrp": float(drops_to_xrp(str(balance_drops))),
                "remaining_xrp": float(drops_to_xrp(str(remaining_drops))),
            }

    raise ValueError(f"Payment Channel {channel_id} not found on ledger.")


def fund_payment_channel(channel_id: str, top_up_xrp: float) -> dict:
    if not _is_real_seed_configured():
        sim_tx = hashlib.sha256(f"fund:{channel_id}:{datetime.utcnow().isoformat()}".encode()).hexdigest().upper()
        return {
            "channel_id": channel_id,
            "tx_hash": sim_tx,
            "top_up_xrp": top_up_xrp,
        }

    client = _get_client()
    treasury = _get_treasury_wallet()

    tx = PaymentChannelFund(
        account=treasury.address,
        channel=channel_id,
        amount=xrp_to_drops(round(float(top_up_xrp), 6)),
    )

    response = submit_and_wait(tx, client, treasury)
    result = response.result

    if result.get("meta", {}).get("TransactionResult") != "tesSUCCESS":
        raise RuntimeError(
            f"PaymentChannelFund failed: "
            f"{result.get('meta', {}).get('TransactionResult')}"
        )

    return {
        "channel_id": channel_id,
        "tx_hash": result["hash"],
        "top_up_xrp": top_up_xrp,
    }


def get_wallet_info(address: str) -> dict:
    client = _get_client()
    response = client.request(AccountInfo(account=address))
    data = response.result.get("account_data", {})
    return {
        "address": address,
        "balance_xrp": float(drops_to_xrp(data.get("Balance", "0"))),
        "sequence": data.get("Sequence"),
    }
