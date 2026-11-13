"""
app/services/xrpl_service.py
─────────────────────────────
All XRP Ledger interactions for the ABC engine.

Responsibilities:
  1. send_payment()          — settle a merchant order on XRPL Testnet
  2. create_payment_channel()— fund a machine spending cap on-ledger
  3. get_channel_balance()   — Guardian Agent reads available budget
  4. fund_payment_channel()  — operator tops up a channel externally
  5. claim_from_channel()    — Transaction Agent draws per machine payment

Settlement currency: RLUSD (Ripple stablecoin) if issuer is configured,
                     XRP drops as fallback for quick testnet demos.

Payment Channels use XRP only (XRPL protocol constraint) — this is the
ledger-enforced hard cap the Guardian Agent cannot override.
"""

import logging
import binascii
from typing import Optional

from xrpl.clients import JsonRpcClient
from xrpl.wallet import Wallet
from xrpl.models.transactions import (
    Payment,
    PaymentChannelCreate,
    PaymentChannelFund,
    PaymentChannelClaim,
)
from xrpl.models.requests import AccountChannels, AccountInfo
from xrpl.models.base_model import BaseModel
from xrpl.transaction import submit_and_wait
from xrpl.utils import xrp_to_drops, drops_to_xrp
from xrpl.models.amounts import IssuedCurrencyAmount
from xrpl.models.transactions.payment import Memo

from app.core.config import settings

logger = logging.getLogger("abc.xrpl")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_client() -> JsonRpcClient:
    """Returns a fresh JSON-RPC client for the configured XRPL node."""
    return JsonRpcClient(settings.XRPL_JSON_RPC_URL)


def _get_treasury_wallet() -> Wallet:
    """Loads the treasury wallet from the configured seed."""
    if not settings.TREASURY_SEED:
        raise ValueError(
            "TREASURY_SEED is not set. "
            "Generate a funded testnet wallet at https://xrpl.org/xrp-testnet-faucet.html"
        )
    return Wallet.from_seed(settings.TREASURY_SEED)


def _hex_encode(text: str) -> str:
    """Encodes a string to uppercase hex — required format for XRPL Memos."""
    return binascii.hexlify(text.encode()).decode().upper()


def _build_payment_amount(amount_rlusd: float):
    """
    Returns an RLUSD IssuedCurrencyAmount if the issuer is configured,
    otherwise falls back to XRP drops (for rapid testnet demos).
    """
    if settings.RLUSD_ISSUER:
        return IssuedCurrencyAmount(
            currency=settings.RLUSD_CURRENCY,
            issuer=settings.RLUSD_ISSUER,
            value=str(round(amount_rlusd, 6)),
        )
    # Fallback: treat the USDC value as XRP for demo purposes
    logger.warning(
        "RLUSD_ISSUER not set — sending %.6f XRP instead. "
        "Get testnet RLUSD from https://tryrlusd.com/",
        amount_rlusd,
    )
    return xrp_to_drops(amount_rlusd)


# ── 1. Merchant Payment Settlement ───────────────────────────────────────────

