import type { ComponentProps } from "react"
import { cn } from "@/lib/utils"

export const Table = ({ className, ...p }: ComponentProps<"table">) => (
  <table className={cn("w-full border-collapse text-sm", className)} {...p} />
)
export const THead = (p: ComponentProps<"thead">) => <thead {...p} />
export const TBody = (p: ComponentProps<"tbody">) => <tbody {...p} />
export const TR = ({ className, ...p }: ComponentProps<"tr">) => (
  <tr className={cn("border-b border-border last:border-0 hover:bg-muted/50", className)} {...p} />
)
export const TH = ({ className, ...p }: ComponentProps<"th">) => (
  <th
    scope="col"
    className={cn("px-3 py-2.5 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase", className)}
    {...p}
  />
)
export const TD = ({ className, ...p }: ComponentProps<"td">) => (
  <td className={cn("px-3 py-3 align-middle", className)} {...p} />
)
