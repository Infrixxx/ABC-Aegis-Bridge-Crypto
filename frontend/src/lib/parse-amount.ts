const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
}
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
}

/**
 * Pulls a Rand amount out of a spoken phrase.
 * "checkout 85 rand" → 85, "checkout eighty five rand" → 85,
 * "one hundred and twenty" → 120, "two thousand five hundred" → 2500.
 */
export function parseSpokenAmount(transcript: string): number | null {
  const text = transcript.toLowerCase().replace(/,/g, ".").replace(/-/g, " ")

  const digits = text.match(/\d+(?:\.\d+)?/)
  if (digits) {
    const n = parseFloat(digits[0])
    return Number.isFinite(n) && n > 0 ? n : null
  }

  let total = 0
  let current = 0
  let seen = false
  for (const word of text.split(/\s+/)) {
    if (word in UNITS) {
      current += UNITS[word]
      seen = true
    } else if (word in TENS) {
      current += TENS[word]
      seen = true
    } else if (word === "hundred") {
      current = (current || 1) * 100
      seen = true
    } else if (word === "thousand") {
      total += (current || 1) * 1000
      current = 0
      seen = true
    }
  }
  const n = total + current
  return seen && n > 0 ? n : null
}
