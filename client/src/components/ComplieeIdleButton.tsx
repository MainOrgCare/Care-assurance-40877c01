import { cn } from "@/lib/utils";
import { motion, useReducedMotion } from "framer-motion";

/* ── Sparkle particle component ─────────────────────────── */
function Sparkle({ delay, x, y, reduceMotion }: { delay: number; x: number; y: number; reduceMotion: boolean }) {
  if (reduceMotion) {
    return null;
  }

  return (
    <motion.div
      className="absolute w-1 h-1 rounded-full bg-primary-foreground/70 pointer-events-none"
      style={{ left: `${x}%`, top: `${y}%` }}
      initial={{ scale: 0, opacity: 0 }}
      animate={{
        scale: [0, 1.2, 0],
        opacity: [0, 0.9, 0],
      }}
      transition={{
        duration: 1.6,
        repeat: Infinity,
        repeatDelay: 2.4,
        delay,
        ease: "easeInOut",
      }}
    />
  );
}

/* ── Mini inline compli-ee face ─────────────────────────── */
function MiniCompliee({ className = "", reduceMotion = false }: { className?: string; reduceMotion?: boolean }) {
  return (
    <motion.svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 80"
      className={cn("overflow-visible", className)}
      initial="rest"
      whileHover="hover"
      animate={reduceMotion ? "rest" : "idle"}
    >
      <motion.g
        className="origin-[32px_30px]"
        variants={{
          rest: { rotate: 0 },
          idle: {
            rotate: [0, -2, 2, -1, 0],
            transition: { duration: 4, repeat: Infinity, ease: "easeInOut" },
          },
          hover: {
            rotate: [0, -12, 14, -8, 6, 0],
            scale: [1, 1.08, 1],
            transition: { duration: 0.7 },
          },
        }}
      >
        <rect x="10" y="8" width="44" height="20" rx="10" fill="currentColor" />
        <rect
          x="8"
          y="16"
          width="48"
          height="36"
          rx="12"
          fill="var(--compliee-skin, #ffedd5)"
        />

        {/* Bangs */}
        <rect x="12" y="6" width="16" height="14" rx="6" fill="currentColor" />
        <rect x="24" y="4" width="16" height="16" rx="6" fill="currentColor" />
        <rect x="36" y="6" width="16" height="14" rx="6" fill="currentColor" />

        {/* Eyes */}
        <circle cx="21" cy="34" r="10" fill="white" />
        <circle cx="43" cy="34" r="10" fill="white" />
        <motion.circle
          cx="24"
          cy="35"
          r="6"
          fill="#1e1e1e"
          variants={{
            rest: {},
            idle: {
              x: [0, 0.8, -0.8, 0],
              transition: { duration: 3, repeat: Infinity, ease: "easeInOut" },
            },
            hover: { y: -1, scale: 1.15, transition: { duration: 0.2 } },
          }}
        />
        <motion.circle
          cx="46"
          cy="35"
          r="6"
          fill="#1e1e1e"
          variants={{
            rest: {},
            idle: {
              x: [0, 0.8, -0.8, 0],
              transition: { duration: 3, repeat: Infinity, ease: "easeInOut" },
            },
            hover: { y: -1, scale: 1.15, transition: { duration: 0.2 } },
          }}
        />
        {/* Eye Sparks */}
        <motion.circle
          cx="27"
          cy="32"
          r="3"
          fill="white"
          animate={reduceMotion ? undefined : { scale: [0.8, 1.3, 0.8], opacity: [0.4, 1, 0.4] }}
          transition={
            reduceMotion
              ? undefined
              : {
                  repeat: Infinity,
                  duration: 2,
                  ease: "easeInOut",
                }
          }
        />
        <motion.circle
          cx="49"
          cy="32"
          r="3"
          fill="white"
          animate={reduceMotion ? undefined : { scale: [0.8, 1.3, 0.8], opacity: [0.4, 1, 0.4] }}
          transition={
            reduceMotion
              ? undefined
              : {
                  repeat: Infinity,
                  duration: 2,
                  ease: "easeInOut",
                  delay: 0.3,
                }
          }
        />

        {/* Smile */}
        <motion.path
          d="M24 46 Q32 52 40 46"
          stroke="#ec4899"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
          variants={{
            rest: {},
            hover: {
              d: "M22 44 Q32 56 42 44",
              transition: { duration: 0.3 },
            },
          }}
        />
        <rect
          x="6"
          y="36"
          width="6"
          height="4"
          rx="2"
          fill="#f43f5e"
          opacity="0.6"
        />
        <rect
          x="52"
          y="36"
          width="6"
          height="4"
          rx="2"
          fill="#f43f5e"
          opacity="0.6"
        />
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
  const prefersReducedMotion = useReducedMotion() ?? false;

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.07, y: -5 }}
      whileTap={{ scale: 0.92 }}
      initial={{ opacity: 0, y: 24, scale: 0.9 }}
      animate={
        prefersReducedMotion
          ? {
              opacity: 1,
              y: 0,
              scale: 1,
            }
          : {
              opacity: 1,
              y: [0, -4, 0],
              scale: 1,
            }
      }
      transition={
        prefersReducedMotion
          ? {
              opacity: { duration: 0.2 },
              y: { duration: 0.2 },
            }
          : {
              opacity: { duration: 0.4 },
              y: {
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut",
                delay: 0.5,
              },
              scale: { type: "spring", stiffness: 300, damping: 20 },
            }
      }
      className={cn(
        "group relative isolate flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all duration-200 overflow-hidden",
        "bg-gradient-to-r from-secondary to-secondary/80 text-secondary-foreground text-sm font-semibold shadow-[0_12px_24px_-14px_color-mix(in_oklab,var(--color-secondary)_50%,transparent)]",
        "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-white/70",
        "after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:opacity-0 after:transition-opacity after:duration-200 after:bg-white/10",
        "hover:from-secondary/90 hover:to-secondary/70 hover:shadow-[0_18px_30px_-16px_color-mix(in_oklab,var(--color-secondary)_55%,transparent)] hover:after:opacity-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className,
      )}
      aria-label="Open Compli-ee assistant"
    >
      <MiniCompliee
        className="h-6 w-5 relative z-10 transition-transform group-hover:scale-110 drop-shadow-md text-primary-foreground"
        reduceMotion={prefersReducedMotion}
      />
      <span className="relative z-10 tracking-tight ml-1">Ask Compli-ee</span>

      {/* Sparkle particles */}
      <Sparkle delay={0} x={12} y={18} reduceMotion={prefersReducedMotion} />
      <Sparkle delay={0.8} x={78} y={25} reduceMotion={prefersReducedMotion} />
      <Sparkle delay={1.6} x={45} y={10} reduceMotion={prefersReducedMotion} />

      {/* Animated glow ring */}
      <motion.div
        className="absolute inset-0 rounded-[inherit] -z-10"
        animate={
          prefersReducedMotion
            ? undefined
            : {
                boxShadow: [
                  "0 0 0 0px color-mix(in oklab, var(--color-secondary) 40%, transparent)",
                  "0 0 0 6px color-mix(in oklab, var(--color-secondary) 0%, transparent)",
                  "0 0 0 0px color-mix(in oklab, var(--color-secondary) 40%, transparent)",
                ],
              }
        }
        transition={prefersReducedMotion ? undefined : { repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
      />

      {/* Shimmer sweep on hover */}
      <motion.div
        className="absolute inset-0 -z-[5] opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{
          background:
            "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.15) 50%, transparent 60%)",
          backgroundSize: "200% 100%",
        }}
        animate={prefersReducedMotion ? undefined : { backgroundPosition: ["200% 0", "-200% 0"] }}
        transition={prefersReducedMotion ? undefined : { repeat: Infinity, duration: 2, ease: "linear" }}
      />
    </motion.button>
  );
}
