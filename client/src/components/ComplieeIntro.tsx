import { useState, useEffect, useCallback } from "react";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ComplieeIntroProps {
  onComplete: () => void;
  onAskHelp: () => void;
}

// Animated Compli-ee SVG component with blinking and expressions
function AnimatedCompliee({ 
  isWaving = false,
  isBlinking = false,
  className = ""
}: { 
  isWaving?: boolean;
  isBlinking?: boolean;
  className?: string;
}) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      viewBox="0 0 64 80" 
      className={className}
    >
      {/* Hair base */}
      <rect x="10" y="8" width="44" height="20" rx="10" fill="#FBBF24"/>
      
      {/* Face */}
      <rect x="8" y="16" width="48" height="36" rx="12" fill="#FED7AA"/>
      
      {/* Hair bangs */}
      <rect x="12" y="6" width="16" height="14" rx="6" fill="#FBBF24"/>
      <rect x="24" y="4" width="16" height="16" rx="6" fill="#FBBF24"/>
      <rect x="36" y="6" width="16" height="14" rx="6" fill="#FBBF24"/>
      
      {/* Eyes - with blink state */}
      {isBlinking ? (
        <>
          {/* Closed eyes (horizontal lines) */}
          <rect x="14" y="33" rx="2" width="14" height="3" fill="#1E40AF"/>
          <rect x="36" y="33" rx="2" width="14" height="3" fill="#1E40AF"/>
        </>
      ) : (
        <>
          {/* Open eyes */}
          <circle cx="21" cy="34" r="10" fill="white"/>
          <circle cx="43" cy="34" r="10" fill="white"/>
          <circle cx="24" cy="35" r="6" fill="#1E40AF"/>
          <circle cx="46" cy="35" r="6" fill="#1E40AF"/>
          <circle cx="27" cy="32" r="3" fill="white"/>
          <circle cx="49" cy="32" r="3" fill="white"/>
        </>
      )}
      
      {/* Smile */}
      <path d="M24 46 Q32 52 40 46" stroke="#78350F" strokeWidth="2" fill="none" strokeLinecap="round"/>
      
      {/* Blush */}
      <rect x="6" y="36" width="6" height="4" rx="2" fill="#FECACA" opacity="0.6"/>
      <rect x="52" y="36" width="6" height="4" rx="2" fill="#FECACA" opacity="0.6"/>
      
      {/* Body */}
      <rect x="14" y="50" width="36" height="26" rx="4" fill="#4F46E5"/>
      
      {/* V detail */}
      <path d="M22 50 L32 60 L42 50" fill="#3730A3"/>
      <line x1="22" y1="50" x2="32" y2="60" stroke="white" strokeWidth="2.5"/>
      <line x1="42" y1="50" x2="32" y2="60" stroke="white" strokeWidth="1.5"/>
      
      {/* Left hand with clipboard */}
      <rect x="4" y="56" width="10" height="10" rx="4" fill="#FED7AA"/>
      <rect x="0" y="52" width="8" height="10" rx="1" fill="#A5B4FC"/>
      <rect x="2" y="50" width="4" height="3" rx="1" fill="#F59E0B"/>
      
      {/* Right hand - waving or normal */}
      {isWaving ? (
        <g className="origin-[55px_59px] animate-wave">
          <rect x="50" y="48" width="10" height="10" rx="4" fill="#FED7AA"/>
          {/* Fingers up for wave */}
          <rect x="52" y="42" width="3" height="8" rx="1.5" fill="#FED7AA"/>
          <rect x="56" y="44" width="3" height="6" rx="1.5" fill="#FED7AA"/>
        </g>
      ) : (
        <rect x="50" y="54" width="10" height="10" rx="4" fill="#FED7AA"/>
      )}
      
      {/* Feet */}
      <rect x="20" y="74" width="10" height="5" rx="2" fill="#374151"/>
      <rect x="34" y="74" width="10" height="5" rx="2" fill="#374151"/>
    </svg>
  );
}

