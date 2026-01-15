import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "whitespace-nowrap inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring/60 focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-primary/25 bg-primary/12 text-primary shadow-[0_0_12px_rgba(59,180,200,0.1)] ring-1 ring-primary/15",
        secondary:
          "border-secondary/25 bg-secondary/12 text-secondary ring-1 ring-secondary/15",
        destructive:
          "border-destructive/25 bg-destructive/15 text-destructive ring-1 ring-destructive/20",
        success:
          "border-emerald-500/25 bg-emerald-500/12 text-emerald-400 ring-1 ring-emerald-500/15",
        warning:
          "border-amber-500/25 bg-amber-500/12 text-amber-400 ring-1 ring-amber-500/15",
        outline: 
          "text-foreground/80 border-border/60 bg-muted/30 backdrop-blur-sm",
        muted:
          "text-muted-foreground border-border/40 bg-muted/40 backdrop-blur-sm",
        premium:
          "border-transparent bg-gradient-to-r from-primary/20 via-primary/15 to-secondary/15 text-primary ring-1 ring-primary/20",
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
