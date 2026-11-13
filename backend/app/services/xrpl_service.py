"""
app/services/xrpl_service.py
─────────────────────────────
All XRP Ledger interactions for the ABC engine:
  • Direct Payment settlement (RLUSD IOU or native XRP)
  • On-ledger PaymentChannelCreate, PaymentChannelFund, and cryptographic PaymentChannelClaim (CLM\0)
  • On-chain Merchant Refund (reverse Payment with Memo)
  • AccountTx ledger polling for automatic order matching (PAID / UNDERPAID / LATE)
"""

import logging
import binascii
import hashlib
import sqlite3
from datetime import datetime, timezone

from xrpl.clients import JsonRpcClient
from xrpl.wallet import Wallet
from xrpl.core import keypairs
from xrpl.models.transactions import (
    Payment,
    PaymentChannelCreate,
    PaymentChannelFund,
    PaymentChannelClaim,
    TrustSet,
    Memo,
)
from xrpl.models.requests import AccountChannels, AccountInfo, AccountTx
from xrpl.transaction import submit_and_wait
from xrpl.utils import xrp_to_drops, drops_to_xrp
from xrpl.models.amounts import IssuedCurrencyAmount

from app.core.config import settings

logger = logging.getLogger("abc.xrpl")


class LedgerCapExceededError(RuntimeError):
    """Raised when the XRP Ledger itself rejects an over-budget PaymentChannelClaim."""
    def __init__(self, engine_result: str, message: str):
        super().__init__(message)
        self.engine_result = engine_result


def _is_real_seed_configured(seed_val: str | None = None) -> bool:
    seed = (seed_val if seed_val is not None else settings.TREASURY_SEED or "").strip()
    return bool(seed) and not seed.startswith("sXXX") and seed != "your_treasury_seed_here"


def _get_client() -> JsonRpcClient:
    return JsonRpcClient(settings.XRPL_JSON_RPC_URL)


def _get_treasury_wallet() -> Wallet:
    if not _is_real_seed_configured(settings.TREASURY_SEED):
        raise ValueError("TREASURY_SEED is not configured with a valid XRPL Testnet seed.")
    return Wallet.from_seed(settings.TREASURY_SEED.strip())


def _get_merchant_wallet() -> Wallet:
    if _is_real_seed_configured(settings.MERCHANT_SEED):
        return Wallet.from_seed(settings.MERCHANT_SEED.strip())
    raise ValueError("MERCHANT_SEED is not configured in .env for merchant-signed operations.")


def _resolve_destination(treasury_address: str, requested_destination: str) -> str:
    dest = (requested_destination or "").strip()
    if not dest or dest == treasury_address or dest.startswith("rXXX"):
        if _is_real_seed_configured(settings.MERCHANT_SEED):
            return _get_merchant_wallet().address
        fallback = settings.MERCHANT_WALLET_ADDRESS
        if fallback == treasury_address:
            return "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe"
        return fallback
    return dest


def _hex_encode(text: str) -> str:
    return binascii.hexlify(text.encode()).decode().upper()


def _build_payment_amount(amount_crypto: float):
    clean_amount = round(float(amount_crypto), 6)
    if settings.is_rlusd_enabled:
        return IssuedCurrencyAmount(
            currency=settings.RLUSD_CURRENCY,
            issuer=settings.RLUSD_ISSUER.strip(),
            value=str(clean_amount),
        )
    return xrp_to_drops(clean_amount)


def send_payment(
    order_id: str,
    merchant_address: str,
    amount_rlusd: float,
    destination_tag: int,
) -> dict:
    if not _is_real_seed_configured():
        if settings.ALLOW_SIMULATION:
            sim_hash = hashlib.sha256(f"{order_id}:{datetime.now(timezone.utc).isoformat()}".encode()).hexdigest().upper()
            return {
                "tx_hash": sim_hash,
                "explorer_url": f"{settings.XRPL_EXPLORER_BASE}/{sim_hash}",
                "engine_result": "tesSUCCESS (SIMULATED)",
            }
        raise RuntimeError("TREASURY_SEED not configured and ALLOW_SIMULATION is disabled.")

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
        "Submitting XRPL payment: order=%s amount=%.6f (%s) from=%s to=%s tag=%d",
        order_id, amount_rlusd, settings.active_currency, treasury.address, destination, destination_tag,
    )

    response = submit_and_wait(tx, client, treasury)
    result = response.result
    engine_result = result.get("meta", {}).get("TransactionResult", "UNKNOWN")

    if engine_result != "tesSUCCESS":
        raise RuntimeError(f"XRPL ledger rejected payment for order {order_id}: {engine_result}")

    tx_hash = result["hash"]
    explorer_url = f"{settings.XRPL_EXPLORER_BASE}/{tx_hash}"
    logger.info("Payment settled on XRPL: order=%s tx_hash=%s", order_id, tx_hash)
    return {
        "tx_hash": tx_hash,
        "explorer_url": explorer_url,
        "engine_result": engine_result,
    }


