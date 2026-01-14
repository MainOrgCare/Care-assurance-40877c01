import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
           // @replit: no hover, and add primary border
           "bg-primary text-primary-foreground border border-primary-border shadow-[0_6px_18px_rgba(0,0,0,0.22)] hover:shadow-[0_8px_22px_rgba(0,0,0,0.26)] active:shadow-[0_4px_12px_rgba(0,0,0,0.18)]",
        destructive:
          "bg-destructive text-destructive-foreground border border-destructive-border shadow-[0_6px_18px_rgba(0,0,0,0.22)] hover:shadow-[0_8px_22px_rgba(0,0,0,0.26)] active:shadow-[0_4px_12px_rgba(0,0,0,0.18)]",
        outline:
          // @replit Shows the background color of whatever card / sidebar / accent background it is inside of.
          // Inherits the current text color. Uses shadow-xs. no shadow on active
          // No hover state
          "border [border-color:var(--button-outline)] bg-transparent text-foreground/90 hover:bg-muted/50 hover:text-foreground shadow-xs active:shadow-none",
        secondary:
          // @replit border, no hover, no shadow, secondary border.
          "border bg-secondary text-secondary-foreground border-secondary-border shadow-[0_6px_18px_rgba(0,0,0,0.2)] hover:shadow-[0_8px_22px_rgba(0,0,0,0.24)] active:shadow-[0_4px_12px_rgba(0,0,0,0.16)]",
        // @replit no hover, transparent border
        ghost: "border border-transparent text-foreground/85 hover:bg-muted/60 hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        // @replit changed sizes
        default: "min-h-9 px-4 py-2",
        sm: "min-h-8 rounded-md px-3 text-xs",
        lg: "min-h-10 rounded-md px-8",
        icon: "h-9 w-9",
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
