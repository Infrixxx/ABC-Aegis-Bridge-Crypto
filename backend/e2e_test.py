"""
backend/e2e_test.py
────────────────────
Verifies Wallets (including MERCHANT_SEED), Multi-Persona Auth, USSD Settlement,
On-Ledger PaymentChannelClaim (HTTP 200 & HTTP 402 Ledger Rejection), and On-Chain Refund.
"""

import os
import re
import sys
import time
import requests
from dotenv import load_dotenv
from xrpl.clients import JsonRpcClient
from xrpl.wallet import Wallet, generate_faucet_wallet

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_PATH = os.path.join(BASE_DIR, ".env")
CONFIG_PATH = os.path.join(BASE_DIR, "app", "core", "config.py")
API_BASE = "http://127.0.0.1:8000"
XRPL_RPC = "https://s.altnet.rippletest.net:51234"


def set_env_var(key: str, value: str):
    if not os.path.exists(ENV_PATH):
        with open(ENV_PATH, "w", encoding="utf-8") as f:
            f.write(f"{key}={value}\n")
        return

    with open(ENV_PATH, "r", encoding="utf-8") as f:
        content = f.read()

    pattern = rf"^{re.escape(key)}=.*$"
    if re.search(pattern, content, flags=re.MULTILINE):
        content = re.sub(pattern, f"{key}={value}", content, flags=re.MULTILINE)
    else:
        if not content.endswith("\n"):
            content += "\n"
        content += f"{key}={value}\n"

    with open(ENV_PATH, "w", encoding="utf-8") as f:
        f.write(content)


def ensure_xrpl_wallets():
    load_dotenv(ENV_PATH, override=True)
    t_seed = os.getenv("TREASURY_SEED", "").strip()
    t_addr = os.getenv("TREASURY_WALLET_ADDRESS", "").strip()
    m_seed = os.getenv("MERCHANT_SEED", "").strip()
    m_addr = os.getenv("MERCHANT_WALLET_ADDRESS", "").strip()

    needs_treasury = (not t_seed) or t_seed.startswith("sXXX") or t_seed == "your_treasury_seed_here"
    needs_merchant = (not m_seed) or m_seed.startswith("sXXX") or (not m_addr) or m_addr == t_addr

    if not needs_merchant:
        try:
            derived = Wallet.from_seed(m_seed).address
            if derived != m_addr:
                set_env_var("MERCHANT_WALLET_ADDRESS", derived)
                m_addr = derived
        except Exception:
            needs_merchant = True

    if not needs_treasury and not needs_merchant:
        print(f"[OK] Verified XRPL Testnet Wallets in .env:")
        print(f"   * Treasury : {t_addr}")
        print(f"   * Merchant : {m_addr} (MERCHANT_SEED verified)")
        return t_addr, m_addr

    client = JsonRpcClient(XRPL_RPC)

    if needs_treasury:
        print("... Requesting funded Treasury Wallet from XRPL Testnet Faucet...")
        tw = generate_faucet_wallet(client, debug=False)
        t_seed, t_addr = tw.seed, tw.address
        set_env_var("TREASURY_SEED", t_seed)
        set_env_var("TREASURY_WALLET_ADDRESS", t_addr)
        print(f"[OK] Funded Treasury Wallet : {t_addr}")

    if needs_merchant:
        print("... Requesting funded Merchant Wallet (with MERCHANT_SEED) from XRPL Testnet Faucet...")
        mw = generate_faucet_wallet(client, debug=False)
        m_seed, m_addr = mw.seed, mw.address
        set_env_var("MERCHANT_SEED", m_seed)
        set_env_var("MERCHANT_WALLET_ADDRESS", m_addr)
        print(f"[OK] Funded Merchant Wallet : {m_addr}")

    if os.path.exists(CONFIG_PATH):
        os.utime(CONFIG_PATH, None)
        print("[RELOAD] Triggered Uvicorn reload with new XRPL credentials (waiting 4s)...")
        time.sleep(4)

    return t_addr, m_addr


