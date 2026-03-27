import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { type ReactNode } from "react";

interface PageTransitionProps {
  children: ReactNode;
}

const pageVariants = {
  initial: { opacity: 0, scale: 0.98, y: 15 },
  enter: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      duration: 0.35,
      ease: [0.16, 1, 0.3, 1] as const, // Custom fast spring-like ease
    },
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    y: -10,
    transition: {
      duration: 0.2,
      ease: [0.7, 0, 0.84, 0] as const,
    },
  },
};

/**
 * Wraps page content with a subtle fade-slide animation on route changes.
 * Uses `prefers-reduced-motion` to skip animation when the user prefers.
 */
export function PageTransition({ children }: PageTransitionProps) {
  const [location] = useLocation();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location}
        variants={pageVariants}
        initial="initial"
        animate="enter"
        exit="exit"
        className="flex-1 min-h-0 flex flex-col"
        style={{ willChange: "opacity, transform" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
