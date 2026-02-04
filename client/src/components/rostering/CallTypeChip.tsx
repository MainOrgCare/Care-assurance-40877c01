import React from "react";

export interface CallTypeChipProps {
  callType: string;
  size?: "sm" | "md";
}

const callTypeColors: Record<string, { bg: string; text: string; border: string }> = {
  am: { bg: "bg-sky-100", text: "text-sky-700", border: "border-sky-300" },
  morning: { bg: "bg-sky-100", text: "text-sky-700", border: "border-sky-300" },
  lunch: { bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-300" },
  tea: { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-300" },
  teatime: { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-300" },
  evening: { bg: "bg-violet-100", text: "text-violet-700", border: "border-violet-300" },
  // NOTE: In many rosters "PM" is used interchangeably with "Tea"/Afternoon.
  pm: { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-300" },
  night: { bg: "bg-indigo-100", text: "text-indigo-700", border: "border-indigo-300" },
  overnight: { bg: "bg-indigo-100", text: "text-indigo-700", border: "border-indigo-300" },
  medication: { bg: "bg-rose-100", text: "text-rose-700", border: "border-rose-300" },
  meds: { bg: "bg-rose-100", text: "text-rose-700", border: "border-rose-300" },
  personal: { bg: "bg-emerald-100", text: "text-emerald-700", border: "border-emerald-300" },
  domestic: { bg: "bg-teal-100", text: "text-teal-700", border: "border-teal-300" },
  shopping: { bg: "bg-cyan-100", text: "text-cyan-700", border: "border-cyan-300" },
};

const getCallTypeColor = (callType: string) => {
  const normalized = callType.toLowerCase().trim();
  for (const [key, colors] of Object.entries(callTypeColors)) {
    if (normalized.includes(key)) {
      return colors;
    }
  }
  return { bg: "bg-slate-100", text: "text-slate-700", border: "border-slate-300" };
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
