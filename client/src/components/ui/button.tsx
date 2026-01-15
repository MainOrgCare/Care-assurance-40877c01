import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-250 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 select-none",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-b from-primary to-primary/90 text-primary-foreground border border-primary-border/80 shadow-[0_2px_8px_rgba(0,0,0,0.15),0_1px_2px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.1)] hover:shadow-[0_4px_16px_rgba(59,180,200,0.25),0_2px_4px_rgba(0,0,0,0.1)] hover:brightness-110 active:shadow-[0_1px_4px_rgba(0,0,0,0.15)] active:brightness-95 active:scale-[0.98]",
        destructive:
          "bg-gradient-to-b from-destructive to-destructive/90 text-destructive-foreground border border-destructive-border/80 shadow-[0_2px_8px_rgba(0,0,0,0.15),0_1px_2px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.1)] hover:shadow-[0_4px_16px_rgba(239,68,68,0.25),0_2px_4px_rgba(0,0,0,0.1)] hover:brightness-110 active:shadow-[0_1px_4px_rgba(0,0,0,0.15)] active:brightness-95 active:scale-[0.98]",
        outline:
          "border border-border/70 bg-transparent text-foreground/90 shadow-sm hover:bg-muted/60 hover:text-foreground hover:border-border active:bg-muted/80 active:scale-[0.98]",
        secondary:
          "bg-gradient-to-b from-secondary to-secondary/90 text-secondary-foreground border border-secondary-border/80 shadow-[0_2px_8px_rgba(0,0,0,0.15),0_1px_2px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.1)] hover:shadow-[0_4px_16px_rgba(251,146,60,0.25),0_2px_4px_rgba(0,0,0,0.1)] hover:brightness-110 active:shadow-[0_1px_4px_rgba(0,0,0,0.15)] active:brightness-95 active:scale-[0.98]",
        ghost: 
          "border border-transparent text-foreground/80 hover:bg-muted/50 hover:text-foreground active:bg-muted/70 active:scale-[0.98]",
        link: "text-primary underline-offset-4 hover:underline",
        success:
          "bg-gradient-to-b from-emerald-500 to-emerald-600 text-white border border-emerald-600/80 shadow-[0_2px_8px_rgba(0,0,0,0.15),0_1px_2px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.1)] hover:shadow-[0_4px_16px_rgba(52,211,153,0.25),0_2px_4px_rgba(0,0,0,0.1)] hover:brightness-110 active:shadow-[0_1px_4px_rgba(0,0,0,0.15)] active:brightness-95 active:scale-[0.98]",
        premium:
          "bg-gradient-to-r from-primary via-primary/90 to-secondary/80 text-white border border-primary/40 shadow-[0_2px_12px_rgba(59,180,200,0.2),0_1px_2px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.15)] hover:shadow-[0_6px_24px_rgba(59,180,200,0.35),0_2px_4px_rgba(0,0,0,0.1)] hover:scale-[1.02] active:shadow-[0_2px_8px_rgba(59,180,200,0.2)] active:scale-[0.98]",
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
