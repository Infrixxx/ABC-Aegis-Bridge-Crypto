import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { usePreferences, type SpeechRate } from "./use-preferences"

const RATE: Record<SpeechRate, number> = { slow: 0.85, normal: 1, fast: 1.2 }

function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  for (const prefix of ["en-ZA", "en-GB", "en-US", "en"]) {
    const v = voices.find((x) => x.lang.replace("_", "-").startsWith(prefix))
    if (v) return v
  }
  return null
}

interface SpeakOptions {
  onEnd?: () => void
}

interface SpeechApi {
  supported: boolean
  /** Speak on explicit user request (Listen buttons). */
  speak: (text: string, opts?: SpeakOptions) => void
  stop: () => void
  /** Status updates: always go to the screen-reader live region; spoken aloud only if enabled. */
  announce: (text: string) => void
}

const Ctx = createContext<SpeechApi | null>(null)

export function SpeechProvider({ children }: { children: ReactNode }) {
  const { prefs } = usePreferences()
  const supported = typeof window !== "undefined" && "speechSynthesis" in window
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [live, setLive] = useState("")
  const flip = useRef(false)

  useEffect(() => {
    if (!supported) return
    const load = () => setVoices(window.speechSynthesis.getVoices())
    load()
    window.speechSynthesis.addEventListener("voiceschanged", load)
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load)
  }, [supported])

  const speak = useCallback(
    (text: string, opts?: SpeakOptions) => {
      if (!supported) return
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(text)
      const voice = pickVoice(voices)
      if (voice) {
        u.voice = voice
        u.lang = voice.lang
      } else {
        u.lang = "en-ZA"
      }
      u.rate = RATE[prefs.speechRate]
      u.onend = () => opts?.onEnd?.()
      u.onerror = () => opts?.onEnd?.()
      window.speechSynthesis.speak(u)
    },
    [supported, voices, prefs.speechRate],
  )

  const stop = useCallback(() => {
    if (supported) window.speechSynthesis.cancel()
  }, [supported])

  const announce = useCallback(
    (text: string) => {
      flip.current = !flip.current
      // The invisible suffix makes repeated identical messages re-announce.
      setLive(flip.current ? text : `${text}​`)
      if (prefs.speech) speak(text)
    },
    [prefs.speech, speak],
  )

  useEffect(() => {
    if (!prefs.speech) stop()
  }, [prefs.speech, stop])

  const value = useMemo<SpeechApi>(
    () => ({ supported, speak, stop, announce }),
    [supported, speak, stop, announce],
  )

  return (
    <Ctx.Provider value={value}>
      {children}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {live}
      </div>
    </Ctx.Provider>
  )
}

export function useSpeech(): SpeechApi {
  const v = useContext(Ctx)
  if (!v) throw new Error("useSpeech must be used inside SpeechProvider")
  return v
}
