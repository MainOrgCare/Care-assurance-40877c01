import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "whitespace-nowrap inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] transition-[border-color,background-color,color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/22 focus-visible:ring-offset-1",
  {
    variants: {
      variant: {
        default:
          "border-primary/20 bg-primary/8 text-primary",
        secondary:
          "border-border bg-secondary text-secondary-foreground",
        destructive:
          "border-destructive/22 bg-destructive/8 text-destructive",
        success:
          "border-success/22 bg-success/8 text-success",
        warning:
          "border-warning/24 bg-warning/10 text-warning",
        outline:
          "text-foreground/80 border-border bg-transparent",
        muted:
          "text-muted-foreground border-border bg-muted/60",
        premium:
          "border-primary/24 bg-primary/10 text-primary",
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
