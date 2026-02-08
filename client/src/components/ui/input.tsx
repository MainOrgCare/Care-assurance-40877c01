import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, id, name, ...props }, ref) => {
    const generatedId = React.useId().replace(/:/g, "");
    const resolvedId = id ?? `input-${generatedId}`;
    const resolvedName = name ?? resolvedId;

    return (
      <input
        id={resolvedId}
        name={resolvedName}
        type={type}
        className={cn(
          "flex h-10 w-full rounded-xl border border-input/90 bg-card/85 px-3 py-2 text-[0.92rem] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] transition-[background-color,border-color,box-shadow,color] file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground/70 focus-visible:border-primary/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:ring-offset-0 hover:border-primary/25 hover:bg-card disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
