import { useState, useEffect, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

interface ComplieeIntroProps {
  onComplete: () => void;
  onAskHelp: () => void;
}

const COMPLIEE_INTRO_SEEN_KEY = "compliee_intro_seen";
const COMPLIEE_INTRO_SNOOZE_KEY = "compliee_intro_snoozed_until";
const COMPLIEE_INTRO_SNOOZE_DAYS = 3;

/* ── Floating sparkle particle ───────────────────────────── */
function FloatingSparkle({
  delay,
  x,
  size,
  reduceMotion,
}: {
  delay: number;
  x: number;
  size: number;
  reduceMotion: boolean;
}) {
  if (reduceMotion) {
    return null;
  }

  return (
    <motion.div
      className="absolute rounded-full bg-primary/60 pointer-events-none"
      style={{ width: size, height: size, left: `${x}%`, bottom: 0 }}
      initial={{ y: 0, opacity: 0, scale: 0 }}
      animate={{
        y: [0, -60, -120],
        opacity: [0, 1, 0],
        scale: [0, 1, 0.5],
        x: [0, (x % 2 === 0 ? 1 : -1) * 12, 0],
      }}
      transition={{
        duration: 2.4,
        delay,
        repeat: Infinity,
        repeatDelay: 3,
        ease: "easeOut",
      }}
    />
  );
}

/* ── Animated Compli-ee SVG with expressions ─────────────── */
function AnimatedCompliee({
  isWaving = false,
  isBlinking = false,
  isExcited = false,
  reduceMotion = false,
  className = "",
}: {
  isWaving?: boolean;
  isBlinking?: boolean;
  isExcited?: boolean;
  reduceMotion?: boolean;
  className?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 80"
      className={cn("compliee-svg overflow-visible", className)}
    >
      <motion.g
        className="compliee-head origin-[32px_30px]"
        animate={
          reduceMotion
            ? { rotate: 0, scale: 1 }
            : isExcited
            ? { rotate: [-3, 4, -3], scale: [1, 1.04, 1] }
            : { rotate: [-2, 2.5, -2] }
        }
        transition={
          reduceMotion
            ? { duration: 0 }
            : { repeat: Infinity, duration: isExcited ? 1.5 : 4, ease: "easeInOut" }
        }
      >
        {/* Hair base */}
        <rect
          x="10"
          y="8"
          width="44"
          height="20"
          rx="10"
          fill="var(--compliee-primary, #6366f1)"
        />

        {/* Face */}
        <rect
          x="8"
          y="16"
          width="48"
          height="36"
          rx="12"
          fill="var(--compliee-skin, #ffedd5)"
        />

        {/* Hair bangs */}
        <rect
          x="12"
          y="6"
          width="16"
          height="14"
          rx="6"
          fill="var(--compliee-primary, #6366f1)"
        />
        <rect
          x="24"
          y="4"
          width="16"
          height="16"
          rx="6"
          fill="var(--compliee-primary, #6366f1)"
        />
        <rect
          x="36"
          y="6"
          width="16"
          height="14"
          rx="6"
          fill="var(--compliee-primary, #6366f1)"
        />

        {/* Eyes - with blink state */}
        <AnimatePresence mode="wait">
          {isBlinking ? (
            <motion.g
              key="blink"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.05 }}
            >
              {/* Closed eyes - happy squint */}
              <motion.rect
                x="14"
                y="33"
                rx="2"
                width="14"
                height="3"
                fill="var(--compliee-eyes, #1e1e1e)"
                initial={{ scaleX: 0.6 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.08 }}
              />
              <motion.rect
                x="36"
                y="33"
                rx="2"
                width="14"
                height="3"
                fill="var(--compliee-eyes, #1e1e1e)"
                initial={{ scaleX: 0.6 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.08 }}
              />
            </motion.g>
          ) : (
            <motion.g
              key="open"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.05 }}
            >
              {/* Open eyes */}
              <circle cx="21" cy="34" r="10" fill="white" />
              <circle cx="43" cy="34" r="10" fill="white" />
              <motion.circle
                cx="24"
                cy="35"
                r="6"
                fill="var(--compliee-eyes, #1e1e1e)"
                animate={reduceMotion ? undefined : { x: [0, 1, -1, 0], y: [0, -1, 1, 0] }}
                transition={
                  reduceMotion
                    ? undefined
                    : {
                        repeat: Infinity,
                        duration: 3.6,
                        ease: "easeInOut",
                      }
                }
              />
              <motion.circle
                cx="46"
                cy="35"
                r="6"
                fill="var(--compliee-eyes, #1e1e1e)"
                animate={reduceMotion ? undefined : { x: [0, 1, -1, 0], y: [0, -1, 1, 0] }}
                transition={
                  reduceMotion
                    ? undefined
                    : {
                        repeat: Infinity,
                        duration: 3.6,
                        ease: "easeInOut",
                      }
                }
              />
              {/* Eye Sparks - enhanced twinkle */}
              <motion.circle
                cx="27"
                cy="32"
                r="3"
                fill="white"
                animate={
                  reduceMotion
                    ? undefined
                    : {
                        scale: [0.7, 1.4, 0.7],
                        opacity: [0.3, 1, 0.3],
                      }
                }
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
                animate={
                  reduceMotion
                    ? undefined
                    : {
                        scale: [0.7, 1.4, 0.7],
                        opacity: [0.3, 1, 0.3],
                      }
                }
                transition={
                  reduceMotion
                    ? undefined
                    : {
                        repeat: Infinity,
                        duration: 2,
                        ease: "easeInOut",
                        delay: 0.4,
                      }
                }
              />
            </motion.g>
          )}
        </AnimatePresence>

        {/* Smile - wider when excited */}
        <motion.path
          d="M24 46 Q32 52 40 46"
          stroke="var(--compliee-accent, #ec4899)"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          animate={isExcited ? { d: "M22 44 Q32 56 42 44" } : {}}
          transition={{ duration: 0.3 }}
        />

        {/* Blush */}
        <motion.rect
          x="6"
          y="36"
          width="6"
          height="4"
          rx="2"
          fill="var(--compliee-blush, #f43f5e)"
          animate={isExcited ? { opacity: [0.6, 0.9, 0.6] } : { opacity: 0.6 }}
          transition={
            isExcited
              ? { repeat: Infinity, duration: 1.2, ease: "easeInOut" }
              : {}
          }
        />
        <motion.rect
          x="52"
          y="36"
          width="6"
          height="4"
          rx="2"
          fill="var(--compliee-blush, #f43f5e)"
          animate={isExcited ? { opacity: [0.6, 0.9, 0.6] } : { opacity: 0.6 }}
          transition={
            isExcited
              ? { repeat: Infinity, duration: 1.2, ease: "easeInOut", delay: 0.2 }
              : {}
          }
        />
      </motion.g>

      {/* Body */}
      <g className="compliee-body">
        <rect
          x="14"
          y="50"
          width="36"
          height="26"
          rx="4"
          fill="var(--compliee-outfit, #2dd4bf)"
        />

        {/* V detail */}
        <path d="M22 50 L32 60 L42 50" fill="var(--compliee-vest, #0f766e)" />
        <line
          x1="22"
          y1="50"
          x2="32"
          y2="60"
          stroke="white"
          strokeWidth="2.5"
        />
        <line
          x1="42"
          y1="50"
          x2="32"
          y2="60"
          stroke="white"
          strokeWidth="1.5"
        />

        {/* Left hand with clipboard */}
        <rect
          x="4"
          y="56"
          width="10"
          height="10"
          rx="4"
          fill="var(--compliee-skin, #ffedd5)"
        />
        <rect x="0" y="52" width="8" height="10" rx="1" fill="#A5B4FC" />
        <rect x="2" y="50" width="4" height="3" rx="1" fill="#F59E0B" />

        {/* Right hand - waving or normal */}
        {isWaving ? (
          <motion.g
            className="origin-[55px_59px]"
            animate={reduceMotion ? { rotate: 0 } : { rotate: [0, -20, 25, -15, 8, 0] }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : {
                    repeat: Infinity,
                    duration: 0.5,
                    ease: "easeInOut",
                  }
            }
          >
            <rect
              x="50"
              y="48"
              width="10"
              height="10"
              rx="4"
              fill="var(--compliee-skin, #ffedd5)"
            />
            {/* Fingers up for wave */}
            <rect
              x="52"
              y="42"
              width="3"
              height="8"
              rx="1.5"
              fill="var(--compliee-skin, #ffedd5)"
            />
            <rect
              x="56"
              y="44"
              width="3"
              height="6"
              rx="1.5"
              fill="var(--compliee-skin, #ffedd5)"
            />
          </motion.g>
        ) : (
          <motion.rect
            x="50"
            y="54"
            width="10"
            height="10"
            rx="4"
            fill="var(--compliee-skin, #ffedd5)"
            className="origin-[55px_60px]"
            animate={reduceMotion ? undefined : { rotate: [0, -6, 0] }}
            transition={
              reduceMotion
                ? undefined
                : {
                    repeat: Infinity,
                    duration: 2.8,
                    ease: "easeInOut",
                  }
            }
          />
        )}

        {/* Feet with subtle tap */}
        <motion.rect
          x="20"
          y="74"
          width="10"
          height="5"
          rx="2"
          fill="var(--compliee-feet, #1e293b)"
          animate={isExcited ? { y: [74, 73, 74] } : {}}
          transition={
            isExcited
              ? { repeat: Infinity, duration: 0.4, ease: "easeInOut" }
              : {}
          }
        />
        <motion.rect
          x="34"
          y="74"
          width="10"
          height="5"
          rx="2"
          fill="var(--compliee-feet, #1e293b)"
          animate={isExcited ? { y: [74, 73, 74] } : {}}
          transition={
            isExcited
              ? {
                  repeat: Infinity,
                  duration: 0.4,
                  ease: "easeInOut",
                  delay: 0.2,
                }
              : {}
          }
        />
      </g>

      {/* Sparkle star */}
      <motion.circle
        cx="8"
        cy="14"
        r="2.5"
        fill="#FDE68A"
        animate={
          reduceMotion
            ? undefined
            : {
                scale: [0.6, 1.4, 0.6],
                opacity: [0.2, 1, 0.2],
                rotate: [0, 180, 360],
              }
        }
        transition={reduceMotion ? undefined : { repeat: Infinity, duration: 2, ease: "easeInOut" }}
      />
      {/* Extra sparkle */}
      <motion.circle
        cx="56"
        cy="10"
        r="1.8"
        fill="#FDE68A"
        animate={
          reduceMotion
            ? undefined
            : {
                scale: [0.5, 1.3, 0.5],
                opacity: [0.1, 0.8, 0.1],
              }
        }
        transition={
          reduceMotion
            ? undefined
            : {
                repeat: Infinity,
                duration: 1.8,
                ease: "easeInOut",
                delay: 0.7,
              }
        }
      />
    </svg>
  );
}