def run_e2e_suite():
    print("\n" + "=" * 72)
    print("AEGIS BRIDGE CRYPTO (ABC) - FULL ON-CHAIN VERIFICATION SUITE")
    print("=" * 72)

    from app.db.db_setup import init_db
    init_db()
    treasury_addr, merchant_addr = ensure_xrpl_wallets()

    # 1. Health & Auth
    health = requests.get(f"{API_BASE}/health", timeout=5)
    health.raise_for_status()
    print(f"\n[1/6] [OK] Health Check: {health.json()}")

    auth_res = requests.post(
        f"{API_BASE}/api/auth/login",
        json={"email": "operator@aegis.bridge", "password": "password123"},
        timeout=5,
    )
    assert auth_res.status_code == 200, f"Auth failed: {auth_res.text}"
    token = auth_res.json()["token"]
    auth_headers = {"Authorization": f"Bearer {token}"}
    print(f"   [OK] Authenticated as Kagiso Ndlovu (Bearer token acquired)")

    # 2. POS Checkout & USSD Settlement
    print("\n[2/6] Testing POS Checkout & Offline USSD On-Chain Settlement...")
    checkout_res = requests.post(
        f"{API_BASE}/api/checkout/",
        json={"phone_number": "+27821234567", "amount_zar": 35.0, "merchant_address": merchant_addr},
        timeout=10,
    )
    assert checkout_res.status_code == 200, f"Checkout failed: {checkout_res.text}"
    order_data = checkout_res.json()
    order_id = order_data["order_id"]
    print(f"   * Order #{order_id}: R{order_data['amount_zar']} -> {order_data['quoted_crypto']} {order_data['currency']} ({order_data.get('fx_source')})")

    ussd_res = requests.post(
        f"{API_BASE}/api/ussd/",
        data={"sessionId": f"e2e-{order_id}", "serviceCode": "*123#", "phoneNumber": "+27821234567", "text": f"{order_id}*1"},
        timeout=10,
    )
    assert ussd_res.status_code == 200

    settled_order = None
    for attempt in range(20):
        time.sleep(2)
        poll_res = requests.get(f"{API_BASE}/api/checkout/{order_id}", timeout=5).json()
        print(f"     [Poll {attempt + 1}] status={poll_res.get('status')} tx_hash={poll_res.get('tx_hash')}")
        if poll_res.get("status") == "PAID" and poll_res.get("tx_hash"):
            settled_order = poll_res
            break
    assert settled_order is not None, "Timed out waiting for XRPL payment."
    print(f"   [OK] Payment TX : https://testnet.xrpl.org/transactions/{settled_order['tx_hash']}")

    # 3. Real On-Chain Refund (Preserving original tx_hash + adding refund_tx_hash)
    print("\n[3/6] Testing Authenticated On-Chain Refund (Merchant -> Treasury)...")
    ref_res = requests.post(
        f"{API_BASE}/api/checkout/refund",
        json={"order_id": order_id, "reason": "E2E On-Chain Refund Verification"},
        headers=auth_headers,
        timeout=30,
    )
    assert ref_res.status_code == 200, f"Refund failed: {ref_res.text}"
    ref_data = ref_res.json()
    print(f"   [OK] On-Chain Refund TX : {ref_data['explorer_url']}")

    # 4. Register M2M Device & Fund On-Ledger Payment Channel
    device_id = f"solar-meter-{int(time.time())}"
    print(f"\n[4/6] Registering M2M Device '{device_id}' (10 XRP PaymentChannelCreate)...")
    reg_res = requests.post(
        f"{API_BASE}/api/machine/register",
        json={"device_id": device_id, "operator_phone": "+27839998888", "max_budget_xrp": 10.0, "approved_suppliers": [merchant_addr]},
        headers=auth_headers,
        timeout=45,
    )
    assert reg_res.status_code == 200, f"Register failed: {reg_res.text}"
    channel_id = reg_res.json()["channel_id"]
    print(f"   [OK] Channel ID : {channel_id}")

    # 5. Valid M2M PaymentChannelClaim (CLM\0 signature verified on XRPL)
    print("\n[5/6] Testing Valid M2M On-Ledger PaymentChannelClaim (R35 within 10 XRP cap)...")
    valid_order = requests.post(
        f"{API_BASE}/api/checkout/",
        json={"phone_number": "+27839998888", "amount_zar": 35.0, "merchant_address": merchant_addr},
        timeout=10,
    ).json()
    m2m_ok = requests.post(
        f"{API_BASE}/api/machine/{device_id}/pay",
        json={"order_id": valid_order["order_id"], "channel_id": channel_id},
        timeout=30,
    )
    assert m2m_ok.status_code == 200, f"Valid M2M claim failed: {m2m_ok.text}"
    print(f"   [OK] PaymentChannelClaim Settled : {m2m_ok.json()['explorer_url']}")

    # 6. Over-Limit M2M PaymentChannelClaim Rejected by the XRP Ledger (HTTP 402)
    print("\n[6/6] Testing Over-Limit M2M Claim Rejected by XRP Ledger (R500 > 10 XRP cap -> HTTP 402)...")
    big_order = requests.post(
        f"{API_BASE}/api/checkout/",
        json={"phone_number": "+27839998888", "amount_zar": 500.0, "merchant_address": merchant_addr},
        timeout=10,
    ).json()
    m2m_over = requests.post(
        f"{API_BASE}/api/machine/{device_id}/pay",
        json={"order_id": big_order["order_id"], "channel_id": channel_id},
        timeout=30,
    )
    assert m2m_over.status_code == 402, f"Expected HTTP 402, got {m2m_over.status_code}: {m2m_over.text}"
    print(f"   [OK] Ledger Rejected Overspend with HTTP 402: {m2m_over.json()['detail']['message']}")

    print("\n" + "=" * 72)
    print("ALL 6 ON-CHAIN PILLARS (PAYMENT, REFUND, CHANNEL CREATE, CLAIM, 402) VERIFIED!")
    print("=" * 72)


if __name__ == "__main__":
    run_e2e_suite()