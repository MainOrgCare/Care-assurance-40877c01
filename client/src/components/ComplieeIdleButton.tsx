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
        "group relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all duration-200",
        "bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-semibold shadow-sm shadow-emerald-500/30",
        "hover:from-emerald-600 hover:to-teal-600 hover:shadow-md hover:shadow-emerald-500/40",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className
      )}
      aria-label="Get help"
    >
      <HelpCircle className="h-4 w-4" />
      <span>Ask Compli-ee</span>
      <span className="h-2 w-2 rounded-full bg-white/75 group-hover:bg-white" />
    </button>
  );
}
