import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
          "flex min-h-[110px] w-full rounded-lg border border-input/70 bg-background px-3 py-2 text-[0.8125rem] text-foreground placeholder:text-muted-foreground/45 transition-[border-color,box-shadow] duration-120 focus-visible:border-primary/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/10 focus-visible:ring-offset-0 hover:border-primary/20 disabled:cursor-not-allowed disabled:opacity-40",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
