import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-[0.875rem] font-semibold leading-none tracking-[-0.01em] transition-[background-color,border-color,box-shadow,transform,color] duration-150 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/18 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 select-none active:scale-[0.985]",
  {
    variants: {
      variant: {
        default:
          "border border-primary bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_10px_24px_-18px_color-mix(in_oklab,var(--color-primary)_75%,transparent)] hover:bg-primary/92 hover:border-primary active:bg-primary/88 active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.12),var(--shadow-xs)]",
        destructive:
          "border border-destructive bg-destructive text-destructive-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_10px_24px_-18px_color-mix(in_oklab,var(--color-destructive)_75%,transparent)] hover:bg-destructive/92 active:bg-destructive/88",
        outline:
          "border border-border/80 bg-card/96 text-foreground shadow-[var(--shadow-xs)] hover:border-primary/28 hover:bg-accent/72 hover:text-foreground",
        secondary:
          "border border-secondary bg-secondary text-secondary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_10px_24px_-18px_color-mix(in_oklab,var(--color-secondary)_72%,transparent)] hover:bg-secondary/92 active:bg-secondary/88",
        ghost:
          "bg-transparent text-foreground/72 hover:bg-muted/68 hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline font-medium",
        success:
          "border border-success bg-success text-success-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_10px_24px_-18px_color-mix(in_oklab,var(--color-success)_75%,transparent)] hover:bg-success/92 active:bg-success/88",
        premium:
          "border border-primary bg-[linear-gradient(135deg,color-mix(in_oklab,var(--color-primary)_92%,white)_0%,color-mix(in_oklab,var(--color-secondary)_26%,var(--color-primary))_100%)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_18px_30px_-20px_rgba(15,23,42,0.45)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_22px_32px_-22px_rgba(15,23,42,0.5)] active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.14),var(--shadow-sm)]",
      },
      size: {
        default: "h-10 px-[1.125rem]",
        sm: "h-8 rounded-lg px-3 text-xs font-semibold",
        lg: "h-11 rounded-xl px-[1.375rem] text-[0.9375rem]",
        xl: "h-12 rounded-xl px-6 text-[1rem]",
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
