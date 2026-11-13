import { useState } from "react"
import { Square, Volume2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useSpeech } from "@/hooks/use-speech"

/** Reads the given text aloud. Hidden when the browser has no speech synthesis. */
export function ListenButton({ text, label = "Listen" }: { text: string; label?: string }) {
  const { supported, speak, stop } = useSpeech()
  const [active, setActive] = useState(false)
  if (!supported) return null
  return (
    <Button
      variant="secondary"
      size="sm"
      aria-pressed={active}
      onClick={() => {
        if (active) {
          stop()
          setActive(false)
        } else {
          setActive(true)
          speak(text, { onEnd: () => setActive(false) })
        }
      }}
    >
      {active ? <Square aria-hidden /> : <Volume2 aria-hidden />}
      {active ? "Stop" : label}
    </Button>
  )
}
