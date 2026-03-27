import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "whitespace-nowrap inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.045em] transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-primary/25 focus:ring-offset-1",
  {
    variants: {
      variant: {
        default:
          "border-primary/16 bg-primary/8 text-primary",
        secondary:
          "border-secondary/16 bg-secondary/8 text-secondary",
        destructive:
          "border-destructive/16 bg-destructive/8 text-destructive dark:border-destructive/20 dark:bg-destructive/100/10 dark:text-red-400",
        success:
          "border-success/16 bg-success/8 text-success dark:border-success/20 dark:bg-success/100/10 dark:text-success-400",
        warning:
          "border-warning/18 bg-warning/100/8 text-warning dark:border-warning/40/20 dark:bg-warning/100/10 dark:text-warning",
        outline:
          "text-foreground/70 border-border/55 bg-transparent",
        muted:
          "text-muted-foreground border-border/45 bg-muted/45",
        premium:
          "border-primary/16 bg-primary/8 text-primary",
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
