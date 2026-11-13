import { useCallback, useEffect, useRef, useState } from "react"

interface RecognitionEventLike {
  results: ArrayLike<ArrayLike<{ transcript: string }>>
}
interface RecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  onstart: (() => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
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

/** Push-to-talk wrapper around the Web Speech API. One instance at a time, so stop actually stops. */
export function useVoiceInput(onTranscript: (text: string) => void) {
  const recRef = useRef<RecognitionLike | null>(null)
  const cbRef = useRef(onTranscript)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supported = getCtor() !== null

  useEffect(() => {
    cbRef.current = onTranscript
  })

  useEffect(() => () => recRef.current?.abort(), [])

  const toggle = useCallback(() => {
    if (recRef.current) {
      recRef.current.stop()
      return
    }
    const Ctor = getCtor()
    if (!Ctor) {
      setError("Voice input needs Chrome or Edge.")
      return
    }
    const rec = new Ctor()
    rec.lang = "en-ZA"
    rec.continuous = false
    rec.interimResults = false
    rec.onstart = () => {
      setListening(true)
      setError(null)
    }
    rec.onend = () => {
      setListening(false)
      recRef.current = null
    }
    rec.onerror = (e) => {
      setError(
        e.error === "not-allowed"
          ? "Microphone access was blocked."
          : e.error === "no-speech"
            ? "Didn't catch that. Try again."
            : "Voice input failed.",
      )
    }
    rec.onresult = (e) => {
      const t = e.results[0]?.[0]?.transcript
      if (t) cbRef.current(t)
    }
    recRef.current = rec
    rec.start()
  }, [])

  return { supported, listening, error, toggle }
}