def send_refund(order_id: str, amount_crypto: float) -> dict:
    """
    Executes a real on-chain reverse Payment from the Merchant wallet back to the Treasury
    with an 'ABC/refund' Memo.
    """
    if not _is_real_seed_configured(settings.MERCHANT_SEED):
        if settings.ALLOW_SIMULATION:
            sim_hash = hashlib.sha256(f"refund:{order_id}:{datetime.now(timezone.utc).isoformat()}".encode()).hexdigest().upper()
            return {"tx_hash": sim_hash, "explorer_url": f"{settings.XRPL_EXPLORER_BASE}/{sim_hash}"}
        raise RuntimeError("MERCHANT_SEED is required in .env to sign on-chain refunds.")

    client = _get_client()
    merchant = _get_merchant_wallet()
    treasury = _get_treasury_wallet()

    tx = Payment(
        account=merchant.address,
        destination=treasury.address,
        amount=_build_payment_amount(amount_crypto),
        destination_tag=int(order_id),
        memos=[
            Memo(
                memo_data=_hex_encode(str(order_id)),
                memo_type=_hex_encode("ABC/refund"),
                memo_format=_hex_encode("text/plain"),
            )
        ],
    )

    logger.info("Submitting on-chain Refund for order=%s amount=%.6f", order_id, amount_crypto)
    response = submit_and_wait(tx, client, merchant)
    result = response.result
    engine_result = result.get("meta", {}).get("TransactionResult", "UNKNOWN")

    if engine_result != "tesSUCCESS":
        raise RuntimeError(f"XRPL refund failed for order {order_id}: {engine_result}")

    tx_hash = result["hash"]
    return {
        "tx_hash": tx_hash,
        "explorer_url": f"{settings.XRPL_EXPLORER_BASE}/{tx_hash}",
        "engine_result": engine_result,
    }


def sign_and_claim_payment_channel(
    channel_id: str,
    cumulative_xrp: float,
    order_id: str,
) -> dict:
    """
    True on-ledger machine spending enforcement:
      1. Treasury signs `CLM\\0` + channel_id (32B) + cumulative drops (8B).
      2. Merchant submits `PaymentChannelClaim` on XRPL Testnet.
      3. If `cumulative_xrp` exceeds the funded channel cap, the XRP Ledger itself
         rejects the claim (`temBAD_AMOUNT` / `tecUNFUNDED_PAYMENT`), raising LedgerCapExceededError.
    """
    client = _get_client()
    treasury = _get_treasury_wallet()
    merchant = _get_merchant_wallet() if _is_real_seed_configured(settings.MERCHANT_SEED) else treasury

    drops_str = xrp_to_drops(round(float(cumulative_xrp), 6))
    drops_int = int(drops_str)

    prefix = b"CLM\x00"
    channel_bytes = bytes.fromhex(channel_id)
    amount_bytes = drops_int.to_bytes(8, byteorder="big", signed=False)
    claim_message = prefix + channel_bytes + amount_bytes

    signature_hex = keypairs.sign(claim_message, treasury.private_key)

    tx = PaymentChannelClaim(
        account=merchant.address,
        channel=channel_id,
        balance=drops_str,
        amount=drops_str,
        signature=signature_hex,
        public_key=treasury.public_key,
        memos=[
            Memo(
                memo_data=_hex_encode(str(order_id)),
                memo_type=_hex_encode("ABC/m2m_claim"),
                memo_format=_hex_encode("text/plain"),
            )
        ],
    )

    logger.info(
        "Submitting on-ledger PaymentChannelClaim: channel=%s cumulative_xrp=%.4f (%s drops) order=%s",
        channel_id, cumulative_xrp, drops_str, order_id,
    )

    try:
        response = submit_and_wait(tx, client, merchant)
        result = response.result
        engine_result = result.get("meta", {}).get("TransactionResult", "UNKNOWN")
    except Exception as exc:
        err_str = str(exc)
        for code in ("tecUNFUNDED_PAYMENT", "temBAD_AMOUNT", "tecNO_LINE", "tefPAST_SEQ"):
            if code in err_str:
                raise LedgerCapExceededError(
                    code,
                    f"XRP Ledger rejected PaymentChannelClaim with {code}: "
                    f"Requested cumulative {cumulative_xrp:.4f} XRP exceeds funded channel cap on-ledger.",
                ) from exc
        raise LedgerCapExceededError(
            "tecUNFUNDED_PAYMENT",
            f"XRP Ledger rejected overspend claim ({err_str}): "
            f"Requested cumulative {cumulative_xrp:.4f} XRP exceeds funded channel cap.",
        ) from exc

    if engine_result != "tesSUCCESS":
        raise LedgerCapExceededError(
            engine_result,
            f"XRP Ledger rejected PaymentChannelClaim ({engine_result}): "
            f"Requested cumulative {cumulative_xrp:.4f} XRP exceeds on-ledger channel cap.",
        )

    tx_hash = result["hash"]
    return {
        "tx_hash": tx_hash,
        "explorer_url": f"{settings.XRPL_EXPLORER_BASE}/{tx_hash}",
        "engine_result": engine_result,
    }


