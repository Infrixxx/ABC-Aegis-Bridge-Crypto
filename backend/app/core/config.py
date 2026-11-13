"""
app/core/config.py — Central configuration for Aegis Bridge Crypto (ABC)
"""

import os
from pydantic import BaseModel

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), "../../.env"), override=True)
except ImportError:
    pass

DEFAULT_MERCHANT_WALLET = "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe"


class Settings(BaseModel):
    # ── FX Rate ───────────────────────────────────────────────────────────────
    API_NINJAS_KEY: str = os.getenv("API_NINJAS_KEY", "")
    FX_LOCK_SECONDS: int = int(os.getenv("FX_LOCK_SECONDS", "60"))
    FX_FALLBACK_RATE: float = float(os.getenv("FX_FALLBACK_RATE", "0.055"))

    # ── XRPL Wallets & Network ────────────────────────────────────────────────
    TREASURY_SEED: str = os.getenv("TREASURY_SEED", "")
    TREASURY_WALLET_ADDRESS: str = os.getenv("TREASURY_WALLET_ADDRESS", "")
    MERCHANT_SEED: str = os.getenv("MERCHANT_SEED", "")
    MERCHANT_WALLET_ADDRESS: str = os.getenv("MERCHANT_WALLET_ADDRESS", DEFAULT_MERCHANT_WALLET)
    XRPL_JSON_RPC_URL: str = os.getenv("XRPL_JSON_RPC_URL", "https://s.altnet.rippletest.net:51234")
    XRPL_EXPLORER_BASE: str = os.getenv("XRPL_EXPLORER_BASE", "https://testnet.xrpl.org/transactions")

    # ── Explicit Simulation Gate (Default False so real errors are never hidden)
    ALLOW_SIMULATION: bool = os.getenv("ALLOW_SIMULATION", "0").strip().lower() in ("1", "true", "yes")

    # ── Auth ──────────────────────────────────────────────────────────────────
    AUTH_SECRET_KEY: str = os.getenv("AUTH_SECRET_KEY", "abc_hackathon_secure_jwt_secret_key_2026")

    # ── RLUSD (Ripple Stablecoin) ─────────────────────────────────────────────
    RLUSD_CURRENCY: str = os.getenv("RLUSD_CURRENCY", "RLUSD")
    RLUSD_ISSUER: str = os.getenv("RLUSD_ISSUER", "")

    # ── Africa's Talking ──────────────────────────────────────────────────────
    AT_USERNAME: str = os.getenv("AT_USERNAME", "sandbox")
    AT_API_KEY: str = os.getenv("AT_API_KEY", "")

    # ── AI / LangGraph ────────────────────────────────────────────────────────
    GOOGLE_API_KEY: str = os.getenv("GOOGLE_API_KEY", "")

    # ── Database ──────────────────────────────────────────────────────────────
    DB_FILE: str = os.path.join(os.path.dirname(__file__), "../../abc_state.db")

    @property
    def is_rlusd_enabled(self) -> bool:
        issuer = (self.RLUSD_ISSUER or "").strip()
        return bool(issuer) and not issuer.startswith("rXXX")

    @property
    def active_currency(self) -> str:
        return self.RLUSD_CURRENCY if self.is_rlusd_enabled else "XRP"


settings = Settings()
