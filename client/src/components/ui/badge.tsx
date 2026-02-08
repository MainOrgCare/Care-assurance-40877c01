import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "whitespace-nowrap inline-flex items-center rounded-md border px-2 py-0.5 text-[0.67rem] font-semibold uppercase tracking-[0.06em] transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-ring/30 focus:ring-offset-1",
  {
    variants: {
      variant: {
        default:
          "border-primary/20 bg-primary/8 text-primary",
        secondary:
          "border-secondary/20 bg-secondary/8 text-secondary",
        destructive:
          "border-destructive/20 bg-destructive/8 text-destructive dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-400",
        success:
          "border-emerald-600/20 bg-emerald-600/8 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-400",
        warning:
          "border-amber-500/20 bg-amber-500/8 text-amber-700 dark:border-amber-400/25 dark:bg-amber-500/10 dark:text-amber-400",
        outline: 
          "text-foreground/80 border-border bg-background",
        muted:
          "text-muted-foreground border-border bg-muted/50",
        premium:
          "border-primary/20 bg-primary/8 text-primary",
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
