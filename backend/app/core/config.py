"""
app/core/config.py — Central configuration for Aegis Bridge Crypto (ABC)
"""

import os
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), "../../.env"))
except ImportError:
    pass

DEFAULT_MERCHANT_WALLET = "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe"

try:
    from pydantic_settings import BaseSettings

    class Settings(BaseSettings):
        # ── FX Rate ───────────────────────────────────────────────────────────
        API_NINJAS_KEY: str = os.getenv("API_NINJAS_KEY", "")
        FX_LOCK_SECONDS: int = int(os.getenv("FX_LOCK_SECONDS", "60"))
        FX_FALLBACK_RATE: float = float(os.getenv("FX_FALLBACK_RATE", "0.055"))

        # ── XRPL ──────────────────────────────────────────────────────────────
        TREASURY_SEED: str = os.getenv("TREASURY_SEED", "")
        TREASURY_WALLET_ADDRESS: str = os.getenv("TREASURY_WALLET_ADDRESS", "")
        MERCHANT_WALLET_ADDRESS: str = os.getenv("MERCHANT_WALLET_ADDRESS", DEFAULT_MERCHANT_WALLET)
        XRPL_JSON_RPC_URL: str = os.getenv("XRPL_JSON_RPC_URL", "https://s.altnet.rippletest.net:51234")
        XRPL_EXPLORER_BASE: str = os.getenv("XRPL_EXPLORER_BASE", "https://testnet.xrpl.org/transactions")

        # ── RLUSD (Ripple stablecoin) ──────────────────────────────────────────
        RLUSD_CURRENCY: str = os.getenv("RLUSD_CURRENCY", "RLUSD")
        RLUSD_ISSUER: str = os.getenv("RLUSD_ISSUER", "")

        # ── Africa's Talking ──────────────────────────────────────────────────
        AT_USERNAME: str = os.getenv("AT_USERNAME", "sandbox")
        AT_API_KEY: str = os.getenv("AT_API_KEY", "")

        # ── AI / LangGraph ────────────────────────────────────────────────────
        GOOGLE_API_KEY: str = os.getenv("GOOGLE_API_KEY", "")

        # ── Database ──────────────────────────────────────────────────────────
        DB_FILE: str = os.path.join(
            os.path.dirname(__file__), "../../abc_state.db"
        )

        class Config:
            env_file = ".env"
            extra = "ignore"

except ImportError:
    from pydantic import BaseModel

    class Settings(BaseModel):
        API_NINJAS_KEY: str = os.getenv("API_NINJAS_KEY", "")
        FX_LOCK_SECONDS: int = int(os.getenv("FX_LOCK_SECONDS", "60"))
        FX_FALLBACK_RATE: float = float(os.getenv("FX_FALLBACK_RATE", "0.055"))

        TREASURY_SEED: str = os.getenv("TREASURY_SEED", "")
        TREASURY_WALLET_ADDRESS: str = os.getenv("TREASURY_WALLET_ADDRESS", "")
        MERCHANT_WALLET_ADDRESS: str = os.getenv("MERCHANT_WALLET_ADDRESS", DEFAULT_MERCHANT_WALLET)
        XRPL_JSON_RPC_URL: str = os.getenv("XRPL_JSON_RPC_URL", "https://s.altnet.rippletest.net:51234")
        XRPL_EXPLORER_BASE: str = os.getenv("XRPL_EXPLORER_BASE", "https://testnet.xrpl.org/transactions")

        RLUSD_CURRENCY: str = os.getenv("RLUSD_CURRENCY", "RLUSD")
        RLUSD_ISSUER: str = os.getenv("RLUSD_ISSUER", "")

        AT_USERNAME: str = os.getenv("AT_USERNAME", "sandbox")
        AT_API_KEY: str = os.getenv("AT_API_KEY", "")

        GOOGLE_API_KEY: str = os.getenv("GOOGLE_API_KEY", "")

        DB_FILE: str = os.path.join(
            os.path.dirname(__file__), "../../abc_state.db"
        )


settings = Settings()
