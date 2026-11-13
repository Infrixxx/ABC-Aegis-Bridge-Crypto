"""
app/main.py
────────────
FastAPI application entry point for Aegis Bridge Crypto (ABC).
In cloud production, serves both `/api/*` and the compiled React SPA (`frontend/dist`)
from a single instance so SQLite (`abc_state.db`) is shared across all personas & devices.
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

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("abc.main")


def _ensure_cloud_testnet_wallets():
    """If deployed to cloud without env vars set, auto-funds Testnet wallets in memory."""
    if not settings.TREASURY_SEED or settings.TREASURY_SEED.startswith("sXXX"):
        try:
            from xrpl.clients import JsonRpcClient
            from xrpl.wallet import generate_faucet_wallet
            logger.info("[Cloud Init] Auto-provisioning XRPL Testnet Treasury & Merchant wallets...")
            client = JsonRpcClient(settings.XRPL_JSON_RPC_URL)
            tw = generate_faucet_wallet(client, debug=False)
            mw = generate_faucet_wallet(client, debug=False)
            settings.TREASURY_SEED = tw.seed
            settings.TREASURY_WALLET_ADDRESS = tw.address
            settings.MERCHANT_SEED = mw.seed
            settings.MERCHANT_WALLET_ADDRESS = mw.address
            logger.info("[Cloud Init] Treasury=%s | Merchant=%s", tw.address, mw.address)
        except Exception as exc:
            logger.warning("[Cloud Init] Faucet auto-provision skipped: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    _ensure_cloud_testnet_wallets()
    try:
        from app.services.ledger_watcher import start_ledger_watcher
        start_ledger_watcher(interval_sec=2.5)
    except Exception:
        pass
    yield


app = FastAPI(
    title="Aegis Bridge Crypto (ABC) API",
    description="AI-governed XRPL payment gateway for offline USSD commerce and HTTP 402 M2M payments.",
    version="0.3.0",
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


@app.get("/health", tags=["Health"])
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
    }


# ── Serve Built React Frontend (`frontend/dist`) if Present (Cloud Production) ─
FRONTEND_DIST = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../frontend/dist"))

if os.path.isdir(FRONTEND_DIST):
    assets_dir = os.path.join(FRONTEND_DIST, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str):
        file_path = os.path.join(FRONTEND_DIST, full_path)
        if full_path and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))
else:
    @app.get("/", tags=["Root"])
    def read_root():
        return {"status": "Aegis Bridge Crypto Engine Active", "version": "0.3.0"}