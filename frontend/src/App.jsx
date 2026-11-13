import React, { useState, useEffect, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Mic,
  MicOff,
  QrCode,
  PhoneCall,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Cpu,
  ArrowRightLeft,
  ShieldAlert,
  Wallet,
  Clock,
  Sparkles,
  ExternalLink,
  RefreshCw,
  Sliders,
  DollarSign
} from "lucide-react";

const API_BASE = "http://localhost:8000";

export default function App() {
  const [activeTab, setActiveTab] = useState("pos"); // 'pos' | 'operator' | 'ledger'

  // POS State
  const [phone, setPhone] = useState("+27821234567");
  const [amountZar, setAmountZar] = useState("85");
  const [currentOrder, setCurrentOrder] = useState(null);
  const [orderStatus, setOrderStatus] = useState(null); // 'PENDING' | 'PAID' | 'LATE' | 'REFUNDED'
  const [timeLeft, setTimeLeft] = useState(60);
  const [isListening, setIsListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Ledger / History State
  const [ordersList, setOrdersList] = useState([]);

  // Operator State
  const [deviceId, setDeviceId] = useState("dev-ev-charger-01");
  const [operatorPhone, setOperatorPhone] = useState("+27839998888");
  const [maxBudgetCap, setMaxBudgetCap] = useState("25");
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [topUpAmount, setTopUpAmount] = useState("10");
  const [operatorNotice, setOperatorNotice] = useState("");

  // Poll current order status until PAID with tx_hash
  useEffect(() => {
    if (
      !currentOrder ||
      (orderStatus === "PAID" && currentOrder.tx_hash) ||
      orderStatus === "REFUNDED" ||
      orderStatus === "FAILED" ||
      orderStatus === "REJECTED" ||
      timeLeft <= 0
    ) {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/checkout/${currentOrder.order_id}`);
        if (res.ok) {
          const data = await res.json();
          setCurrentOrder(prev => ({ ...prev, ...data }));
          if (data.status === "PAID") {
            setOrderStatus("PAID");
            fetchRecentOrders();
          } else if (data.status === "LATE" || data.status === "FAILED" || data.status === "REJECTED") {
            setOrderStatus(data.status);
          }
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [currentOrder, orderStatus, timeLeft]);

  // 60-Second Countdown Timer
  useEffect(() => {
    if (!currentOrder || orderStatus === "PAID" || timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          setOrderStatus("LATE");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [currentOrder, orderStatus, timeLeft]);

  // Load orders history on tab change
  useEffect(() => {
    fetchRecentOrders();
    if (activeTab === "operator") {
      fetchDeviceInfo(deviceId);
    }
  }, [activeTab]);

  const fetchRecentOrders = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/checkout/`);
      if (res.ok) {
        const data = await res.json();
        setOrdersList(data.orders || []);
      }
    } catch (err) {
      console.warn("Could not load recent orders:", err);
    }
  };

  const fetchDeviceInfo = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/api/machine/${id}`);
      if (res.ok) {
        const data = await res.json();
        setDeviceInfo(data);
      } else {
        setDeviceInfo(null);
      }
    } catch (err) {
      console.warn("Failed to fetch device info:", err);
    }
  };

  // Web Speech API Voice Checkout
  const toggleSpeechRecognition = () => {
    if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
      alert("Web Speech API not supported in this browser. Please use Chrome or Edge.");
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-ZA";

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript.toLowerCase();
      console.log("Voice Transcript:", transcript);

      // Extract numeric values from speech: e.g. "checkout 85 rand" -> 85
      const matches = transcript.match(/\d+(\.\d+)?/);
      if (matches) {
        setAmountZar(matches[0]);
      } else if (transcript.includes("fifty")) {
        setAmountZar("50");
      } else if (transcript.includes("hundred")) {
        setAmountZar("100");
      }
    };

    if (isListening) {
      recognition.stop();
    } else {
      recognition.start();
    }
  };

  // Create Checkout
  const handleCreateCheckout = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    setErrorMsg("");
    setCurrentOrder(null);
    setOrderStatus(null);

    try {
      const res = await fetch(`${API_BASE}/api/checkout/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone_number: phone,
          amount_zar: parseFloat(amountZar) || 10,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Checkout creation failed");
      }

      const data = await res.json();
      setCurrentOrder(data);
      setOrderStatus("PENDING");
      setTimeLeft(60);
      fetchRecentOrders();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Simulate USSD Payment in 1-Click (For Live Judging Demo)
  const handleSimulateUSSDPayment = async () => {
    if (!currentOrder) return;
    setLoading(true);

    try {
      const formData = new URLSearchParams();
      formData.append("sessionId", "demo-session-123");
      formData.append("serviceCode", "*120*123#");
      formData.append("phoneNumber", currentOrder.phone_number || phone);
      formData.append("text", `1*${currentOrder.order_id}*1`);

      const res = await fetch(`${API_BASE}/api/ussd/`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
      });

      if (res.ok) {
        // Keep polling active until LangGraph writes PAID + tx_hash to SQLite
        fetchRecentOrders();
      }
    } catch (err) {
      alert("Simulation failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // 1-Click Refund
  const handleRefund = async (orderId) => {
    if (!confirm(`Confirm refund for Order ${orderId}? Stablecoins will be returned.`)) return;

    try {
      const res = await fetch(`${API_BASE}/api/checkout/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId, reason: "Merchant POS Refund" }),
      });

      if (res.ok) {
        alert(`Order ${orderId} refunded successfully.`);
        if (currentOrder?.order_id === orderId) {
          setOrderStatus("REFUNDED");
        }
        fetchRecentOrders();
      } else {
        const data = await res.json();
        alert(`Refund failed: ${data.detail}`);
      }
    } catch (err) {
      alert("Refund error: " + err.message);
    }
  };

  // Operator Register Device
  const handleRegisterDevice = async (e) => {
    e.preventDefault();
    setOperatorNotice("");
    try {
      const res = await fetch(`${API_BASE}/api/machine/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          device_id: deviceId,
          operator_phone: operatorPhone,
          max_budget_xrp: parseFloat(maxBudgetCap),
          approved_suppliers: [
            "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
            "rTreasuryWalletPlaceholder",
            "rMerchantStoreAddress1",
          ],
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setOperatorNotice(`Device registered! Payment channel initialized on XRPL Testnet.`);
        fetchDeviceInfo(deviceId);
      } else {
        setOperatorNotice(`Registration error: ${data.detail}`);
      }
    } catch (err) {
      setOperatorNotice(`Registration failed: ${err.message}`);
    }
  };

  // Operator Top Up Budget
  const handleTopUpBudget = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/machine/${deviceId}/budget`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ top_up_xrp: parseFloat(topUpAmount) || 5 }),
      });
      const data = await res.json();
      if (res.ok) {
        setOperatorNotice(`Payment Channel topped up +${topUpAmount} XRP!`);
        fetchDeviceInfo(deviceId);
      } else {
        setOperatorNotice(`Top-up failed: ${data.detail}`);
      }
    } catch (err) {
      setOperatorNotice(`Error: ${err.message}`);
    }
  };

  // Operator Revoke Device Key
  const handleRevokeDevice = async () => {
    if (!confirm(`REVOKE device ${deviceId}? The Guardian Agent will immediately block all payments.`)) return;
    try {
      const res = await fetch(`${API_BASE}/api/machine/${deviceId}/revoke`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setOperatorNotice(`Device ${deviceId} KEY REVOKED. Guardian Agent blocking active.`);
        fetchDeviceInfo(deviceId);
      }
    } catch (err) {
      alert(`Revoke failed: ${err.message}`);
    }
  };

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 16px" }}>
      {/* ── HEADER & NAVIGATION ────────────────────────────────────────────── */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
          paddingBottom: 24,
          borderBottom: "1px solid var(--border-color)",
          marginBottom: 28,
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 8,
                backgroundColor: "#2563eb",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 800,
                color: "#fff",
                fontSize: 18,
                boxShadow: "0 0 16px rgba(37,99,235,0.5)",
              }}
            >
              ABC
            </div>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.5px" }}>
                Aegis Bridge Crypto
              </h1>
              <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
                XRPL Agentic Finance · Offline USSD & IVR Gateway · HTTP 402 M2M
              </p>
            </div>
          </div>
        </div>

        {/* Tab Controls */}
        <nav style={{ display: "flex", gap: 8, backgroundColor: "var(--bg-card)", padding: 4, borderRadius: 10, border: "1px solid var(--border-color)" }}>
          <button
            onClick={() => setActiveTab("pos")}
            style={{
              padding: "10px 18px",
              borderRadius: 8,
              border: "none",
              backgroundColor: activeTab === "pos" ? "#2563eb" : "transparent",
              color: activeTab === "pos" ? "#fff" : "var(--text-muted)",
              fontWeight: 700,
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <QrCode size={16} /> Merchant POS
          </button>
          <button
            onClick={() => setActiveTab("operator")}
            style={{
              padding: "10px 18px",
              borderRadius: 8,
              border: "none",
              backgroundColor: activeTab === "operator" ? "#2563eb" : "transparent",
              color: activeTab === "operator" ? "#fff" : "var(--text-muted)",
              fontWeight: 700,
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Sliders size={16} /> Operator "God Mode"
          </button>
          <button
            onClick={() => setActiveTab("ledger")}
            style={{
              padding: "10px 18px",
              borderRadius: 8,
              border: "none",
              backgroundColor: activeTab === "ledger" ? "#2563eb" : "transparent",
              color: activeTab === "ledger" ? "#fff" : "var(--text-muted)",
              fontWeight: 700,
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <ArrowRightLeft size={16} /> Settled Ledger
          </button>
        </nav>
      </header>

      {/* ── TAB 1: MERCHANT POS TERMINAL ─────────────────────────────────────── */}
      {activeTab === "pos" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 24 }}>
          {/* Left Column: Price Input & Voice */}
          <div
            style={{
              backgroundColor: "var(--bg-card)",
              borderRadius: 14,
              border: "1px solid var(--border-color)",
              padding: 24,
            }}
          >
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
              <Wallet size={20} color="#3b82f6" /> Spaza Shop Terminal
            </h2>

            <form onSubmit={handleCreateCheckout}>
              <div style={{ marginBottom: 18 }}>
                <label style={{ display: "block", fontSize: 13, color: "var(--text-muted)", marginBottom: 8, fontWeight: 600 }}>
                  Customer Phone Number (Telecom Identity)
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  placeholder="+27821234567"
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    borderRadius: 8,
                    border: "1px solid var(--border-color)",
                    backgroundColor: "#0d1424",
                    color: "#fff",
                    fontSize: 15,
                  }}
                />
              </div>

              <div style={{ marginBottom: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <label style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 600 }}>
                    Order Amount (South African Rand - ZAR)
                  </label>
                  <button
                    type="button"
                    onClick={toggleSpeechRecognition}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 12,
                      fontWeight: 700,
                      backgroundColor: isListening ? "#ef4444" : "#1e293b",
                      color: isListening ? "#fff" : "#94a3b8",
                      border: "none",
                      borderRadius: 6,
                      padding: "4px 8px",
                    }}
                  >
                    {isListening ? <MicOff size={14} /> : <Mic size={14} />}
                    {isListening ? "Listening..." : "Say 'Checkout 85'"}
                  </button>
                </div>

                <div style={{ position: "relative" }}>
                  <span
                    style={{
                      position: "absolute",
                      left: 14,
                      top: 12,
                      fontSize: 20,
                      fontWeight: 800,
                      color: "#94a3b8",
                    }}
                  >
                    R
                  </span>
                  <input
                    type="number"
                    step="any"
                    value={amountZar}
                    onChange={(e) => setAmountZar(e.target.value)}
                    required
                    style={{
                      width: "100%",
                      padding: "12px 14px 12px 38px",
                      borderRadius: 8,
                      border: "1px solid var(--border-color)",
                      backgroundColor: "#0d1424",
                      color: "#10b981",
                      fontSize: 24,
                      fontWeight: 800,
                    }}
                  />
                </div>
              </div>

              {errorMsg && (
                <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 14 }}>
                  {errorMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "14px",
                  borderRadius: 8,
                  border: "none",
                  backgroundColor: "#2563eb",
                  color: "#fff",
                  fontSize: 16,
                  fontWeight: 800,
                  boxShadow: "0 4px 12px rgba(37,99,235,0.4)",
                }}
              >
                {loading ? "Locking FX Quote..." : "Generate Locked Bill"}
              </button>
            </form>

            <div style={{ marginTop: 24, borderTop: "1px solid var(--border-color)", paddingTop: 16, fontSize: 13, color: "var(--text-muted)" }}>
              <p>💡 <b>Two Ice Creams Solved:</b> Every checkout generates an XRPL Destination Tag. Multiple concurrent payments map to this specific session.</p>
            </div>
          </div>

          {/* Right Column: Dynamic Bill / QR / USSD Display */}
          <div
            style={{
              backgroundColor: "var(--bg-card)",
              borderRadius: 14,
              border: "1px solid var(--border-color)",
              padding: 24,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              minHeight: 440,
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* UNMISTAKABLE PAID SCREEN OVERLAY */}
            {orderStatus === "PAID" && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  backgroundColor: "#064e3b",
                  border: "3px solid #10b981",
                  borderRadius: 12,
                  zIndex: 20,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 24,
                  textAlign: "center",
                  animation: "fadeIn 0.3s ease-in-out",
                }}
              >
                <div
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: "50%",
                    backgroundColor: "#10b981",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 16,
                    boxShadow: "0 0 24px #10b981",
                  }}
                >
                  <CheckCircle2 size={44} color="#022c22" />
                </div>

                <h2 style={{ fontSize: 32, fontWeight: 900, color: "#fff", letterSpacing: "-0.5px", marginBottom: 6 }}>
                  PAID IN FULL
                </h2>
                <p style={{ fontSize: 16, color: "#a7f3d0", marginBottom: 18 }}>
                  Settled on XRP Ledger Testnet
                </p>

                <div
                  style={{
                    backgroundColor: "rgba(0,0,0,0.3)",
                    padding: "12px 18px",
                    borderRadius: 8,
                    marginBottom: 20,
                    fontSize: 14,
                    width: "100%",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ color: "#a7f3d0" }}>Amount Settled:</span>
                    <span style={{ fontWeight: 800, color: "#fff" }}>
                      R{currentOrder?.amount_zar} ({currentOrder?.quoted_crypto} RLUSD)
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ color: "#a7f3d0" }}>Destination Tag:</span>
                    <span style={{ fontWeight: 800, color: "#fff" }}>{currentOrder?.destination_tag}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ color: "#a7f3d0" }}>On-Chain Hash:</span>
                    <a
                      href={`https://testnet.xrpl.org/transactions/${currentOrder?.tx_hash || "mock-hash"}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        color: "#6ee7b7",
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        textDecoration: "underline",
                      }}
                    >
                      {currentOrder?.tx_hash ? `${currentOrder.tx_hash.slice(0, 10)}...` : "tesSUCCESS"}
                      <ExternalLink size={13} />
                    </a>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 12, width: "100%" }}>
                  <button
                    onClick={() => handleRefund(currentOrder.order_id)}
                    style={{
                      flex: 1,
                      padding: "10px",
                      borderRadius: 6,
                      border: "1px solid rgba(255,255,255,0.2)",
                      backgroundColor: "rgba(0,0,0,0.4)",
                      color: "#fff",
                      fontWeight: 700,
                      fontSize: 13,
                    }}
                  >
                    1-Click Refund
                  </button>
                  <button
                    onClick={() => {
                      setCurrentOrder(null);
                      setOrderStatus(null);
                    }}
                    style={{
                      flex: 1,
                      padding: "10px",
                      borderRadius: 6,
                      border: "none",
                      backgroundColor: "#10b981",
                      color: "#022c22",
                      fontWeight: 800,
                      fontSize: 13,
                    }}
                  >
                    Next Customer
                  </button>
                </div>
              </div>
            )}

            {/* PENDING ACTIVE BILL */}
            {currentOrder && orderStatus === "PENDING" && (
              <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
                {/* 60-Second FX Lock Badge */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    backgroundColor: timeLeft < 15 ? "rgba(239,68,68,0.2)" : "rgba(59,130,246,0.15)",
                    border: `1px solid ${timeLeft < 15 ? "#ef4444" : "#3b82f6"}`,
                    color: timeLeft < 15 ? "#f87171" : "#60a5fa",
                    padding: "6px 14px",
                    borderRadius: 20,
                    fontSize: 13,
                    fontWeight: 700,
                    marginBottom: 16,
                  }}
                >
                  <Clock size={16} />
                  FX Rate Locked: {timeLeft}s remaining
                </div>

                {/* QR Code */}
                <div
                  style={{
                    padding: 16,
                    backgroundColor: "#fff",
                    borderRadius: 12,
                    boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
                    marginBottom: 18,
                  }}
                >
                  <QRCodeSVG value={currentOrder.qr_payload} size={180} />
                </div>

                <div style={{ textAlign: "center", marginBottom: 16 }}>
                  <div style={{ fontSize: 28, fontWeight: 900, color: "#fff" }}>
                    R{currentOrder.amount_zar}
                  </div>
                  <div style={{ fontSize: 15, color: "#10b981", fontWeight: 700 }}>
                    {currentOrder.quoted_crypto} RLUSD
                  </div>
                </div>

                {/* Prominent Offline USSD Shortcode */}
                <div
                  style={{
                    backgroundColor: "#0d1424",
                    border: "1px solid #3b82f6",
                    borderRadius: 10,
                    padding: "12px 18px",
                    width: "100%",
                    textAlign: "center",
                    marginBottom: 16,
                  }}
                >
                  <div style={{ fontSize: 12, color: "#94a3b8", textTransform: "uppercase", fontWeight: 700 }}>
                    Feature Phone (Zero Data) Dial Code
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: "#60a5fa", letterSpacing: "1px" }}>
                    {currentOrder.ussd_shortcode}
                  </div>
                </div>

                {/* Demo Shortcut: Simulate USSD Confirmation */}
                <button
                  onClick={handleSimulateUSSDPayment}
                  disabled={loading}
                  style={{
                    width: "100%",
                    padding: "10px",
                    borderRadius: 6,
                    border: "1px dashed #10b981",
                    backgroundColor: "rgba(16,185,129,0.1)",
                    color: "#6ee7b7",
                    fontSize: 13,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  <Sparkles size={15} /> Simulate Offline USSD Confirmation (Demo)
                </button>
              </div>
            )}

            {/* EXPIRED ORDER */}
            {orderStatus === "LATE" && (
              <div style={{ textAlign: "center", padding: 20 }}>
                <AlertTriangle size={48} color="#ef4444" style={{ marginBottom: 12 }} />
                <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>Quote Expired</h3>
                <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 16 }}>
                  The 60-second volatility lock expired. Please generate a fresh bill.
                </p>
                <button
                  onClick={handleCreateCheckout}
                  style={{
                    padding: "10px 18px",
                    borderRadius: 8,
                    border: "none",
                    backgroundColor: "#2563eb",
                    color: "#fff",
                    fontWeight: 700,
                  }}
                >
                  Regenerate Quote
                </button>
              </div>
            )}

            {/* EMPTY STATE */}
            {!currentOrder && (
              <div style={{ textAlign: "center", color: "var(--text-muted)", padding: 40 }}>
                <QrCode size={56} style={{ margin: "0 auto 12px auto", opacity: 0.3 }} />
                <p style={{ fontSize: 15, fontWeight: 600 }}>Ready for Checkout</p>
                <p style={{ fontSize: 13 }}>Enter a Rand amount on the left or use your microphone.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 2: OPERATOR "GOD MODE" CONSOLE ─────────────────────────────────── */}
      {activeTab === "operator" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 24 }}>
          {/* Machine Budget Control */}
          <div style={{ backgroundColor: "var(--bg-card)", borderRadius: 14, border: "1px solid var(--border-color)", padding: 24 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
              <Cpu size={20} color="#f59e0b" /> Autonomous Machine Limits
            </h2>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 18 }}>
              <b>Track Requirement:</b> Spending limits are enforced on the XRP Ledger via Payment Channels. The AI agent cannot raise its own cap.
            </p>

            <form onSubmit={handleRegisterDevice}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", fontWeight: 600, marginBottom: 4 }}>
                  Device Identifier (IoT Meter / EV Charger)
                </label>
                <input
                  type="text"
                  value={deviceId}
                  onChange={(e) => setDeviceId(e.target.value)}
                  style={{ width: "100%", padding: "10px", borderRadius: 6, border: "1px solid var(--border-color)", backgroundColor: "#0d1424", color: "#fff" }}
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", fontWeight: 600, marginBottom: 4 }}>
                  Operator Alert Phone (Guardian SMS Target)
                </label>
                <input
                  type="text"
                  value={operatorPhone}
                  onChange={(e) => setOperatorPhone(e.target.value)}
                  style={{ width: "100%", padding: "10px", borderRadius: 6, border: "1px solid var(--border-color)", backgroundColor: "#0d1424", color: "#fff" }}
                />
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", fontWeight: 600, marginBottom: 4 }}>
                  Ledger Hard Budget Cap (XRP / RLUSD)
                </label>
                <input
                  type="number"
                  value={maxBudgetCap}
                  onChange={(e) => setMaxBudgetCap(e.target.value)}
                  style={{ width: "100%", padding: "10px", borderRadius: 6, border: "1px solid var(--border-color)", backgroundColor: "#0d1424", color: "#f59e0b", fontWeight: 800 }}
                />
              </div>

              <button
                type="submit"
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: 6,
                  border: "none",
                  backgroundColor: "#f59e0b",
                  color: "#000",
                  fontWeight: 800,
                  fontSize: 14,
                }}
              >
                Register & Fund Payment Channel
              </button>
            </form>

            {operatorNotice && (
              <div style={{ marginTop: 14, padding: 10, borderRadius: 6, backgroundColor: "rgba(245,158,11,0.1)", color: "#fbbf24", fontSize: 13 }}>
                {operatorNotice}
              </div>
            )}
          </div>

          {/* Live Device Status & Kill-Switch */}
          <div style={{ backgroundColor: "var(--bg-card)", borderRadius: 14, border: "1px solid var(--border-color)", padding: 24 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
              <ShieldAlert size={20} color="#ef4444" /> Live Enforced Status
            </h2>

            {deviceInfo ? (
              <div>
                <div style={{ backgroundColor: "#0d1424", padding: 16, borderRadius: 8, border: "1px solid var(--border-color)", marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13 }}>
                    <span style={{ color: "var(--text-muted)" }}>Device ID:</span>
                    <span style={{ fontWeight: 700 }}>{deviceInfo.device_id}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13 }}>
                    <span style={{ color: "var(--text-muted)" }}>Max Budget Cap:</span>
                    <span style={{ fontWeight: 800, color: "#f59e0b" }}>{deviceInfo.max_budget_cap_xrp} XRP</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13 }}>
                    <span style={{ color: "var(--text-muted)" }}>Channel Remaining:</span>
                    <span style={{ fontWeight: 800, color: "#10b981" }}>
                      {deviceInfo.ledger_channel_remaining_xrp !== null ? `${deviceInfo.ledger_channel_remaining_xrp} XRP (Ledger Live)` : `${deviceInfo.remaining_xrp} XRP`}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span style={{ color: "var(--text-muted)" }}>Key Status:</span>
                    <span style={{ fontWeight: 800, color: deviceInfo.is_key_revoked ? "#ef4444" : "#10b981" }}>
                      {deviceInfo.is_key_revoked ? "REVOKED (BLOCKED)" : "ACTIVE"}
                    </span>
                  </div>
                </div>

                {/* Operator External Top-Up */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 6, fontWeight: 600 }}>
                    External Operator Top-Up (Outside Agent)
                  </label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="number"
                      value={topUpAmount}
                      onChange={(e) => setTopUpAmount(e.target.value)}
                      style={{ flex: 1, padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border-color)", backgroundColor: "#0d1424", color: "#fff" }}
                    />
                    <button
                      type="button"
                      onClick={handleTopUpBudget}
                      style={{ padding: "8px 16px", borderRadius: 6, border: "none", backgroundColor: "#3b82f6", color: "#fff", fontWeight: 700, fontSize: 13 }}
                    >
                      Fund Channel
                    </button>
                  </div>
                </div>

                {/* Kill Switch */}
                <button
                  type="button"
                  onClick={handleRevokeDevice}
                  style={{
                    width: "100%",
                    padding: "10px",
                    borderRadius: 6,
                    border: "1px solid #ef4444",
                    backgroundColor: "rgba(239,68,68,0.15)",
                    color: "#f87171",
                    fontWeight: 800,
                    fontSize: 13,
                  }}
                >
                  Emergency Revoke Device Key (Kill Switch)
                </button>
              </div>
            ) : (
              <div style={{ textAlign: "center", color: "var(--text-muted)", padding: 40 }}>
                <p>No device selected. Enter a device ID and click Register to create a live on-ledger Payment Channel.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 3: SETTLED LEDGER & OFF-RAMP ──────────────────────────────────── */}
      {activeTab === "ledger" && (
        <div style={{ backgroundColor: "var(--bg-card)", borderRadius: 14, border: "1px solid var(--border-color)", padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>Settled Transactions Ledger</h2>
              <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
                Real-time hybrid ledger recording all POS, USSD, and M2M transactions.
              </p>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={fetchRecentOrders}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 14px",
                  borderRadius: 6,
                  border: "1px solid var(--border-color)",
                  backgroundColor: "#0d1424",
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                <RefreshCw size={14} /> Refresh
              </button>
              <button
                onClick={() => alert("Simulating Sweep to Rand via Kotani Pay / MoneyBadger API:\nR850.00 transferred to Merchant Standard Bank account.")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 16px",
                  borderRadius: 6,
                  border: "none",
                  backgroundColor: "#10b981",
                  color: "#022c22",
                  fontSize: 13,
                  fontWeight: 800,
                }}
              >
                <DollarSign size={15} /> Sweep to Rand (Off-Ramp)
              </button>
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-color)", color: "var(--text-muted)", textAlign: "left" }}>
                  <th style={{ padding: "10px" }}>Order ID</th>
                  <th style={{ padding: "10px" }}>Phone</th>
                  <th style={{ padding: "10px" }}>ZAR</th>
                  <th style={{ padding: "10px" }}>RLUSD</th>
                  <th style={{ padding: "10px" }}>Status</th>
                  <th style={{ padding: "10px" }}>TX Hash</th>
                  <th style={{ padding: "10px", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {ordersList.map((ord) => (
                  <tr key={ord.order_id} style={{ borderBottom: "1px solid var(--border-color)" }}>
                    <td style={{ padding: "12px 10px", fontWeight: 700 }}>{ord.order_id}</td>
                    <td style={{ padding: "12px 10px", color: "var(--text-muted)" }}>{ord.phone_number}</td>
                    <td style={{ padding: "12px 10px", fontWeight: 700, color: "#fff" }}>R{ord.amount_zar}</td>
                    <td style={{ padding: "12px 10px", color: "#10b981" }}>{ord.quoted_crypto}</td>
                    <td style={{ padding: "12px 10px" }}>
                      <span
                        style={{
                          padding: "3px 8px",
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 800,
                          backgroundColor:
                            ord.status === "PAID"
                              ? "rgba(16,185,129,0.2)"
                              : ord.status === "REFUNDED"
                              ? "rgba(245,158,11,0.2)"
                              : "rgba(239,68,68,0.2)",
                          color:
                            ord.status === "PAID"
                              ? "#34d399"
                              : ord.status === "REFUNDED"
                              ? "#fbbf24"
                              : "#f87171",
                        }}
                      >
                        {ord.status}
                      </span>
                    </td>
                    <td style={{ padding: "12px 10px" }}>
                      {ord.tx_hash ? (
                        <a
                          href={`https://testnet.xrpl.org/transactions/${ord.tx_hash}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: "#60a5fa", display: "flex", alignItems: "center", gap: 4 }}
                        >
                          {ord.tx_hash.slice(0, 8)}... <ExternalLink size={12} />
                        </a>
                      ) : (
                        <span style={{ color: "#64748b" }}>-</span>
                      )}
                    </td>
                    <td style={{ padding: "12px 10px", textAlign: "right" }}>
                      {ord.status === "PAID" && (
                        <button
                          onClick={() => handleRefund(ord.order_id)}
                          style={{
                            padding: "4px 8px",
                            borderRadius: 4,
                            border: "1px solid #ef4444",
                            backgroundColor: "transparent",
                            color: "#f87171",
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          Refund
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
