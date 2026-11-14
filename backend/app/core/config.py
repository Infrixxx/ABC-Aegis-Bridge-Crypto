"""
app/core/config.py â€” Central configuration for Aegis Bridge Crypto (ABC)
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
    # â”€â”€ FX Rate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    API_NINJAS_KEY: str = os.getenv("API_NINJAS_KEY", "")
    FX_LOCK_SECONDS: int = int(os.getenv("FX_LOCK_SECONDS", "60"))
    FX_FALLBACK_RATE: float = float(os.getenv("FX_FALLBACK_RATE", "0.055"))

    # â”€â”€ XRPL Wallets & Network â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    TREASURY_SEED: str = os.getenv("TREASURY_SEED", "")
    TREASURY_WALLET_ADDRESS: str = os.getenv("TREASURY_WALLET_ADDRESS", "")
    MERCHANT_SEED: str = os.getenv("MERCHANT_SEED", "")
    MERCHANT_WALLET_ADDRESS: str = os.getenv("MERCHANT_WALLET_ADDRESS", DEFAULT_MERCHANT_WALLET)
    XRPL_JSON_RPC_URL: str = os.getenv("XRPL_JSON_RPC_URL", "https://s.altnet.rippletest.net:51234")
    XRPL_EXPLORER_BASE: str = os.getenv("XRPL_EXPLORER_BASE", "https://testnet.xrpl.org/transactions")

    # â”€â”€ Explicit Simulation Gate (Default False so real errors are never hidden)
    ALLOW_SIMULATION: bool = os.getenv("ALLOW_SIMULATION", "0").strip().lower() in ("1", "true", "yes")

    # â”€â”€ Auth â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    AUTH_SECRET_KEY: str = os.getenv("AUTH_SECRET_KEY", "")

    # â”€â”€ RLUSD (Ripple Stablecoin) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    RLUSD_CURRENCY: str = os.getenv("RLUSD_CURRENCY", "RLUSD")
    RLUSD_ISSUER: str = os.getenv("RLUSD_ISSUER", "")

    # â”€â”€ Africa's Talking â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    AT_USERNAME: str = os.getenv("AT_USERNAME", "sandbox")
    AT_API_KEY: str = os.getenv("AT_API_KEY", "")

    # â”€â”€ AI / LangGraph â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    GOOGLE_API_KEY: str = os.getenv("GOOGLE_API_KEY", "")

    # â”€â”€ Database â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    DB_FILE: str = os.path.join(os.path.dirname(__file__), "../../abc_state.db")

    @property
    def is_rlusd_enabled(self) -> bool:
        issuer = (self.RLUSD_ISSUER or "").strip()
        return bool(issuer) and not issuer.startswith("rXXX")

    @property
    def active_currency(self) -> str:
        return self.RLUSD_CURRENCY if self.is_rlusd_enabled else "XRP"


settings = Settings()

# Never ship a guessable signing key. If none is configured (or the old public
# default is still set), generate a random one for this process. Set
# AUTH_SECRET_KEY in the environment so logins survive restarts.
if not settings.AUTH_SECRET_KEY or settings.AUTH_SECRET_KEY == "abc_hackathon_secure_jwt_secret_key_2026":
    import logging as _logging
    import secrets as _secrets
    settings.AUTH_SECRET_KEY = _secrets.token_urlsafe(48)
    _logging.getLogger("abc.config").warning(
        "AUTH_SECRET_KEY not set: using a random key. Sessions reset on restart. "
        "Set AUTH_SECRET_KEY in your environment."
    )
