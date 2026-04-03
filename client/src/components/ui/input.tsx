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
          "flex h-10 w-full rounded-xl border border-input/90 bg-card/92 px-3.5 py-2 text-[0.875rem] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.28)] transition-[border-color,box-shadow,background-color] duration-150 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground/70 focus-visible:border-primary/45 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/12 focus-visible:ring-offset-0 focus-visible:bg-card hover:border-primary/24 hover:bg-card disabled:cursor-not-allowed disabled:opacity-40",
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
