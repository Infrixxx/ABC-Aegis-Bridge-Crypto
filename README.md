# Aegis Bridge Crypto (ABC)

> **W3Node Hackathon MVP** · Tracks: *Merchant & Machine Payments* · *Mobile Money & Peer-to-Peer*

An AI-governed, accessible crypto payment gateway for African markets. ABC bridges the **XRP Ledger (XRPL)** with offline telecom infrastructure (**USSD via Africa's Talking**), enabling anyone with a feature phone to send and receive stablecoin payments — no smartphone or internet connection required.

---

## Table of Contents

1. [The Problem We Solve](#the-problem-we-solve)
2. [How It Works](#how-it-works)
3. [Architecture](#architecture)
4. [Project Structure](#project-structure)
5. [Quick Start](#quick-start)
6. [API Reference](#api-reference)
7. [Phase Roadmap](#phase-roadmap)
8. [Hackathon Submission](#hackathon-submission)
9. [License](#license)

---

## The Problem We Solve

### 1 · The "Two Ice Creams" Problem
When two customers pay the same amount to the same merchant wallet at the same time, how do you know which payment belongs to which order?

**ABC's solution:** Every checkout generates a unique **XRPL Destination Tag** — a 32-bit integer embedded in the transaction. The gateway matches incoming funds to open orders instantly, without smart contracts.

### 2 · The Smartphone Gap
Over 60% of sub-Saharan Africa uses feature phones. Crypto has been inaccessible to them.

**ABC's solution:** Every order gets a `*120*TAG#` USSD shortcode. Dial it on any phone, any carrier, zero data, and confirm your crypto payment in under 10 seconds.

### 3 · Crypto Volatility for Merchants
A spaza shop owner can't accept a payment if the value might change before they get it.

**ABC's solution:** A live ZAR→USDC rate is fetched and **locked for 60 seconds** per order. The customer sees the exact rand amount. The merchant receives the exact USDC equivalent.

---

## How It Works

```
Merchant POS (React)
      │
      │  POST /api/checkout/   { phone_number, amount_zar }
      ▼
┌─────────────────────────────────┐
│   FastAPI Backend (ABC Engine)  │
│                                 │
│  1. Fetch live ZAR/USD rate     │
│  2. Generate unique Dest. Tag   │
│  3. Lock rate for 60 seconds    │
│  4. Save PENDING order to DB    │
└──────────┬──────────────────────┘
           │
           ├──▶  QR Code (xrpl://pay?to=...&dt=TAG)
           │     ← scanned by XRPL-compatible wallet
           │
           └──▶  USSD Shortcode (*120*TAG#)
                 ← dialled on any feature phone
                        │
                        ▼
               Africa's Talking
               USSD Gateway
                        │
                        │  POST /api/ussd/
                        ▼
               Verify order + FX lock
               Mark PENDING → PAID
                        │
                        ▼
               [Phase 3] LangGraph
               AI Agent Pipeline
                        │
                 Security Check → XRPL Settlement → SMS Confirmation
```

---

## Architecture

```
ABC-Aegis-Bridge-Crypto/
│
├── backend/                        ← Python / FastAPI
│   ├── app/
│   │   ├── api/
│   │   │   ├── routes_checkout.py  ← POST /api/checkout/ + GET /api/checkout/{id}
│   │   │   ├── routes_ussd.py      ← POST /api/ussd/  (Africa's Talking webhook)
│   │   │   ├── routes_machine.py   ← POST /api/machine/ (HTTP 402 M2M payments)
│   │   │   └── routes_voice.py     ← POST /api/voice/  (IVR fallback)
│   │   ├── agents/
│   │   │   ├── state.py            ← LangGraph shared state definition
│   │   │   ├── supervisor.py       ← Orchestration entry point
│   │   │   ├── security_agent.py   ← Threat check + FX validation
│   │   │   ├── guardian_agent.py   ← M2M budget monitor
│   │   │   ├── transaction_agent.py← XRPL settlement executor
│   │   │   └── graph_builder.py    ← Compiles the LangGraph pipeline
│   │   ├── core/
│   │   │   └── config.py           ← All env vars via Pydantic BaseSettings
│   │   ├── db/
│   │   │   └── db_setup.py         ← SQLite schema + idempotent migrations
│   │   ├── services/
│   │   │   ├── xrpl_service.py     ← xrpl-py client, wallet, tx signing
│   │   │   └── africas_talking_service.py ← SMS/USSD/Voice SDK wrapper
│   │   └── main.py                 ← FastAPI app, middleware, routers
│   ├── requirements.txt
│   └── .env.example                ← Copy to .env and fill in your keys
│
└── frontend/                       ← React / Vite (Phase 3 — POS Terminal)
```

### Database Schema (Hybrid Ledger — `abc_state.db`)

| Table | Purpose |
|---|---|
| `users` | Maps phone numbers → custodial XRPL wallet addresses |
| `orders` | Tracks every checkout: ZAR amount, USDC quote, 60s FX lock, Destination Tag, status, tx_hash |
| `machine_budgets` | M2M device spending caps and supplier allowlists (HTTP 402 track) |
| `flagged_addresses` | Threat cache checked by the Security Agent before every settlement |

**Order status flow:** `PENDING` → `PAID` | `LATE` | `UNDERPAID` | `REFUNDED`

---

## Quick Start

### Prerequisites

- Python 3.11+
- A funded [XRPL Testnet wallet](https://xrpl.org/xrp-testnet-faucet.html)
- An [Africa's Talking sandbox account](https://account.africastalking.com/)
- An [API Ninjas](https://api-ninjas.com/) key (for live FX rates)
- An [ngrok](https://ngrok.com/) account (to expose your local server to AT's webhook)

---

### 1 · Clone & Set Up

```bash
git clone https://github.com/Infrixxx/ABC-Aegis-Bridge-Crypto.git
cd ABC-Aegis-Bridge-Crypto/backend
```

### 2 · Create Virtual Environment

```bash
python -m venv venv

# Linux / macOS
source venv/bin/activate

# Windows
venv\Scripts\activate
```

### 3 · Install Dependencies

```bash
pip install -r requirements.txt
```

### 4 · Configure Environment Variables

```bash
cp .env.example .env
```

Open `.env` and fill in your keys:

| Variable | Where to get it |
|---|---|
| `API_NINJAS_KEY` | [api-ninjas.com](https://api-ninjas.com/) → free tier |
| `TREASURY_SEED` | [xrpl.org/xrp-testnet-faucet.html](https://xrpl.org/xrp-testnet-faucet.html) |
| `TREASURY_WALLET_ADDRESS` | Same faucet page |
| `AT_API_KEY` | Africa's Talking dashboard → Settings → API Key |
| `GOOGLE_API_KEY` | [aistudio.google.com](https://aistudio.google.com) → Get API key |

### 5 · Initialise the Database

```bash
python -m app.db.db_setup
```

You should see:
```
✅ ABC SQLite Database Initialised / Migrated Successfully.
```

### 6 · Start the API Server

```bash
uvicorn app.main:app --reload --port 8000
```

The server is now live at **http://localhost:8000**

- **Swagger UI (interactive docs):** http://localhost:8000/docs
- **Health check:** http://localhost:8000/health

---

### 7 · Test the Checkout Flow

**Create an order:**
```bash
curl -X POST http://localhost:8000/api/checkout/ \
  -H "Content-Type: application/json" \
  -d '{"phone_number": "+27821234567", "amount_zar": 50.00}'
```

**Expected response:**
```json
{
  "status": "success",
  "order_id": "47293841",
  "destination_tag": 47293841,
  "amount_zar": 50.0,
  "quoted_crypto": 2.75,
  "currency": "USDC",
  "expires_at": "2026-11-13T12:01:00",
  "fx_lock_seconds": 60,
  "qr_payload": "xrpl://pay?to=rTreasury...&amount=2.75&dt=47293841",
  "ussd_shortcode": "*123*47293841#"
}
```

**Poll order status (React POS uses this):**
```bash
curl http://localhost:8000/api/checkout/47293841
```

---

### 8 · Test the USSD Flow

Expose your local server with ngrok:
```bash
ngrok http 8000
```

Copy the `https://xxxx.ngrok.io` URL into your Africa's Talking sandbox USSD callback URL as:
```
https://xxxx.ngrok.io/api/ussd/
```

Then simulate a USSD session from the AT dashboard:
```
Dial: *120*ABC#
> 1 (Pay Merchant)
> [Enter your order_id from step 7]
> 1 (Confirm)
```

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/checkout/` | Create a new order (ZAR → USDC quote + Destination Tag) |
| `GET` | `/api/checkout/{order_id}` | Poll order status (used by POS for PAID confirmation) |
| `POST` | `/api/ussd/` | Africa's Talking USSD webhook |
| `POST` | `/api/machine/` | HTTP 402 M2M payment endpoint *(Phase 3)* |
| `POST` | `/api/voice/` | IVR Voice fallback *(Phase 3)* |
| `GET` | `/health` | API + DB connectivity check |
| `GET` | `/docs` | Interactive Swagger UI |

---

## Phase Roadmap

### ✅ Phase 1 — Architecture & Hybrid Ledger
- FastAPI project structure scaffolded
- SQLite schema: `users`, `orders`, `machine_budgets`, `flagged_addresses`
- Idempotent database migration system

### ✅ Phase 2 — Ingestion Layers
- `POST /api/checkout/` — Live FX rate, 60s lock, unique Destination Tag, collision-safe
- `GET /api/checkout/{id}` — Order status polling for POS terminal
- `POST /api/ussd/` — Full USSD state machine with FX expiry enforcement and idempotency guards
- Centralised config via Pydantic `BaseSettings`
- Structured logging throughout

### ⏳ Phase 3 — AI Guardian & XRPL Settlement *(current)*
- **`xrpl_service.py`** — Testnet client, wallet management, transaction construction with `Memos`
- **`security_agent.py`** — Validates FX expiry, checks `flagged_addresses`, detects underpayment
- **`guardian_agent.py`** — Enforces M2M budget caps, revokes compromised device keys
- **`transaction_agent.py`** — Signs and submits payments to XRPL Testnet, writes `tx_hash` to DB
- **`supervisor.py` + `graph_builder.py`** — LangGraph orchestration pipeline
- **React/Vite POS Terminal** — Merchant-facing checkout, QR display, PAID screen with tx_hash

---

## Hackathon Submission

**Track 1 — Merchant & Machine Payments**
- ✅ Real payment end-to-end (XRPL Testnet)
- ✅ Automatic order matching (Destination Tag + Memos)
- ✅ Merchant view: 60s FX lock, PAID confirmation, tx_hash on screen
- ✅ Machine spending cap: `machine_budgets` table with hard limits + Guardian Agent

**Track 2 — Mobile Money & Peer-to-Peer**
- ✅ USSD gateway: zero data, any feature phone, any carrier
- ✅ Africa's Talking integration
- ✅ Sub-10 second payment confirmation

---

## License

[MIT](LICENSE) © 2026 Code Whisperer
