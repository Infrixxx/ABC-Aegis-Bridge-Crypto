import { Check, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCopy } from "@/hooks/use-copy"

export function CopyButton({ text, label }: { text: string; label: string }) {
  const { copied, copy } = useCopy()
  return (
    <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => void copy(text)} aria-label={`Copy ${label}`}>
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      <span className="sr-only" role="status">
        {copied ? "Copied" : ""}
      </span>
    </Button>
  )
}
