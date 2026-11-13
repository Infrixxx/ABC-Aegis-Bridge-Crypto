import React, { useState, useEffect, useMemo, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Mic,
  MicOff,
  QrCode,
  CheckCircle2,
  AlertTriangle,
  Cpu,
  ArrowRightLeft,
  ShieldAlert,
  Wallet,
  Clock,
  Sparkles,
  ExternalLink,
  RefreshCw,
  Sliders,
  DollarSign,
  Zap,
  Ban,
  Volume2,
  VolumeX,
  Sun,
  Moon,
  Eye,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Search,
  LayoutList,
  Table as TableIcon,
  ShieldCheck,
  Terminal
} from "lucide-react";

const API_BASE = "http://127.0.0.1:8000";
const QUICK_AMOUNTS = ["20", "35", "50", "85", "150", "250"];

export default function App() {
  // Navigation & View Mode
  const [activeTab, setActiveTab] = useState("pos"); // 'pos' | 'operator' | 'ledger'
  const [ledgerViewMode, setLedgerViewMode] = useState("feed"); // 'feed' | 'table'
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const [showAdvancedRouting, setShowAdvancedRouting] = useState(false);

  // Accessibility & Theme Preferences
  const [theme, setTheme] = useState(() => localStorage.getItem("abc_theme") || "dark");
  const [cvdMode, setCvdMode] = useState(() => localStorage.getItem("abc_cvd") || "standard"); // 'standard' | 'okabe' | 'hc'
  const [ttsEnabled, setTtsEnabled] = useState(() => localStorage.getItem("abc_tts") === "true");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [copiedKey, setCopiedKey] = useState(null);

  // POS State
  const [phone, setPhone] = useState("+27821234567");
  const [amountZar, setAmountZar] = useState("85");
  const [customMerchantAddr, setCustomMerchantAddr] = useState("");
  const [currentOrder, setCurrentOrder] = useState(null);
  const [orderStatus, setOrderStatus] = useState(null);
  const [timeLeft, setTimeLeft] = useState(60);
  const [isListening, setIsListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Ledger / History State
  const [ordersList, setOrdersList] = useState([]);

  // Operator State
  const [deviceId, setDeviceId] = useState("dev-ev-charger-01");
  const [operatorPhone, setOperatorPhone] = useState("+27839998888");
  const [maxBudgetCap, setMaxBudgetCap] = useState("10");
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [registeredDevices, setRegisteredDevices] = useState([]);
  const [topUpAmount, setTopUpAmount] = useState("5");
  const [operatorNotice, setOperatorNotice] = useState("");
  const [m2mResult, setM2mResult] = useState(null);
  const [m2mLoading, setM2mLoading] = useState(false);

  // Sync Theme & Color-Vision Deficiency Attributes
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("abc_theme", theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute("data-cvd", cvdMode);
    localStorage.setItem("abc_cvd", cvdMode);
  }, [cvdMode]);

  useEffect(() => {
    localStorage.setItem("abc_tts", String(ttsEnabled));
    if (!ttsEnabled && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  }, [ttsEnabled]);

  // Text-to-Speech (TTS) Engine
  const speakText = useCallback(
    (text, force = false) => {
      if ((!ttsEnabled && !force) || !("speechSynthesis" in window)) return;
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "en-ZA";
        utterance.rate = 1.02;
        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = () => setIsSpeaking(false);
        window.speechSynthesis.speak(utterance);
      } catch (e) {
        console.warn("TTS error:", e);
      }
    },
    [ttsEnabled]
  );

  const stopSpeaking = () => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };

  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  // Fetch Orders & Registered M2M Devices
  const fetchRecentOrders = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/checkout/`);
      if (res.ok) {
        const data = await res.json();
        setOrdersList(data.orders || []);
      }
    } catch (err) {
      console.warn("Could not load recent orders:", err);
    }
  }, []);

  const fetchDeviceInfo = useCallback(async (id) => {
    if (!id) return;
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
  }, []);

  const fetchAllDevices = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/machine/`);
      if (res.ok) {
        const data = await res.json();
        const list = data.devices || [];
        setRegisteredDevices(list);
        if (list.length > 0 && !deviceInfo) {
          const matching = list.find((d) => d.device_id === deviceId) || list[0];
          setDeviceId(matching.device_id);
          setDeviceInfo(matching);
        }
      }
    } catch (err) {
      console.warn("Could not list devices:", err);
    }
  }, [deviceId, deviceInfo]);

  useEffect(() => {
    fetchRecentOrders();
    fetchAllDevices();
  }, []);

  useEffect(() => {
    fetchRecentOrders();
    if (activeTab === "operator") {
      fetchAllDevices();
      fetchDeviceInfo(deviceId);
    }
  }, [activeTab]);

  // Poll Current Order Status Until PAID with tx_hash
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
          setCurrentOrder((prev) => ({ ...prev, ...data }));
          if (data.status === "PAID" && orderStatus !== "PAID") {
            setOrderStatus("PAID");
            fetchRecentOrders();
            speakText(
              `Payment confirmed in full. ${data.amount_zar} Rand settled on the XRP Ledger. Destination tag ${data.order_id}.`
            );
          } else if (data.status === "PROCESSING" && orderStatus !== "PROCESSING") {
            setOrderStatus("PROCESSING");
          } else if (
            data.status === "LATE" ||
            data.status === "FAILED" ||
            data.status === "REJECTED"
          ) {
            setOrderStatus(data.status);
            fetchRecentOrders();
          }
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [currentOrder, orderStatus, timeLeft, fetchRecentOrders, speakText]);

  // 60-Second Countdown Timer
  useEffect(() => {
    if (
      !currentOrder ||
      orderStatus === "PAID" ||
      orderStatus === "PROCESSING" ||
      timeLeft <= 0
    )
      return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setOrderStatus("LATE");
          speakText("Warning: 60 second foreign exchange rate lock has expired.");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [currentOrder, orderStatus, timeLeft, speakText]);

  // Derived Telemetry Metrics
  const telemetry = useMemo(() => {
    const paidOrders = ordersList.filter((o) => o.status === "PAID");
    const blockedOrders = ordersList.filter(
      (o) => o.status === "BUDGET_EXCEEDED" || o.status === "REJECTED"
    );
    const totalZar = paidOrders.reduce((acc, o) => acc + Number(o.amount_zar || 0), 0);
    const totalRlusd = paidOrders.reduce(
      (acc, o) => acc + Number(o.quoted_crypto || 0),
      0
    );
    return {
      paidCount: paidOrders.length,
      blockedCount: blockedOrders.length,
      totalZar,
      totalRlusd,
    };
  }, [ordersList]);

  const filteredOrders = useMemo(() => {
    return ordersList.filter((ord) => {
      const matchesStatus =
        statusFilter === "ALL"
          ? true
          : statusFilter === "BLOCKED"
          ? ord.status === "BUDGET_EXCEEDED" || ord.status === "REJECTED" || ord.status === "LATE"
          : ord.status === statusFilter;

      const q = searchQuery.trim().toLowerCase();
      const matchesQuery =
        !q ||
        String(ord.order_id || "").toLowerCase().includes(q) ||
        String(ord.phone_number || "").toLowerCase().includes(q) ||
        String(ord.tx_hash || "").toLowerCase().includes(q);

      return matchesStatus && matchesQuery;
    });
  }, [ordersList, statusFilter, searchQuery]);

  // Speech-to-Text (STT) Voice Billing
  const toggleSpeechRecognition = () => {
    if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
      alert("Web Speech API not supported in this browser. Please use Chrome or Edge.");
      return;
    }

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-ZA";

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript.toLowerCase();
      const matches = transcript.match(/\d+(\.\d+)?/);
      if (matches) {
        setAmountZar(matches[0]);
        speakText(`Amount set to ${matches[0]} Rand`);
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
      const payload = {
        phone_number: phone,
        amount_zar: parseFloat(amountZar) || 10,
      };
      if (customMerchantAddr.trim()) {
        payload.merchant_address = customMerchantAddr.trim();
      }

      const res = await fetch(`${API_BASE}/api/checkout/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
      speakText(
        `Bill locked for ${data.amount_zar} Rand, quoted at ${data.quoted_crypto} R L U S D. Feature phone dial code star 1 2 3 star ${data.destination_tag} hash.`
      );
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Simulate USSD Payment
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
        setOrderStatus("PROCESSING");
        fetchRecentOrders();
        speakText("Offline USSD signature received. LangGraph settling on XRP Ledger Testnet.");
      }
    } catch (err) {
      alert("Simulation failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // 1-Click Refund
  const handleRefund = async (orderId) => {
    if (!confirm(`Confirm refund for Order #${orderId}? Stablecoins will be returned.`))
      return;

    try {
      const res = await fetch(`${API_BASE}/api/checkout/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId, reason: "Merchant POS Refund" }),
      });

      if (res.ok) {
        if (currentOrder?.order_id === orderId) {
          setOrderStatus("REFUNDED");
        }
        fetchRecentOrders();
        speakText(`Order ${orderId} has been marked refunded.`);
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
    setOperatorNotice("Submitting PaymentChannelCreate transaction to XRPL Testnet...");
    setM2mResult(null);
    setM2mLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/machine/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          device_id: deviceId,
          operator_phone: operatorPhone,
          max_budget_xrp: parseFloat(maxBudgetCap),
          approved_suppliers: ["rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe"],
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setOperatorNotice(
          `On-Ledger Payment Channel (${data.channel_id.slice(0, 14)}...) funded with ${data.max_budget_xrp} XRP.`
        );
        await fetchAllDevices();
        await fetchDeviceInfo(deviceId);
        speakText(
          `Device ${deviceId} registered. XRP Ledger Payment Channel funded with ${data.max_budget_xrp} XRP hard spending cap.`
        );
      } else {
        setOperatorNotice(`Registration error: ${data.detail}`);
      }
    } catch (err) {
      setOperatorNotice(`Registration failed: ${err.message}`);
    } finally {
      setM2mLoading(false);
    }
  };

  // Operator Top Up Budget
  const handleTopUpBudget = async () => {
    setOperatorNotice("Submitting PaymentChannelFund transaction to XRPL Testnet...");
    setM2mLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/machine/${deviceId}/budget`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ top_up_xrp: parseFloat(topUpAmount) || 5 }),
      });
      const data = await res.json();
      if (res.ok) {
        setOperatorNotice(
          `Payment Channel topped up +${topUpAmount} XRP on-ledger (New cap: ${data.new_max_budget_cap_xrp} XRP).`
        );
        await fetchAllDevices();
        await fetchDeviceInfo(deviceId);
        speakText(`Payment channel funded with an additional ${topUpAmount} XRP.`);
      } else {
        setOperatorNotice(`Top-up failed: ${data.detail}`);
      }
    } catch (err) {
      setOperatorNotice(`Error: ${err.message}`);
    } finally {
      setM2mLoading(false);
    }
  };

  // Operator Revoke Device Key
  const handleRevokeDevice = async () => {
    if (
      !confirm(
        `REVOKE device ${deviceId}? The Guardian Agent will immediately block all future payments.`
      )
    )
      return;
    try {
      const res = await fetch(`${API_BASE}/api/machine/${deviceId}/revoke`, {
        method: "POST",
      });
      if (res.ok) {
        setOperatorNotice(
          `Device ${deviceId} KEY REVOKED. Guardian Agent Kill-Switch is active.`
        );
        await fetchAllDevices();
        await fetchDeviceInfo(deviceId);
        speakText(`Emergency kill switch activated. Device ${deviceId} key revoked.`);
      }
    } catch (err) {
      alert(`Revoke failed: ${err.message}`);
    }
  };

  // Simulate M2M Autonomous Agent Payment
  const handleSimulateM2MPayment = async (mode) => {
    if (!deviceInfo?.channel_id) {
      alert("Please register or select a device with an active XRPL Payment Channel first.");
      return;
    }

    setM2mLoading(true);
    setM2mResult(null);

    try {
      const zarAmount = mode === "over_budget" ? 500.0 : 35.0;
      const checkoutBody = {
        phone_number: operatorPhone,
        amount_zar: zarAmount,
      };
      if (mode === "unapproved_supplier") {
        checkoutBody.merchant_address = "rUnapprovedRogueSupplierWallet999";
      }

      const orderRes = await fetch(`${API_BASE}/api/checkout/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(checkoutBody),
      });
      const orderData = await orderRes.json();

      const payRes = await fetch(`${API_BASE}/api/machine/${deviceId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: orderData.order_id,
          channel_id: deviceInfo.channel_id,
        }),
      });

      const payData = await payRes.json();

      if (payRes.ok) {
        const msg = `Order #${orderData.order_id} (R${zarAmount} / ${orderData.quoted_crypto} RLUSD) passed Security & Guardian checks and settled on XRPL Testnet.`;
        setM2mResult({
          type: "success",
          code: 200,
          title: "HTTP 200 · AUTONOMOUS M2M PAYMENT SETTLED",
          detail: msg,
          tx_hash: payData.tx_hash,
        });
        speakText(`Autonomous machine payment settled. ${zarAmount} Rand paid on XRP Ledger.`);
      } else {
        const errDetail = payData.detail || {};
        const blockTitle =
          payRes.status === 402
            ? "HTTP 402 PAYMENT REQUIRED · LEDGER CAP ENFORCED"
            : `HTTP ${payRes.status} · MANDATE POLICY BLOCK (${errDetail.error || "REJECTED"})`;
        const blockMsg =
          errDetail.message ||
          JSON.stringify(errDetail) ||
          "Blocked by on-ledger Payment Channel policy.";
        setM2mResult({
          type: "blocked",
          code: payRes.status,
          title: blockTitle,
          detail: blockMsg,
        });
        speakText(`Guardian Agent blocked transaction. ${blockMsg}`);
      }

      await fetchAllDevices();
      await fetchDeviceInfo(deviceId);
      await fetchRecentOrders();
    } catch (err) {
      setM2mResult({
        type: "blocked",
        code: 500,
        title: "M2M Simulation Error",
        detail: err.message,
      });
    } finally {
      setM2mLoading(false);
    }
  };

  // Helper to render accessible status badges with distinct icons & prefixes
  const renderStatusBadge = (status) => {
    switch (status) {
      case "PAID":
        return (
          <span className="status-badge success">
            <CheckCircle2 size={12} /> ✓ PAID
          </span>
        );
      case "PROCESSING":
        return (
          <span className="status-badge warning">
            <Clock size={12} /> ⏳ SETTLING
          </span>
        );
      case "PENDING":
        return (
          <span className="status-badge neutral">
            <Clock size={12} /> ● PENDING
          </span>
        );
      case "BUDGET_EXCEEDED":
        return (
          <span className="status-badge danger">
            <ShieldAlert size={12} /> ✕ 402 CAP BLOCKED
          </span>
        );
      case "REJECTED":
        return (
          <span className="status-badge danger">
            <Ban size={12} /> ✕ REJECTED
          </span>
        );
      case "LATE":
        return (
          <span className="status-badge warning">
            <AlertTriangle size={12} /> ⏱ FX EXPIRED
          </span>
        );
      case "REFUNDED":
        return (
          <span className="status-badge warning">
            <ArrowRightLeft size={12} /> ↩ REFUNDED
          </span>
        );
      default:
        return <span className="status-badge neutral">{status}</span>;
    }
  };

  const cycleCvdMode = () => {
    const order = ["standard", "okabe", "hc"];
    const next = order[(order.indexOf(cvdMode) + 1) % order.length];
    setCvdMode(next);
  };

  const cvdLabel =
    cvdMode === "standard"
      ? "Vision: Standard"
      : cvdMode === "okabe"
      ? "Vision: Color-Blind Safe"
      : "Vision: High-Contrast";

  const channelUtilPct = deviceInfo?.max_budget_cap_xrp
    ? Math.min(
        100,
        Math.round(
          (Number(deviceInfo.current_spent_xrp || 0) /
            Number(deviceInfo.max_budget_cap_xrp)) *
            100
        )
      )
    : 0;

  return (
    <div className="app-shell">
      {/* ── STICKY COMMAND HEADER ──────────────────────────────────────────── */}
      <header className="top-bar">
        <div className="top-bar-inner">
          <div className="brand-cluster">
            <div className="brand-mark">ABC</div>
            <div>
              <div className="brand-title">
                Aegis Bridge Crypto
                <span className="status-badge success" style={{ fontSize: 10 }}>
                  XRPL TESTNET LIVE
                </span>
              </div>
              <div className="brand-subtitle">
                Sis Thandi's Spaza POS · Offline USSD/IVR · HTTP 402 Machine Channels
              </div>
            </div>
          </div>

          {/* Primary Segmented Navigation */}
          <nav className="nav-pills" aria-label="Primary Workspace Navigation">
            <button
              type="button"
              onClick={() => setActiveTab("pos")}
              className={`nav-pill ${activeTab === "pos" ? "active" : ""}`}
            >
              <QrCode size={15} /> Merchant POS
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("operator")}
              className={`nav-pill ${activeTab === "operator" ? "active" : ""}`}
            >
              <Sliders size={15} /> Operator Mandate
              {registeredDevices.length > 0 && (
                <span className="nav-count">{registeredDevices.length}</span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("ledger")}
              className={`nav-pill ${activeTab === "ledger" ? "active" : ""}`}
            >
              <ArrowRightLeft size={15} /> Audit Feed
              <span className="nav-count">{ordersList.length}</span>
            </button>
          </nav>

          {/* Accessibility & Theme Controls */}
          <div className="a11y-toolbar">
            <button
              type="button"
              onClick={() => {
                if (isSpeaking) {
                  stopSpeaking();
                } else {
                  const nextState = !ttsEnabled;
                  setTtsEnabled(nextState);
                  if (nextState) {
                    speakText(
                      `Audio readout enabled. Settled volume is ${telemetry.totalZar.toFixed(
                        0
                      )} Rand across ${telemetry.paidCount} transactions.`,
                      true
                    );
                  }
                }
              }}
              className={`control-pill ${ttsEnabled ? "active" : ""}`}
              title="Toggle Text-to-Speech Audio Readout"
            >
              {ttsEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
              {ttsEnabled ? "TTS Audio: ON" : "TTS Audio: OFF"}
            </button>

            <button
              type="button"
              onClick={cycleCvdMode}
              className={`control-pill ${cvdMode !== "standard" ? "active" : ""}`}
              title="Switch Color-Blindness & Contrast Mode (Standard / Okabe-Ito Safe / High-Contrast)"
            >
              <Eye size={14} />
              {cvdLabel}
            </button>

            <button
              type="button"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="icon-btn"
              title="Toggle Dark / Light Surface Theme"
            >
              {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
              {theme === "dark" ? "Light" : "Dark"}
            </button>
          </div>
        </div>
      </header>

      {/* ── NEOBANK TELEMETRY STRIP (TABULAR-NUMS KPI TILES) ───────────────── */}
      <section className="kpi-grid" aria-label="Treasury & Channel Telemetry">
        <div className="kpi-tile">
          <div className="kpi-label">
            <span>Settled Volume (POS & M2M)</span>
            <Wallet size={13} />
          </div>
          <div className="kpi-value tabular-nums">
            R{telemetry.totalZar.toFixed(2)}
          </div>
          <div className="kpi-sub tabular-nums">
            {telemetry.totalRlusd.toFixed(4)} RLUSD · {telemetry.paidCount} settled txns
          </div>
        </div>

        <div className="kpi-tile">
          <div className="kpi-label">
            <span>Oracle FX Lock Window</span>
            <Clock size={13} />
          </div>
          <div className="kpi-value tabular-nums">1 ZAR ≈ 0.0550 RLUSD</div>
          <div className="kpi-sub tabular-nums">
            60s volatility shield · 0.5% fee + $0.0002 gas
          </div>
        </div>

        <div className="kpi-tile">
          <div className="kpi-label">
            <span>Active M2M Channel Cap</span>
            <Cpu size={13} />
          </div>
          <div className="kpi-value tabular-nums">
            {deviceInfo
              ? `${Number(deviceInfo.remaining_xrp).toFixed(2)} / ${Number(
                  deviceInfo.max_budget_cap_xrp
                ).toFixed(2)} XRP`
              : "No Channel Selected"}
          </div>
          <div className="kpi-sub tabular-nums">
            {deviceInfo
              ? `Device: ${deviceInfo.device_id} (${
                  deviceInfo.is_key_revoked ? "REVOKED" : "ACTIVE"
                })`
              : "On-ledger PaymentChannelCreate"}
          </div>
        </div>

        <div className="kpi-tile">
          <div className="kpi-label">
            <span>Guardian Policy Blocks</span>
            <ShieldCheck size={13} />
          </div>
          <div className="kpi-value tabular-nums">{telemetry.blockedCount} Blocked</div>
          <div className="kpi-sub tabular-nums">
            Enforced via HTTP 402 & XRPL AccountChannels
          </div>
        </div>
      </section>

      {/* ── TAB 1: MERCHANT POS TERMINAL ───────────────────────────────────── */}
      {activeTab === "pos" && (
        <div className="workspace-grid">
          {/* Left Column: Order Entry & Voice Input */}
          <div className="surface-card">
            <div className="card-header">
              <div>
                <div className="card-title">
                  <Wallet size={17} /> Checkout & FX Rate Lock
                </div>
                <div className="card-subtitle">
                  Generates a collision-safe 32-bit XRPL Destination Tag ("Two Ice Creams" solver)
                </div>
              </div>
              <button
                type="button"
                onClick={toggleSpeechRecognition}
                className={`control-pill ${isListening ? "active" : ""}`}
              >
                {isListening ? <MicOff size={14} /> : <Mic size={14} />}
                {isListening ? "Listening (en-ZA)..." : "Voice Input"}
              </button>
            </div>

            <div className="card-body">
              <form onSubmit={handleCreateCheckout}>
                <div className="field-group">
                  <div className="field-label-row">
                    <label className="field-label" htmlFor="pos-amount">
                      Checkout Amount (South African Rand · ZAR)
                    </label>
                    <span className="font-mono" style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      ≈ {((parseFloat(amountZar) || 0) * 0.055).toFixed(4)} RLUSD
                    </span>
                  </div>
                  <div className="amount-input-wrap">
                    <span className="currency-prefix">R</span>
                    <input
                      id="pos-amount"
                      type="number"
                      step="any"
                      min="1"
                      value={amountZar}
                      onChange={(e) => setAmountZar(e.target.value)}
                      required
                      className="amount-input"
                    />
                  </div>
                  <div className="chip-row">
                    {QUICK_AMOUNTS.map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setAmountZar(amt)}
                        className={`quick-chip ${amountZar === amt ? "active" : ""}`}
                      >
                        R{amt}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="field-group">
                  <div className="field-label-row">
                    <label className="field-label" htmlFor="pos-phone">
                      Customer Telecom Identity (USSD / SMS Receipt Number)
                    </label>
                  </div>
                  <input
                    id="pos-phone"
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    placeholder="+27821234567"
                    className="text-input font-mono"
                  />
                </div>

                {/* Collapsible Advanced XRPL Routing Drawer */}
                <div style={{ marginBottom: 16 }}>
                  <button
                    type="button"
                    onClick={() => setShowAdvancedRouting(!showAdvancedRouting)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--text-muted)",
                      fontSize: 12,
                      fontWeight: 600,
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      cursor: "pointer",
                    }}
                  >
                    {showAdvancedRouting ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    Advanced XRPL Destination & Memo Routing
                  </button>
                  {showAdvancedRouting && (
                    <div
                      style={{
                        marginTop: 8,
                        padding: 12,
                        borderRadius: 8,
                        backgroundColor: "var(--bg-subtle)",
                        border: "1px solid var(--border-subtle)",
                      }}
                    >
                      <label className="field-label" style={{ display: "block", marginBottom: 4 }}>
                        Override Merchant XRPL Wallet (Optional)
                      </label>
                      <input
                        type="text"
                        value={customMerchantAddr}
                        onChange={(e) => setCustomMerchantAddr(e.target.value)}
                        placeholder="Defaults to configured MERCHANT_WALLET_ADDRESS in .env"
                        className="text-input font-mono"
                        style={{ fontSize: 12 }}
                      />
                    </div>
                  )}
                </div>

                {errorMsg && (
                  <div
                    style={{
                      padding: "10px 12px",
                      borderRadius: 8,
                      backgroundColor: "var(--status-danger-bg)",
                      border: "1px solid var(--status-danger-border)",
                      color: "var(--status-danger-fg)",
                      fontSize: 12,
                      fontWeight: 600,
                      marginBottom: 14,
                    }}
                  >
                    {errorMsg}
                  </div>
                )}

                <button type="submit" disabled={loading} className="btn-primary">
                  <QrCode size={16} />
                  {loading ? "Locking Live FX Quote..." : "Lock 60s Quote & Generate Tag"}
                </button>
              </form>
            </div>

            <div className="card-footer">
              <span>Zero smart contracts required · Native XRPL DestinationTag + Memo</span>
              <span className="font-mono">3–5s Finality</span>
            </div>
          </div>

          {/* Right Column: Active Payment Ticket / Settlement Receipt */}
          <div className="surface-card">
            <div className="card-header">
              <div>
                <div className="card-title">
                  <Terminal size={17} /> Live Settlement Ticket
                </div>
                <div className="card-subtitle">
                  {currentOrder
                    ? `Order #${currentOrder.order_id} · ${currentOrder.phone_number}`
                    : "Awaiting checkout generation"}
                </div>
              </div>
              {currentOrder && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() =>
                      speakText(
                        orderStatus === "PAID"
                          ? `Order ${currentOrder.order_id} paid in full. ${currentOrder.amount_zar} Rand settled on XRP Ledger.`
                          : `Active bill for ${currentOrder.amount_zar} Rand, equivalent to ${currentOrder.quoted_crypto} RLUSD. Dial star 1 2 3 star ${currentOrder.destination_tag} hash on any feature phone.`,
                        true
                      )
                    }
                    className="icon-btn"
                    title="Read Ticket Aloud (Text-to-Speech)"
                  >
                    <Volume2 size={14} /> Speak
                  </button>
                  {renderStatusBadge(orderStatus)}
                </div>
              )}
            </div>

            <div className="card-body">
              {/* STATE A: SETTLED RECEIPT */}
              {currentOrder && orderStatus === "PAID" && (
                <div>
                  <div
                    style={{
                      padding: 16,
                      borderRadius: 10,
                      backgroundColor: "var(--status-success-bg)",
                      border: "1px solid var(--status-success-border)",
                      marginBottom: 16,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 8,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 800,
                          textTransform: "uppercase",
                          color: "var(--status-success-fg)",
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <CheckCircle2 size={16} /> ✓ PAID IN FULL · ON-CHAIN FINALITY
                      </span>
                      <span className="font-mono" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                        tesSUCCESS
                      </span>
                    </div>
                    <div className="tabular-nums" style={{ fontSize: 28, fontWeight: 800 }}>
                      R{Number(currentOrder.amount_zar).toFixed(2)}{" "}
                      <span style={{ fontSize: 16, fontWeight: 600, color: "var(--text-secondary)" }}>
                        ({currentOrder.quoted_crypto} RLUSD)
                      </span>
                    </div>
                  </div>

                  {/* Structured Receipt Metadata Rows */}
                  <div
                    style={{
                      border: "1px solid var(--border-subtle)",
                      borderRadius: 10,
                      overflow: "hidden",
                      marginBottom: 16,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "10px 14px",
                        borderBottom: "1px solid var(--border-subtle)",
                        fontSize: 13,
                      }}
                    >
                      <span style={{ color: "var(--text-muted)" }}>Destination Tag (Order ID)</span>
                      <span className="font-mono" style={{ fontWeight: 700 }}>
                        #{currentOrder.destination_tag}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "10px 14px",
                        borderBottom: "1px solid var(--border-subtle)",
                        fontSize: 13,
                      }}
                    >
                      <span style={{ color: "var(--text-muted)" }}>Merchant Wallet</span>
                      <span className="font-mono" style={{ fontSize: 12 }}>
                        {currentOrder.merchant_address
                          ? `${currentOrder.merchant_address.slice(0, 10)}...${currentOrder.merchant_address.slice(-6)}`
                          : "Configured Merchant"}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "10px 14px",
                        fontSize: 13,
                      }}
                    >
                      <span style={{ color: "var(--text-muted)" }}>XRPL Testnet Hash</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <a
                          href={`https://testnet.xrpl.org/transactions/${currentOrder.tx_hash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono"
                          style={{
                            color: "var(--accent-primary)",
                            fontWeight: 700,
                            textDecoration: "underline",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          {currentOrder.tx_hash
                            ? `${currentOrder.tx_hash.slice(0, 14)}...`
                            : "Explorer"}
                          <ExternalLink size={12} />
                        </a>
                        {currentOrder.tx_hash && (
                          <button
                            type="button"
                            onClick={() => copyToClipboard(currentOrder.tx_hash, "pos-hash")}
                            className="icon-btn"
                            style={{ padding: "4px 7px" }}
                          >
                            {copiedKey === "pos-hash" ? <Check size={12} /> : <Copy size={12} />}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      type="button"
                      onClick={() => handleRefund(currentOrder.order_id)}
                      className="btn-outline-danger"
                      style={{ flex: 1 }}
                    >
                      1-Click Refund
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCurrentOrder(null);
                        setOrderStatus(null);
                      }}
                      className="btn-primary"
                      style={{ flex: 1 }}
                    >
                      Next Customer
                    </button>
                  </div>
                </div>
              )}

              {/* STATE B: ACTIVE PENDING / PROCESSING TICKET */}
              {currentOrder &&
                (orderStatus === "PENDING" || orderStatus === "PROCESSING") && (
                  <div>
                    {/* Volatility Lock Countdown Progress Bar */}
                    <div style={{ marginBottom: 16 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: 12,
                          fontWeight: 600,
                          marginBottom: 6,
                        }}
                      >
                        <span style={{ color: "var(--text-secondary)" }}>
                          {orderStatus === "PROCESSING"
                            ? "USSD Confirmed · LangGraph Settling on XRPL..."
                            : "60s FX Volatility Lock Window"}
                        </span>
                        <span className="font-mono">
                          {orderStatus === "PROCESSING" ? "3–5s" : `${timeLeft}s remaining`}
                        </span>
                      </div>
                      <div className="meter-track">
                        <div
                          className="meter-fill"
                          style={{
                            width:
                              orderStatus === "PROCESSING"
                                ? "100%"
                                : `${Math.max(0, (timeLeft / 60) * 100)}%`,
                            backgroundColor:
                              orderStatus === "PROCESSING"
                                ? "var(--status-success-fg)"
                                : timeLeft < 15
                                ? "var(--status-danger-fg)"
                                : "var(--accent-primary)",
                          }}
                        />
                      </div>
                    </div>

                    {/* Split QR + USSD Dial Instructions */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "auto 1fr",
                        gap: 16,
                        alignItems: "center",
                        padding: 16,
                        borderRadius: 10,
                        backgroundColor: "var(--bg-subtle)",
                        border: "1px solid var(--border-subtle)",
                        marginBottom: 16,
                      }}
                    >
                      <div
                        style={{
                          padding: 10,
                          backgroundColor: "#FFFFFF",
                          borderRadius: 8,
                          border: "1px solid var(--border-subtle)",
                        }}
                      >
                        <QRCodeSVG value={currentOrder.qr_payload} size={132} />
                      </div>

                      <div>
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            color: "var(--text-muted)",
                            marginBottom: 2,
                          }}
                        >
                          Locked Quote Amount
                        </div>
                        <div className="tabular-nums" style={{ fontSize: 24, fontWeight: 800 }}>
                          R{Number(currentOrder.amount_zar).toFixed(2)}{" "}
                          <span
                            style={{
                              fontSize: 14,
                              fontWeight: 700,
                              color: "var(--status-success-fg)",
                            }}
                          >
                            ({currentOrder.quoted_crypto} RLUSD)
                          </span>
                        </div>

                        <div
                          style={{
                            marginTop: 12,
                            padding: "8px 12px",
                            borderRadius: 8,
                            backgroundColor: "var(--bg-surface)",
                            border: "1px solid var(--border-subtle)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                          }}
                        >
                          <div>
                            <div
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                textTransform: "uppercase",
                                color: "var(--text-muted)",
                              }}
                            >
                              2G Feature Phone USSD Code
                            </div>
                            <div
                              className="font-mono"
                              style={{
                                fontSize: 18,
                                fontWeight: 700,
                                color: "var(--text-primary)",
                              }}
                            >
                              {currentOrder.ussd_shortcode}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              copyToClipboard(currentOrder.ussd_shortcode, "ussd-code")
                            }
                            className="icon-btn"
                            title="Copy USSD Shortcode"
                          >
                            {copiedKey === "ussd-code" ? <Check size={13} /> : <Copy size={13} />}
                          </button>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleSimulateUSSDPayment}
                      disabled={loading || orderStatus === "PROCESSING"}
                      className="btn-primary"
                    >
                      <Sparkles size={15} />
                      {orderStatus === "PROCESSING"
                        ? "Settling on XRPL Testnet (Waiting for Validated Ledger)..."
                        : "Simulate Offline USSD Confirmation (1-Click Judge Demo)"}
                    </button>
                  </div>
                )}

              {/* STATE C: EXPIRED OR REFUNDED */}
              {currentOrder && (orderStatus === "LATE" || orderStatus === "REFUNDED") && (
                <div style={{ textAlign: "center", padding: "24px 12px" }}>
                  <AlertTriangle
                    size={36}
                    style={{ color: "var(--status-warning-fg)", marginBottom: 10 }}
                  />
                  <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>
                    {orderStatus === "REFUNDED"
                      ? `Order #${currentOrder.order_id} Refunded`
                      : "60-Second FX Lock Expired"}
                  </h3>
                  <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
                    {orderStatus === "REFUNDED"
                      ? "This transaction was reversed in the Hybrid Ledger."
                      : "To protect the merchant from currency volatility, stale quotes cannot settle."}
                  </p>
                  <button
                    type="button"
                    onClick={handleCreateCheckout}
                    className="btn-primary"
                  >
                    Generate Fresh Locked Quote
                  </button>
                </div>
              )}

              {/* STATE D: EMPTY IDLE STATE */}
              {!currentOrder && (
                <div
                  style={{
                    textAlign: "center",
                    padding: "48px 20px",
                    color: "var(--text-muted)",
                  }}
                >
                  <QrCode size={42} style={{ opacity: 0.35, marginBottom: 10 }} />
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-secondary)" }}>
                    No Active Checkout Session
                  </div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>
                    Select a quick Rand amount or use voice input on the left to lock an XRPL quote.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: OPERATOR MANDATE ("CFO SIGN-OFF" CONSOLE) ───────────────── */}
      {activeTab === "operator" && (
        <div className="workspace-grid">
          {/* Left Column: Channel Provisioning & Registered Device Switcher */}
          <div className="surface-card">
            <div className="card-header">
              <div>
                <div className="card-title">
                  <Cpu size={17} /> On-Ledger Payment Channel Mandate
                </div>
                <div className="card-subtitle">
                  Enforces hard XRP spending caps on-ledger outside the AI agent's control
                </div>
              </div>
            </div>

            <div className="card-body">
              {/* Registered Devices Quick Switcher */}
              {registeredDevices.length > 0 && (
                <div className="field-group">
                  <div className="field-label-row">
                    <span className="field-label">
                      Registered M2M Devices ({registeredDevices.length})
                    </span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      Click to inspect channel
                    </span>
                  </div>
                  <div className="chip-row">
                    {registeredDevices.map((dev) => (
                      <button
                        key={dev.device_id}
                        type="button"
                        onClick={() => {
                          setDeviceId(dev.device_id);
                          setDeviceInfo(dev);
                          setM2mResult(null);
                        }}
                        className={`quick-chip font-mono ${
                          deviceInfo?.device_id === dev.device_id ? "active" : ""
                        }`}
                      >
                        {dev.device_id} ({Number(dev.remaining_xrp).toFixed(1)} XRP)
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <form onSubmit={handleRegisterDevice}>
                <div className="field-group">
                  <div className="field-label-row">
                    <label className="field-label" htmlFor="op-device-id">
                      Device Identifier (EV Charger / Solar Micro-Grid Meter)
                    </label>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      id="op-device-id"
                      type="text"
                      value={deviceId}
                      onChange={(e) => setDeviceId(e.target.value)}
                      className="text-input font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => fetchDeviceInfo(deviceId)}
                      className="btn-secondary"
                    >
                      Load
                    </button>
                  </div>
                </div>

                <div className="field-group">
                  <label className="field-label" htmlFor="op-phone" style={{ display: "block", marginBottom: 6 }}>
                    Operator Alert Phone (SMS Escalation Target)
                  </label>
                  <input
                    id="op-phone"
                    type="text"
                    value={operatorPhone}
                    onChange={(e) => setOperatorPhone(e.target.value)}
                    className="text-input font-mono"
                  />
                </div>

                <div className="field-group">
                  <label className="field-label" htmlFor="op-cap" style={{ display: "block", marginBottom: 6 }}>
                    Hard Payment Channel Deposit Cap (XRP)
                  </label>
                  <input
                    id="op-cap"
                    type="number"
                    step="any"
                    value={maxBudgetCap}
                    onChange={(e) => setMaxBudgetCap(e.target.value)}
                    className="text-input font-mono"
                  />
                </div>

                <button type="submit" disabled={m2mLoading} className="btn-primary">
                  <ShieldCheck size={16} />
                  {m2mLoading
                    ? "Submitting PaymentChannelCreate to XRPL..."
                    : "Provision / Reset On-Ledger Payment Channel"}
                </button>
              </form>

              {operatorNotice && (
                <div
                  style={{
                    marginTop: 14,
                    padding: "10px 12px",
                    borderRadius: 8,
                    backgroundColor: "var(--bg-subtle)",
                    border: "1px solid var(--border-strong)",
                    color: "var(--text-primary)",
                    fontSize: 12,
                  }}
                >
                  {operatorNotice}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Live Channel Telemetry & Judge Simulator (Happy vs Blocked Paths) */}
          <div className="surface-card">
            <div className="card-header">
              <div>
                <div className="card-title">
                  <ShieldAlert size={17} /> Guardian Enforcement & Agent Simulator
                </div>
                <div className="card-subtitle">
                  Test autonomous M2M settlement (HTTP 200) vs ledger-enforced blocks (HTTP 402)
                </div>
              </div>
              {deviceInfo && (
                <span
                  className={`status-badge ${
                    deviceInfo.is_key_revoked ? "danger" : "success"
                  }`}
                >
                  {deviceInfo.is_key_revoked ? "✕ KEY REVOKED" : "✓ MANDATE ACTIVE"}
                </span>
              )}
            </div>

            <div className="card-body">
              {deviceInfo ? (
                <div>
                  {/* Channel Utilization Bar */}
                  <div
                    style={{
                      padding: 14,
                      borderRadius: 10,
                      backgroundColor: "var(--bg-subtle)",
                      border: "1px solid var(--border-subtle)",
                      marginBottom: 16,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: 12,
                        marginBottom: 6,
                      }}
                    >
                      <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>
                        XRPL Channel #{deviceInfo.channel_id?.slice(0, 12)}...
                      </span>
                      <span className="font-mono" style={{ fontWeight: 700 }}>
                        {Number(deviceInfo.current_spent_xrp || 0).toFixed(2)} XRP spent /{" "}
                        {Number(deviceInfo.remaining_xrp || 0).toFixed(2)} XRP available
                      </span>
                    </div>
                    <div className="meter-track">
                      <div
                        className="meter-fill"
                        style={{
                          width: `${channelUtilPct}%`,
                          backgroundColor:
                            channelUtilPct > 85
                              ? "var(--status-danger-fg)"
                              : "var(--accent-primary)",
                        }}
                      />
                    </div>
                  </div>

                  {/* 3-Scenario Autonomous Agent Simulator */}
                  <div
                    style={{
                      padding: 14,
                      borderRadius: 10,
                      border: "1px solid var(--border-subtle)",
                      marginBottom: 16,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        color: "var(--text-muted)",
                        marginBottom: 10,
                      }}
                    >
                      Autonomous Agent Execution Scenarios
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <button
                        type="button"
                        disabled={m2mLoading}
                        onClick={() => handleSimulateM2MPayment("valid")}
                        className="btn-secondary"
                        style={{ justifyContent: "space-between" }}
                      >
                        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <Zap size={14} style={{ color: "var(--status-success-fg)" }} />
                          1. Execute Valid Agent Spend (R35 / ~1.93 XRP)
                        </span>
                        <span className="status-badge success">Expect HTTP 200</span>
                      </button>

                      <button
                        type="button"
                        disabled={m2mLoading}
                        onClick={() => handleSimulateM2MPayment("over_budget")}
                        className="btn-secondary"
                        style={{ justifyContent: "space-between" }}
                      >
                        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <ShieldAlert size={14} style={{ color: "var(--status-warning-fg)" }} />
                          2. Attempt Over-Cap Spend (R500 / ~27.5 XRP)
                        </span>
                        <span className="status-badge danger">Expect HTTP 402</span>
                      </button>

                      <button
                        type="button"
                        disabled={m2mLoading}
                        onClick={() => handleSimulateM2MPayment("unapproved_supplier")}
                        className="btn-secondary"
                        style={{ justifyContent: "space-between" }}
                      >
                        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <Ban size={14} style={{ color: "var(--status-danger-fg)" }} />
                          3. Attempt Unapproved Rogue Supplier Payment
                        </span>
                        <span className="status-badge danger">Expect Block</span>
                      </button>
                    </div>

                    {m2mResult && (
                      <div
                        style={{
                          marginTop: 12,
                          padding: 12,
                          borderRadius: 8,
                          backgroundColor:
                            m2mResult.type === "success"
                              ? "var(--status-success-bg)"
                              : "var(--status-danger-bg)",
                          border: `1px solid ${
                            m2mResult.type === "success"
                              ? "var(--status-success-border)"
                              : "var(--status-danger-border)"
                          }`,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: 4,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 800,
                              color:
                                m2mResult.type === "success"
                                  ? "var(--status-success-fg)"
                                  : "var(--status-danger-fg)",
                            }}
                          >
                            {m2mResult.title}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              speakText(`${m2mResult.title}. ${m2mResult.detail}`, true)
                            }
                            className="icon-btn"
                            style={{ padding: "2px 6px", fontSize: 11 }}
                          >
                            <Volume2 size={12} /> Speak
                          </button>
                        </div>
                        <div style={{ fontSize: 12, color: "var(--text-primary)" }}>
                          {m2mResult.detail}
                        </div>
                        {m2mResult.tx_hash && (
                          <a
                            href={`https://testnet.xrpl.org/transactions/${m2mResult.tx_hash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono"
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              marginTop: 6,
                              fontSize: 12,
                              fontWeight: 700,
                              color: "var(--accent-primary)",
                            }}
                          >
                            Inspect XRPL Tx: {m2mResult.tx_hash.slice(0, 16)}...{" "}
                            <ExternalLink size={12} />
                          </a>
                        )}
                      </div>
                    )}
                  </div>

                  {/* External Human Operator Controls */}
                  <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                    <input
                      type="number"
                      step="any"
                      value={topUpAmount}
                      onChange={(e) => setTopUpAmount(e.target.value)}
                      className="text-input font-mono"
                      style={{ width: 110 }}
                      aria-label="Top up XRP amount"
                    />
                    <button
                      type="button"
                      disabled={m2mLoading}
                      onClick={handleTopUpBudget}
                      className="btn-secondary"
                      style={{ flex: 1 }}
                    >
                      Fund Channel (+{topUpAmount} XRP via PaymentChannelFund)
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleRevokeDevice}
                    className="btn-outline-danger"
                    style={{ width: "100%" }}
                  >
                    <Ban size={14} /> Emergency Revoke Device Key (Operator Kill-Switch)
                  </button>
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "40px 16px", color: "var(--text-muted)" }}>
                  No active channel loaded. Select a registered device pill on the left or click{" "}
                  <b>Provision / Reset On-Ledger Payment Channel</b>.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 3: AUDIT FEED & SETTLED LEDGER (REDDIT-MEETS-NEOBANK FEED) ──── */}
      {activeTab === "ledger" && (
        <div className="surface-card">
          <div className="card-header">
            <div>
              <div className="card-title">
                <ArrowRightLeft size={17} /> Hybrid Audit Feed & Settlement Ledger
              </div>
              <div className="card-subtitle">
                Every USSD, IVR, POS, and HTTP 402 machine event reconciled with XRPL Destination Tags
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {/* View Switcher: Modular Feed vs Compact Table */}
              <div className="nav-pills">
                <button
                  type="button"
                  onClick={() => setLedgerViewMode("feed")}
                  className={`nav-pill ${ledgerViewMode === "feed" ? "active" : ""}`}
                  style={{ padding: "5px 10px", fontSize: 12 }}
                >
                  <LayoutList size={13} /> Feed Cards
                </button>
                <button
                  type="button"
                  onClick={() => setLedgerViewMode("table")}
                  className={`nav-pill ${ledgerViewMode === "table" ? "active" : ""}`}
                  style={{ padding: "5px 10px", fontSize: 12 }}
                >
                  <TableIcon size={13} /> Compact Table
                </button>
              </div>

              <button type="button" onClick={fetchRecentOrders} className="btn-secondary">
                <RefreshCw size={13} /> Refresh
              </button>

              <button
                type="button"
                onClick={() => {
                  speakText(
                    `Sweeping ${telemetry.totalZar.toFixed(
                      2
                    )} Rand via Instant PayShap off-ramp to merchant bank account.`,
                    true
                  );
                  alert(
                    `Kotani Pay / MoneyBadger Off-Ramp Sweep:\nR${telemetry.totalZar.toFixed(
                      2
                    )} (${telemetry.totalRlusd.toFixed(
                      4
                    )} RLUSD) settled via Instant PayShap to Sis Thandi's Capitec account.`
                  );
                }}
                className="btn-primary"
                style={{ width: "auto", padding: "8px 14px", fontSize: 13 }}
              >
                <DollarSign size={14} /> Sweep to Rand (PayShap Off-Ramp)
              </button>
            </div>
          </div>

          {/* Filter & Search Bar */}
          <div
            style={{
              padding: "12px 20px",
              borderBottom: "1px solid var(--border-subtle)",
              backgroundColor: "var(--bg-subtle)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <div className="chip-row" style={{ marginTop: 0 }}>
              {["ALL", "PAID", "BLOCKED", "PENDING", "REFUNDED"].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`quick-chip ${statusFilter === st ? "active" : ""}`}
                >
                  {st === "BLOCKED" ? "BLOCKED / 402" : st}
                </button>
              ))}
            </div>

            <div style={{ position: "relative", minWidth: 240 }}>
              <Search
                size={14}
                style={{
                  position: "absolute",
                  left: 10,
                  top: 10,
                  color: "var(--text-muted)",
                }}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by Tag, Phone, or XRPL Hash..."
                className="text-input font-mono"
                style={{ padding: "6px 10px 6px 30px", fontSize: 12 }}
              />
            </div>
          </div>

          <div className="card-body">
            {/* MODE 1: REDDIT-STYLE SCANNABLE MODULAR FEED CARDS */}
            {ledgerViewMode === "feed" ? (
              <div className="feed-list">
                {filteredOrders.map((ord) => {
                  const isExpanded = expandedOrderId === ord.order_id;
                  return (
                    <article key={ord.order_id} className="feed-card">
                      <div className="feed-card-top">
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          {renderStatusBadge(ord.status)}
                          <span className="font-mono" style={{ fontWeight: 700, fontSize: 14 }}>
                            Tag #{ord.order_id}
                          </span>
                          <span className="feed-meta">
                            <span>• Payer: {ord.phone_number}</span>
                            {ord.created_at && <span>• {ord.created_at}</span>}
                          </span>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                          <div style={{ textAlign: "right" }}>
                            <div className="tabular-nums" style={{ fontWeight: 800, fontSize: 15 }}>
                              R{Number(ord.amount_zar).toFixed(2)}
                            </div>
                            <div
                              className="font-mono"
                              style={{ fontSize: 11, color: "var(--text-muted)" }}
                            >
                              {ord.quoted_crypto} RLUSD
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              speakText(
                                `Order tag ${ord.order_id}, amount ${ord.amount_zar} Rand, status ${ord.status}.`,
                                true
                              )
                            }
                            className="icon-btn"
                            title="Read Transaction Aloud"
                          >
                            <Volume2 size={13} />
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setExpandedOrderId(isExpanded ? null : ord.order_id)
                            }
                            className="icon-btn"
                          >
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            Details
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="feed-actions" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
                          <div className="feed-meta font-mono" style={{ fontSize: 11 }}>
                            <span>Merchant: {ord.merchant_address || "Default Treasury"}</span>
                            <span>• FX Expiry: {ord.fx_lock_expires_at}</span>
                            {ord.tx_hash && (
                              <a
                                href={`https://testnet.xrpl.org/transactions/${ord.tx_hash}`}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  color: "var(--accent-primary)",
                                  fontWeight: 700,
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 4,
                                }}
                              >
                                XRPL Hash: {ord.tx_hash.slice(0, 16)}...{" "}
                                <ExternalLink size={11} />
                              </a>
                            )}
                          </div>

                          {ord.status === "PAID" && (
                            <button
                              type="button"
                              onClick={() => handleRefund(ord.order_id)}
                              className="btn-outline-danger"
                              style={{ padding: "4px 10px", fontSize: 11 }}
                            >
                              Reverse / Refund
                            </button>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            ) : (
              /* MODE 2: HIGH-DENSITY COMPACT NEOBANK TABLE */
              <div style={{ overflowX: "auto" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Destination Tag</th>
                      <th>Telecom Identity</th>
                      <th>ZAR Amount</th>
                      <th>RLUSD Quote</th>
                      <th>Status</th>
                      <th>XRPL Testnet Hash</th>
                      <th style={{ textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map((ord) => (
                      <tr key={ord.order_id}>
                        <td className="font-mono" style={{ fontWeight: 700 }}>
                          #{ord.order_id}
                        </td>
                        <td className="font-mono" style={{ color: "var(--text-secondary)" }}>
                          {ord.phone_number}
                        </td>
                        <td className="tabular-nums" style={{ fontWeight: 700 }}>
                          R{Number(ord.amount_zar).toFixed(2)}
                        </td>
                        <td className="font-mono">{ord.quoted_crypto} RLUSD</td>
                        <td>{renderStatusBadge(ord.status)}</td>
                        <td className="font-mono">
                          {ord.tx_hash ? (
                            <a
                              href={`https://testnet.xrpl.org/transactions/${ord.tx_hash}`}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                color: "var(--accent-primary)",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                              }}
                            >
                              {ord.tx_hash.slice(0, 12)}... <ExternalLink size={12} />
                            </a>
                          ) : (
                            <span style={{ color: "var(--text-muted)" }}>—</span>
                          )}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <div style={{ display: "inline-flex", gap: 6 }}>
                            <button
                              type="button"
                              onClick={() =>
                                speakText(
                                  `Order ${ord.order_id}, ${ord.amount_zar} Rand, status ${ord.status}.`,
                                  true
                                )
                              }
                              className="icon-btn"
                              style={{ padding: "4px 7px" }}
                            >
                              <Volume2 size={12} />
                            </button>
                            {ord.status === "PAID" && (
                              <button
                                type="button"
                                onClick={() => handleRefund(ord.order_id)}
                                className="btn-outline-danger"
                                style={{ padding: "4px 8px", fontSize: 11 }}
                              >
                                Refund
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
