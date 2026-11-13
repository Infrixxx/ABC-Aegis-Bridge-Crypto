import type { ComponentProps } from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"
import { cn } from "@/lib/utils"

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium select-none " +
    "transition-[transform,background-color,border-color,color,filter] duration-150 active:scale-[0.97] " +
    "disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-foreground shadow-[inset_0_-3px_0_rgb(0_0_0/0.16)] hover:brightness-105",
        secondary: "border border-border bg-card hover:border-foreground/40 hover:bg-muted",
        ghost: "hover:bg-muted",
        outline: "border border-input bg-transparent hover:bg-muted",
        danger: "border border-danger/50 bg-danger-soft text-danger-text hover:border-danger",
      },
      size: {
        sm: "h-9 rounded-lg px-3 text-sm [&_svg]:size-4",
        md: "h-11 rounded-xl px-4 text-[0.95rem] [&_svg]:size-[1.1rem]",
        lg: "h-14 rounded-2xl px-6 text-lg [&_svg]:size-5",
        icon: "size-11 rounded-xl [&_svg]:size-5",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
)

export function Button({
  className,
  variant,
  size,
  asChild = false,
  type = "button",
  ...props
}: ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button"
  return <Comp type={asChild ? undefined : type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
}
