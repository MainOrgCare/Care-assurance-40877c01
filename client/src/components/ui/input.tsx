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
          "flex h-10 w-full rounded-xl border border-input/85 bg-[linear-gradient(180deg,hsl(0_0%_100%/_0.97),hsl(204_30%_97%/_0.9))] px-3.5 py-2 text-[0.9rem] font-medium leading-[1.36] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_1px_0_rgba(15,23,42,0.03)] transition-[background-color,border-color,box-shadow,color,transform] file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:font-medium placeholder:text-muted-foreground/66 focus-visible:border-primary/42 focus-visible:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:ring-offset-0 hover:border-primary/24 hover:bg-card hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50",
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
