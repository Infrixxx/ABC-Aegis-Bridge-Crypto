import { useEffect, useState, type ReactNode } from "react"
import { Loader2 } from "lucide-react"
import { Button, type buttonVariants } from "@/components/ui/button"
import type { VariantProps } from "class-variance-authority"
import { errorMessage } from "@/lib/utils"

/**
 * Two-step action with no modal: the first tap arms it ("Sure?"), the second runs it.
 * Disarms itself after a few seconds. Failures show inline beneath the button.
 */
export function ConfirmButton({
  children,
  confirmLabel = "Yes, do it",
  onConfirm,
  variant = "danger",
  confirmVariant = "danger",
  size = "sm",
  className,
}: {
  children: ReactNode
  confirmLabel?: string
  onConfirm: () => Promise<void> | void
  variant?: VariantProps<typeof buttonVariants>["variant"]
  confirmVariant?: VariantProps<typeof buttonVariants>["variant"]
  size?: VariantProps<typeof buttonVariants>["size"]
  className?: string
}) {
  const [armed, setArmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 5000)
    return () => clearTimeout(t)
  }, [armed])

  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
      setArmed(false)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={className}>
      {armed ? (
        <div className="flex items-center gap-2">
          <Button variant={confirmVariant} size={size} onClick={() => void run()} disabled={busy}>
            {busy && <Loader2 className="animate-spin" aria-hidden />}
            {confirmLabel}
          </Button>
          <Button variant="ghost" size={size} onClick={() => setArmed(false)} disabled={busy}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button variant={variant} size={size} onClick={() => setArmed(true)}>
          {children}
        </Button>
      )}
      {error && (
        <p role="alert" className="mt-1.5 text-sm text-danger-text">
          {error}
        </p>
      )}
    </div>
  )
}
