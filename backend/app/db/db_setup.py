import sqlite3
import os

DB_FILE = "abc_state.db"

def init_db():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    # 1. Users Table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS users (
        phone_number TEXT PRIMARY KEY,
        custodial_wallet TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    # 2. Orders Table (The "Two Ice Creams" Resolver)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS orders (
        order_id TEXT PRIMARY KEY,
        phone_number TEXT,
        amount_zar REAL,
        quoted_crypto REAL,
        fx_lock_expires_at TIMESTAMP,
        status TEXT DEFAULT 'PENDING',
        FOREIGN KEY(phone_number) REFERENCES users(phone_number)
    )
    ''')

    # 3. Machine Budgets Table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS machine_budgets (
        device_id TEXT PRIMARY KEY,
        operator_phone TEXT,
        max_budget_cap REAL,
        current_spent REAL DEFAULT 0,
        FOREIGN KEY(operator_phone) REFERENCES users(phone_number)
    )
    ''')

    # 4. Flagged Addresses Table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS flagged_addresses (
        wallet_address TEXT PRIMARY KEY,
        flag_reason TEXT,
        flagged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    conn.commit()
    conn.close()
    print("✅ ABC SQLite Database Initialized.")

if __name__ == "__main__":
    init_db()
