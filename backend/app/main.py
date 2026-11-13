"""
app/main.py
────────────
FastAPI application entry point for Aegis Bridge Crypto (ABC).
Verifies XRPL Testnet wallets on startup and serves both `/api/*` and `frontend/dist`.
"""

import os
import logging
import sqlite3
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.api import routes_checkout, routes_ussd, routes_machine, routes_voice, routes_auth
from app.core.config import settings
from app.db.db_setup import init_db
from app.services.ledger_watcher import start_ledger_watcher

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
logger = logging.getLogger("abc.main")


def _is_wallet_funded(client, seed: str) -> tuple[bool, str]:
    """Checks if a seed is valid AND funded on the current XRPL Testnet ledger."""
    if not seed or seed.startswith("sXXX") or seed == "your_treasury_seed_here":
        return False, ""
    try:
        from xrpl.wallet import Wallet
        from xrpl.models.requests import AccountInfo
        w = Wallet.from_seed(seed.strip())
        res = client.request(AccountInfo(account=w.address))
        if "account_data" in res.result:
            return True, w.address
        return False, w.address
    except Exception:
        return False, ""


def _ensure_cloud_testnet_wallets():
    try:
        from xrpl.clients import JsonRpcClient
        from xrpl.wallet import generate_faucet_wallet
        client = JsonRpcClient(settings.XRPL_JSON_RPC_URL)

        t_ok, t_addr = _is_wallet_funded(client, settings.TREASURY_SEED)
        if not t_ok:
            logger.info("[XRPL Init] Provisioning funded Treasury Wallet from XRPL Testnet Faucet...")
            tw = generate_faucet_wallet(client, debug=False)
            settings.TREASURY_SEED = tw.seed
            settings.TREASURY_WALLET_ADDRESS = tw.address
        else:
            settings.TREASURY_WALLET_ADDRESS = t_addr

        m_ok, m_addr = _is_wallet_funded(client, settings.MERCHANT_SEED)
        if not m_ok or m_addr == settings.TREASURY_WALLET_ADDRESS:
            logger.info("[XRPL Init] Provisioning funded Merchant Wallet from XRPL Testnet Faucet...")
            mw = generate_faucet_wallet(client, debug=False)
            settings.MERCHANT_SEED = mw.seed
            settings.MERCHANT_WALLET_ADDRESS = mw.address
        else:
            settings.MERCHANT_WALLET_ADDRESS = m_addr

        logger.info(
            "[XRPL Init] Active Wallets -> Treasury=%s | Merchant=%s",
            settings.TREASURY_WALLET_ADDRESS,
            settings.MERCHANT_WALLET_ADDRESS,
        )
    except Exception as exc:
        logger.warning("[XRPL Init] Wallet check skipped: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    _ensure_cloud_testnet_wallets()
    start_ledger_watcher(interval_sec=2.5)
    yield


app = FastAPI(
    title="Aegis Bridge Crypto (ABC) API",
    description="AI-governed XRPL payment gateway for offline USSD commerce and HTTP 402 M2M payments.",
    version="0.3.1",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(routes_auth.router,     prefix="/api/auth",      tags=["User Authentication & Personas"])
app.include_router(routes_checkout.router, prefix="/api/checkout",  tags=["Checkout & Orders"])
app.include_router(routes_ussd.router,     prefix="/api/ussd",      tags=["USSD Webhook"])
app.include_router(routes_machine.router,  prefix="/api/machine",   tags=["HTTP 402 Machine API"])
app.include_router(routes_voice.router,    prefix="/api/voice",     tags=["IVR Voice API"])


@app.api_route("/health", methods=["GET", "HEAD"], tags=["Health"])
def health_check():
    db_status = "connected"
    try:
        conn = sqlite3.connect(settings.DB_FILE)
        conn.execute("SELECT 1")
        conn.close()
    except Exception as exc:
        db_status = f"error: {exc}"

    return {
        "api":      "ok",
        "db":       db_status,
        "xrpl":     "testnet (https://s.altnet.rippletest.net:51234)",
        "currency": getattr(settings, "active_currency", "XRP"),
        "merchant": settings.MERCHANT_WALLET_ADDRESS,
        "watcher":  "active (smart AccountTx poll)",
    }


FRONTEND_DIST = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../frontend/dist"))

if os.path.isdir(FRONTEND_DIST):
    assets_dir = os.path.join(FRONTEND_DIST, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.api_route("/{full_path:path}", methods=["GET", "HEAD"], include_in_schema=False)
    def serve_spa(full_path: str):
        file_path = os.path.join(FRONTEND_DIST, full_path)
        if full_path and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))
else:
    @app.api_route("/", methods=["GET", "HEAD"], tags=["Root"])
    def read_root():
        return {"status": "Aegis Bridge Crypto Engine Active", "version": "0.3.1"}