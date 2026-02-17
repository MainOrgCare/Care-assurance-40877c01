import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-[0.8125rem] font-medium leading-none tracking-[0.004em] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 select-none active:scale-[0.98]",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_1px_3px_rgba(15,23,42,0.12),0_1px_2px_rgba(15,23,42,0.06)] hover:bg-primary/90 active:bg-primary/85",
        destructive:
          "bg-destructive text-destructive-foreground shadow-[0_1px_3px_rgba(15,23,42,0.12),0_1px_2px_rgba(15,23,42,0.06)] hover:bg-destructive/90 active:bg-destructive/85",
        outline:
          "border border-border/60 bg-card text-foreground shadow-[var(--shadow-xs)] hover:border-primary/25 hover:bg-accent hover:text-foreground",
        secondary:
          "bg-secondary text-secondary-foreground shadow-[0_1px_3px_rgba(15,23,42,0.12),0_1px_2px_rgba(15,23,42,0.06)] hover:bg-secondary/90 active:bg-secondary/85",
        ghost: 
          "bg-transparent text-foreground/70 hover:bg-muted/50 hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline font-medium",
        success:
          "bg-success text-success-foreground shadow-[0_1px_3px_rgba(15,23,42,0.12),0_1px_2px_rgba(15,23,42,0.06)] hover:bg-success/90 active:bg-success/85",
        premium:
          "bg-primary text-white shadow-[0_2px_8px_-2px_rgba(15,23,42,0.16),0_1px_3px_rgba(15,23,42,0.08)] hover:bg-primary/90 hover:shadow-[0_4px_12px_-4px_rgba(15,23,42,0.20),0_2px_4px_rgba(15,23,42,0.08)] active:bg-primary/85",
      },
      size: {
        default: "h-9 px-4",
        sm: "h-8 rounded-md px-3 text-xs font-medium",
        lg: "h-10 rounded-lg px-5 text-sm",
        xl: "h-11 rounded-lg px-6 text-[0.9375rem] font-semibold",
        icon: "h-9 w-9",
        "icon-sm": "h-7 w-7",
        "icon-lg": "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
