import React from "react";

export interface WorkerAvatarProps {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const avatarColors = [
  { bg: "bg-sky-500", text: "text-white" },
  { bg: "bg-emerald-500", text: "text-white" },
  { bg: "bg-violet-500", text: "text-white" },
  { bg: "bg-amber-500", text: "text-white" },
  { bg: "bg-rose-500", text: "text-white" },
  { bg: "bg-cyan-500", text: "text-white" },
  { bg: "bg-indigo-500", text: "text-white" },
  { bg: "bg-orange-500", text: "text-white" },
  { bg: "bg-teal-500", text: "text-white" },
  { bg: "bg-pink-500", text: "text-white" },
];

const getColorForName = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % avatarColors.length;
  return avatarColors[index];
};

const getInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

export const WorkerAvatar: React.FC<WorkerAvatarProps> = ({
  name,
  size = "md",
  className = "",
}) => {
  const colors = getColorForName(name);
  const initials = getInitials(name);

  const sizeClasses = {
    sm: "h-6 w-6 text-[10px]",
    md: "h-8 w-8 text-xs",
    lg: "h-10 w-10 text-sm",
  };

  return (
    <div
      className={`flex items-center justify-center rounded-full font-semibold ${sizeClasses[size]} ${colors.bg} ${colors.text} ${className}`}
      title={name}
    >
      {initials}
    </div>
  );
};

export interface WorkerBadgeProps {
  name: string;
  subtitle?: string;
  isSelected?: boolean;
  onClick?: () => void;
}

export const WorkerBadge: React.FC<WorkerBadgeProps> = ({
  name,
  subtitle,
  isSelected,
  onClick,
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full border px-2 py-1 text-left transition ${
        isSelected
          ? "border-primary/50 bg-primary/10"
          : "border-border/60 bg-background/60 hover:bg-muted/40"
      }`}
    >
      <WorkerAvatar name={name} size="sm" />
      <div className="pr-1">
        <p className="text-xs font-semibold leading-tight">{name}</p>
        {subtitle && <p className="text-[10px] text-muted-foreground leading-tight">{subtitle}</p>}
      </div>
    </button>
  );
};
