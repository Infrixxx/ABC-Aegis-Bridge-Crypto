import { useCallback, useEffect, useRef, useState } from "react"

export function useCopy() {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard may be unavailable on http origins; nothing else to do */
    }
  }, [])

  return { copied, copy }
}
