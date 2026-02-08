import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[110px] w-full rounded-xl border border-input/90 bg-card/85 px-3 py-2.5 text-[0.93rem] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] placeholder:text-muted-foreground/70 transition-[background-color,border-color,box-shadow] focus-visible:border-primary/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:ring-offset-0 hover:border-primary/25 hover:bg-card disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
