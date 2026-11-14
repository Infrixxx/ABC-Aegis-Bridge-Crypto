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

// Tried in order. A different language only helps for language errors, but a
// single retry also rescues a flaky first connection to the speech service.
const LANGS = ["en-ZA", "en-GB", "en-US"]

const MESSAGES: Record<string, string> = {
  "not-allowed": "Microphone access is blocked. Allow the microphone for this site, then try again.",
  "service-not-allowed": "This browser won't allow voice input here. Type the amount instead.",
  "audio-capture": "No microphone found. Plug one in, or type the amount.",
  "no-speech": "Didn't hear anything. Tap Speak and say the amount, for example “fifty rand”.",
  network:
    "Voice needs an internet connection to the browser's speech service, and it can't be reached (Brave, VPNs and some networks block it). Use Chrome or Edge, or type the amount.",
  "language-not-supported": "This browser can't recognise English here. Type the amount instead.",
}

/**
 * Push-to-talk wrapper around the Web Speech API.
 * It never invents a transcript: when recognition fails it says why and leaves
 * the amount alone. `simulate` exists only for the clearly labelled demo buttons.
 */
export function useVoiceInput(onFinalTranscript: (text: string) => void) {
  const recRef = useRef<RecognitionLike | null>(null)
  const cbRef = useRef(onFinalTranscript)
  const gotResult = useRef(false)
  const [listening, setListening] = useState(false)
  const [interimTranscript, setInterimTranscript] = useState("")
  const [error, setError] = useState<string | null>(null)
  const supported = getCtor() !== null

  useEffect(() => {
    cbRef.current = onFinalTranscript
  })

  useEffect(
    () => () => {
      try {
        recRef.current?.abort()
      } catch {
        /* ignore */
      }
    },
    [],
  )

  /** Demo helper for the labelled "Voice test" buttons only. */
  const simulate = useCallback((phrase: string) => {
    setError(null)
    setInterimTranscript("")
    cbRef.current(phrase)
  }, [])

  const start = useCallback((langIndex: number, retriedNetwork: boolean) => {
    const Ctor = getCtor()
    if (!Ctor) {
      setError("This browser has no voice input. Use Chrome, Edge or Safari, or type the amount.")
      return
    }
    try {
      const rec = new Ctor()
      rec.lang = LANGS[langIndex] ?? "en-US"
      rec.continuous = false
      rec.interimResults = true
      rec.onstart = () => {
        setListening(true)
        setError(null)
        setInterimTranscript("")
      }
      rec.onresult = (e) => {
        let interim = ""
        let final = ""
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i]
          if (r.isFinal) final += r[0].transcript
          else interim += r[0].transcript
        }
        if (interim) setInterimTranscript(interim)
        if (final) {
          gotResult.current = true
          setInterimTranscript("")
          cbRef.current(final)
        }
      }
      rec.onerror = (e) => {
        recRef.current = null
        if ((e.error === "language-not-supported" || e.error === "service-not-allowed") && langIndex + 1 < LANGS.length) {
          start(langIndex + 1, retriedNetwork)
          return
        }
        if (e.error === "network" && !retriedNetwork) {
          start(langIndex + 1 < LANGS.length ? langIndex + 1 : langIndex, true)
          return
        }
        if (e.error === "aborted") return
        setListening(false)
        setInterimTranscript("")
        setError(MESSAGES[e.error] ?? `Voice input failed (${e.error}). Type the amount instead.`)
      }
      rec.onend = () => {
        setListening(false)
        recRef.current = null
      }
      recRef.current = rec
      gotResult.current = false
      rec.start()
    } catch {
      setListening(false)
      setError("Couldn't start voice input. Type the amount instead.")
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
    setError(null)
    start(0, false)
  }, [start])

  return { supported, listening, interimTranscript, error, toggle, simulate }
}