export default function ComplieeIntro({
  onComplete,
  onAskHelp,
}: ComplieeIntroProps) {
  const [phase, setPhase] = useState<
    | "hidden"
    | "peek1"
    | "hide1"
    | "peek2"
    | "wave"
    | "slideIn"
    | "askHelp"
    | "idle"
    | "complete"
  >("hidden");
  const [isBlinking, setIsBlinking] = useState(false);
  const [showBubble, setShowBubble] = useState(false);
  const prefersReducedMotion = useReducedMotion() ?? false;

  // Check if intro was already shown
  useEffect(() => {
    const hasSeenIntro = localStorage.getItem(COMPLIEE_INTRO_SEEN_KEY);
    const snoozedUntilRaw = localStorage.getItem(COMPLIEE_INTRO_SNOOZE_KEY);
    const snoozedUntil = snoozedUntilRaw ? Number(snoozedUntilRaw) : 0;
    const isSnoozed = Number.isFinite(snoozedUntil) && snoozedUntil > Date.now();

    if (hasSeenIntro || isSnoozed) {
      setPhase("complete");
      onComplete();
    } else {
      // Start intro sequence after short delay
      const timer = setTimeout(() => {
        if (prefersReducedMotion) {
          setShowBubble(true);
          setPhase("askHelp");
          return;
        }
        setPhase("peek1");
      }, prefersReducedMotion ? 120 : 800);
      return () => clearTimeout(timer);
    }
  }, [onComplete, prefersReducedMotion]);

  // Intro sequence timing
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    switch (phase) {
      case "peek1":
        timer = setTimeout(() => setPhase("hide1"), 600);
        break;
      case "hide1":
        timer = setTimeout(() => setPhase("peek2"), 400);
        break;
      case "peek2":
        timer = setTimeout(() => setPhase("wave"), 500);
        break;
      case "wave":
        timer = setTimeout(() => setPhase("slideIn"), 800);
        break;
      case "slideIn":
        timer = setTimeout(() => {
          setShowBubble(true);
          setPhase("askHelp");
        }, 600);
        break;
      case "askHelp":
        // Stay here until user interacts
        break;
    }

    return () => clearTimeout(timer);
  }, [phase]);

  // Blinking animation (random intervals when in idle/askHelp state)
  useEffect(() => {
    if (
      prefersReducedMotion ||
      phase !== "askHelp" &&
      phase !== "idle" &&
      phase !== "wave" &&
      phase !== "slideIn"
    )
      return;

    const blink = () => {
      setIsBlinking(true);
      setTimeout(() => setIsBlinking(false), 150);
    };

    // Initial blink
    const initialBlink = setTimeout(blink, 1000);

    // Random blinking every 2-5 seconds
    const blinkInterval = setInterval(() => {
      if (Math.random() > 0.3) blink();
    }, 2500);

    return () => {
      clearTimeout(initialBlink);
      clearInterval(blinkInterval);
    };
  }, [phase, prefersReducedMotion]);

  const closeIntro = useCallback(
    (snooze: boolean) => {
      if (snooze) {
        const snoozeUntil = Date.now() + COMPLIEE_INTRO_SNOOZE_DAYS * 24 * 60 * 60 * 1000;
        localStorage.setItem(COMPLIEE_INTRO_SNOOZE_KEY, String(snoozeUntil));
      }

      setPhase("complete");
      setShowBubble(false);
      onComplete();
    },
    [onComplete],
  );

  const handleYes = useCallback(() => {
    localStorage.setItem(COMPLIEE_INTRO_SEEN_KEY, "true");
    localStorage.removeItem(COMPLIEE_INTRO_SNOOZE_KEY);
    setPhase("complete");
    setShowBubble(false);
    onAskHelp();
  }, [onAskHelp]);

  const handleNo = useCallback(() => {
    closeIntro(true);
  }, [closeIntro]);

  useEffect(() => {
    if (phase === "complete" || phase === "hidden") {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeIntro(true);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [closeIntro, phase]);

  // Must be declared before any early return to satisfy Rules of Hooks
  const complieeVariants = useMemo(
    () => ({
      hidden: { x: "100%", y: 0, scale: 0.9, opacity: 0 },
      peek1: { x: "40%", y: 0, scale: 1, opacity: 1 },
      hide1: { x: "100%", y: 0, scale: 0.95, opacity: 0.5 },
      peek2: { x: "40%", y: 0, scale: 1, opacity: 1 },
      wave: { x: "25%", y: 0, scale: 1, opacity: 1 },
      slideIn: { x: 0, y: 0, scale: 1, opacity: 1 },
      askHelp: prefersReducedMotion
        ? { x: 0, y: 0, scale: 1, opacity: 1 }
        : { x: 0, y: [0, -6, 2, 0], scale: 1, opacity: 1 },
    }),
    [prefersReducedMotion],
  );

  if (phase === "complete" || phase === "hidden") return null;

  return (
    <AnimatePresence>
      <div className="fixed bottom-4 sm:bottom-6 right-3 sm:right-6 z-50 flex items-end gap-3 sm:gap-4 pointer-events-none max-w-[calc(100vw-1.5rem)]">
        {/* Ambient glow under character */}
        <AnimatePresence>
          {(phase === "askHelp" || phase === "slideIn") && (
            <motion.div
              className="absolute -bottom-2 right-8 w-20 h-6 rounded-full pointer-events-none"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={
                prefersReducedMotion
                  ? { opacity: 0.2, scale: 1 }
                  : {
                      opacity: [0.15, 0.3, 0.15],
                      scale: [0.9, 1.1, 0.9],
                    }
              }
              exit={{ opacity: 0 }}
              transition={
                prefersReducedMotion
                  ? { duration: 0.2 }
                  : {
                      repeat: Infinity,
                      duration: 3,
                      ease: "easeInOut",
                    }
              }
              style={{
                background:
                  "radial-gradient(ellipse, var(--color-primary) 0%, transparent 70%)",
              }}
            />
          )}
        </AnimatePresence>

        {/* Speech bubble */}
        <AnimatePresence>
          {showBubble && (
            <motion.div
              initial={{
                scale: 0,
                opacity: 0,
                y: 20,
                transformOrigin: "bottom right",
              }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 10 }}
              transition={{
                type: "spring",
                stiffness: 280,
                damping: 18,
                mass: 0.8,
              }}
              className={cn(
                "relative bg-card rounded-2xl shadow-2xl border border-border p-5 w-[min(19rem,calc(100vw-5.5rem))] pointer-events-auto",
                "backdrop-blur-md bg-card/95",
              )}
              role="dialog"
              aria-label="Compli-ee introduction"
              aria-live="polite"
            >
              <button
                type="button"
                onClick={handleNo}
                className="absolute top-2 right-2 inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border/70 bg-background/80 text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
                aria-label="Dismiss Compli-ee intro"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <div className="flex items-center gap-2 mb-3">
                <motion.div
                  className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center"
                  animate={{ rotate: [0, 5, -5, 0] }}
                  transition={{
                    repeat: Infinity,
                    duration: 3,
                    ease: "easeInOut",
                  }}
                >
                  <motion.span
                    animate={{ rotate: [0, 15, -10, 0] }}
                    transition={{
                      repeat: Infinity,
                      duration: 1.5,
                      repeatDelay: 1,
                    }}
                    className="text-lg"
                  >
                    👋
                  </motion.span>
                </motion.div>
                <h3 className="font-semibold text-foreground text-sm flex-1">
                  Hi, I&apos;m{" "}
                  <span className="text-primary">Compli-ee</span>!
                </h3>
              </div>

              {/* Animated text reveal */}
              <motion.p
                className="text-sm text-muted-foreground mb-4 leading-relaxed"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.4 }}
              >
                I&apos;m your AI compliance assistant. Would you like a
                quick tour of the dashboard?
              </motion.p>

              <motion.div
                className="flex gap-2"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.4 }}
              >
                <motion.button
                  whileHover={{ scale: 1.06, y: -1 }}
                  whileTap={{ scale: 0.94 }}
                  onClick={handleYes}
                  className="flex-1 px-3 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-xl shadow-lg shadow-primary/20 hover:bg-primary/90 transition-colors"
                >
                  Yes please! ✨
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.06, y: -1 }}
                  whileTap={{ scale: 0.94 }}
                  onClick={handleNo}
                  className="flex-1 px-3 py-2 bg-muted text-foreground text-sm font-semibold rounded-xl hover:bg-muted/80 transition-colors"
                >
                  Not now
                </motion.button>
              </motion.div>

              <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed">
                You can reopen Compli-ee anytime from the header help button.
              </p>

              {/* Speech bubble tail */}
              <div className="absolute -right-2 bottom-6 w-4 h-4 bg-card border-r border-b border-border transform rotate-[-45deg] shadow-[2px_2px_4px_rgba(0,0,0,0.05)]" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Compli-ee character */}
        <motion.div
          variants={complieeVariants}
          initial="hidden"
          animate={phase}
          transition={
            phase === "askHelp"
              ? { repeat: Infinity, duration: 2.6, ease: "easeInOut" }
              : {
                  type: "spring",
                  stiffness: 200,
                  damping: 14,
                  mass: 0.9,
                }
          }
          className="relative w-24 h-28 pointer-events-auto drop-shadow-2xl"
          whileHover={prefersReducedMotion ? undefined : { scale: 1.08 }}
        >
          <AnimatedCompliee
            isWaving={phase === "wave" || phase === "slideIn"}
            isBlinking={prefersReducedMotion ? false : isBlinking}
            isExcited={phase === "askHelp"}
            reduceMotion={prefersReducedMotion}
            className="w-full h-full"
          />

          {/* Floating sparkle particles around character */}
          <FloatingSparkle delay={0} x={10} size={4} reduceMotion={prefersReducedMotion} />
          <FloatingSparkle delay={0.8} x={50} size={3} reduceMotion={prefersReducedMotion} />
          <FloatingSparkle delay={1.5} x={85} size={5} reduceMotion={prefersReducedMotion} />
          <FloatingSparkle delay={2.2} x={30} size={3} reduceMotion={prefersReducedMotion} />
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
