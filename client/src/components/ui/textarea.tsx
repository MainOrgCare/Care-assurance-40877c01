import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
      <textarea
        className={cn(
          "flex min-h-[124px] w-full rounded-xl border border-input/90 bg-card/92 px-3.5 py-2.5 text-[0.875rem] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.28)] placeholder:text-muted-foreground/70 transition-[border-color,box-shadow,background-color] duration-150 focus-visible:border-primary/45 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/12 focus-visible:ring-offset-0 focus-visible:bg-card hover:border-primary/24 hover:bg-card disabled:cursor-not-allowed disabled:opacity-40",
          className
        )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
