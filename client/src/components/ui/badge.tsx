import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "whitespace-nowrap inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] transition-colors duration-120 focus:outline-none focus:ring-2 focus:ring-ring/20 focus:ring-offset-1",
  {
    variants: {
      variant: {
        default:
          "border-primary/12 bg-primary/7 text-primary",
        secondary:
          "border-secondary/12 bg-secondary/7 text-secondary",
        destructive:
          "border-destructive/12 bg-destructive/7 text-destructive dark:border-red-500/18 dark:bg-red-500/8 dark:text-red-400",
        success:
          "border-emerald-600/12 bg-emerald-600/7 text-emerald-700 dark:border-emerald-500/18 dark:bg-emerald-500/8 dark:text-emerald-400",
        warning:
          "border-amber-500/14 bg-amber-500/7 text-amber-700 dark:border-amber-400/18 dark:bg-amber-500/8 dark:text-amber-400",
        outline: 
          "text-foreground/65 border-border/50 bg-transparent",
        muted:
          "text-muted-foreground border-border/40 bg-muted/40",
        premium:
          "border-primary/12 bg-primary/7 text-primary",
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
