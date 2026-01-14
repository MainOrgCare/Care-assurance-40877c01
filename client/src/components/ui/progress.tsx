"use client"

import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"

import { cn } from "@/lib/utils"

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>
>(({ className, value, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn(
      "group relative h-3 w-full overflow-hidden rounded-full border border-border/60 bg-gradient-to-r from-muted/50 via-muted/30 to-muted/50 shadow-inner",
      "after:absolute after:inset-0 after:content-[''] after:bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.18),transparent_60%)] after:opacity-70",
      className
    )}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className={cn(
        "relative h-full w-full flex-1 rounded-full bg-gradient-to-r from-primary via-primary/80 to-secondary/70 shadow-[0_6px_12px_rgba(0,0,0,0.25)]",
        "transition-[transform,box-shadow] duration-500 ease-out will-change-transform",
        "before:absolute before:inset-0 before:content-[''] before:-translate-x-full before:bg-gradient-to-r before:from-white/0 before:via-white/35 before:to-white/0 before:animate-[shimmer_1.8s_ease-in-out_infinite] motion-reduce:before:animate-none",
        "group-data-[state=complete]:shadow-[0_8px_18px_rgba(59,130,246,0.35)]"
      )}
      style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
    />
  </ProgressPrimitive.Root>
))
Progress.displayName = ProgressPrimitive.Root.displayName

export { Progress }
