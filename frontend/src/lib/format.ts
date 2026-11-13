export function zar(n: number): string {
  return `R${Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function rlusd(n: number): string {
  return Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })
}

export function xrp(n: number): string {
  return Number(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 4 })
}

export function shortHash(h: string, head = 6, tail = 4): string {
  return h.length <= head + tail + 1 ? h : `${h.slice(0, head)}…${h.slice(-tail)}`.toUpperCase()
}

export function formatPhone(p: string): string {
  if (/^\+27\d{9}$/.test(p)) return `+27 ${p.slice(3, 5)} ${p.slice(5, 8)} ${p.slice(8)}`
  return p
}

/**
 * The backend stores naive UTC timestamps ("2026-11-13T04:31:00.123456" or
 * SQLite's "2026-11-13 04:31:00"). Browsers would read those as local time.
 */
export function parseServerTime(s: string | undefined | null): number | null {
  if (!s) return null
  let v = s.trim().replace(" ", "T")
  if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(v)) v += "Z"
  v = v.replace(/(\.\d{3})\d+/, "$1")
  const t = Date.parse(v)
  return Number.isNaN(t) ? null : t
}

export function relativeTime(s: string | undefined | null, now = Date.now()): string {
  const t = parseServerTime(s)
  if (t === null) return ""
  const diff = Math.max(0, now - t)
  const min = Math.floor(diff / 60_000)
  if (min < 1) return "just now"
  if (min < 60) return `${min} min ago`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h ago`
  return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

export function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

const DIGIT_WORDS: Record<string, string> = {
  "0": "zero",
  "1": "one",
  "2": "two",
  "3": "three",
  "4": "four",
  "5": "five",
  "6": "six",
  "7": "seven",
  "8": "eight",
  "9": "nine",
  "*": "star",
  "#": "hash",
}

/** "*123*4729#" → "star one two three star four seven two nine hash" for speech. */
export function spellDigits(s: string): string {
  return [...s].map((c) => DIGIT_WORDS[c] ?? c).join(" ")
}
