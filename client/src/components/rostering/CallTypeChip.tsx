import React from "react";

export interface CallTypeChipProps {
  callType: string;
  size?: "sm" | "md";
}

const callTypeColors: Record<string, { bg: string; text: string; border: string }> = {
  am: { bg: "bg-sky-100 dark:bg-sky-950/40", text: "text-sky-700 dark:text-sky-400", border: "border-sky-300 dark:border-sky-700/60" },
  morning: { bg: "bg-sky-100 dark:bg-sky-950/40", text: "text-sky-700 dark:text-sky-400", border: "border-sky-300 dark:border-sky-700/60" },
  lunch: { bg: "bg-warning/10", text: "text-warning", border: "border-warning/30/60" },
  tea: { bg: "bg-orange-100 dark:bg-orange-950/40", text: "text-orange-700 dark:text-orange-400", border: "border-orange-300 dark:border-orange-700/60" },
  teatime: { bg: "bg-orange-100 dark:bg-orange-950/40", text: "text-orange-700 dark:text-orange-400", border: "border-orange-300 dark:border-orange-700/60" },
  evening: { bg: "bg-violet-100 dark:bg-violet-950/40", text: "text-violet-700 dark:text-violet-400", border: "border-violet-300 dark:border-violet-700/60" },
  // NOTE: In many rosters "PM" is used interchangeably with "Tea"/Afternoon.
  pm: { bg: "bg-orange-100 dark:bg-orange-950/40", text: "text-orange-700 dark:text-orange-400", border: "border-orange-300 dark:border-orange-700/60" },
  night: { bg: "bg-indigo-100 dark:bg-indigo-950/40", text: "text-indigo-700 dark:text-indigo-400", border: "border-indigo-300 dark:border-indigo-700/60" },
  overnight: { bg: "bg-indigo-100 dark:bg-indigo-950/40", text: "text-indigo-700 dark:text-indigo-400", border: "border-indigo-300 dark:border-indigo-700/60" },
  medication: { bg: "bg-rose-100 dark:bg-rose-950/40", text: "text-rose-700 dark:text-rose-400", border: "border-rose-300 dark:border-rose-700/60" },
  meds: { bg: "bg-rose-100 dark:bg-rose-950/40", text: "text-rose-700 dark:text-rose-400", border: "border-rose-300 dark:border-rose-700/60" },
  personal: { bg: "bg-success/10 dark:bg-success-950/40", text: "text-success dark:text-success-400", border: "bg-success/10" },
  domestic: { bg: "bg-teal-100 dark:bg-teal-950/40", text: "text-teal-700 dark:text-teal-400", border: "border-teal-300 dark:border-teal-700/60" },
  shopping: { bg: "bg-cyan-100 dark:bg-cyan-950/40", text: "text-cyan-700 dark:text-cyan-400", border: "border-cyan-300 dark:border-cyan-700/60" },
};

const getCallTypeColor = (callType: string) => {
  const normalized = callType.toLowerCase().trim();
  for (const [key, colors] of Object.entries(callTypeColors)) {
    if (normalized.includes(key)) {
      return colors;
    }
  }
  return { bg: "bg-muted", text: "text-muted-foreground", border: "border-border" };
};

export const CallTypeChip: React.FC<CallTypeChipProps> = ({ callType, size = "sm" }) => {
  const colors = getCallTypeColor(callType);

  const sizeClasses = size === "sm" 
    ? "px-2 py-0.5 text-[10px]" 
    : "px-2.5 py-1 text-xs";

  return (
    <span
      className={`inline-flex items-center rounded-full border font-semibold ${sizeClasses} ${colors.bg} ${colors.text} ${colors.border}`}
    >
      {callType}
    </span>
  );
};
