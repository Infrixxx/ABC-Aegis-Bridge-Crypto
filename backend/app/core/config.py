"""
app/core/config.py
──────────────────
Central configuration for Aegis Bridge Crypto (ABC).
All environment variables are read here — nowhere else in the codebase
should os.getenv() be called directly.

Usage:
    from app.core.config import settings
    print(settings.TREASURY_WALLET_ADDRESS)
"""

import os
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

# Load .env from the backend/ directory (one level up from app/)
load_dotenv(os.path.join(os.path.dirname(__file__), "../../.env"))


class Settings(BaseSettings):
    # ── FX Rate ───────────────────────────────────────────────────────────────
    API_NINJAS_KEY: str = ""
    FX_LOCK_SECONDS: int = 60
    FX_FALLBACK_RATE: float = 0.055  # ZAR→USD fallback if API is unreachable

    # ── XRPL ──────────────────────────────────────────────────────────────────
    TREASURY_SEED: str = ""
    TREASURY_WALLET_ADDRESS: str = "rTreasuryWalletPlaceholder"
    XRPL_NODE_URL: str = "wss://s.altnet.rippletest.net:51233"

    # ── Africa's Talking ──────────────────────────────────────────────────────
    AT_USERNAME: str = "sandbox"
    AT_API_KEY: str = ""

    # ── AI / LangGraph ────────────────────────────────────────────────────────
    GOOGLE_API_KEY: str = ""

    # ── Database ──────────────────────────────────────────────────────────────
    # Absolute path resolved relative to backend/app/core/config.py
    DB_FILE: str = os.path.join(
        os.path.dirname(__file__), "../../abc_state.db"
    )

    class Config:
        env_file = ".env"
        extra = "ignore"


# Single shared instance — import this everywhere
settings = Settings()
