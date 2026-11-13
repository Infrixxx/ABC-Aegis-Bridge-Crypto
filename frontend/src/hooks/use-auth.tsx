import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { api } from "@/lib/api"
import type { LoginBody, RegisterBody, User } from "@/lib/types"
import { usePreferences, type Mode } from "./use-preferences"

const TOKEN_KEY = "abc.auth.token.v1"
const USER_KEY = "abc.auth.user.v1"

export const DEMO_ACCOUNTS: Record<
  "shop" | "machines" | "pro",
  { email: string; name: string; org: string; pass: string; title: string; subtitle: string }
> = {
  shop: {
    email: "thandi@aegis.bridge",
    name: "Sis Thandi",
    org: "Thandi's Spaza & Groceries (Soweto)",
    pass: "password123",
    title: "Sis Thandi — Spaza Merchant",
    subtitle: "Offline USSD (*384*2818#), spoken confirmation & zero crypto jargon",
  },
  machines: {
    email: "operator@aegis.bridge",
    name: "Kagiso Ndlovu",
    org: "SolarKasi IoT & CleanGrid",
    pass: "password123",
    title: "Kagiso Ndlovu — IoT Fleet Lead",
    subtitle: "XRPL Payment Channels, telemetry budgets & hardware kill-switches",
  },
  pro: {
    email: "cfo@aegis.bridge",
    name: "Dr. Arthur Vance, CFA",
    org: "Hyperion Settlement Capital",
    pass: "password123",
    title: "Dr. Arthur Vance — CFO & Auditor",
    subtitle: "On-chain transaction hashes, Destination Tags & RLUSD FX proofs",
  },
}

interface AuthContextType {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  loading: boolean
  login: (credentials: LoginBody) => Promise<User>
  quickLogin: (role: "shop" | "machines" | "pro") => Promise<User>
  register: (body: RegisterBody) => Promise<User>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  })
  const [user, setUser] = useState<User | null>(() => {
    try {
      const raw = localStorage.getItem(USER_KEY)
      return raw ? (JSON.parse(raw) as User) : null
    } catch {
      return null
    }
  })
  const [loading, setLoading] = useState<boolean>(true)
  const { setPref } = usePreferences()

  // Verify session on initial mount
  useEffect(() => {
    let cancelled = false
    async function checkAuth() {
      if (!token) {
        setLoading(false)
        return
      }
      try {
        const me = await api.me()
        if (!cancelled) {
          setUser(me)
          localStorage.setItem(USER_KEY, JSON.stringify(me))
        }
      } catch {
        if (!cancelled) {
          setToken(null)
          setUser(null)
          localStorage.removeItem(TOKEN_KEY)
          localStorage.removeItem(USER_KEY)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void checkAuth()
    return () => {
      cancelled = true
    }
  }, [token])

  const login = useCallback(
    async (credentials: LoginBody) => {
      const res = await api.login(credentials)
      setToken(res.token)
      setUser(res.user)
      localStorage.setItem(TOKEN_KEY, res.token)
      localStorage.setItem(USER_KEY, JSON.stringify(res.user))
      // Automatically switch view to match persona
      if (res.user.role) {
        setPref("mode", res.user.role as Mode)
      }
      return res.user
    },
    [setPref],
  )

  const quickLogin = useCallback(
    async (role: "shop" | "machines" | "pro") => {
      const account = DEMO_ACCOUNTS[role]
      return login({ email: account.email, password: account.pass })
    },
    [login],
  )

  const register = useCallback(
    async (body: RegisterBody) => {
      const res = await api.register(body)
      setToken(res.token)
      setUser(res.user)
      localStorage.setItem(TOKEN_KEY, res.token)
      localStorage.setItem(USER_KEY, JSON.stringify(res.user))
      if (res.user.role) {
        setPref("mode", res.user.role as Mode)
      }
      return res.user
    },
    [setPref],
  )

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
    try {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(USER_KEY)
    } catch {
      /* ignore */
    }
    void api.logout().catch(() => {})
  }, [])

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(token && user),
      loading,
      login,
      quickLogin,
      register,
      logout,
    }),
    [user, token, loading, login, quickLogin, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider")
  return ctx
}
