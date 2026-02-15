import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-[0.8125rem] font-medium leading-none tracking-[0.003em] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 select-none",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[var(--shadow-xs)] hover:bg-primary/92 active:bg-primary/85",
        destructive:
          "bg-destructive text-destructive-foreground shadow-[var(--shadow-xs)] hover:bg-destructive/92 active:bg-destructive/85",
        outline:
          "border border-border/70 bg-card text-foreground shadow-[var(--shadow-xs)] hover:border-border hover:bg-muted/40 hover:text-foreground",
        secondary:
          "bg-secondary text-secondary-foreground shadow-[var(--shadow-xs)] hover:bg-secondary/92 active:bg-secondary/85",
        ghost: 
          "bg-transparent text-foreground/70 hover:bg-muted/50 hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline font-medium",
        success:
          "bg-success text-success-foreground shadow-[var(--shadow-xs)] hover:bg-success/92 active:bg-success/85",
        premium:
          "bg-primary text-white shadow-[var(--shadow-sm)] hover:bg-primary/92 active:bg-primary/85",
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
