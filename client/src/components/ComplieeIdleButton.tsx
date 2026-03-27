import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

// Mini inline compli-ee face just for the button!
function MiniCompliee({ className = "" }: { className?: string; }) {
  return (
    <motion.svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 80"
      drag
      dragConstraints={{ left: -150, right: 150, top: -300, bottom: 50 }}
      dragElastic={0.4}
      dragTransition={{ bounceStiffness: 400, bounceDamping: 15 }}
      className={cn("overflow-visible", className)}
      initial="rest"
      whileHover="hover"
      animate="rest"
    >
      <motion.g 
        className="origin-[32px_30px]"
        variants={{
          rest: { rotate: 0 },
          hover: { rotate: [0, -10, 10, -5, 5, 0], transition: { duration: 0.8 } }
        }}
      >
        <rect x="10" y="8" width="44" height="20" rx="10" fill="currentColor"/>
        <rect x="8" y="16" width="48" height="36" rx="12" fill="var(--compliee-skin, #ffedd5)"/>
        
        {/* Bangs */}
        <rect x="12" y="6" width="16" height="14" rx="6" fill="currentColor"/>
        <rect x="24" y="4" width="16" height="16" rx="6" fill="currentColor"/>
        <rect x="36" y="6" width="16" height="14" rx="6" fill="currentColor"/>

        {/* Eyes */}
        <circle cx="21" cy="34" r="10" fill="white"/>
        <circle cx="43" cy="34" r="10" fill="white"/>
        <circle cx="24" cy="35" r="6" fill="#1e1e1e"/>
        <circle cx="46" cy="35" r="6" fill="#1e1e1e"/>
        <circle cx="27" cy="32" r="3" fill="white"/>
        <circle cx="49" cy="32" r="3" fill="white"/>

        {/* Smile */}
        <path d="M24 46 Q32 52 40 46" stroke="#ec4899" strokeWidth="3" fill="none" strokeLinecap="round"/>
        <rect x="6" y="36" width="6" height="4" rx="2" fill="#f43f5e" opacity="0.6"/>
        <rect x="52" y="36" width="6" height="4" rx="2" fill="#f43f5e" opacity="0.6"/>
      </motion.g>
    </motion.svg>
  );
}

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
      whileHover={{ scale: 1.05, y: -4 }}
      whileTap={{ scale: 0.95 }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className={cn(
        "group relative isolate flex items-center gap-2 px-4 py-2.5 rounded-full transition-all duration-300 overflow-visible",
        "bg-primary text-primary-foreground text-[14px] font-bold shadow-lg shadow-primary/25",
        "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-white/30",
        "after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:opacity-0 after:transition-opacity after:duration-300 after:bg-white/10",
        "hover:shadow-[0_12px_30px_rgba(0,0,0,0.2)] hover:after:opacity-100 ring-2 ring-transparent hover:ring-primary/30 ring-offset-2 ring-offset-background",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
        className
      )}
      aria-label="Get help"
    >
      <MiniCompliee className="h-6 w-5 relative z-10 transition-transform group-hover:scale-110 drop-shadow-md text-primary-foreground" />
      <span className="relative z-10 tracking-tight ml-1">Ask Compli-ee</span>
      
      {/* Pulse ring animation behind button */}
      <motion.div 
        className="absolute inset-0 rounded-full border-2 border-primary/40 -z-10"
        animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0, 0.5] }}
        transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
      />
    </motion.button>
  );
}
