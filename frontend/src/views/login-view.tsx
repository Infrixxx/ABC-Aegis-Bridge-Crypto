import { useState } from "react"
import { ArrowRight, Cpu, KeyRound, Loader2, ShieldCheck, Store, UserPlus } from "lucide-react"
import { Logo } from "@/components/logo"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input, Label } from "@/components/ui/input"
import { Notice } from "@/components/notice"
import { DEMO_ACCOUNTS, useAuth } from "@/hooks/use-auth"
import type { Mode } from "@/hooks/use-preferences"
import { cn } from "@/lib/utils"

export function LoginView() {
  const { login, register, quickLogin } = useAuth()
  const [tab, setTab] = useState<"demo" | "custom" | "register">("demo")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Custom login state
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  // Register state
  const [regName, setRegName] = useState("")
  const [regEmail, setRegEmail] = useState("")
  const [regPassword, setRegPassword] = useState("")
  const [regOrg, setRegOrg] = useState("")
  const [regRole, setRegRole] = useState<Mode>("shop")

  const handleQuick = async (role: "shop" | "machines" | "pro") => {
    try {
      setLoading(true)
      setError(null)
      await quickLogin(role)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to sign in")
    } finally {
      setLoading(false)
    }
  }

  const handleCustomLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) {
      setError("Please enter your email and password.")
      return
    }
    try {
      setLoading(true)
      setError(null)
      await login({ email, password })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to sign in")
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!regEmail || !regPassword || !regName) {
      setError("Please fill in your name, email, and password.")
      return
    }
    try {
      setLoading(true)
      setError(null)
      await register({
        email: regEmail,
        password: regPassword,
        full_name: regName,
        role: regRole,
        organization: regOrg || undefined,
      })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative mx-auto flex min-h-[90dvh] max-w-4xl flex-col justify-center px-4 py-8">
      {/* Decorative top band */}
      <div className="kasi-band mb-8 rounded-full shadow-sm" />

      <div className="mb-8 text-center space-y-2">
        <div className="inline-flex items-center gap-2.5 rounded-full border border-primary/40 bg-card px-4 py-1.5 shadow-xs">
          <Logo className="size-6 text-primary" />
          <span className="font-display text-sm font-semibold tracking-wide text-foreground">
            Aegis Bridge Crypto
          </span>
          <span className="rounded-full bg-success/20 px-2 py-0.5 text-[11px] font-semibold text-success-text">
            XRPL Testnet Active
          </span>
        </div>
        <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl text-foreground">
          Sign in to Aegis Gateway
        </h1>
        <p className="mx-auto max-w-lg text-sm text-muted-foreground sm:text-base">
          AI-governed XRPL settlement bridge for offline African commerce and autonomous machine payments.
        </p>
      </div>

      {/* Mode navigation tabs */}
      <div className="mx-auto mb-6 flex rounded-xl border border-border bg-card p-1 shadow-xs">
        <button
          type="button"
          onClick={() => {
            setTab("demo")
            setError(null)
          }}
          className={cn(
            "rounded-lg px-4 py-1.5 text-xs sm:text-sm font-medium transition-colors",
            tab === "demo" ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
          )}
        >
          Demo Personas (1-Click)
        </button>
        <button
          type="button"
          onClick={() => {
            setTab("custom")
            setError(null)
          }}
          className={cn(
            "rounded-lg px-4 py-1.5 text-xs sm:text-sm font-medium transition-colors",
            tab === "custom" ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
          )}
        >
          Email & Password
        </button>
        <button
          type="button"
          onClick={() => {
            setTab("register")
            setError(null)
          }}
          className={cn(
            "rounded-lg px-4 py-1.5 text-xs sm:text-sm font-medium transition-colors",
            tab === "register" ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
          )}
        >
          Register New Merchant
        </button>
      </div>

      {error && (
        <div className="mx-auto mb-6 w-full max-w-xl">
          <Notice tone="danger">{error}</Notice>
        </div>
      )}

      {/* Tab 1: 1-Click Demo Persona Cards */}
      {tab === "demo" && (
        <div className="grid gap-4 sm:grid-cols-3">
          {/* Persona 1: Sis Thandi */}
          <Card className="flex flex-col justify-between border-primary/30 transition-all hover:border-primary hover:shadow-md">
            <CardContent className="space-y-4 pt-6">
              <div className="flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Store className="size-6" />
              </div>
              <div className="space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                  Spaza Merchant POS
                </span>
                <h3 className="font-display text-xl font-semibold text-foreground">
                  {DEMO_ACCOUNTS.shop.name}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {DEMO_ACCOUNTS.shop.org}
                </p>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Offline USSD dialing, spoken en-ZA receipts, and simplified cash register with zero crypto complexity.
              </p>
            </CardContent>
            <div className="p-6 pt-0">
              <Button
                variant="primary"
                className="w-full justify-between"
                disabled={loading}
                onClick={() => handleQuick("shop")}
              >
                <span>Sign In as Thandi</span>
                {loading ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
              </Button>
            </div>
          </Card>

          {/* Persona 2: Kagiso Ndlovu */}
          <Card className="flex flex-col justify-between border-primary/30 transition-all hover:border-primary hover:shadow-md">
            <CardContent className="space-y-4 pt-6">
              <div className="flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Cpu className="size-6" />
              </div>
              <div className="space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                  IoT & Vending Fleet
                </span>
                <h3 className="font-display text-xl font-semibold text-foreground">
                  {DEMO_ACCOUNTS.machines.name}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {DEMO_ACCOUNTS.machines.org}
                </p>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                XRPL Payment Channels, automated telemetry allowances, supplier whitelists & hardware kill-switches.
              </p>
            </CardContent>
            <div className="p-6 pt-0">
              <Button
                variant="primary"
                className="w-full justify-between"
                disabled={loading}
                onClick={() => handleQuick("machines")}
              >
                <span>Sign In as Kagiso</span>
                {loading ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
              </Button>
            </div>
          </Card>

          {/* Persona 3: Dr. Arthur Vance */}
          <Card className="flex flex-col justify-between border-primary/30 transition-all hover:border-primary hover:shadow-md">
            <CardContent className="space-y-4 pt-6">
              <div className="flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <ShieldCheck className="size-6" />
              </div>
              <div className="space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                  CFO & Treasury Auditor
                </span>
                <h3 className="font-display text-xl font-semibold text-foreground">
                  {DEMO_ACCOUNTS.pro.name}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {DEMO_ACCOUNTS.pro.org}
                </p>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Raw 64-char XRPL transaction hashes, Destination Tag matching, and real-time RLUSD reserve proofs.
              </p>
            </CardContent>
            <div className="p-6 pt-0">
              <Button
                variant="primary"
                className="w-full justify-between"
                disabled={loading}
                onClick={() => handleQuick("pro")}
              >
                <span>Sign In as CFO</span>
                {loading ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Tab 2: Custom Email & Password */}
      {tab === "custom" && (
        <Card className="mx-auto w-full max-w-md">
          <CardContent className="pt-6">
            <form onSubmit={handleCustomLogin} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="login-email">Email Address</Label>
                <Input
                  id="login-email"
                  type="email"
                  placeholder="e.g. thandi@aegis.bridge"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="login-password">Password</Label>
                <Input
                  id="login-password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>

              <div className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">Demo Accounts (Password: password123):</span>
                <ul className="mt-1 list-disc list-inside space-y-0.5">
                  <li><code>thandi@aegis.bridge</code> (Shop POS)</li>
                  <li><code>operator@aegis.bridge</code> (IoT Machines)</li>
                  <li><code>cfo@aegis.bridge</code> (CFO Auditor)</li>
                </ul>
              </div>

              <Button type="submit" variant="primary" size="lg" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
                {loading ? "Authenticating…" : "Sign In"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Tab 3: Register New Merchant */}
      {tab === "register" && (
        <Card className="mx-auto w-full max-w-md">
          <CardContent className="pt-6">
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="reg-name">Full Name</Label>
                <Input
                  id="reg-name"
                  type="text"
                  placeholder="e.g. Nandi Khumalo"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="reg-email">Email Address</Label>
                <Input
                  id="reg-email"
                  type="email"
                  placeholder="e.g. nandi@kasi-foods.co.za"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="reg-password">Password (min 6 chars)</Label>
                <Input
                  id="reg-password"
                  type="password"
                  placeholder="••••••••"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="reg-org">Store / Organization Name</Label>
                <Input
                  id="reg-org"
                  type="text"
                  placeholder="e.g. Khumalo Supermarket"
                  value={regOrg}
                  onChange={(e) => setRegOrg(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="reg-role">Account Persona Role</Label>
                <select
                  id="reg-role"
                  value={regRole}
                  onChange={(e) => setRegRole(e.target.value as Mode)}
                  className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground shadow-xs focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="shop">Spaza Shop POS (Sis Thandi)</option>
                  <option value="machines">IoT / Vending Machine Fleet (Kagiso)</option>
                  <option value="pro">CFO & Treasury Auditor (Dr. Vance)</option>
                </select>
              </div>

              <Button type="submit" variant="primary" size="lg" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
                {loading ? "Creating Account…" : "Create Merchant Account"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Footer reassurance */}
      <div className="mt-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-4">
        <span>Protected by LangGraph AI Security Agent</span>
        <span>•</span>
        <span>XRPL Ledger Testnet</span>
        <span>•</span>
        <span>Africa's Talking Telecom Gateway</span>
      </div>
    </div>
  )
}
