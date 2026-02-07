import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "whitespace-nowrap inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring/45 focus:ring-offset-1",
  {
    variants: {
      variant: {
        default:
          "border-primary/25 bg-primary/12 text-primary ring-1 ring-primary/20",
        secondary:
          "border-secondary/25 bg-secondary/12 text-secondary ring-1 ring-secondary/20",
        destructive:
          "border-destructive/25 bg-destructive/12 text-destructive ring-1 ring-destructive/20",
        success:
          "border-emerald-500/30 bg-emerald-500/12 text-emerald-600 ring-1 ring-emerald-500/20",
        warning:
          "border-amber-500/30 bg-amber-500/12 text-amber-700 ring-1 ring-amber-500/20",
        outline: 
          "text-foreground/80 border-border/70 bg-background/70",
        muted:
          "text-muted-foreground border-border/60 bg-muted/45",
        premium:
          "border-primary/25 bg-[linear-gradient(120deg,hsl(213_84%_43%/_0.16),hsl(194_85%_36%/_0.16))] text-primary ring-1 ring-primary/20",
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
