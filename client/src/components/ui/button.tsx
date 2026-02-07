import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold tracking-[0.01em] transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 select-none",
  {
    variants: {
      variant: {
        default:
          "border border-primary/85 bg-primary text-primary-foreground shadow-[0_10px_20px_-12px_rgba(37,99,235,0.72)] hover:bg-primary/92 hover:border-primary hover:shadow-[0_16px_28px_-14px_rgba(37,99,235,0.75)] active:translate-y-px",
        destructive:
          "border border-destructive/80 bg-destructive text-destructive-foreground shadow-[0_10px_20px_-12px_rgba(220,38,38,0.7)] hover:bg-destructive/92 hover:border-destructive hover:shadow-[0_16px_28px_-14px_rgba(220,38,38,0.75)] active:translate-y-px",
        outline:
          "border border-border/75 bg-background/88 text-foreground shadow-sm hover:bg-muted/80 hover:border-primary/30 hover:text-foreground active:translate-y-px",
        secondary:
          "border border-secondary/80 bg-secondary text-secondary-foreground shadow-[0_10px_20px_-12px_rgba(8,145,178,0.62)] hover:bg-secondary/92 hover:border-secondary hover:shadow-[0_16px_28px_-14px_rgba(8,145,178,0.68)] active:translate-y-px",
        ghost: 
          "border border-transparent bg-transparent text-foreground/75 hover:bg-muted/65 hover:text-foreground active:translate-y-px",
        link: "text-primary underline-offset-4 hover:underline",
        success:
          "border border-emerald-600/80 bg-emerald-600 text-white shadow-[0_10px_20px_-12px_rgba(5,150,105,0.68)] hover:bg-emerald-600/92 hover:border-emerald-600 hover:shadow-[0_16px_28px_-14px_rgba(5,150,105,0.72)] active:translate-y-px",
        premium:
          "border border-primary/35 bg-[linear-gradient(135deg,hsl(213_84%_43%),hsl(194_85%_36%))] text-white shadow-[0_16px_30px_-16px_rgba(14,116,144,0.8)] hover:brightness-105 hover:shadow-[0_20px_36px_-18px_rgba(14,116,144,0.85)] active:translate-y-px",
      },
      size: {
        default: "min-h-10 px-5 py-2.5",
        sm: "min-h-9 rounded-lg px-4 py-2 text-xs",
        lg: "min-h-12 rounded-xl px-8 py-3 text-base",
        xl: "min-h-14 rounded-xl px-10 py-4 text-base font-bold",
        icon: "h-10 w-10",
        "icon-sm": "h-9 w-9",
        "icon-lg": "h-12 w-12",
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
