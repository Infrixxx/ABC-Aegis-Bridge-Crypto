# Aegis Bridge Crypto (ABC)

> **W3Node Hackathon 2026** · Tracks: **Agentic Finance (Primary - Sponsored by Ripple)** · **Mobile Money & Peer-to-Peer (Secondary - Sponsored by Tether)** · **Merchant & Machine Payments**

An AI-governed, accessible crypto payment gateway for African markets. ABC bridges the **XRP Ledger (XRPL)** and **RLUSD** stablecoins with offline telecom infrastructure (**USSD & IVR Voice via Africa's Talking**) and autonomous machine-to-machine (**HTTP 402 M2M**) microtransactions — enabling anyone with a basic feature phone or IoT device to settle on-chain with zero mobile data.

---

## 📑 Table of Contents

1. [Executive Summary & The 4 Pillars](#executive-summary--the-4-pillars)
2. [Target Customer & Problem Statement](#target-customer--problem-statement)
3. [Answer to the 4 Core Challenge Questions](#answer-to-the-4-core-challenge-questions)
4. [Commercial Fee Comparison Table](#commercial-fee-comparison-table)
5. [Architecture & Agentic Finance Pipeline](#architecture--agentic-finance-pipeline)
6. [Offline Accessibility: USSD + IVR Voice](#offline-accessibility-ussd--ivr-voice)
7. [M2M Payments & XRPL Payment Channels](#m2m-payments--xrpl-payment-channels)
8. [Quick Start & Demo Guide](#quick-start--demo-guide)
9. [API Reference](#api-reference)
10. [Go-To-Market & Pilot Rollout](#go-to-market--pilot-rollout)
11. [Hackathon Submission Checklist](#hackathon-submission-checklist)
12. [License](#license)

---

## 🏛️ Executive Summary & The 4 Pillars

| Mandatory Pillar | Implementation in ABC | Status |
| :--- | :--- | :---: |
| **1. Real Payment, End to End** | Live transaction settlement executed on **XRPL Testnet** using **RLUSD** (Ripple USD) / XRP. Payer approves offline via USSD/voice or online via QR; LangGraph Supervisor settles on-chain and updates POS status. | ✅ Built |
| **2. Automatic Order Matching** | Solves the **"Two Ice Creams" problem** (two patrons buying identical R85 items simultaneously). A unique 32-bit XRPL **Destination Tag** is generated and embedded in the transaction `Memos` field, QR URI, and USSD dial code. | ✅ Built |
| **3. Merchant / Operator View** | WCAG-compliant React POS Terminal with Web Speech API voice billing, 60-second live volatility countdown, unmistakable green **"PAID IN FULL"** confirmation screen with clickable testnet hash, 1-click refund, and sweep off-ramp. | ✅ Built |
| **4. Hard Spending Cap for Machines** | Autonomous M2M devices (EV chargers, solar meters) are bound by **XRPL Payment Channels** on the XRP Ledger. The AI agent cannot exceed the funded balance; human operators retain external budget top-up and kill-switch control. | ✅ Built |

---

## 🎯 Target Customer & Problem Statement

### Named Customer: Sis Thandi's Spaza Shop
- **Location:** Walter Sisulu Road, Site B, Khayelitsha, Cape Town.
- **Profile:** Micro-merchant serving ~320 local residents daily with staples (bread, airtime, milk, prepaid electricity).
- **Daily Realities & Pain Points:**
  1. **Cash Robbery Danger:** Keeping R4,000 in cash daily makes her an immediate target for armed robberies. Cash-in-transit deposit fees at local ATMs cost 2.5% to 4%.
  2. **Card Machine Lock-Out:** Speedpoint and card machines charge R450 to R800/month rental, take 2.75% to 3.5% + R1.50 per swipe, and freeze whenever local cellular data networks experience load-shedding outages.
  3. **The Smartphone Barrier:** Over 65% of her elderly and grant-recipient customers own basic feature phones (Nokia 105s, Mobicel) with zero active mobile data. They cannot use standard Web3 dApps or Metamask.
  4. **Crypto Volatility:** Thandi cannot accept volatile crypto if a R50 loaf of bread devalues to R44 before supplier restocking day.

**How ABC Solves This:** Thandi taps a microphone button on her cheap Android tablet: *"Checkout 85 Rand"*. The POS immediately locks the exchange rate into RLUSD for 60 seconds and shows a `*123*79477624#` USSD code. Her customer dials it on their 2G Nokia phone, presses 1 to sign, and within 3 seconds, Thandi’s screen flashes bright green: **PAID IN FULL**.

---

## 💡 Answer to the 4 Core Challenge Questions

### 1. How does the customer pay in seconds from a phone they own?
The customer dials the generated USSD shortcode (e.g. `*123*DEST_TAG#`) or calls the toll-free IVR Voice gateway (`/api/voice`). Their phone number acts as their custodial identity. The USSD session displays the exact Rand and RLUSD amounts. Pressing **1** digitally signs and authorizes the transaction. Zero mobile data, zero seed phrases, and zero crypto app downloads required.

### 2. How does the merchant know which order was paid without a block explorer?
Through **XRPL Destination Tags & Memos matching**. Every order generates a unique 32-bit integer Destination Tag. When funds arrive, the backend watcher detects the tag and transaction memo, immediately updating the database. The React POS polls `/api/checkout/{order_id}` and switches to the green **PAID IN FULL** confirmation modal in `< 3 seconds`, displaying the live testnet hash.

### 3. How do funds reach a bank or mobile money account?
ABC integrates with regional off-ramps (e.g., **Kotani Pay** and **MoneyBadger**). The merchant console features a **"Sweep to Rand (Off-Ramp)"** button that automatically converts settled on-chain RLUSD stablecoins into instant fiat deposits (EFT or Instant PayShap) directly into the merchant's Standard Bank or Capitec account.

### 4. What is the max a machine can spend, and who can stop it?
Spending caps are enforced **on-ledger via XRPL Payment Channels**, never inside an LLM prompt. When a machine is registered (`POST /api/machine/register`), a Payment Channel is funded with a fixed cap (e.g. 25 XRP / RLUSD). The XRP Ledger itself rejects any transaction exceeding this limit. The human operator controls this outside the agent and can top up funds via `/api/machine/{id}/budget` or trigger an **Emergency Revoke (Kill-Switch)** via `/api/machine/{id}/revoke`.

---

## 📊 Commercial Fee Comparison Table

| Payment Method | Merchant Processing Fee | Monthly Hardware/SaaS Fee | Settlement Speed | Offline Capability | Robbery / Fraud Risk |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Physical Cash** | 2.0% – 4.5% (Deposit & transit costs) | R0 | Immediate physical | 100% Offline | **High (Armed robbery risk)** |
| **Traditional Card POS (Yoco/Speedpoint)** | 2.5% – 3.5% + R1.50 per swipe | R450 – R800 / month | 24 – 48 Hours | ❌ Requires 3G/LTE Internet | Low (Chargeback risk) |
| **Mobile Money (M-Pesa / EcoCash)** | 1.5% – 3.0% transfer fee | R0 | Instant (Walled garden) | ✅ USSD native | Low |
| **ABC on XRPL (Aegis Bridge)** | **0.5% + $0.0002 on-chain network fee** | **R0 (Runs in browser)** | **3 – 5 Seconds (On-chain)** | **✅ Full USSD & IVR Voice** | **Zero (Custodial on-chain)** |

---

## 🏗️ Architecture & Agentic Finance Pipeline

ABC uses a **LangGraph Multi-Agent Supervisor Pattern** to coordinate risk, security, and settlement:

```
                          ┌───────────────────────────┐
                          │   Africa's Talking USSD   │
                          │   or React Web POS QR     │
                          └─────────────┬─────────────┘
                                        │
                                        ▼
                          ┌───────────────────────────┐
                          │  FastAPI Relayer Engine   │
                          └─────────────┬─────────────┘
                                        │
                                        ▼
                          ┌───────────────────────────┐
                          │   LangGraph Supervisor    │
                          │      (supervisor.py)      │
                          └─────────────┬─────────────┘
                                        │
              ┌─────────────────────────┼─────────────────────────┐
              │                         │                         │
              ▼                         ▼                         ▼
   ┌────────────────────┐    ┌────────────────────┐    ┌────────────────────┐
   │   Security Agent   │    │   Guardian Agent   │    │ Transaction Agent  │
   │ Checks FX expiry   │───►│ Enforces Payment   │───►│ Signs with Treasury│
   │ & threat blacklist │    │ Channel budget cap │    │ seed & submits tx  │
   └────────────────────┘    └────────────────────┘    └─────────┬──────────┘
                                                                 │
                                                                 ▼
                                                       ┌────────────────────┐
                                                       │  XRP Ledger Testnet│
                                                       │   (RLUSD / XRP)    │
                                                       └────────────────────┘
```

1. **`security_agent.py`**: Verifies the 60-second volatility lock has not expired (marking `LATE` if stale) and checks merchant wallets against the `flagged_addresses` threat database.
2. **`guardian_agent.py`**: Queries the XRP Ledger directly for Payment Channel balances. Rejects transactions exceeding operator budgets and verifies supplier allowlists.
3. **`transaction_agent.py`**: The sole node holding the custodial testnet signing key. Encodes the `order_id` in the XRPL transaction `Memos` field, executes settlement, writes `tx_hash` to SQLite, and dispatches an Africa's Talking SMS receipt.

---

## 📱 Offline Accessibility: USSD + IVR Voice

To solve sub-Saharan Africa's smartphone deficit and support visually impaired or low-literacy users, ABC provides two zero-data telecom channels:

1. **Text USSD (`POST /api/ussd/`):**
   - Dial: `*120*ABC#`
   - Menu:
     ```
     CON Welcome to Aegis Crypto Bridge
     1. Pay Merchant
     2. Check Balance
     ```
   - Entering `1*79477624` loads the bill: `CON Pay R85.00 (4.68 RLUSD)? 1. Confirm`
   - Dialing `1` confirms payment and triggers the LangGraph settlement pipeline.

2. **Accessible Voice IVR (`POST /api/voice/`):**
   - Powered by Africa's Talking Voice XML.
   - Visually impaired patrons call the toll-free number.
   - Text-to-speech speaks the bill: *"Order 79477624 found. Total amount is 85 Rand, quoted at 4.68 RLUSD. Press 1 on your keypad to confirm."*
   - Pressing `1` executes on-chain settlement with audio confirmation.

---

## 🤖 M2M Payments & XRPL Payment Channels

For autonomous scripts, smart meters, solar micro-grids, and EV charging stations:

- **HTTP 402 Payment Required:** Unauthenticated or out-of-budget requests to `POST /api/machine/{id}/pay` return HTTP 402 with channel deficit metadata.
- **On-Ledger Enforcement:** Limits are enforced by **XRPL Payment Channels** created via `PaymentChannelCreate`. The AI agent cannot spend more than the ledger channel balance.
- **Operator "God Mode":** Human operators can review live ledger channel balances, top up channels via `PaymentChannelFund`, or hit the emergency kill-switch (`/api/machine/{id}/revoke`).

---

## 🚀 Quick Start & Demo Guide

### Prerequisites
- Python 3.11+
- Node.js 18+ & npm
- A funded [XRPL Testnet wallet](https://xrpl.org/resources/dev-tools/xrp-faucets)

### 1. Clone & Set Up Backend
```bash
git clone https://github.com/Infrixxx/ABC-Aegis-Bridge-Crypto.git
cd ABC-Aegis-Bridge-Crypto/backend

# Create virtualenv
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env
# Edit .env and supply your TREASURY_SEED and API keys

# Initialize SQLite Hybrid Ledger
python -m app.db.db_setup

# Start FastAPI Engine
uvicorn app.main:app --reload --port 8000
```
- API Swagger Docs: `http://localhost:8000/docs`
- Health Check: `http://localhost:8000/health`

### 2. Set Up Frontend POS & Operator Console
In a separate terminal:
```bash
cd ABC-Aegis-Bridge-Crypto/frontend
npm install
npm run dev
```
Open **`http://localhost:5173`** to access the high-contrast Merchant POS Terminal.

---

## 🔌 API Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/checkout/` | Creates order, locks FX rate for 60s, generates Destination Tag & QR |
| `GET` | `/api/checkout/{id}` | Status polling endpoint for POS terminal |
| `GET` | `/api/checkout/` | List recent orders for merchant transaction ledger |
| `POST` | `/api/checkout/refund` | Reverses a paid order in the Hybrid Ledger |
| `POST` | `/api/ussd/` | Africa's Talking USSD form-data webhook handler |
| `POST` | `/api/voice/` | Africa's Talking IVR Voice XML payment handler |
| `POST` | `/api/voice/confirm`| IVR Voice keypad DTMF confirmation callback |
| `POST` | `/api/machine/register` | Registers M2M device and creates on-ledger Payment Channel |
| `GET` | `/api/machine/{id}` | Queries device budget and live XRPL channel balance |
| `POST` | `/api/machine/{id}/budget` | Operator external top-up via `PaymentChannelFund` |
| `POST` | `/api/machine/{id}/pay` | Autonomous M2M payment execution (HTTP 402 compatible) |
| `POST` | `/api/machine/{id}/revoke`| Emergency operator kill-switch |
| `GET` | `/health` | Live system health and database check |

---

## 📈 Go-To-Market & Pilot Rollout

- **Phase 1: Pilot Deployment (Months 1–3):**
  - Launch with 10 spaza shops along Walter Sisulu Road in Khayelitsha, Cape Town.
  - Subsidize initial merchant transaction fees. Distribute laminated QR and USSD dialing cards.
- **Phase 2: Regional Telecom Distribution (Months 4–8):**
  - Leverage Africa's Talking aggregator network across South Africa, Kenya, and Nigeria.
  - Partner with local FMCG distributors (e.g., bread and beverage delivery trucks) to allow spaza shops to pay wholesalers directly in RLUSD without carrying physical cash.
- **Phase 3: Automated Micro-Utilities (Months 9–12):**
  - Integrate HTTP 402 M2M payment APIs into communal solar water heaters and pay-as-you-go solar micro-grids.

---

## 🏁 Hackathon Submission Checklist

### Track 1 — Agentic Finance (Primary — Sponsored by Ripple)
- [x] **Autonomous Agent Settlement:** `transaction_agent.py` autonomously submits signed transactions to XRPL Testnet.
- [x] **Ledger-Enforced Limits:** Hard spending caps enforced on-chain via **XRPL Payment Channels** (`xrpl_service.py`).
- [x] **Human Operator Controls:** Independent operator API (`POST /api/machine/{id}/budget` and `revoke`) outside the agent's control.
- [x] **RLUSD Integration:** Ready for Ripple USD stablecoin (`tryrlusd.com`) with XRP testnet fallback.
- [x] **Named Customer & GTM:** Defined real-world persona (Sis Thandi) and actionable African rollout plan.

### Track 2 — Mobile Money & Peer-to-Peer (Secondary — Sponsored by Tether)
- [x] **Zero-Data USSD Gateway:** Full state machine (`routes_ussd.py`) compatible with any basic feature phone.
- [x] **Accessible Voice IVR:** Spoken audio prompts for visually impaired and low-literacy users (`routes_voice.py`).
- [x] **SMS Settlement Receipts:** Automatic SMS payment confirmation via Africa's Talking.
- [x] **Custodial Phone Mapping:** Phone numbers mapped to custodial XRPL ledger wallets.

### Track 3 — Merchant & Machine Payments (Open Track)
- [x] **High-Contrast React POS:** Built with Web Speech API voice billing, live QR codes, and 60s FX lock.
- [x] **Unmistakable PAID Screen:** Instantaneous green status confirmation with clickable testnet transaction hash.
- [x] **Automatic Order Matching:** XRPL Destination Tags solve the "Two Ice Creams" problem without smart contracts.
- [x] **1-Click Refund & Sweep:** Reversible transactions and off-ramp cash-out demonstration.

---

## 📄 License

[MIT](LICENSE) © 2026 Code Whisperer
