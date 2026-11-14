# Aegis Bridge Crypto (ABC)

> Tracks: Agentic Finance (Primary - Sponsored by Ripple) | Mobile Money & Peer-to-Peer (Secondary - Sponsored by Tether) | Merchant & Machine Payments (Open Track)

An AI-governed, accessible crypto payment gateway for African markets. ABC bridges the XRP Ledger (XRPL) and RLUSD stablecoins with offline telecom infrastructure (USSD & IVR Voice via Africa's Talking) and autonomous machine-to-machine (HTTP 402 M2M) microtransactions. ABC enables anyone with a basic feature phone or IoT device to settle on-chain with zero mobile data.

---

## Live Deployed Project

The complete ABC gateway (FastAPI relayer, LangGraph agent pipeline, smart ledger watcher, and multi-persona React interface) is live and deployed at:

**Deployed URL:** [https://abc-aegis-bridge-crypto.onrender.com/](https://abc-aegis-bridge-crypto.onrender.com/)

- Live POS Terminal & Operator Console: `https://abc-aegis-bridge-crypto.onrender.com/`
- Direct Customer Phone Simulator: `https://abc-aegis-bridge-crypto.onrender.com/?pay=DEMO`
- Interactive API Documentation (Swagger): `https://abc-aegis-bridge-crypto.onrender.com/docs`
- System Health & Ledger Status: `https://abc-aegis-bridge-crypto.onrender.com/health`

---

## Table of Contents

1. [Executive Summary & The 4 Pillars](#executive-summary--the-4-pillars)
2. [Target Customer & Problem Statement](#target-customer--problem-statement)
3. [Multi-Persona System Architecture](#multi-persona-system-architecture)
4. [Answer to the 4 Core Challenge Questions](#answer-to-the-4-core-challenge-questions)
5. [Commercial Fee Comparison Table](#commercial-fee-comparison-table)
6. [Architecture & Agentic Finance Pipeline](#architecture--agentic-finance-pipeline)
7. [Security & Cryptographic Guarantees](#security--cryptographic-guarantees)
8. [Offline Accessibility: USSD + IVR Voice](#offline-accessibility-ussd--ivr-voice)
9. [M2M Payments & XRPL Payment Channels](#m2m-payments--xrpl-payment-channels)
10. [End-to-End Test Suite & On-Chain Verification](#end-to-end-test-suite--on-chain-verification)
11. [Quick Start & Demo Guide](#quick-start--demo-guide)
12. [API Reference](#api-reference)
13. [Go-To-Market & Pilot Rollout](#go-to-market--pilot-rollout)
14. [Hackathon Submission Checklist](#hackathon-submission-checklist)
15. [License](#license)

---

## Executive Summary & The 4 Pillars

| Mandatory Pillar | Implementation in ABC | Verification Status |
| :--- | :--- | :--- |
| **1. Real Payment, End to End** | Live transaction settlement executed on **XRPL Testnet** using **RLUSD** (Ripple USD) / XRP. Payer authorizes offline via USSD/IVR or online via QR; LangGraph Supervisor settles on-chain and updates POS status. | [Built & Verified on XRPL] |
| **2. Automatic Order Matching** | Solves the **"Two Ice Creams" problem** (two patrons buying identical R85 items simultaneously). A unique 32-bit XRPL **Destination Tag** is generated and embedded in the transaction `Memos` field, QR URI, and USSD dial code. Background `ledger_watcher.py` auto-matches on-chain transfers. | [Built & Verified on XRPL] |
| **3. Merchant / Operator View** | WCAG-compliant React POS Terminal with Web Speech API voice billing, 60-second live volatility countdown, high-contrast green **"PAID IN FULL"** confirmation screen with clickable testnet hash, 1-click on-chain refund, and sweep off-ramp simulation. | [Built & Verified on XRPL] |
| **4. Hard Spending Cap for Machines** | Autonomous M2M devices (EV chargers, solar meters) are bound by **XRPL Payment Channels** on the XRP Ledger. The AI agent cannot exceed the funded balance; human operators retain external budget top-up and emergency kill-switch control. | [Built & Verified on XRPL] |

---

## Target Customer & Problem Statement

### Named Customer: Sis Thandi's Spaza Shop
- **Location:** Walter Sisulu Road, Site B, Khayelitsha, Cape Town.
- **Profile:** Micro-merchant serving approximately 320 local residents daily with staples (bread, airtime, milk, prepaid electricity).
- **Daily Realities & Pain Points:**
  1. **Cash Robbery Danger:** Keeping R4,000 in cash daily makes her an immediate target for armed robberies. Cash-in-transit deposit fees at local ATMs cost 2.5% to 4%.
  2. **Card Machine Lock-Out:** Traditional card terminals (Speedpoint, Yoco) charge R450 to R800/month rental, take 2.75% to 3.5% + R1.50 per swipe, and freeze whenever local cellular data networks experience load-shedding outages.
  3. **The Smartphone Barrier:** Over 65% of her elderly and grant-recipient customers own basic feature phones (Nokia 105, Mobicel) with zero active mobile data. They cannot use standard Web3 dApps or browser wallets.
  4. **Crypto Volatility:** Thandi cannot accept volatile crypto if a R50 loaf of bread devalues to R44 before supplier restocking day.

**How ABC Solves This:** Thandi taps the microphone button on her Android tablet: *"Checkout 85 Rand"*. The POS immediately locks the exchange rate into RLUSD for 60 seconds and displays a `*123*79477624#` USSD code. Her customer dials it on their 2G Nokia phone, enters their 4-digit PIN, and within 3 seconds, Thandi's screen flashes bright green: **PAID IN FULL**.

---

## Multi-Persona System Architecture

ABC provides tailored interfaces and workflows for each stakeholder in the settlement lifecycle:

### Persona 1: Sis Thandi - Spaza Merchant (`shop` Mode)
- **Role:** `shop`
- **Demo Account:** `thandi@aegis.bridge` / `password123`
- **Interface:** Touch-first POS keypad, large high-contrast numerals, Web Speech voice input (*"Charge 45 Rand"*), 60-second FX lock ring timer, and zero crypto jargon.
- **Views:** "Charge" (instant billing) and "Today" (simplified sales summary, daily volume, and payment statuses).

### Persona 2: Kagiso Ndlovu - IoT Fleet Lead (`machines` Mode)
- **Role:** `machines`
- **Demo Account:** `operator@aegis.bridge` / `password123`
- **Interface:** Hardware spending limit manager, autonomous M2M telemetry meters, XRPL Payment Channel health bars, and external budget controls.
- **Capabilities:**
  - On-ledger channel creation (`PaymentChannelCreate`) with hard XRP balance caps.
  - Interactive simulation triggers: Valid spend (R35 within cap), Over-limit spend (R500 > cap triggering HTTP 402), and Blacklist threat spend (targeting sanctioned wallets).
  - Operator top-up (`PaymentChannelFund`) and Emergency Key Revocation / Kill-Switch (`PaymentChannelClaim` with close flag).

### Persona 3: Dr. Arthur Vance, CFA - CFO & Auditor (`pro` Mode)
- **Role:** `pro`
- **Demo Account:** `cfo@aegis.bridge` / `password123`
- **Interface:** Deep accounting and technical audit terminal.
- **Capabilities:**
  - Full hybrid ledger inspection with live 32-bit XRPL Destination Tags and transaction hashes linked to the testnet explorer.
  - Real-time LangGraph Multi-Agent Telemetry Stream (`AgentTraceView`) showing node execution traces (Security, Guardian, Transaction).
  - 1-click on-chain refund execution (Merchant wallet to Treasury/Customer).
  - Simulated fiat sweep off-ramp to South African bank accounts (Kotani Pay / MoneyBadger integration).

### Customer Phone Simulator (Payer Experience)
- **Access:** Accessible directly from the login page or via QR code scan (`?pay=ORDER_ID`) without requiring authentication.
- **Telecom Modalities:**
  1. **Feature Phone USSD Dialer:** Interactive session runner simulating `*123*ORDER_ID#`, prompt display, and PIN entry.
  2. **Toll-Free IVR Voice Gateway (0800-AEGIS):** Interactive speech-enabled IVR simulator reading bills via Web Speech synthesis and accepting DTMF keypad input.
  3. **Direct Order Pay:** Payer view displaying order details, live FX rates, and 4-digit custodial PIN verification (`1234`).

---

## Answer to the 4 Core Challenge Questions

### 1. How does the customer pay in seconds from a phone they own?
The customer dials the generated USSD shortcode (e.g. `*123*DEST_TAG#`) or calls the toll-free IVR Voice gateway (`/api/voice`). Their phone number acts as their custodial identity. The USSD session displays the exact Rand and RLUSD amounts. Entering their 4-digit custodial PIN authenticates and authorizes the transaction. Zero mobile data, zero seed phrases, and zero crypto app downloads required.

### 2. How does the merchant know which order was paid without a block explorer?
Through **XRPL Destination Tags and Memos matching**. Every checkout generates a unique 32-bit integer Destination Tag. The background ledger watcher detects incoming payments on the merchant wallet, inspects the Destination Tag, verifies the delivered amount against the 60-second quoted rate, and updates SQLite. The React POS terminal polls `/api/checkout/{order_id}` and switches to the green **PAID IN FULL** confirmation screen in under 3 seconds with zero manual refreshing.

### 3. How do funds reach a bank or mobile money account?
ABC integrates with regional off-ramp aggregators (e.g., **Kotani Pay** and **MoneyBadger**). In the merchant and CFO consoles, settled RLUSD stablecoins can be swept automatically via the **"Sweep to Rand (Off-Ramp)"** pipeline, initiating instant fiat payouts (EFT or PayShap) directly into South African bank accounts (Standard Bank, Capitec, FNB).

### 4. What is the max a machine can spend, and who can stop it?
Spending caps are enforced **on-ledger via XRPL Payment Channels**, never inside an LLM prompt or application configuration. When an M2M machine is registered (`POST /api/machine/register`), a Payment Channel is created and funded on-chain with a strict cap (e.g. 10 or 25 XRP). The XRP Ledger itself rejects any cumulative claim exceeding this funded amount with `tecUNFUNDED_PAYMENT`, surfaced to the caller as an `HTTP 402 Payment Required` response. Human operators retain external budget controls via `/api/machine/{id}/budget` and an emergency kill-switch via `/api/machine/{id}/revoke`.

---

## Commercial Fee Comparison Table

| Payment Method | Merchant Processing Fee | Monthly Hardware/SaaS Fee | Settlement Speed | Offline Capability | Robbery / Fraud Risk |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Physical Cash** | 2.0% - 4.5% (Deposit & transit costs) | R0 | Immediate physical | 100% Offline | High (Armed robbery target) |
| **Traditional Card POS (Yoco/Speedpoint)** | 2.75% - 3.5% + R1.50 per swipe | R450 - R800 / month | 24 - 48 Hours | Requires 3G/LTE Internet | Low (Chargeback risk) |
| **Mobile Money (M-Pesa / EcoCash)** | 1.5% - 3.0% transfer fee | R0 | Instant (Walled garden) | USSD native | Low |
| **ABC on XRPL (Aegis Bridge)** | **0.5% + $0.0002 on-chain network fee** | **R0 (Runs in browser/PWA)** | **3 - 5 Seconds (On-chain)** | **Full USSD & IVR Voice** | **Zero (Custodial on-chain)** |

---

## Architecture & Agentic Finance Pipeline

ABC uses a **LangGraph Multi-Agent StateGraph Architecture** coordinating risk, budget enforcement, and on-chain settlement:

```
                           +---------------------------+
                           |   Africa's Talking USSD   |
                           |   or React Web POS QR     |
                           +-------------+-------------+
                                         |
                                         v
                           +---------------------------+
                           |  FastAPI Relayer Engine   |
                           +-------------+-------------+
                                         |
                                         v
                           +---------------------------+
                           |   LangGraph Supervisor    |
                           |       (StateGraph)        |
                           +-------------+-------------+
                                         |
               +-------------------------+-------------------------+
               |                         |                         |
               v                         v                         v
    +--------------------+    +--------------------+    +--------------------+
    |   Security Agent   |    |   Guardian Agent   |    | Transaction Agent  |
    | Verifies FX lock   |--->| Enforces on-ledger |--->| Signs with custody |
    | & threat blacklist |    | PaymentChannel cap |    | seed & submits tx  |
    +--------------------+    +--------------------+    +---------+----------+
               |                         |                         |
               | (reject: END)           | (block: END / 402)      v
               v                         v              +--------------------+
              END                       END             |  XRP Ledger Testnet|
                                                        |   (RLUSD / XRP)    |
                                                        +--------------------+
```

### Agent Pipeline Details
1. **`security_agent.py` (Security Node):**
   - Verifies the 60-second rate lock window (`fx_lock_expires_at`). Rejects expired orders with status `REJECTED` and reason `FX_RATE_EXPIRED`.
   - Queries an O(1) in-memory threat cache synchronized with the SQLite `flagged_addresses` database. Automatically blocks known sanctioned drainers, phishing addresses, and Sybil wallets.
2. **`guardian_agent.py` (Guardian Node):**
   - Directly checks on-ledger XRPL Payment Channel balances via `AccountChannels`.
   - Enforces hard machine spending caps. If a requested claim exceeds remaining channel balance, returns status `BUDGET_EXCEEDED`, triggering an HTTP 402 response.
   - Validates merchant addresses against authorized supply-chain allowlists.
3. **`transaction_agent.py` (Transaction Node):**
   - The sole component holding custodial signing authority.
   - Submits signed transactions (`Payment` or `PaymentChannelClaim`) to the XRP Ledger JSON-RPC node.
   - Embeds the unique 32-bit `order_id` in the XRPL transaction `Memos` field.
   - Writes the resulting `tx_hash` to the SQLite Hybrid Ledger and dispatches an automated SMS settlement receipt via Africa's Talking.
4. **`ledger_watcher.py` (Background Ledger Watcher):**
   - Lightweight `AccountTx` poller that checks SQLite first, only pinging the XRPL RPC when active `PENDING` or `PROCESSING` orders exist.
   - Automatically matches incoming ledger transactions by `DestinationTag`.
   - Reconciles order status: `PAID` for full payments, `UNDERPAID` for partial deliveries, and `LATE` for expired locks.

---

## Security & Cryptographic Guarantees

1. **PBKDF2-HMAC-SHA256 Custodial PIN Hashing:**
   - All 4-digit custodial USSD/IVR PINs are salted with a cryptographic 8-byte hex token and hashed using `PBKDF2-HMAC-SHA256` with 50,000 iterations (`hash_pin()` in `backend/app/db/db_setup.py`).
   - Verifications use `hmac.compare_digest()` to provide constant-time execution and prevent side-channel timing attacks.
2. **Strict Caller Identity Enforcement:**
   - USSD and IVR payment routes (`routes_ussd.py` and `routes_voice.py`) enforce non-empty, normalized E.164 phone number matching between the active telecommunication session and the order's `customer_phone`.
3. **Deterministic Settlement Execution:**
   - Mid-request faucet generation has been eliminated from transaction paths (`xrpl_service.py`), ensuring that invalid destination addresses fail immediately and deterministically with a `RuntimeError`.
4. **SQLite WAL Mode & Concurrency:**
   - The Hybrid Ledger uses SQLite Write-Ahead Logging (`PRAGMA journal_mode = WAL;`) and a busy timeout of 5,000 ms, ensuring thread-safe concurrency across FastAPI webhooks, the background ledger watcher, and LangGraph agents.

---

## Offline Accessibility: USSD + IVR Voice

To solve sub-Saharan Africa's smartphone deficit and support visually impaired or low-literacy users, ABC provides two zero-data telecom channels:

### 1. Interactive USSD Gateway (`POST /api/ussd/`)
- Dial shortcode: `*123*ORDER_ID#` (or standard menu `*123#`)
- Full session state machine handling navigation:
  ```
  CON Order #79477624
  Pay R85.00 (4.68 RLUSD)?
  Enter 4-digit PIN to authorize:
  ```
- Submitting PIN `1234` validates against the PBKDF2 hash, invokes the LangGraph pipeline, and returns:
  ```
  END Payment Authorized! R85.00 sent to Sis Thandi.
  TX Hash: D0C0DCE59277FFF2...
  SMS receipt sent.
  ```

### 2. Accessible Voice IVR (`POST /api/voice/` and `/confirm`)
- Powered by Africa's Talking Voice XML and toll-free shortcodes.
- Visually impaired patrons call the gateway.
- Automated speech synthesizes the bill: *"Order 79477624 found. Total amount is 85 Rand, quoted at 4.68 RLUSD. Please enter your 4-digit PIN followed by hash."*
- DTMF keypad input authenticates the customer and triggers on-chain settlement with spoken confirmation.

---

## M2M Payments & XRPL Payment Channels

For autonomous scripts, smart meters, solar micro-grids, and EV charging stations:

- **HTTP 402 Payment Required:** Unauthenticated or out-of-budget requests to `POST /api/machine/{id}/pay` return HTTP 402 with channel deficit metadata.
- **On-Ledger Enforcement:** Limits are enforced by **XRPL Payment Channels** created via `PaymentChannelCreate`. The AI agent cannot spend more than the ledger channel balance.
- **Operator Controls:** Human operators review live ledger channel balances, top up channels via `PaymentChannelFund`, or trigger emergency revocations (`POST /api/machine/{id}/revoke`).

---

## End-to-End Test Suite & On-Chain Verification

The test suite in [`backend/e2e_test.py`](backend/e2e_test.py) executes live against the XRPL Testnet:

```
========================================================================
AEGIS BRIDGE CRYPTO (ABC) - FULL ON-CHAIN VERIFICATION SUITE
========================================================================
[1/6] Health Check & Bearer JWT Authentication: PASSED
[2/6] POS Checkout & Offline USSD Settlement with PIN: PAID
      TX: https://testnet.xrpl.org/transactions/D0C0DCE59277FFF29CE55ACBF5F92EE73D459CDBE989F7BD989AD4F919A77652
[3/6] Authenticated On-Chain Refund (Merchant -> Treasury): PAID
      TX: https://testnet.xrpl.org/transactions/AF6867762621C8756AF29583BA1BC9BFCEE58F7AAB85CAC092DB8C1C75A22928
[4/6] Register M2M Device (PaymentChannelCreate with 10 XRP Cap): PASSED
      Channel ID: D9B0E4E2F088468DAA43FFE688D14F725A8DD0094E910A363A273AF5CF8C43F7
[5/6] Valid M2M On-Ledger PaymentChannelClaim (R35 within 10 XRP cap): PASSED
      TX: https://testnet.xrpl.org/transactions/CE7F2AB8D4C604185440F8CCE3641740BAB1CCF818853131C7904041DB119B57
[6/6] Over-Limit M2M Claim Rejected by XRP Ledger with HTTP 402: PASSED
      XRP Ledger rejected claim with tecUNFUNDED_PAYMENT (Requested 31.66 XRP > 10 XRP cap)
========================================================================
ALL 6 ON-CHAIN PILLARS VERIFIED ON XRPL TESTNET
========================================================================
```

---

## Quick Start & Demo Guide

### Prerequisites
- Python 3.11+
- Node.js 18+ and npm
- A funded [XRPL Testnet wallet](https://xrpl.org/resources/dev-tools/xrp-faucets)

### 1. Clone & Set Up Backend
```bash
git clone https://github.com/Infrixxx/ABC-Aegis-Bridge-Crypto.git
cd ABC-Aegis-Bridge-Crypto/backend

# Create virtual environment
python -m venv venv
# On Linux/macOS:
source venv/bin/activate
# On Windows:
venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env
# Edit .env and supply your TREASURY_SEED and API keys

# Initialize SQLite Hybrid Ledger and seed threat cache
python -m app.db.db_setup

# Start FastAPI Relayer
uvicorn app.main:app --reload --port 8000
```
- API Swagger Documentation: `http://localhost:8000/docs`
- System Health: `http://localhost:8000/health`

### 2. Set Up Frontend POS & Operator Console
In a separate terminal:
```bash
cd ABC-Aegis-Bridge-Crypto/frontend
npm install
npm run dev
```
Open `http://localhost:5173` to access the multi-persona terminal.

### 3. Demo Account Credentials

| Persona | Role | Email | Password | Primary Feature |
| :--- | :--- | :--- | :--- | :--- |
| **Sis Thandi** | `shop` | `thandi@aegis.bridge` | `password123` | Touch Keypad, Voice Input, 60s FX Lock, Today Sales |
| **Kagiso Ndlovu** | `machines` | `operator@aegis.bridge` | `password123` | Payment Channels, M2M Telemetry, HTTP 402 Test |
| **Dr. Arthur Vance** | `pro` | `cfo@aegis.bridge` | `password123` | Destination Tags, Ledger Stream, 1-Click Refund, Sweep |

---

## API Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Register new merchant or operator user |
| `POST` | `/api/auth/login` | Authenticate user and receive Bearer JWT token |
| `GET` | `/api/auth/me` | Fetch authenticated user profile and persona role |
| `GET` | `/api/auth/demo` | Fetch public demo account metadata |
| `POST` | `/api/checkout/` | Creates order, locks FX rate for 60s, generates Destination Tag & QR URI |
| `GET` | `/api/checkout/{id}` | Status polling endpoint for POS terminal |
| `GET` | `/api/checkout/` | List recent orders for merchant transaction ledger |
| `POST` | `/api/checkout/refund` | Authenticated on-chain refund (Merchant to Treasury/Customer) |
| `POST` | `/api/ussd/` | Africa's Talking USSD form-data webhook handler |
| `POST` | `/api/voice/` | Africa's Talking IVR Voice XML payment handler |
| `POST` | `/api/voice/confirm`| IVR Voice keypad DTMF confirmation callback |
| `POST` | `/api/machine/register` | Registers M2M device and creates on-ledger Payment Channel |
| `GET` | `/api/machine/{id}` | Queries device budget and live XRPL channel balance |
| `GET` | `/api/machine/` | List all registered M2M devices |
| `POST` | `/api/machine/{id}/budget` | Operator external top-up via `PaymentChannelFund` |
| `POST` | `/api/machine/{id}/pay` | Autonomous M2M payment execution (HTTP 402 compatible) |
| `POST` | `/api/machine/{id}/revoke`| Emergency operator kill-switch to claim/close channel |
| `GET` | `/health` | Live system health, SQLite WAL status, and watcher telemetry |

---

## Go-To-Market & Pilot Rollout

- **Phase 1: Spaza Shop Pilot (Months 1-3):**
  - Launch with 10 spaza shops along Walter Sisulu Road in Khayelitsha, Cape Town.
  - Subsidize initial merchant transaction fees. Distribute laminated QR and USSD dialing cards.
- **Phase 2: Regional Telecom Distribution (Months 4-8):**
  - Leverage Africa's Talking aggregator network across South Africa, Kenya, and Nigeria.
  - Partner with local FMCG distributors (bread, beverage, and dairy delivery fleets) to enable spaza shops to pay wholesalers directly in RLUSD without carrying physical cash.
- **Phase 3: Automated Micro-Utilities (Months 9-12):**
  - Integrate HTTP 402 M2M payment APIs into communal solar water heaters, mini-grids, and EV delivery charging hubs.

---

## Hackathon Submission Checklist

### Track 1 - Agentic Finance (Primary - Sponsored by Ripple)
- [x] **Autonomous Agent Settlement:** `transaction_agent.py` autonomously signs and submits transactions to XRPL Testnet.
- [x] **Ledger-Enforced Limits:** Hard spending caps enforced on-chain via **XRPL Payment Channels** (`xrpl_service.py`).
- [x] **Human Operator Controls:** Independent operator API (`POST /api/machine/{id}/budget` and `revoke`) outside the agent's control.
- [x] **RLUSD Integration:** Ready for Ripple USD stablecoin (`tryrlusd.com`) with XRP testnet fallback.
- [x] **Multi-Agent Governance:** LangGraph StateGraph pipeline with distinct Security, Guardian, and Transaction nodes.
- [x] **Named Customer & GTM:** Defined real-world persona (Sis Thandi) and actionable African rollout plan.

### Track 2 - Mobile Money & Peer-to-Peer (Secondary - Sponsored by Tether)
- [x] **Zero-Data USSD Gateway:** Full state machine (`routes_ussd.py`) compatible with any basic feature phone.
- [x] **Accessible Voice IVR:** Spoken audio prompts for visually impaired and low-literacy users (`routes_voice.py`).
- [x] **SMS Settlement Receipts:** Automated SMS payment confirmation via Africa's Talking.
- [x] **PBKDF2 Custodial PIN Security:** Salted PBKDF2-HMAC-SHA256 hashed 4-digit PINs with constant-time verification.
- [x] **Interactive Customer Phone Simulator:** Built-in web dialer and voice runner for live demonstrations without a physical SIM.

### Track 3 - Merchant & Machine Payments (Open Track)
- [x] **High-Contrast React POS:** Built with Web Speech API voice billing, live QR codes, and 60-second FX countdown.
- [x] **Multi-Persona Interface:** Tailored views for Merchants (`shop`), Fleet Leads (`machines`), and Auditors (`pro`).
- [x] **Unmistakable PAID Screen:** Instantaneous green status confirmation with clickable testnet transaction hash.
- [x] **Automatic Order Matching:** XRPL Destination Tags solve the "Two Ice Creams" problem without smart contracts.
- [x] **Smart Ledger Watcher:** Background `AccountTx` poller with auto-reconciliation for `PAID`, `UNDERPAID`, and `LATE` orders.
- [x] **1-Click Refund & Sweep:** Reversible transactions and off-ramp cash-out demonstration.

---

## License

[MIT](LICENSE) (c) 2026 Aegis Bridge Crypto
