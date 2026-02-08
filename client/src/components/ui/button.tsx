import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-xl text-[0.92rem] font-semibold tracking-[-0.01em] transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 select-none",
  {
    variants: {
      variant: {
        default:
          "border border-primary/90 bg-primary text-primary-foreground shadow-[0_14px_28px_-18px_hsl(206_88%_37%_/_0.8)] hover:border-primary hover:bg-primary/95 hover:shadow-[0_18px_34px_-20px_hsl(206_88%_37%_/_0.85)] hover:-translate-y-px active:translate-y-[0.5px]",
        destructive:
          "border border-destructive/90 bg-destructive text-destructive-foreground shadow-[0_12px_24px_-16px_hsl(0_72%_45%_/_0.78)] hover:bg-destructive/92 hover:-translate-y-px active:translate-y-[0.5px]",
        outline:
          "border border-border/90 bg-card/82 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.84)] hover:border-primary/28 hover:bg-muted/66 hover:text-foreground active:translate-y-[0.5px]",
        secondary:
          "border border-secondary/85 bg-secondary text-secondary-foreground shadow-[0_12px_24px_-16px_hsl(172_71%_30%_/_0.7)] hover:bg-secondary/92 hover:-translate-y-px active:translate-y-[0.5px]",
        ghost: 
          "border border-transparent bg-transparent text-foreground/78 hover:bg-muted/70 hover:text-foreground active:translate-y-[0.5px]",
        link: "text-primary underline-offset-4 hover:underline",
        success:
          "border border-success/85 bg-success text-success-foreground shadow-[0_12px_24px_-16px_hsl(154_63%_34%_/_0.75)] hover:bg-success/92 hover:-translate-y-px active:translate-y-[0.5px]",
        premium:
          "border border-primary/60 bg-gradient-to-br from-primary to-secondary text-white shadow-[0_18px_30px_-20px_hsl(206_88%_37%_/_0.75)] hover:brightness-105 hover:-translate-y-px active:translate-y-[0.5px]",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-9 rounded-lg px-3 text-[0.8rem]",
        lg: "h-11 rounded-xl px-6 text-[0.95rem]",
        xl: "h-12 rounded-xl px-8 text-base font-semibold",
        icon: "h-10 w-10",
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