export default function ComplieeIntro({ onComplete, onAskHelp }: ComplieeIntroProps) {
  const [phase, setPhase] = useState<
    "hidden" | "peek1" | "hide1" | "peek2" | "wave" | "slideIn" | "askHelp" | "idle" | "complete"
  >("hidden");
  const [isBlinking, setIsBlinking] = useState(false);
  const [showBubble, setShowBubble] = useState(false);

  // Check if intro was already shown
  useEffect(() => {
    const hasSeenIntro = localStorage.getItem("compliee_intro_seen");
    if (hasSeenIntro) {
      setPhase("complete");
      onComplete();
    } else {
      // Start intro sequence after short delay
      const timer = setTimeout(() => setPhase("peek1"), 800);
      return () => clearTimeout(timer);
    }
  }, [onComplete]);

  // Intro sequence timing
  useEffect(() => {
    let timer: NodeJS.Timeout;

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
    if (phase !== "askHelp" && phase !== "idle") return;

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
  }, [phase]);

  const handleYes = useCallback(() => {
    localStorage.setItem("compliee_intro_seen", "true");
    setPhase("complete");
    onAskHelp();
  }, [onAskHelp]);

  const handleNo = useCallback(() => {
    localStorage.setItem("compliee_intro_seen", "true");
    setPhase("complete");
    onComplete();
  }, [onComplete]);

  if (phase === "complete" || phase === "hidden") return null;

  return (
    <>
      {/* Styles for animations */}
      <style>{`
        @keyframes peekIn {
          0% { transform: translateX(100%); }
          100% { transform: translateX(30%); }
        }
        @keyframes peekOut {
          0% { transform: translateX(30%); }
          100% { transform: translateX(100%); }
        }
        @keyframes slideInFull {
          0% { transform: translateX(30%); }
          100% { transform: translateX(0); }
        }
        @keyframes wave {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-20deg); }
          75% { transform: rotate(20deg); }
        }
        @keyframes bob {
          0%, 100% { transform: translateY(0) translateX(0); }
          25% { transform: translateY(-3px) translateX(3px); }
          50% { transform: translateY(0) translateX(0); }
          75% { transform: translateY(-3px) translateX(-3px); }
        }
        @keyframes bubblePop {
          0% { transform: scale(0); opacity: 0; }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-wave {
          animation: wave 0.4s ease-in-out infinite;
        }
        .animate-bob {
          animation: bob 2s ease-in-out infinite;
        }
        .animate-bubble-pop {
          animation: bubblePop 0.3s ease-out forwards;
        }
      `}</style>

      <div className="fixed bottom-6 right-0 z-50 flex items-end gap-3">
        {/* Speech bubble */}
        {showBubble && (
          <div 
            className={cn(
              "bg-white rounded-2xl shadow-xl border border-gray-200 p-4 max-w-[260px]",
              "animate-bubble-pop origin-bottom-right"
            )}
          >
            <p className="text-sm text-gray-700 mb-3 font-medium">
              👋 Hi there! I'm <span className="text-indigo-600 font-bold">Compli-ee</span>!
              <br />
              <span className="text-gray-600">Would you like a quick tour of the platform?</span>
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleYes}
                className="flex-1 px-3 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Yes please! 🎉
              </button>
              <button
                onClick={handleNo}
                className="flex-1 px-3 py-2 bg-gray-100 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-200 transition-colors"
              >
                Maybe later
              </button>
            </div>
            {/* Speech bubble tail */}
            <div className="absolute -right-2 bottom-6 w-4 h-4 bg-white border-r border-b border-gray-200 transform rotate-[-45deg]" />
          </div>
        )}

        {/* Compli-ee character */}
        <div
          className={cn(
            "w-20 h-24 transition-transform duration-300",
            phase === "peek1" && "animate-[peekIn_0.4s_ease-out_forwards]",
            phase === "hide1" && "animate-[peekOut_0.3s_ease-in_forwards]",
            phase === "peek2" && "animate-[peekIn_0.3s_ease-out_forwards]",
            phase === "wave" && "translate-x-[30%]",
            phase === "slideIn" && "animate-[slideInFull_0.4s_ease-out_forwards]",
            (phase === "askHelp" || phase === "idle") && "translate-x-0 animate-bob"
          )}
        >
          <AnimatedCompliee 
            isWaving={phase === "wave" || phase === "slideIn"}
            isBlinking={isBlinking}
            className="w-full h-full drop-shadow-lg"
          />
        </div>
      </div>
    </>
  );
}

// Export a smaller idle version for the header button
export function ComplieeIdleButton({ 
  onClick,
  className = ""
}: { 
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors",
        "bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium",
        className
      )}
      aria-label="Get help"
    >
      <HelpCircle className="h-4 w-4" />
      <span>Help</span>
    </button>
  );
}
