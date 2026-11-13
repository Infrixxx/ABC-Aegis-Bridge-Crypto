import type { ComponentProps } from "react"
import { Popover as PopoverPrimitive } from "radix-ui"
import { cn } from "@/lib/utils"

export const Popover = PopoverPrimitive.Root
export const PopoverTrigger = PopoverPrimitive.Trigger

export function PopoverContent({
  className,
  align = "end",
  sideOffset = 8,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={12}
        className={cn(
          "paper z-50 w-[min(22rem,calc(100vw-1.5rem))] rounded-2xl border border-border bg-card p-4 text-foreground",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}