def create_payment_channel(
    device_id: str,
    destination_address: str,
    max_budget_xrp: float,
    settle_delay_seconds: int = 86400,
) -> dict:
    if not _is_real_seed_configured():
        if settings.ALLOW_SIMULATION:
            sim_channel = hashlib.sha256(f"chan:{device_id}".encode()).hexdigest().upper()
            return {"channel_id": sim_channel, "tx_hash": sim_channel, "max_budget_xrp": max_budget_xrp, "device_id": device_id}
        raise RuntimeError("TREASURY_SEED not configured and ALLOW_SIMULATION is disabled.")

    client = _get_client()
    treasury = _get_treasury_wallet()
    # Always target the Merchant wallet derived from MERCHANT_SEED so claims succeed
    if _is_real_seed_configured(settings.MERCHANT_SEED):
        destination = _get_merchant_wallet().address
    else:
        destination = _resolve_destination(treasury.address, destination_address)

    tx = PaymentChannelCreate(
        account=treasury.address,
        destination=destination,
        amount=xrp_to_drops(round(float(max_budget_xrp), 6)),
        settle_delay=settle_delay_seconds,
        public_key=treasury.public_key,
    )

    response = submit_and_wait(tx, client, treasury)
    result = response.result
    engine_result = result.get("meta", {}).get("TransactionResult", "UNKNOWN")
    if engine_result != "tesSUCCESS":
        raise RuntimeError(f"PaymentChannelCreate failed on XRPL: {engine_result}")

    channel_id = None
    for node in result.get("meta", {}).get("AffectedNodes", []):
        created = node.get("CreatedNode", {})
        if created.get("LedgerEntryType") == "PayChannel":
            channel_id = created.get("LedgerIndex")
            break

    if not channel_id:
        raise RuntimeError("PayChannel LedgerIndex not found in transaction metadata.")

    return {
        "channel_id": channel_id,
        "tx_hash": result["hash"],
        "max_budget_xrp": max_budget_xrp,
        "device_id": device_id,
    }


def get_channel_balance(channel_id: str) -> dict:
    if not _is_real_seed_configured():
        if settings.ALLOW_SIMULATION:
            conn = sqlite3.connect(settings.DB_FILE)
            row = conn.execute("SELECT max_budget_cap, current_spent FROM machine_budgets WHERE channel_id = ?", (channel_id,)).fetchone()
            conn.close()
            if row:
                cap, spent = float(row[0] or 0.0), float(row[1] or 0.0)
                return {"channel_id": channel_id, "amount_xrp": cap, "spent_xrp": spent, "remaining_xrp": max(0.0, cap - spent)}
        raise RuntimeError("TREASURY_SEED not configured.")

    client = _get_client()
    treasury = _get_treasury_wallet()
    response = client.request(AccountChannels(account=treasury.address))
    for ch in response.result.get("channels", []):
        if ch.get("channel_id") == channel_id:
            amount_drops = int(ch.get("amount", 0))
            balance_drops = int(ch.get("balance", 0))
            remaining_drops = max(0, amount_drops - balance_drops)
            return {
                "channel_id": channel_id,
                "amount_xrp": float(drops_to_xrp(str(amount_drops))),
                "spent_xrp": float(drops_to_xrp(str(balance_drops))),
                "remaining_xrp": float(drops_to_xrp(str(remaining_drops))),
            }

    raise ValueError(f"Payment Channel {channel_id} not found on XRPL Testnet.")


def fund_payment_channel(channel_id: str, top_up_xrp: float) -> dict:
    client = _get_client()
    treasury = _get_treasury_wallet()
    tx = PaymentChannelFund(
        account=treasury.address,
        channel=channel_id,
        amount=xrp_to_drops(round(float(top_up_xrp), 6)),
    )
    response = submit_and_wait(tx, client, treasury)
    result = response.result
    engine_result = result.get("meta", {}).get("TransactionResult", "UNKNOWN")
    if engine_result != "tesSUCCESS":
        raise RuntimeError(f"PaymentChannelFund failed on XRPL: {engine_result}")
    return {"channel_id": channel_id, "tx_hash": result["hash"], "top_up_xrp": top_up_xrp}


def fetch_recent_merchant_txs(limit: int = 15) -> list[dict]:
    """Queries XRPL AccountTx for the Merchant wallet to auto-match incoming payments."""
    if not _is_real_seed_configured():
        return []
    merchant_addr = (
        _get_merchant_wallet().address
        if _is_real_seed_configured(settings.MERCHANT_SEED)
        else settings.MERCHANT_WALLET_ADDRESS
    )
    if not merchant_addr or merchant_addr.startswith("rXXX"):
        return []
    try:
        client = _get_client()
        res = client.request(AccountTx(account=merchant_addr, limit=limit))
        return res.result.get("transactions", [])
    except Exception as exc:
        logger.debug("AccountTx watcher poll skipped: %s", exc)
        return []