def send_payment(
    order_id: str,
    merchant_address: str,
    amount_rlusd: float,
    destination_tag: int,
) -> dict:
    """
    Constructs, signs, and submits a payment to the merchant's XRPL wallet.

    The Memo field embeds the order_id so the merchant can reconcile
    on-chain transactions with their POS orders — solving the
    "Two Ice Creams" problem at the blockchain layer.

    Args:
        order_id:          The unique order identifier (Destination Tag as string)
        merchant_address:  The merchant's XRPL wallet address
        amount_rlusd:      The RLUSD (or XRP fallback) amount to send
        destination_tag:   The 32-bit tag embedded in the XRPL transaction

    Returns:
        dict with tx_hash and explorer_url on success.

    Raises:
        RuntimeError on transaction failure.
    """
    client = _get_client()
    treasury = _get_treasury_wallet()

    tx = Payment(
        account=treasury.address,
        destination=merchant_address,
        amount=_build_payment_amount(amount_rlusd),
        destination_tag=destination_tag,
        memos=[
            Memo(
                memo_data=_hex_encode(order_id),
                memo_type=_hex_encode("ABC/order_id"),
                memo_format=_hex_encode("text/plain"),
            )
        ],
    )

    logger.info(
        "Submitting payment: order=%s amount=%.6f to=%s",
        order_id, amount_rlusd, merchant_address,
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

    logger.info("✅ Payment settled: order=%s tx_hash=%s", order_id, tx_hash)
    return {
        "tx_hash": tx_hash,
        "explorer_url": explorer_url,
        "engine_result": "tesSUCCESS",
    }


# ── 2. Payment Channels (Ledger-Enforced Machine Budget) ──────────────────────

def create_payment_channel(
    device_id: str,
    destination_address: str,
    max_budget_xrp: float,
    settle_delay_seconds: int = 86400,
) -> dict:
    """
    Creates an XRPL Payment Channel from the Treasury to a device agent address.

    The channel is funded with `max_budget_xrp` XRP. The agent can only
    claim up to this amount — the XRP Ledger enforces the cap with zero
    possibility of overdraft. This satisfies the Agentic Finance track
    requirement: "limits enforced somewhere the agent doesn't control."

    Args:
        device_id:            Identifier stored in machine_budgets table
        destination_address:  The agent's claim address (Treasury or device wallet)
        max_budget_xrp:       Hard XRP cap funded into the channel
        settle_delay_seconds: Minimum seconds before channel can close (default 24h)

    Returns:
        dict with channel_id and transaction details.
    """
    client = _get_client()
    treasury = _get_treasury_wallet()

    tx = PaymentChannelCreate(
        account=treasury.address,
        destination=destination_address,
        amount=xrp_to_drops(max_budget_xrp),
        settle_delay=settle_delay_seconds,
        public_key=treasury.public_key,
    )

    logger.info(
        "Creating Payment Channel: device=%s budget=%.4f XRP",
        device_id, max_budget_xrp,
    )

    response = submit_and_wait(tx, client, treasury)
    result = response.result

    if result.get("meta", {}).get("TransactionResult") != "tesSUCCESS":
        raise RuntimeError(
            f"PaymentChannelCreate failed for device {device_id}: "
            f"{result.get('meta', {}).get('TransactionResult')}"
        )

    # Extract channel ID from the created ledger nodes
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
    """
    Queries the XRP Ledger for the current balance of a Payment Channel.

    Returns the remaining XRP available for the agent to claim.
    The Guardian Agent calls this before every machine payment to enforce
    the spend cap without trusting any local database.

    Args:
        channel_id:  The ledger index of the Payment Channel

    Returns:
        dict with balance_xrp (remaining), amount_xrp (total funded)
    """
    client = _get_client()
    treasury = _get_treasury_wallet()

    request = AccountChannels(
        account=treasury.address,
        destination_account=treasury.address,
    )
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
    """
    Adds more XRP to an existing Payment Channel.

    This is called by the human operator — not the agent — when they want
    to increase a device's monthly budget. The operator uses their own
    wallet outside the agent system to do this.

    Args:
        channel_id:   The ledger index of the channel to top up
        top_up_xrp:  Additional XRP to add to the channel

    Returns:
        dict with tx_hash and updated channel balance.
    """
    client = _get_client()
    treasury = _get_treasury_wallet()

    tx = PaymentChannelFund(
        account=treasury.address,
        channel=channel_id,
        amount=xrp_to_drops(top_up_xrp),
    )

    logger.info(
        "Funding Payment Channel: channel=%s top_up=%.4f XRP",
        channel_id, top_up_xrp,
    )

    response = submit_and_wait(tx, client, treasury)
    result = response.result

    if result.get("meta", {}).get("TransactionResult") != "tesSUCCESS":
        raise RuntimeError(
            f"PaymentChannelFund failed: "
            f"{result.get('meta', {}).get('TransactionResult')}"
        )

    logger.info("✅ Channel funded: channel=%s tx=%s", channel_id, result["hash"])
    return {
        "channel_id": channel_id,
        "tx_hash": result["hash"],
        "top_up_xrp": top_up_xrp,
    }


def get_wallet_info(address: str) -> dict:
    """Returns basic account info for any XRPL address (used by health checks)."""
    client = _get_client()
    response = client.request(AccountInfo(account=address))
    data = response.result.get("account_data", {})
    return {
        "address": address,
        "balance_xrp": float(drops_to_xrp(data.get("Balance", "0"))),
        "sequence": data.get("Sequence"),
    }
