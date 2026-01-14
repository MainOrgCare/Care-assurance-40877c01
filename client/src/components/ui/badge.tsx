import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "whitespace-nowrap inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors focus:outline-none focus:ring-2 focus:ring-ring/60 focus:ring-offset-2 backdrop-blur",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary/18 text-primary shadow-xs ring-1 ring-primary/20",
        secondary:
          "border-transparent bg-secondary/18 text-secondary ring-1 ring-secondary/20",
        destructive:
          "border-transparent bg-destructive/20 text-destructive-foreground shadow-xs ring-1 ring-destructive/25",
        outline: "text-foreground border [border-color:var(--badge-outline)] bg-transparent",
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
