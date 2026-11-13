import type { ComponentProps } from "react"
import { cn } from "@/lib/utils"

export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("paper rounded-3xl border border-border bg-card", className)} {...props} />
}

export function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex items-start justify-between gap-3 p-5 pb-0 sm:p-6 sm:pb-0", className)} {...props} />
}

export function CardTitle({ className, ...props }: ComponentProps<"h2">) {
  return <h2 className={cn("font-display text-xl leading-tight font-semibold tracking-tight", className)} {...props} />
}

export function CardDescription({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("mt-1 text-sm text-muted-foreground", className)} {...props} />
}

export function CardContent({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("p-5 sm:p-6", className)} {...props} />
}
