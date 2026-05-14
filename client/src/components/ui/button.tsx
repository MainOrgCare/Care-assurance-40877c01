import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "relative isolate inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[0.625rem] text-[0.875rem] font-semibold leading-none tracking-[-0.012em] transition-[background-color,border-color,box-shadow,transform,color,opacity] duration-150 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/22 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none aria-[busy=true]:cursor-progress aria-[busy=true]:opacity-85 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 select-none active:scale-[0.985]",
  {
    variants: {
      variant: {
        default:
          "border border-transparent bg-primary text-primary-foreground shadow-[var(--shadow-xs)] hover:bg-primary/93 hover:shadow-[var(--shadow-sm)] active:bg-primary/88 active:shadow-none",
        destructive:
          "border border-transparent bg-destructive text-destructive-foreground shadow-[var(--shadow-xs)] hover:bg-destructive/93 hover:shadow-[var(--shadow-sm)] active:bg-destructive/88",
        outline:
          "border border-border bg-card text-foreground shadow-none hover:border-primary/35 hover:bg-muted/60 hover:text-foreground active:bg-muted",
        secondary:
          "border border-border bg-secondary text-secondary-foreground shadow-none hover:bg-muted hover:border-primary/25 active:bg-muted/80",
        ghost:
          "border border-transparent bg-transparent text-foreground/75 hover:bg-muted hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline font-medium",
        success:
          "border border-transparent bg-success text-success-foreground shadow-[var(--shadow-xs)] hover:bg-success/93 hover:shadow-[var(--shadow-sm)] active:bg-success/88",
        premium:
          "border border-transparent bg-primary text-primary-foreground shadow-[var(--shadow-sm)] hover:bg-primary/95 hover:shadow-[var(--shadow-soft)] active:bg-primary/90",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 rounded-[0.5rem] px-3 text-xs font-semibold",
        lg: "h-11 rounded-[0.625rem] px-5 text-[0.9375rem]",
        xl: "h-12 rounded-[0.75rem] px-6 text-[1rem]",
        icon: "h-10 w-10",
        "icon-sm": "h-8 w-8 rounded-[0.5rem]",
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
