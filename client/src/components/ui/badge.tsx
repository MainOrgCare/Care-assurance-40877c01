import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "whitespace-nowrap inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.05em] transition-[border-color,background-color,color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:ring-offset-1",
  {
    variants: {
      variant: {
        default:
          "border-primary/24 bg-primary/10 text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]",
        secondary:
          "border-secondary/22 bg-secondary/10 text-secondary",
        destructive:
          "border-destructive/24 bg-destructive/10 text-destructive dark:border-destructive/26 dark:bg-destructive/100/12 dark:text-destructive",
        success:
          "border-success/24 bg-success/10 text-success dark:border-success/28 dark:bg-success/100/12 dark:text-success-400",
        warning:
          "border-warning/24 bg-warning/100/12 text-warning dark:border-warning/40/24 dark:bg-warning/100/12 dark:text-warning",
        outline:
          "text-foreground/80 border-border/90 bg-transparent",
        muted:
          "text-muted-foreground border-border bg-muted/60",
        premium:
          "border-primary/30 bg-[linear-gradient(135deg,color-mix(in_oklab,var(--color-primary)_10%,transparent)_0%,color-mix(in_oklab,var(--color-secondary)_16%,transparent)_100%)] text-primary",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
