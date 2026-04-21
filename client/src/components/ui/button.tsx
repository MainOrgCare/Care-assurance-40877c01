import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "relative isolate inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-[0.875rem] font-semibold leading-none tracking-[-0.01em] transition-[background-color,border-color,box-shadow,transform,color,opacity] duration-150 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none aria-[busy=true]:cursor-progress aria-[busy=true]:opacity-85 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 select-none active:scale-[0.985]",
  {
    variants: {
      variant: {
        default:
          "border border-primary bg-primary text-primary-foreground shadow-[var(--shadow-xs)] hover:bg-primary/92 hover:shadow-[var(--shadow-sm)] active:bg-primary/88 active:shadow-[var(--shadow-xs)]",
        destructive:
          "border border-destructive bg-destructive text-destructive-foreground shadow-[var(--shadow-xs)] hover:bg-destructive/92 hover:shadow-[var(--shadow-sm)] active:bg-destructive/88",
        outline:
          "border border-border bg-card text-foreground shadow-[var(--shadow-xs)] hover:border-primary/30 hover:bg-accent hover:text-foreground active:bg-accent",
        secondary:
          "border border-secondary bg-secondary text-secondary-foreground shadow-[var(--shadow-xs)] hover:bg-secondary/92 hover:shadow-[var(--shadow-sm)] active:bg-secondary/88",
        ghost:
          "border border-transparent bg-transparent text-foreground/72 hover:bg-muted hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline font-medium",
        success:
          "border border-success bg-success text-success-foreground shadow-[var(--shadow-xs)] hover:bg-success/92 hover:shadow-[var(--shadow-sm)] active:bg-success/88",
        premium:
          "border border-primary bg-[linear-gradient(180deg,color-mix(in_oklab,var(--color-primary)_98%,white)_0%,var(--color-primary)_100%)] text-primary-foreground shadow-[var(--shadow-sm)] hover:brightness-[1.04] hover:shadow-[var(--shadow-soft)] active:brightness-[0.98]",
      },
      size: {
        default: "h-10 px-[1.125rem]",
        sm: "h-8 rounded-md px-3 text-xs font-semibold",
        lg: "h-11 rounded-lg px-[1.375rem] text-[0.9375rem]",
        xl: "h-12 rounded-lg px-6 text-[1rem]",
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
