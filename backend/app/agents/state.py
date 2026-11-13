"""
app/agents/state.py
────────────────────
Shared LangGraph state definition for the ABC agent pipeline.

Every node in the graph reads from and writes to this TypedDict.
State flows through: Security → Guardian → Transaction

Design rules:
  - Nodes only ADD information — they never delete existing fields.
  - If a node sets `error`, downstream nodes check it and short-circuit.
  - `status` is the single source of truth for order outcome.
"""

from typing import TypedDict, Optional


class ABCState(TypedDict):
    # ── Order Identity ────────────────────────────────────────────────────────
    order_id: str                    # XRPL Destination Tag (string)
    phone_number: str                # Payer's phone (from USSD session)
    merchant_address: str            # Merchant's XRPL wallet address
    amount_usdc: float               # Quoted USDC/RLUSD amount to settle
    destination_tag: int             # 32-bit int for XRPL DestinationTag field

    # ── Security Agent output ─────────────────────────────────────────────────
    is_flagged: bool                 # True if merchant wallet is in flagged_addresses
    fx_expired: bool                 # True if the 60s FX lock window has closed

    # ── Guardian Agent output (Machine Payments only) ─────────────────────────
    channel_id: Optional[str]        # Payment Channel ledger ID (None for USSD flow)
    channel_balance_xrp: float       # Remaining XRP in the Payment Channel
    budget_ok: bool                  # True if spend is within channel balance

    # ── Transaction Agent output ──────────────────────────────────────────────
    tx_hash: Optional[str]           # XRPL transaction hash on success
    explorer_url: Optional[str]      # testnet.xrpl.org link for POS display

    # ── Overall outcome ───────────────────────────────────────────────────────
    # Values: PENDING | PAID | REJECTED | BUDGET_EXCEEDED | FAILED
    status: str
    error: Optional[str]             # Human-readable error message if status != PAID
