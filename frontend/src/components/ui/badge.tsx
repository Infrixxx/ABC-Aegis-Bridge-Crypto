import type { ComponentProps } from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold whitespace-nowrap [&_svg]:size-3.5",
  {
    variants: {
      tone: {
        success: "border-success/40 bg-success-soft text-success-text",
        warning: "border-warning/40 bg-warning-soft text-warning-text",
        danger: "border-danger/40 bg-danger-soft text-danger-text",
        neutral: "border-border bg-muted text-muted-foreground",
      },
      /** Pending states get a dashed outline so status never relies on colour alone. */
      dashed: { true: "border-dashed", false: "" },
    },
    defaultVariants: { tone: "neutral", dashed: false },
  },
)

export function Badge({
  className,
  tone,
  dashed,
  ...props
}: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone, dashed }), className)} {...props} />
}
