import { useState, useRef, useEffect, useCallback } from "react";
import { X, Send, Loader2, Bot, User, Minimize2, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

// Generate a unique ID for messages
const generateId = () => Math.random().toString(36).substring(2, 9);

// Animated Compli-ee SVG character
function AnimatedComplieeCharacter({ 
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
        <g style={{ transformOrigin: "55px 59px" }}>
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

// Compli-ee character component - a friendly clipboard mascot
export function ComplieeAvatar({ size = "md", animate = false }: { size?: "sm" | "md" | "lg"; animate?: boolean }) {
  const sizeClasses = {
    sm: "h-6 w-6",
    md: "h-8 w-8",
    lg: "h-12 w-12",
  };
  
  return (
    <div 
      className={cn(
        sizeClasses[size],
        "relative rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-md",
        animate && "animate-bounce"
      )}
      title="Compli-ee - Your Compliance Assistant"
    >
      {/* Clipboard body */}
      <div className="absolute inset-[15%] bg-white rounded-sm border-2 border-emerald-600/30">
        {/* Clipboard clip at top */}
        <div className="absolute -top-[4px] left-1/2 -translate-x-1/2 w-[40%] h-[6px] bg-amber-400 rounded-sm border border-amber-500" />
        {/* Checkmark lines */}
        <div className="absolute top-[35%] left-[20%] w-[60%] h-[2px] bg-emerald-500 rounded" />
        <div className="absolute top-[55%] left-[20%] w-[40%] h-[2px] bg-emerald-500 rounded" />
        <div className="absolute top-[75%] left-[20%] w-[50%] h-[2px] bg-emerald-400 rounded" />
      </div>
      {/* Happy face */}
      <div className="absolute bottom-[18%] left-1/2 -translate-x-1/2 flex gap-[3px]">
        <div className="h-[3px] w-[3px] bg-emerald-700 rounded-full" />
        <div className="h-[3px] w-[3px] bg-emerald-700 rounded-full" />
      </div>
      <div className="absolute bottom-[10%] left-1/2 -translate-x-1/2 w-[20%] h-[2px] bg-emerald-700 rounded-full" style={{ borderRadius: "0 0 50% 50%" }} />
    </div>
  );
}

// Trigger button to place in header
export function ChatTriggerButton({ onClick }: { onClick: () => void }) {
  const [isHovered, setIsHovered] = useState(false);
  
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        "relative flex items-center gap-2 px-2.5 py-1.5 rounded-xl transition-all duration-300",
        "bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200/60",
        "hover:from-emerald-100 hover:to-teal-100 hover:border-emerald-300 hover:shadow-md hover:shadow-emerald-100",
        "group"
      )}
      aria-label="Ask Compli-ee for help"
    >
      <ComplieeAvatar size="sm" animate={isHovered} />
      <div className="hidden sm:flex items-center gap-1.5">
        <span className="text-xs font-semibold text-emerald-700">Help</span>
        <HelpCircle className="h-3.5 w-3.5 text-emerald-500" />
      </div>
      {/* Pulse indicator */}
      <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-white animate-pulse" />
    </button>
  );
}

interface ChatAssistantProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ChatAssistant({ isOpen, onClose }: ChatAssistantProps) {
  const { user } = useAuth();
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  
  // Compli-ee animation states
  const [animationPhase, setAnimationPhase] = useState<"hidden" | "bounceIn" | "idle" | "bounceOut">("hidden");
  const [isBlinking, setIsBlinking] = useState(false);
  const [isWaving, setIsWaving] = useState(false);
  const [bobDirection, setBobDirection] = useState<"left" | "right">("left");

