import type { ComponentProps } from "react"
import { cn } from "@/lib/utils"

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-12 w-full rounded-xl border border-input bg-background/60 px-3.5 text-base text-foreground " +
          "placeholder:text-muted-foreground/70 transition-colors focus-visible:border-foreground focus-visible:outline-offset-0 " +
          "disabled:opacity-60",
        className,
      )}
      {...props}
    />
  )
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("mb-1.5 block text-sm font-medium", className)} {...props} />
}
