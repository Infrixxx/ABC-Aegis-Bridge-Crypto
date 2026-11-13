import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"

export type Theme = "system" | "light" | "dark"
export type Palette = "standard" | "rg" | "by"
export type TextSize = "md" | "lg" | "xl"
export type Mode = "shop" | "machines" | "pro"
export type SpeechRate = "slow" | "normal" | "fast"

export interface Prefs {
  mode: Mode | null
  theme: Theme
  palette: Palette
  textSize: TextSize
  contrast: boolean
  speech: boolean
  speechRate: SpeechRate
}

const DEFAULTS: Prefs = {
  mode: null,
  theme: "system",
  palette: "standard",
  textSize: "md",
  contrast: false,
  speech: false,
  speechRate: "normal",
}

const KEY = "abc.prefs.v1"

function load(): Prefs {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) } : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

function apply(p: Prefs) {
  const root = document.documentElement
  const dark =
    p.theme === "dark" || (p.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)
  root.classList.toggle("dark", dark)
  root.style.colorScheme = dark ? "dark" : "light"
  root.dataset.palette = p.palette
  root.dataset.text = p.textSize
  root.dataset.contrast = p.contrast ? "more" : "normal"
}

interface PreferencesApi {
  prefs: Prefs
  setPref: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void
}

const Ctx = createContext<PreferencesApi | null>(null)

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(load)

  useEffect(() => {
    apply(prefs)
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs))
    } catch {
      /* storage can be blocked; preferences just won't persist */
    }
  }, [prefs])

  useEffect(() => {
    if (prefs.theme !== "system") return
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => apply(prefs)
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [prefs])

  const value = useMemo<PreferencesApi>(
    () => ({
      prefs,
      setPref: (key, val) => setPrefs((p) => ({ ...p, [key]: val })),
    }),
    [prefs],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function usePreferences(): PreferencesApi {
  const v = useContext(Ctx)
  if (!v) throw new Error("usePreferences must be used inside PreferencesProvider")
  return v
}
