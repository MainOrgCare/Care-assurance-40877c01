import * as React from "react"

import { cn } from "@/lib/utils"
import { formControlClassName } from "./form-control-styles"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        formControlClassName,
        "flex min-h-[124px] px-3.5 py-2.5 resize-none",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
