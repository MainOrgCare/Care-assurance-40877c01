import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

export default function ComplieeIdleButton({
  onClick,
  className = "",
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.97 }}
      className={cn(
        "group relative isolate flex items-center gap-2 px-3.5 py-2 rounded-xl transition-all duration-300 overflow-hidden",
        "bg-primary text-primary-foreground text-[13px] font-bold shadow-[0_4px_12px_rgba(0,0,0,0.1)] dark:shadow-[0_4px_12px_rgba(0,0,0,0.3)]",
        "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-white/20",
        "after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:opacity-0 after:transition-opacity after:duration-300 after:bg-white/10",
        "hover:shadow-[0_8px_20px_rgba(0,0,0,0.15)] hover:after:opacity-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className
      )}
      aria-label="Get help"
    >
      <HelpCircle className="h-4 w-4 relative z-10 opacity-90 group-hover:opacity-100 transition-opacity" />
      <span className="relative z-10 tracking-tight">Ask Compli-ee</span>
      <span className="relative z-10 ml-0.5 h-2 w-2 rounded-full bg-primary-foreground/60 group-hover:bg-primary-foreground transition-colors mix-blend-overlay" />
    </motion.button>
  );
}