  // Handle open/close animations
  useEffect(() => {
    if (isOpen && animationPhase === "hidden") {
      // Bounce in sequence
      setAnimationPhase("bounceIn");
      setIsWaving(true);
      setTimeout(() => setIsWaving(false), 1200);
      setTimeout(() => setAnimationPhase("idle"), 600);
    } else if (!isOpen && animationPhase === "idle") {
      // Bounce out
      setIsWaving(true);
      setAnimationPhase("bounceOut");
      setTimeout(() => {
        setAnimationPhase("hidden");
        setIsWaving(false);
      }, 500);
    }
  }, [isOpen, animationPhase]);

  // Blinking animation - random intervals when idle
  useEffect(() => {
    if (animationPhase !== "idle") return;

    const blink = () => {
      setIsBlinking(true);
      setTimeout(() => setIsBlinking(false), 150);
    };

    // Blink every 2-4 seconds randomly
    const blinkInterval = setInterval(() => {
      if (Math.random() > 0.3) blink();
    }, 2500);

    return () => clearInterval(blinkInterval);
  }, [animationPhase]);

  // Side-to-side bobbing animation when idle
  useEffect(() => {
    if (animationPhase !== "idle") return;

    const bobInterval = setInterval(() => {
      setBobDirection(prev => prev === "left" ? "right" : "left");
    }, 1200);

    return () => clearInterval(bobInterval);
  }, [animationPhase]);

