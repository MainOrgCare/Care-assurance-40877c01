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
      "group relative h-3 w-full overflow-hidden rounded-full border border-border/75 bg-gradient-to-r from-muted/60 via-muted/45 to-muted/60 shadow-[inset_0_1px_2px_rgba(15,23,42,0.12)]",
      "after:absolute after:inset-0 after:content-[''] after:bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.22),transparent_60%)] after:opacity-80",
      className
    )}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className={cn(
        "relative h-full w-full flex-1 rounded-full bg-primary shadow-[0_10px_16px_-10px_hsl(var(--primary)/0.45)]",
        "transition-[transform,box-shadow] duration-500 ease-out will-change-transform",
        "before:absolute before:inset-0 before:content-[''] before:-translate-x-full before:bg-gradient-to-r before:from-white/0 before:via-white/35 before:to-white/0 before:animate-[shimmer_1.8s_ease-in-out_infinite] motion-reduce:before:animate-none",
        "group-data-[state=complete]:shadow-[0_12px_20px_-10px_rgba(37,99,235,0.72)]"
      )}
      style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
    />
  </ProgressPrimitive.Root>
))
Progress.displayName = ProgressPrimitive.Root.displayName

export { Progress }
