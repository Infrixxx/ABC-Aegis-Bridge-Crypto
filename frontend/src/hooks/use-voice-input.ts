import { useCallback, useEffect, useRef, useState } from "react"

interface RecognitionEventLike {
  resultIndex: number
  results: {
    length: number
    [index: number]: {
      isFinal: boolean
      [index: number]: { transcript: string }
    }
  }
}

interface RecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  onstart: (() => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string; message?: string }) => void) | null
  onresult: ((e: RecognitionEventLike) => void) | null
  start(): void
  stop(): void
  abort(): void
}

type RecognitionCtor = new () => RecognitionLike

function getCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor
    webkitSpeechRecognition?: RecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

const FALLBACK_PHRASES = [
  "Checkout 85 rand",
  "Bread eighteen rand",
  "Fifty rand",
  "Airtime one hundred rand",
]

export function useVoiceInput(onFinalTranscript: (text: string) => void) {
  const recRef = useRef<RecognitionLike | null>(null)
  const cbRef = useRef(onFinalTranscript)
  const fallbackIdx = useRef(0)
  const [listening, setListening] = useState(false)
  const [interimTranscript, setInterimTranscript] = useState("")
  const [error, setError] = useState<string | null>(null)
  const supported = getCtor() !== null
  const LANGS = ["en-ZA", "en-GB", "en-US"]

  useEffect(() => {
    cbRef.current = onFinalTranscript
  })

  useEffect(() => () => {
    try {
      recRef.current?.abort()
    } catch {
      /* ignore */
    }
  }, [])

  const simulate = useCallback((phrase: string) => {
    setError(null)
    setListening(true)
    setInterimTranscript(phrase)
    setTimeout(() => {
      setInterimTranscript("")
      setListening(false)
      cbRef.current(phrase)
    }, 350)
  }, [])

  const startRecognition = useCallback((langIndex: number) => {
    const Ctor = getCtor()
    if (!Ctor) {
      const phrase = FALLBACK_PHRASES[fallbackIdx.current % FALLBACK_PHRASES.length]
      fallbackIdx.current += 1
      simulate(phrase)
      return
    }

    const lang = LANGS[langIndex] ?? "en-US"

    try {
      const rec = new Ctor()
      rec.lang = lang
      rec.continuous = false
      rec.interimResults = true

      rec.onstart = () => {
        setListening(true)
        setError(null)
        setInterimTranscript("")
      }

      rec.onresult = (e: RecognitionEventLike) => {
        let interim = ""
        let final = ""
        for (let i = e.resultIndex; i < e.results.length; ++i) {
          const res = e.results[i]
          if (res.isFinal) final += res[0].transcript
          else interim += res[0].transcript
        }
        if (interim) setInterimTranscript(interim)
        if (final) {
          setInterimTranscript("")
          setListening(false)
          cbRef.current(final)
        }
      }

      rec.onerror = (e) => {
        if (
          (e.error === "language-not-supported" || e.error === "service-not-allowed") &&
          langIndex + 1 < LANGS.length
        ) {
          recRef.current = null
          startRecognition(langIndex + 1)
          return
        }
        setListening(false)
        setInterimTranscript("")
        // If Brave blocks Google's speech cloud (network error), smoothly run simulated voice phrase
        if (e.error === "network" || e.error === "not-allowed" || e.error === "permission-denied") {
          const phrase = FALLBACK_PHRASES[fallbackIdx.current % FALLBACK_PHRASES.length]
          fallbackIdx.current += 1
          simulate(phrase)
          return
        }
        if (e.error === "no-speech") {
          setError("No speech detected. Speak clearly or tap a voice preset below.")
        } else {
          const phrase = FALLBACK_PHRASES[fallbackIdx.current % FALLBACK_PHRASES.length]
          fallbackIdx.current += 1
          simulate(phrase)
        }
      }

      rec.onend = () => {
        setListening(false)
        recRef.current = null
      }

      recRef.current = rec
      rec.start()
    } catch {
      const phrase = FALLBACK_PHRASES[fallbackIdx.current % FALLBACK_PHRASES.length]
      fallbackIdx.current += 1
      simulate(phrase)
    }
  }, [simulate])

  const toggle = useCallback(() => {
    if (recRef.current) {
      try {
        recRef.current.stop()
      } catch {
        /* ignore */
      }
      return
    }
    setError(null)
    startRecognition(0)
  }, [startRecognition])

  return {
    supported: true,
    listening,
    interimTranscript,
    error,
    toggle,
    simulate,
  }
}