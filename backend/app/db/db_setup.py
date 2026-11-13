"""
app/db/db_setup.py
───────────────────
Initialises the ABC SQLite hybrid ledger.
Run directly to create/migrate the database:

    cd backend
    python -m app.db.db_setup

Schema changelog:
  v1 — Initial: users, orders, machine_budgets, flagged_addresses
  v2 — Added merchant_address + tx_hash to orders (Phase 3 XRPL settlement)
       Added approved_suppliers + is_key_revoked to machine_budgets (Guardian)
"""

import sqlite3
import os
from app.core.config import settings

DB_FILE = settings.DB_FILE


def init_db():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    # Enable WAL mode and timeout for high-concurrency thread safety
    cursor.execute("PRAGMA journal_mode = WAL;")
    cursor.execute("PRAGMA busy_timeout = 5000;")

    # ── 1. Users Table ────────────────────────────────────────────────────────
    # Maps a telecom phone number to a custodial XRPL wallet address.
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS users (
        phone_number    TEXT PRIMARY KEY,
        custodial_wallet TEXT,
        created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    # ── 2. Orders Table — "The Two Ice Creams Resolver" ──────────────────────
    # Each row is one checkout session, locked to a unique Destination Tag.
    # Status flow: PENDING → PAID | LATE | UNDERPAID | REFUNDED
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS orders (
        order_id            TEXT PRIMARY KEY,       -- XRPL Destination Tag (string)
        phone_number        TEXT,                   -- Payer's phone number
        merchant_address    TEXT,                   -- Merchant's XRPL wallet address
        amount_zar          REAL,                   -- Original ZAR amount requested
        quoted_crypto       REAL,                   -- Locked USDC equivalent
        fx_lock_expires_at  TIMESTAMP,              -- 60-second FX rate expiry
        status              TEXT DEFAULT 'PENDING', -- PENDING|PAID|LATE|UNDERPAID|REFUNDED
        tx_hash             TEXT,                   -- XRPL transaction hash (set by agent)
        created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(phone_number) REFERENCES users(phone_number)
    )
    ''')

    # ── 3. Machine Budgets Table ───────────────────────────────────────────────
    # Governs autonomous M2M (HTTP 402) spending caps per registered device.
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS machine_budgets (
        device_id           TEXT PRIMARY KEY,
        operator_phone      TEXT,
        channel_id          TEXT,                   -- XRPL Payment Channel ledger index
        max_budget_cap      REAL,                   -- Hard spending ceiling (USDC/XRP)
        current_spent       REAL DEFAULT 0,         -- Running total spent this cycle
        approved_suppliers  TEXT DEFAULT '[]',      -- JSON array of approved wallet addresses
        is_key_revoked      INTEGER DEFAULT 0,      -- 1 = device API key is revoked
        FOREIGN KEY(operator_phone) REFERENCES users(phone_number)
    )
    ''')

    # ── 4. Flagged Addresses Table ─────────────────────────────────────────────
    # Threat cache checked by the Security Agent before every settlement.
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS flagged_addresses (
        wallet_address  TEXT PRIMARY KEY,
        flag_reason     TEXT,
        flagged_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    # ── Schema Migration: v1 → v2 ─────────────────────────────────────────────
    # Safely add new columns to existing databases without data loss.
    _run_migrations(cursor)

    conn.commit()
    conn.close()
    print("[OK] ABC SQLite Database Initialised / Migrated Successfully.")


def _run_migrations(cursor):
    """
    Idempotent ALTER TABLE migrations.
    Each block catches the error raised when a column already exists,
    so this is always safe to re-run.
    """
    migrations = [
        # v2: orders table
        ("orders",          "merchant_address",     "TEXT"),
        ("orders",          "tx_hash",              "TEXT"),
        # v2: machine_budgets table
        ("machine_budgets", "channel_id",           "TEXT"),
        ("machine_budgets", "approved_suppliers",   "TEXT DEFAULT '[]'"),
        ("machine_budgets", "is_key_revoked",       "INTEGER DEFAULT 0"),
    ]
    for table, column, col_type in migrations:
        try:
            cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}")
            print(f"  ↳ Migration applied: {table}.{column}")
        except Exception:
            pass  # Column already exists — safe to ignore


if __name__ == "__main__":
    init_db()
