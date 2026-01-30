import React from "react";
import {
  categorizeTravelTime,
  getTravelCategoryColor,
  getTravelCategoryLabel,
  type TravelCategory,
} from "@/lib/rostering/travelUtils";
import { Car, Clock } from "lucide-react";

export interface TravelTimeIndicatorProps {
  travelMinutes: number;
  gapMinutes?: number;
  showLabel?: boolean;
  compact?: boolean;
}

export const TravelTimeIndicator: React.FC<TravelTimeIndicatorProps> = ({
  travelMinutes,
  gapMinutes,
  showLabel = true,
  compact = false,
}) => {
  const category = categorizeTravelTime(travelMinutes);
  const color = getTravelCategoryColor(category);
  const label = getTravelCategoryLabel(category);

  const hasExcessGap = gapMinutes !== undefined && gapMinutes > travelMinutes + 10;
  const isTight = gapMinutes !== undefined && gapMinutes < travelMinutes;

  if (compact) {
    return (
      <div
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
        style={{ backgroundColor: `${color}20`, color }}
      >
        <Car className="h-3 w-3" />
        {travelMinutes}m
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-background/60 px-3 py-2">
      <div
        className="flex h-8 w-8 items-center justify-center rounded-full"
        style={{ backgroundColor: `${color}20` }}
      >
        <Car className="h-4 w-4" style={{ color }} />
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{travelMinutes} min travel</span>
          {isTight && (
            <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">
              Tight!
            </span>
          )}
          {hasExcessGap && (
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">
              Gap: {gapMinutes}m
            </span>
          )}
        </div>
        {showLabel && (
          <p className="text-xs text-muted-foreground" style={{ color: `${color}cc` }}>
            {label}
          </p>
        )}
      </div>
    </div>
  );
};

export interface TravelSegmentBarProps {
  segments: Array<{
    travelMinutes: number;
    category: TravelCategory;
  }>;
  maxWidth?: number;
}

export const TravelSegmentBar: React.FC<TravelSegmentBarProps> = ({
  segments,
  maxWidth = 200,
}) => {
  const totalTravel = segments.reduce((sum, s) => sum + s.travelMinutes, 0);
  if (totalTravel === 0) return null;

  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted/30" style={{ maxWidth }}>
      {segments.map((segment, idx) => {
        const width = (segment.travelMinutes / totalTravel) * 100;
        const color = getTravelCategoryColor(segment.category);
        return (
          <div
            key={idx}
            className="h-full transition-all"
            style={{ width: `${width}%`, backgroundColor: color }}
          />
        );
      })}
    </div>
  );
};