  // Auto-scroll to bottom of messages
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen && !isMinimized) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, isMinimized]);

  // Welcome message on first open
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const welcomeMessage: Message = {
        id: generateId(),
        role: "assistant",
        content: `Hello${user?.firstName ? ` ${user.firstName}` : ""}! I'm Compli-ee, your friendly compliance assistant!\n\nI'm here to help you get the most out of CareAssurance. I can:\n\n• Show you around the platform\n• Explain features like EMAR Auditing and Risk Assessments\n• Offer tips to make your work easier\n\nWhat would you like to know?`,
        timestamp: new Date(),
      };
      setMessages([welcomeMessage]);
    }
  }, [isOpen, messages.length, user?.firstName]);

  const sendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: Message = {
      id: generateId(),
      role: "user",
      content: inputValue.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    try {
      // Build conversation history for context
      const conversationHistory = [...messages, userMessage].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ messages: conversationHistory }),
      });

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      const data = await response.json();

      const assistantMessage: Message = {
        id: generateId(),
        role: "assistant",
        content: data.reply,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Chat error:", error);
      const errorMessage: Message = {
        id: generateId(),
        role: "assistant",
        content: "I apologise, but I'm having trouble connecting right now. Please try again in a moment.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleClose = () => {
    // Start bounce out animation
    setIsWaving(true);
    setAnimationPhase("bounceOut");
    setTimeout(() => {
      onClose();
      setAnimationPhase("hidden");
      setIsWaving(false);
    }, 500);
  };

  // Don't render if not logged in
  if (!user) return null;

  return (
    <>
      {/* Animation styles */}
      <style>{`
        @keyframes bounceInDown {
          0% { transform: translateY(-100%) scale(0.8); opacity: 0; }
          50% { transform: translateY(10%) scale(1.05); }
          70% { transform: translateY(-5%) scale(0.98); }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes bounceOutUp {
          0% { transform: translateY(0) scale(1); opacity: 1; }
          30% { transform: translateY(10%) scale(1.02); }
          100% { transform: translateY(-100%) scale(0.8); opacity: 0; }
        }
        @keyframes bob {
          0%, 100% { transform: translateX(0) translateY(0); }
          50% { transform: translateX(var(--bob-x, 3px)) translateY(-2px); }
        }
        @keyframes wave {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-15deg); }
          75% { transform: rotate(15deg); }
        }
        .compliee-bounce-in {
          animation: bounceInDown 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards;
        }
        .compliee-bounce-out {
          animation: bounceOutUp 0.5s cubic-bezier(0.55, 0.055, 0.675, 0.19) forwards;
        }
        .compliee-bob-left {
          --bob-x: -3px;
          animation: bob 1.2s ease-in-out infinite;
        }
        .compliee-bob-right {
          --bob-x: 3px;
          animation: bob 1.2s ease-in-out infinite;
        }
        .compliee-wave {
          animation: wave 0.4s ease-in-out 3;
        }
      `}</style>

      {/* Animated Compli-ee Character - peeking behind the chat window */}
      {animationPhase !== "hidden" && (
        <div
          className={cn(
            "fixed z-40 transition-all pointer-events-none",
            isMinimized ? "bottom-6 right-[280px]" : "bottom-[520px] sm:bottom-[580px] right-6",
            animationPhase === "bounceIn" && "compliee-bounce-in",
            animationPhase === "bounceOut" && "compliee-bounce-out",
            animationPhase === "idle" && bobDirection === "left" && "compliee-bob-left",
            animationPhase === "idle" && bobDirection === "right" && "compliee-bob-right"
          )}
        >
          <div className={cn(isWaving && "compliee-wave")} style={{ transformOrigin: "bottom center" }}>
            <AnimatedComplieeCharacter
              isBlinking={isBlinking}
              isWaving={isWaving}
              className="w-16 h-20 drop-shadow-xl"
            />
          </div>
        </div>
      )}

      {/* Chat Window */}
      <div
        className={cn(
          "fixed bottom-6 right-6 z-50 transition-all duration-300 bg-background border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col",
          isOpen ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none",
          isMinimized ? "w-72 h-14" : "w-[380px] h-[520px] sm:w-[420px] sm:h-[580px]"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white">
          <div className="flex items-center gap-3">
            <ComplieeAvatar size="md" />
            {!isMinimized && (
              <div>
                <h3 className="font-semibold text-sm">Compli-ee</h3>
                <p className="text-xs text-white/80">Your Compliance Assistant</p>
              </div>
            )}
            {isMinimized && (
              <span className="font-semibold text-sm">Compli-ee</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white hover:bg-white/20 rounded-lg"
              onClick={() => setIsMinimized(!isMinimized)}
            >
              <Minimize2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white hover:bg-white/20 rounded-lg"
              onClick={handleClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Messages Area */}
        {!isMinimized && (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted/30">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex gap-3",
                    message.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  {message.role === "assistant" && (
                    <div className="flex-shrink-0">
                      <ComplieeAvatar size="sm" />
                    </div>
                  )}
                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm",
                      message.role === "user"
                        ? "bg-emerald-500 text-white rounded-br-md"
                        : "bg-background border border-border shadow-sm rounded-bl-md"
                    )}
                  >
                    <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                  </div>
                  {message.role === "user" && (
                    <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                      <User className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                </div>
              ))}

              {/* Typing indicator */}
              {isLoading && (
                <div className="flex gap-3 justify-start">
                  <div className="flex-shrink-0">
                    <ComplieeAvatar size="sm" animate />
                  </div>
                  <div className="bg-background border border-border shadow-sm rounded-2xl rounded-bl-md px-4 py-3">
                    <div className="flex gap-1.5">
                      <span className="h-2 w-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="h-2 w-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="h-2 w-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-3 border-t border-border bg-background">
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask Compli-ee anything..."
                  rows={1}
                  className={cn(
                    "flex-1 resize-none bg-muted/50 border border-border rounded-xl px-4 py-2.5 text-sm",
                    "focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50",
                    "max-h-24 min-h-[42px] placeholder:text-muted-foreground"
                  )}
                  style={{
                    height: "auto",
                    minHeight: "42px",
                    maxHeight: "96px",
                    overflow: inputValue.split("\n").length > 3 ? "auto" : "hidden",
                  }}
                  disabled={isLoading}
                />
                <Button
                  onClick={sendMessage}
                  disabled={!inputValue.trim() || isLoading}
                  size="icon"
                  className="h-[42px] w-[42px] rounded-xl flex-shrink-0 bg-emerald-500 hover:bg-emerald-600"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-2 text-center">
                Press Enter to send • Shift+Enter for new line
              </p>
            </div>
          </>
        )}
      </div>
    </>
  );
}
