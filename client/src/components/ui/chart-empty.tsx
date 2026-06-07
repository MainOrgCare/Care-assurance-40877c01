import type { ComponentProps, ReactNode } from "react";
import { BarChart3 } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";

interface ChartEmptyProps extends ComponentProps<"div"> {
  /** Short headline, e.g. "No audit data yet". */
  title?: string;
  /** Optional supporting sentence explaining how data appears. */
  description?: ReactNode;
  /** Icon shown in the media badge. Defaults to a chart glyph. */
  icon?: ReactNode;
}

/**
 * Polished placeholder for empty charts and data panels. Wraps the shared
 * Empty primitives so every "no data" surface reads consistently across the
 * app instead of bare centred text.
 */
export function ChartEmpty({
  title = "No data to display",
  description,
  icon,
  className,
  ...props
}: ChartEmptyProps) {
  return (
    <Empty
      className={cn(
        "min-h-[250px] gap-4 border-border/60 bg-card/40 p-6 shadow-none",
        className,
      )}
      {...props}
    >
      <EmptyHeader>
        <EmptyMedia variant="icon">
          {icon ?? <BarChart3 aria-hidden="true" />}
        </EmptyMedia>
        <EmptyTitle className="text-base">{title}</EmptyTitle>
        {description ? (
          <EmptyDescription>{description}</EmptyDescription>
        ) : null}
      </EmptyHeader>
    </Empty>
  );
}
