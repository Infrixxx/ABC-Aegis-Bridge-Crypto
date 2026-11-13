/**
 * parse-amount.ts
 * ───────────────
 * Pulls a Rand amount out of spoken phrases, handling:
 *   • Direct numbers: "85", "85.50", "R120", "R 45.00"
 *   • Spoken words: "eighty five rand", "one hundred and twenty rand"
 *   • Vernacular & Slang: "clip" / "clipper" (R100), "pinkie" (R50), "choc" (R20), "tiger" (R10), "grand" (R1000)
 *   • Item + price combinations: "loaf of bread eighteen rand" → 18, "two cokes 30 rand" → 30
 *   • Compound cents: "twenty five fifty" → 25.50, "fifty rand and fifty cents" → 50.50
 *   • Colloquial compounds: "one fifty" → 150, "two fifty" → 250
 */

const UNITS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
}

const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fourty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
}

const SLANG_AMOUNTS: Record<string, number> = {
  clipper: 100,
  clip: 100,
  pinkie: 50,
  pinky: 50,
  choc: 20,
  tiger: 10,
  grand: 1000,
}

function wordsToNumber(words: string[]): number | null {
  let total = 0
  let current = 0
  let seen = false

  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    if (w in SLANG_AMOUNTS) {
      total += SLANG_AMOUNTS[w]
      seen = true
    } else if (w in UNITS) {
      current += UNITS[w]
      seen = true
    } else if (w in TENS) {
      current += TENS[w]
      seen = true
    } else if (w === "hundred") {
      current = (current || 1) * 100
      seen = true
    } else if (w === "thousand") {
      total += (current || 1) * 1000
      current = 0
      seen = true
    }
  }

  const res = total + current
  return seen && res > 0 ? res : null
}

export function parseSpokenAmount(transcript: string): number | null {
  if (!transcript || typeof transcript !== "string") return null

  const raw = transcript.trim().toLowerCase()
  // Normalise separators and currency prefixes
  const clean = raw
    .replace(/[rR]\s*(\d+)/g, "$1") // "R 85" -> "85"
    .replace(/,/g, ".")
    .replace(/-/g, " ")

  // 1. Direct Slang Check: "just a clipper", "a pinkie", "two clips"
  for (const [slang, val] of Object.entries(SLANG_AMOUNTS)) {
    const rx = new RegExp(`\\b${slang}s?\\b`)
    if (rx.test(clean)) {
      // Check if multiplier before slang: "two clippers" -> 200
      const match = clean.match(new RegExp(`(\\d+|one|two|three|four|five)\\s+${slang}s?`))
      if (match) {
        const mult = UNITS[match[1]] ?? parseInt(match[1], 10)
        if (mult && !isNaN(mult)) return mult * val
      }
      return val
    }
  }

  // 2. Pattern: "<digits> rand <digits> cents" or "<digits> and <digits> cents"
  const randCentsMatch = clean.match(/(\d+(?:\.\d+)?)\s*(?:rand|rands|zar)?\s*(?:and)?\s*(\d+)\s*(?:cents?|ct)?/)
  if (randCentsMatch) {
    const r = parseFloat(randCentsMatch[1])
    const c = parseFloat(randCentsMatch[2])
    if (Number.isFinite(r)) {
      return Number.isFinite(c) ? r + c / 100 : r
    }
  }

  // 3. Priority check: Find number explicitly tagged with "rand" or "rands" or "zar" or "bucks"
  // E.g. "two loaves of bread thirty five rand" -> grabs 35, ignoring "two"
  const taggedMatch = clean.match(/(\d+(?:\.\d+)?)\s*(?:rand|rands|zar|bucks)\b/)
  if (taggedMatch) {
    const n = parseFloat(taggedMatch[1])
    if (Number.isFinite(n) && n > 0) return n
  }

  // 4. Any digits in the text (take the largest number or rightmost price)
  const allDigits = [...clean.matchAll(/\d+(?:\.\d+)?/g)].map((m) => parseFloat(m[0]))
  if (allDigits.length > 0) {
    // If multiple digits, typically the last one is the price (e.g., "2 items for 50")
    const last = allDigits[allDigits.length - 1]
    if (Number.isFinite(last) && last > 0) return last
  }

  // 5. Spoken word matching: "one fifty" -> 150, "two fifty" -> 250
  if (/\bone\s+fifty\b/.test(clean)) return 150
  if (/\btwo\s+fifty\b/.test(clean)) return 250
  if (/\bthree\s+fifty\b/.test(clean)) return 350
  if (/\bfour\s+fifty\b/.test(clean)) return 450
  if (/\bfive\s+fifty\b/.test(clean)) return 550

  // 6. Word-based compound with cents: "twenty five fifty" -> 25.50
  const compMatch = clean.match(/\b(twenty|thirty|forty|fourty|fifty|sixty|seventy|eighty|ninety)(?:\s+(one|two|three|four|five|six|seven|eight|nine))?\s+(fifty|twenty|thirty)\b/)
  if (compMatch) {
    const tens = TENS[compMatch[1]] || 0
    const units = compMatch[2] ? UNITS[compMatch[2]] || 0 : 0
    const cents = TENS[compMatch[3]] || 0
    return tens + units + cents / 100
  }

  // 7. General number words extraction
  const words = clean.split(/\s+/)
  return wordsToNumber(words)
}
