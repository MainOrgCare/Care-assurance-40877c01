import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ComplieeIdleButton({
  onClick,
  className = "",
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative isolate flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all duration-200 overflow-hidden",
        "bg-primary text-primary-foreground text-sm font-semibold shadow-[0_12px_24px_-14px_rgba(5,150,105,0.7)]",
        "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-white/70",
        "after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:opacity-0 after:transition-opacity after:duration-200 after:bg-white/10",
        "hover:from-emerald-600 hover:to-teal-600 hover:shadow-[0_18px_30px_-16px_rgba(5,150,105,0.78)] hover:after:opacity-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className
      )}
      aria-label="Get help"
    >
      <HelpCircle className="h-4 w-4 relative z-10" />
      <span className="relative z-10">Ask Compli-ee</span>
      <span className="relative z-10 h-2 w-2 rounded-full bg-white/75 group-hover:bg-white" />
    </button>
  );
}
