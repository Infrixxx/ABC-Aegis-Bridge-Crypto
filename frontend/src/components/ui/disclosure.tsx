import { useState, type ReactNode } from "react"
import { Collapsible } from "radix-ui"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

/** "Show more" row that smoothly reveals advanced content. */
export function Disclosure({
  label,
  children,
  defaultOpen = false,
  className,
}: {
  label: string
  children: ReactNode
  defaultOpen?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <Collapsible.Root open={open} onOpenChange={setOpen} className={className}>
      <Collapsible.Trigger className="group flex items-center gap-1.5 rounded-lg py-1 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
        {label}
      </Collapsible.Trigger>
      <Collapsible.Content className="disclosure overflow-hidden">
        <div className="pt-2">{children}</div>
      </Collapsible.Content>
    </Collapsible.Root>
  )
}
