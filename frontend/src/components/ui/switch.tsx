import type { ComponentProps } from "react"
import { Switch as SwitchPrimitive } from "radix-ui"
import { cn } from "@/lib/utils"

export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "relative h-7 w-12 shrink-0 rounded-full border border-input bg-muted transition-colors " +
          "data-[state=checked]:border-transparent data-[state=checked]:bg-primary",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "block size-5 translate-x-1 rounded-full bg-foreground/70 transition-transform duration-150 " +
            "data-[state=checked]:translate-x-6 data-[state=checked]:bg-primary-foreground",
        )}
      />
    </SwitchPrimitive.Root>
  )
}
