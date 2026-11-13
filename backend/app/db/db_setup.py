"""
app/db/db_setup.py
───────────────────
Initialises the ABC SQLite hybrid ledger and seeds the local threat cache.
"""

import sqlite3
from app.core.config import settings

DB_FILE = settings.DB_FILE

DEFAULT_FLAGGED_WALLETS = [
    ("rFlaggedSanctionedDrainerWallet666", "OFAC / Sanctioned Crypto Drainer"),
    ("rKnownPhishingExploitAddress999", "Known Phishing & Replay Exploit Actor"),
    ("rSybilBotnetAggregatorWallet000", "Automated Sybil Botnet Drain Address"),
]


def init_db():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    cursor.execute("PRAGMA journal_mode = WAL;")
    cursor.execute("PRAGMA busy_timeout = 5000;")

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS users (
        phone_number     TEXT PRIMARY KEY,
        custodial_wallet TEXT,
        created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS orders (
        order_id           TEXT PRIMARY KEY,
        phone_number       TEXT,
        merchant_address   TEXT,
        amount_zar         REAL,
        quoted_crypto      REAL,
        currency           TEXT DEFAULT 'XRP',
        fx_source          TEXT DEFAULT 'live',
        fx_lock_expires_at TIMESTAMP,
        status             TEXT DEFAULT 'PENDING',
        tx_hash            TEXT,
        refund_tx_hash     TEXT,
        agent_trace        TEXT DEFAULT '[]',
        created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(phone_number) REFERENCES users(phone_number)
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS machine_budgets (
        device_id          TEXT PRIMARY KEY,
        operator_phone     TEXT,
        channel_id         TEXT,
        max_budget_cap     REAL,
        current_spent      REAL DEFAULT 0,
        approved_suppliers TEXT DEFAULT '[]',
        is_key_revoked     INTEGER DEFAULT 0,
        FOREIGN KEY(operator_phone) REFERENCES users(phone_number)
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS flagged_addresses (
        wallet_address TEXT PRIMARY KEY,
        flag_reason    TEXT,
        flagged_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS auth_users (
        id             TEXT PRIMARY KEY,
        email          TEXT UNIQUE NOT NULL,
        password_hash  TEXT NOT NULL,
        full_name      TEXT NOT NULL,
        role           TEXT NOT NULL,
        organization   TEXT,
        wallet_address TEXT,
        created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    _run_migrations(cursor)

    cursor.executemany(
        "INSERT OR IGNORE INTO flagged_addresses (wallet_address, flag_reason) VALUES (?, ?)",
        DEFAULT_FLAGGED_WALLETS,
    )

    default_users = [
        (
            "usr_thandi_shop",
            "thandi@aegis.bridge",
            "abc2026salt:acd588a716d8edea435f31921b87e3806953452e706a383b2ae7fc40de746042",
            "Sis Thandi",
            "shop",
            "Thandi's Spaza & Groceries (Persona)",
            "rKasiSpazaSettlementWallet8888",
        ),
        (
            "usr_kagiso_iot",
            "operator@aegis.bridge",
            "abc2026salt:acd588a716d8edea435f31921b87e3806953452e706a383b2ae7fc40de746042",
            "Kagiso Ndlovu",
            "machines",
            "SolarKasi IoT & CleanGrid",
            "rCleanGridOperatorChannelWallet77",
        ),
        (
            "usr_vance_cfo",
            "cfo@aegis.bridge",
            "abc2026salt:acd588a716d8edea435f31921b87e3806953452e706a383b2ae7fc40de746042",
            "Dr. Arthur Vance, CFA",
            "pro",
            "Hyperion Settlement Capital",
            "rHyperionCFOAuditTreasuryPool555",
        ),
    ]

    cursor.executemany(
        """
        INSERT OR IGNORE INTO auth_users (id, email, password_hash, full_name, role, organization, wallet_address)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        default_users,
    )

    conn.commit()
    conn.close()
    print("[OK] ABC SQLite Database & Threat Cache Initialised Successfully.")


def _run_migrations(cursor):
    migrations = [
        ("orders",          "merchant_address",   "TEXT"),
        ("orders",          "tx_hash",            "TEXT"),
        ("orders",          "refund_tx_hash",     "TEXT"),
        ("orders",          "currency",           "TEXT DEFAULT 'XRP'"),
        ("orders",          "fx_source",          "TEXT DEFAULT 'live'"),
        ("orders",          "agent_trace",        "TEXT DEFAULT '[]'"),
        ("machine_budgets", "channel_id",         "TEXT"),
        ("machine_budgets", "approved_suppliers", "TEXT DEFAULT '[]'"),
        ("machine_budgets", "is_key_revoked",     "INTEGER DEFAULT 0"),
    ]
    for table, column, col_type in migrations:
        try:
            cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}")
        except Exception:
            pass


if __name__ == "__main__":
    init_db()