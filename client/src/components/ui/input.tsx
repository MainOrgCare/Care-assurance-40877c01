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
          "flex h-9 w-full rounded-lg border border-input/65 bg-background px-3 py-1.5 text-[0.8125rem] text-foreground transition-[border-color,box-shadow,background-color] duration-150 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground/45 focus-visible:border-primary/45 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/10 focus-visible:ring-offset-0 focus-visible:bg-card hover:border-primary/25 disabled:cursor-not-allowed disabled:opacity-40",
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
