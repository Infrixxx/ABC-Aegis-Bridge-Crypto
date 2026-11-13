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

/**
 * Enhanced push-to-talk speech recognition hook with:
 *   • Live interim transcripts for real-time feedback
 *   • Multi-tier locale fallback (en-ZA → en-GB → en-US)
 *   • Clear status indicators (listening, interimTranscript, error)
 *   • Built-in simulation trigger for quick testing in headless/mic-restricted environments
 */
export function useVoiceInput(onFinalTranscript: (text: string) => void) {
  const recRef = useRef<RecognitionLike | null>(null)
  const cbRef = useRef(onFinalTranscript)
  const [listening, setListening] = useState(false)
  const [interimTranscript, setInterimTranscript] = useState("")
  const [error, setError] = useState<string | null>(null)
  const supported = getCtor() !== null
  const currentLangIndex = useRef(0)
  const LANGS = ["en-ZA", "en-GB", "en-US"]

  useEffect(() => {
    cbRef.current = onFinalTranscript
  })

  useEffect(() => () => {
    try {
      recRef.current?.abort()
    } catch {
      /* ignore cleanup */
    }
  }, [])

  const startRecognition = useCallback((langIndex: number) => {
    const Ctor = getCtor()
    if (!Ctor) return

    currentLangIndex.current = langIndex
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
          if (res.isFinal) {
            final += res[0].transcript
          } else {
            interim += res[0].transcript
          }
        }

        if (interim) {
          setInterimTranscript(interim)
        }

        if (final) {
          setInterimTranscript("")
          setListening(false)
          cbRef.current(final)
        }
      }

      rec.onerror = (e) => {
        // Fallback to next locale if language not supported
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

        if (e.error === "not-allowed" || e.error === "permission-denied") {
          setError("Microphone permission denied. Enable microphone access in browser settings or use voice presets below.")
        } else if (e.error === "no-speech") {
          setError("No speech detected. Please speak clearly into your microphone.")
        } else if (e.error === "network") {
          setError("Speech network unreachable. Use voice presets or verify connection.")
        } else {
          setError(`Voice input: ${e.error}`)
        }
      }

      rec.onend = () => {
        setListening(false)
        recRef.current = null
      }

      recRef.current = rec
      rec.start()
    } catch (err) {
      setListening(false)
      setError("Unable to start speech recognition. Use the quick presets below.")
    }
  }, [])

  const toggle = useCallback(() => {
    if (recRef.current) {
      try {
        recRef.current.stop()
      } catch {
        /* ignore */
      }
      return
    }

    if (!supported) {
      setError("Web Speech API not supported in this browser. Try Chrome/Edge or click a voice preset.")
      return
    }

    setError(null)
    startRecognition(0)
  }, [startRecognition, supported])

  const simulate = useCallback((phrase: string) => {
    setError(null)
    setInterimTranscript(phrase)
    setTimeout(() => {
      setInterimTranscript("")
      cbRef.current(phrase)
    }, 250)
  }, [])

  return {
    supported,
    listening,
    interimTranscript,
    error,
    toggle,
    simulate,
  }
}
