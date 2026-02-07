import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-lg text-sm font-medium tracking-normal transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 select-none",
  {
    variants: {
      variant: {
        default:
          "border border-primary bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 active:translate-y-px",
        destructive:
          "border border-destructive bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 active:translate-y-px",
        outline:
          "border border-border bg-background text-foreground shadow-xs hover:bg-muted hover:border-border active:translate-y-px",
        secondary:
          "border border-secondary bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/90 active:translate-y-px",
        ghost: 
          "border border-transparent bg-transparent text-foreground/75 hover:bg-muted hover:text-foreground active:translate-y-px",
        link: "text-primary underline-offset-4 hover:underline",
        success:
          "border border-emerald-600 bg-emerald-600 text-white shadow-sm hover:bg-emerald-600/90 active:translate-y-px",
        premium:
          "border border-primary/50 bg-primary text-white shadow-sm hover:bg-primary/90 active:translate-y-px",
      },
      size: {
        default: "min-h-9 px-4 py-2",
        sm: "min-h-8 rounded-md px-3 py-1.5 text-xs",
        lg: "min-h-11 rounded-lg px-6 py-2.5 text-sm",
        xl: "min-h-12 rounded-lg px-8 py-3 text-base font-semibold",
        icon: "h-9 w-9",
        "icon-sm": "h-8 w-8",
        "icon-lg": "h-11 w-11",
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
