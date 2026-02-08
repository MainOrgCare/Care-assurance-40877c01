import * as React from "react"

import { cn } from "@/lib/utils"

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "relative overflow-hidden rounded-2xl border border-border/80 bg-[linear-gradient(165deg,hsl(0_0%_100%/_0.95),hsl(204_30%_98%/_0.88))] text-card-foreground backdrop-blur-[3px]",
      "before:pointer-events-none before:absolute before:inset-0 before:bg-[linear-gradient(165deg,rgba(255,255,255,0.78),rgba(255,255,255,0)_58%)] before:opacity-85",
      "after:pointer-events-none after:absolute after:-right-[24%] after:-top-[42%] after:h-[86%] after:w-[68%] after:rounded-full after:bg-[radial-gradient(circle,rgba(14,116,144,0.10),rgba(14,116,144,0)_70%)]",
      "shadow-[0_14px_32px_-24px_rgba(15,23,42,0.4),0_2px_8px_rgba(15,23,42,0.08)]",
      "hover:border-primary/28 hover:shadow-[0_22px_42px_-30px_rgba(15,23,42,0.48),0_2px_10px_rgba(15,23,42,0.08)] hover:-translate-y-px",
      "transition-[border-color,box-shadow,transform] duration-200 ease-out",
      className
    )}
    {...props}
  />
))
Card.displayName = "Card"

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("relative z-10 flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("font-heading text-[1.02rem] font-semibold leading-none tracking-[-0.024em] text-foreground", className)}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-[0.88rem] text-muted-foreground leading-relaxed", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("relative z-10 p-6 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("relative z-10 flex items-center p-6 pt-0", className)}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
