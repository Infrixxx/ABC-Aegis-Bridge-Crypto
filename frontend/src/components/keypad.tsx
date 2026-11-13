import { Delete } from "lucide-react"

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"] as const
export type KeypadKey = (typeof KEYS)[number]

export function Keypad({ onKey, disabled }: { onKey: (k: KeypadKey) => void; disabled?: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-2.5" role="group" aria-label="Amount keypad">
      {KEYS.map((k) => (
        <button
          key={k}
          type="button"
          disabled={disabled}
          onClick={() => onKey(k)}
          aria-label={k === "back" ? "Delete last digit" : k === "." ? "Decimal point" : k}
          className="font-display grid h-16 place-items-center rounded-2xl border border-border bg-background/70 text-3xl font-medium
            transition-[transform,background-color] duration-100 hover:bg-muted active:scale-95 active:bg-primary active:text-primary-foreground
            disabled:opacity-50 sm:h-[4.25rem]"
        >
          {k === "back" ? <Delete className="size-6" aria-hidden /> : k}
        </button>
      ))}
    </div>
  )
}
