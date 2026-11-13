import type { ReactNode } from "react"
import { ToggleGroup } from "radix-ui"
import { cn } from "@/lib/utils"

interface Option<T extends string> {
  value: T
  label: ReactNode
}

/** Single-choice segmented control (shadcn "toggle group" pattern). */
export function Segmented<T extends string>({
  value,
  onValueChange,
  options,
  label,
  className,
}: {
  value: T
  onValueChange: (v: T) => void
  options: Option<T>[]
  label: string
  className?: string
}) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onValueChange(v as T)}
      aria-label={label}
      className={cn("inline-flex w-full gap-1 rounded-xl border border-border bg-muted p-1", className)}
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          className={
            "flex h-9 min-w-0 flex-1 items-center justify-center rounded-lg px-2 text-sm font-medium text-muted-foreground " +
            "transition-colors hover:text-foreground data-[state=on]:bg-card data-[state=on]:text-foreground " +
            "data-[state=on]:shadow-[0_1px_2px_rgb(0_0_0/0.12)]"
          }
        >
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  )
}
