"""
app/main.py
────────────
FastAPI application entry point for Aegis Bridge Crypto (ABC).

Start the server:
    cd backend
    uvicorn app.main:app --reload --port 8000

API docs available at:
    http://localhost:8000/docs      (Swagger UI)
    http://localhost:8000/redoc     (ReDoc)
"""

import logging
import sqlite3
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import routes_checkout, routes_ussd, routes_machine, routes_voice
from app.core.config import settings

# ── Structured Logging Setup ──────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("abc.main")

# ── FastAPI App ───────────────────────────────────────────────────────────────
app = FastAPI(
    title="Aegis Bridge Crypto (ABC) API",
    description=(
        "An AI-governed, accessible crypto payment gateway for African markets. "
        "Bridges the XRP Ledger with USSD telecom infrastructure and handles "
        "autonomous M2M microtransactions."
    ),
    version="0.2.0",
)

# ── CORS ──────────────────────────────────────────────────────────────────────
# NOTE: allow_origins=["*"] is intentional for the hackathon demo.
# Restrict to your frontend domain in production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(routes_checkout.router, prefix="/api/checkout",  tags=["Checkout & Orders"])
app.include_router(routes_ussd.router,     prefix="/api/ussd",      tags=["USSD Webhook"])
app.include_router(routes_machine.router,  prefix="/api/machine",   tags=["HTTP 402 Machine API"])
app.include_router(routes_voice.router,    prefix="/api/voice",     tags=["IVR Voice API"])


# ── Root ─────────────────────────────────────────────────────────────────────
@app.get("/", tags=["Root"])
def read_root():
    return {"status": "Aegis Bridge Crypto Engine Active", "version": "0.2.0"}


# ── Health Check ──────────────────────────────────────────────────────────────
@app.get("/health", tags=["Health"])
def health_check():
    """
    Returns the operational status of the API and its dependencies.
    Judges and CI pipelines can call this to confirm the server is live.
    """
    # Test DB connectivity
    db_status = "connected"
    try:
        conn = sqlite3.connect(settings.DB_FILE)
        conn.execute("SELECT 1")
        conn.close()
    except Exception as exc:
        db_status = f"error: {exc}"

    return {
        "api":  "ok",
        "db":   db_status,
        "xrpl": "testnet (wss://s.altnet.rippletest.net:51233)",
        "note": "XRPL live connection checked during Phase 3 agent startup.",
    }
