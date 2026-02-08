import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-xl text-[0.9rem] font-semibold leading-none tracking-[0.002em] transition-[background-color,border-color,color,box-shadow,transform,filter] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-[46%] before:bg-gradient-to-b before:from-white/28 before:to-transparent before:opacity-0 before:transition-opacity [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 select-none",
  {
    variants: {
      variant: {
        default:
          "border border-primary/85 bg-[linear-gradient(180deg,hsl(206_88%_40%),hsl(206_88%_35%))] text-primary-foreground shadow-[0_14px_28px_-18px_hsl(206_88%_37%_/_0.78)] before:opacity-100 hover:border-primary hover:brightness-[1.03] hover:shadow-[0_20px_38px_-22px_hsl(206_88%_37%_/_0.82)] hover:-translate-y-px active:translate-y-[0.5px]",
        destructive:
          "border border-destructive/90 bg-[linear-gradient(180deg,hsl(0_72%_54%),hsl(0_72%_47%))] text-destructive-foreground shadow-[0_12px_24px_-16px_hsl(0_72%_45%_/_0.78)] before:opacity-70 hover:brightness-[1.03] hover:-translate-y-px active:translate-y-[0.5px]",
        outline:
          "border border-border/88 bg-card/86 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.84)] hover:border-primary/32 hover:bg-muted/66 hover:text-foreground hover:-translate-y-px active:translate-y-[0.5px]",
        secondary:
          "border border-secondary/85 bg-[linear-gradient(180deg,hsl(172_71%_35%),hsl(172_71%_30%))] text-secondary-foreground shadow-[0_12px_24px_-16px_hsl(172_71%_30%_/_0.7)] before:opacity-90 hover:brightness-[1.03] hover:-translate-y-px active:translate-y-[0.5px]",
        ghost: 
          "border border-transparent bg-transparent text-foreground/78 hover:bg-muted/70 hover:text-foreground hover:-translate-y-px active:translate-y-[0.5px]",
        link: "text-primary underline-offset-4 hover:underline",
        success:
          "border border-success/85 bg-[linear-gradient(180deg,hsl(154_63%_39%),hsl(154_63%_34%))] text-success-foreground shadow-[0_12px_24px_-16px_hsl(154_63%_34%_/_0.75)] before:opacity-80 hover:brightness-[1.03] hover:-translate-y-px active:translate-y-[0.5px]",
        premium:
          "border border-primary/60 bg-gradient-to-br from-primary to-secondary text-white shadow-[0_18px_30px_-20px_hsl(206_88%_37%_/_0.75)] before:opacity-90 hover:brightness-105 hover:-translate-y-px active:translate-y-[0.5px]",
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
