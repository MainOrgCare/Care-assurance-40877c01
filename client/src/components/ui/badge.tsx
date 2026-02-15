import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "whitespace-nowrap inline-flex items-center rounded-md border px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-[0.05em] transition-colors duration-120 focus:outline-none focus:ring-2 focus:ring-ring/20 focus:ring-offset-1",
  {
    variants: {
      variant: {
        default:
          "border-primary/15 bg-primary/6 text-primary",
        secondary:
          "border-secondary/15 bg-secondary/6 text-secondary",
        destructive:
          "border-destructive/15 bg-destructive/6 text-destructive dark:border-red-500/20 dark:bg-red-500/8 dark:text-red-400",
        success:
          "border-emerald-600/15 bg-emerald-600/6 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/8 dark:text-emerald-400",
        warning:
          "border-amber-500/15 bg-amber-500/6 text-amber-700 dark:border-amber-400/20 dark:bg-amber-500/8 dark:text-amber-400",
        outline: 
          "text-foreground/70 border-border/60 bg-transparent",
        muted:
          "text-muted-foreground border-border/50 bg-muted/40",
        premium:
          "border-primary/15 bg-primary/6 text-primary",
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
