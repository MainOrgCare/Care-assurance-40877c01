import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  X,
  Send,
  Loader2,
  User,
  Minimize2,
  HelpCircle,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Copy,
  Check,
  Download,
  ArrowUpRight,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { useLocation } from "wouter";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface ChatAssistantProps {
  isOpen: boolean;
  onClose: () => void;
}

interface AiStatusResponse {
  available?: boolean;
  message?: string;
  aiEnabled?: boolean;
  provider?: string;
  providerConfigured?: boolean;
}

interface ChatResponse {
  reply?: string;
  messageSent?: boolean;
  mode?: "full" | "fallback";
  fallbackReason?: string;
}

const generateId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const MAX_CONTEXT_MESSAGES = 16;
const MAX_PERSISTED_MESSAGES = 80;
const MAX_TEXTAREA_HEIGHT = 140;
const CHAT_STORAGE_PREFIX = "careassurance:chat-assistant";

const QUICK_PROMPTS = [
  "How do I run an EMAR audit from start to finish?",
  "Where can I create or improve a risk assessment?",
  "Help me draft a message for a care team update.",
  "Send me a reminder in my Messages inbox.",
] as const;

const WORKSPACE_SHORTCUTS = [
  { label: "EMAR Audit", path: "/care-workers/emar-audit" },
  { label: "Risk Assessment", path: "/service-users/risk-assessment" },
  { label: "Care Planning", path: "/service-users/care-planning" },
  { label: "Messages", path: "/messages" },
] as const;

const LOCAL_FALLBACK_GUIDANCE = [
  "EMAR audits: Care Workers -> EMAR Audit -> upload file -> run analysis.",
  "Risk assessments: Service Users -> Risk Assessment.",
  "Care planning: Service Users -> Care Planning.",
  "Reminders and notes: Messages.",
] as const;

const buildLocalFallbackReply = (prompt: string, isAdmin: boolean): string => {
  const normalized = prompt.toLowerCase();

  if (normalized.includes("emar")) {
    return "I could not reach the AI service just now, but you can still run an EMAR audit:\n1. Open Care Workers -> EMAR Audit.\n2. Upload the MAR file.\n3. Run analysis and review the discrepancy sections.";
  }

  if (normalized.includes("risk")) {
    return "AI is temporarily unavailable, but you can continue via Service Users -> Risk Assessment and complete the guided workflow.";
  }

  if (normalized.includes("care plan") || normalized.includes("care planning")) {
    return "AI is temporarily unavailable. Open Service Users -> Care Planning to draft or update plans using the structured workflow.";
  }

  if (normalized.includes("message") || normalized.includes("remind")) {
    return "I cannot send a reminder right now because the AI service is unavailable. You can still create it directly in Messages.";
  }

  const adminLine = isAdmin
    ? "\nAdmin tools are available in the Admin section if you need diagnostics."
    : "";

  return `I am in limited offline guidance mode right now. You can still proceed with these workflows:\n- ${LOCAL_FALLBACK_GUIDANCE.join("\n- ")}${adminLine}`;
};

const createWelcomeMessage = (firstName?: string): Message => ({
  id: generateId(),
  role: "assistant",
  content: `Hello${firstName ? ` ${firstName}` : ""}! I'm Compli-ee.

I can help with:
- EMAR and visit audit workflows
- Care planning and risk assessment guidance
- Writing clear internal or family communications
- Sending reminders to your Messages inbox

What would you like to do first?`,
  timestamp: new Date().toISOString(),
});

const toUiMessage = (value: unknown): Message | null => {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const role = candidate.role;
  const content = candidate.content;
  const timestamp = candidate.timestamp;

  if ((role !== "user" && role !== "assistant") || typeof content !== "string") {
    return null;
  }

  return {
    id: typeof candidate.id === "string" ? candidate.id : generateId(),
    role,
    content,
    timestamp:
      typeof timestamp === "string" && !Number.isNaN(Date.parse(timestamp))
        ? timestamp
        : new Date().toISOString(),
  };
};

const getStorageKey = (userId: string) => `${CHAT_STORAGE_PREFIX}:${userId}`;

export const ComplieeAvatar = React.memo(function ComplieeAvatar({
  size = "md",
  animate = false,
}: {
  size?: "sm" | "md" | "lg";
  animate?: boolean;
}) {
  const sizeClasses = {
    sm: "h-6 w-6",
    md: "h-8 w-8",
    lg: "h-12 w-12",
  };

  return (
    <motion.div
      className={cn(
        sizeClasses[size],
        "relative rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg border border-primary/20",
        animate && "compliee-glow"
      )}
      title="Compli-ee - Your Compliance Assistant"
      animate={animate ? { scale: [1, 1.05, 1] } : {}}
      transition={animate ? { repeat: Infinity, duration: 1.5, ease: "easeInOut" } : {}}
    >
      <motion.svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 64 80"
        className={cn("w-full h-full p-1 overflow-visible drop-shadow-sm")}
        initial="rest"
        whileHover="hover"
        animate={animate ? "thinking" : "rest"}
      >
        <motion.g 
          className="origin-[32px_30px]"
          variants={{
            rest: { rotate: 0 },
            thinking: { rotate: [-3, 3, -3], transition: { duration: 1.2, repeat: Infinity, ease: "easeInOut" } },
            hover: { rotate: [0, -10, 10, -5, 5, 0], transition: { duration: 0.8 } }
          }}
        >
          <rect x="10" y="8" width="44" height="20" rx="10" fill="white"/>
          <rect x="8" y="16" width="48" height="36" rx="12" fill="var(--compliee-skin, #ffedd5)"/>
          
          {/* Bangs */}
          <rect x="12" y="6" width="16" height="14" rx="6" fill="white"/>
          <rect x="24" y="4" width="16" height="16" rx="6" fill="white"/>
          <rect x="36" y="6" width="16" height="14" rx="6" fill="white"/>

          {/* Eyes */}
          <circle cx="21" cy="34" r="10" fill="white"/>
          <circle cx="43" cy="34" r="10" fill="white"/>
          <motion.circle
            cx="24" cy="35" r="6" fill="#1e1e1e"
            variants={{
              rest: {},
              thinking: { x: [0, 1.5, -1, 0], y: [-0.5, 0.5, -0.5], transition: { duration: 2, repeat: Infinity, ease: "easeInOut" } },
              hover: {},
            }}
          />
          <motion.circle
            cx="46" cy="35" r="6" fill="#1e1e1e"
            variants={{
              rest: {},
              thinking: { x: [0, 1.5, -1, 0], y: [-0.5, 0.5, -0.5], transition: { duration: 2, repeat: Infinity, ease: "easeInOut" } },
              hover: {},
            }}
          />
          <motion.circle cx="27" cy="32" r="3" fill="white"
            animate={{ scale: [0.8, 1.3, 0.8], opacity: [0.4, 1, 0.4] }}
            transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
          />
          <motion.circle cx="49" cy="32" r="3" fill="white"
            animate={{ scale: [0.8, 1.3, 0.8], opacity: [0.4, 1, 0.4] }}
            transition={{ repeat: Infinity, duration: 2, ease: "easeInOut", delay: 0.3 }}
          />

          {/* Smile */}
          <path d="M24 46 Q32 52 40 46" stroke="#ec4899" strokeWidth="3" fill="none" strokeLinecap="round"/>
          <rect x="6" y="36" width="6" height="4" rx="2" fill="#f43f5e" opacity="0.6"/>
          <rect x="52" y="36" width="6" height="4" rx="2" fill="#f43f5e" opacity="0.6"/>
        </motion.g>
      </motion.svg>
    </motion.div>
  );
});

export const ChatTriggerButton = React.memo(function ChatTriggerButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/90 text-secondary-foreground text-sm font-medium transition-colors"
      aria-label="Get help"
    >
      <HelpCircle className="h-4 w-4" />
      <span>Help</span>
    </button>
  );
});

export default function ChatAssistant({ isOpen, onClose }: ChatAssistantProps) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [assistantAvailable, setAssistantAvailable] = useState(true);
  const [limitedMode, setLimitedMode] = useState(false);
  const [availabilityLoading, setAvailabilityLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const hasUserPrompt = useMemo(
    () => messages.some((message) => message.role === "user"),
    [messages]
  );
  const canSendMessages = assistantAvailable || limitedMode;

  const formatTime = useCallback((timestamp: string) => {
    try {
      return new Date(timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  }, []);

  const refreshAssistantAvailability = useCallback(async () => {
    if (!user) return;

    setAvailabilityLoading(true);
    try {
      const response = await fetch("/api/ai/status", {
        credentials: "include",
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const fallback =
          response.status === 401
            ? "Your session has expired. Please sign in again."
            : "AI is temporarily unavailable. Compli-ee will run in limited guidance mode.";
        setAssistantAvailable(false);
        setLimitedMode(response.status !== 401);
        setStatusMessage(payload?.message || fallback);
        return;
      }

      const data = (await response.json()) as AiStatusResponse;
      const fullModeAvailable = Boolean(data.available);
      setAssistantAvailable(fullModeAvailable);
      setLimitedMode(!fullModeAvailable);
      setStatusMessage(
        fullModeAvailable
          ? data.message || null
          : data.message || "AI is temporarily unavailable. You can still get workflow guidance and navigation help."
      );
    } catch {
      setAssistantAvailable(false);
      setLimitedMode(true);
      setStatusMessage("Unable to verify AI status. Limited guidance mode is available.");
    } finally {
      setAvailabilityLoading(false);
    }
  }, [user]);

  const resetConversation = useCallback(() => {
    setMessages([createWelcomeMessage(user?.firstName)]);
    setInputValue("");
    setStatusMessage(null);
  }, [user?.firstName]);

  const copyMessage = useCallback(async (message: Message) => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedMessageId(message.id);
      window.setTimeout(() => {
        setCopiedMessageId((current) => (current === message.id ? null : current));
      }, 1200);
    } catch {
      setCopiedMessageId(null);
    }
  }, []);

  const downloadTranscript = useCallback(() => {
    if (messages.length === 0) return;
    const lines = messages.map((message) => {
      const name = message.role === "assistant" ? "Compli-ee" : "You";
      return `[${new Date(message.timestamp).toLocaleString()}] ${name}\n${message.content}\n`;
    });
    const content = lines.join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `compli-ee-chat-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, [messages]);

  const openWorkspace = useCallback(
    (path: string) => {
      setLocation(path);
      onClose();
    },
    [onClose, setLocation]
  );

  const sendMessage = useCallback(
    async (presetPrompt?: string) => {
      if (!user || isLoading || availabilityLoading) return;

      const prompt = (presetPrompt ?? inputValue).trim();
      if (!prompt) return;

      if (!canSendMessages) {
        setStatusMessage(
          (current) =>
            current ||
            "Compli-ee is unavailable right now. Refresh assistant status and try again."
        );
        return;
      }

      const userMessage: Message = {
        id: generateId(),
        role: "user",
        content: prompt,
        timestamp: new Date().toISOString(),
      };

      const nextMessages = [...messages, userMessage];
      setMessages(nextMessages);
      setInputValue("");
      setStatusMessage(null);
      setIsLoading(true);

      try {
        const response = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            messages: nextMessages
              .slice(-MAX_CONTEXT_MESSAGES)
              .map((message) => ({ role: message.role, content: message.content })),
          }),
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          let message = payload?.message || `Request failed (${response.status})`;

          if (response.status === 401) {
            message = "Your session has expired. Please sign in again.";
          }
          if (response.status === 503) {
            setAssistantAvailable(false);
          }

          throw new Error(message);
        }

        const data = (await response.json()) as ChatResponse;
        if (data?.mode === "fallback") {
          setAssistantAvailable(false);
          setLimitedMode(true);
          if (data.fallbackReason) {
            setStatusMessage(data.fallbackReason);
          }
        } else {
          setAssistantAvailable(true);
          setLimitedMode(false);
        }

        const assistantMessage: Message = {
          id: generateId(),
          role: "assistant",
          content:
            typeof data?.reply === "string" && data.reply.trim()
              ? data.reply.trim()
              : "I couldn't generate a response just now. Please try again.",
          timestamp: new Date().toISOString(),
        };

        setMessages((current) => [...current, assistantMessage]);

        if (data?.messageSent) {
          setStatusMessage("Done. I sent that to your Messages inbox.");
        }
      } catch (error) {
        const message =
          error instanceof Error && error.message
            ? error.message
            : "I’m having trouble connecting right now. Please try again.";
        if (/session has expired/i.test(message)) {
          setLimitedMode(false);
        } else {
          setLimitedMode(true);
        }
        setAssistantAvailable(false);
        setStatusMessage(message);

        const fallbackMessage: Message = {
          id: generateId(),
          role: "assistant",
          content: buildLocalFallbackReply(prompt, user?.role === "admin"),
          timestamp: new Date().toISOString(),
        };
        setMessages((current) => [...current, fallbackMessage]);
      } finally {
        setIsLoading(false);
      }
    },
    [availabilityLoading, canSendMessages, inputValue, isLoading, messages, user]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        void sendMessage();
      }
    },
    [sendMessage]
  );

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInputValue(event.target.value);
      event.target.style.height = "auto";
      event.target.style.height = `${Math.min(
        event.target.scrollHeight,
        MAX_TEXTAREA_HEIGHT
      )}px`;
    },
    []
  );

  useEffect(() => {
    if (!user?.id) {
      setHydrated(false);
      setMessages([]);
      return;
    }

    try {
      const raw = localStorage.getItem(getStorageKey(user.id));
      if (!raw) {
        setMessages([]);
        setIsMinimized(false);
        setHydrated(true);
        return;
      }

      const parsed = JSON.parse(raw) as {
        messages?: unknown[];
        minimized?: unknown;
      };

      const persistedMessages = Array.isArray(parsed.messages)
        ? parsed.messages
            .map((entry) => toUiMessage(entry))
            .filter((entry): entry is Message => Boolean(entry))
            .slice(-MAX_PERSISTED_MESSAGES)
        : [];

      setMessages(persistedMessages);
      setIsMinimized(Boolean(parsed.minimized));
    } catch {
      setMessages([]);
      setIsMinimized(false);
    } finally {
      setHydrated(true);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!hydrated || !user?.id) return;

    const payload = JSON.stringify({
      messages: messages.slice(-MAX_PERSISTED_MESSAGES),
      minimized: isMinimized,
    });

    localStorage.setItem(getStorageKey(user.id), payload);
  }, [hydrated, isMinimized, messages, user?.id]);

  useEffect(() => {
    if (!isOpen || !hydrated) return;
    if (messages.length > 0) return;
    setMessages([createWelcomeMessage(user?.firstName)]);
  }, [hydrated, isOpen, messages.length, user?.firstName]);

  useEffect(() => {
    if (!isOpen || isMinimized) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [isOpen, isMinimized, messages, isLoading]);

  useEffect(() => {
    if (!isOpen || isMinimized) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [isOpen, isMinimized]);

  useEffect(() => {
    if (!isOpen) return;
    void refreshAssistantAvailability();
  }, [isOpen, refreshAssistantAvailability]);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!user) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: "100%", opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: "100%", opacity: 0 }}
          transition={{ type: "spring", damping: 28, stiffness: 280, mass: 0.9 }}
          className={cn(
            "fixed z-50 bg-background border-l border-border shadow-[var(--shadow-strong)] overflow-hidden flex flex-col",
            /* framer-motion handles entrance/exit */
            isMinimized
              ? "bottom-4 right-4 w-[300px] h-14 rounded-xl"
              : "top-0 right-0 w-full sm:w-[430px] h-full"
          )}
        >
      {/* ── Header with animated gradient ────────────────────── */}
      <motion.div
        className="relative flex items-center justify-between px-3.5 py-3 bg-primary text-primary-foreground overflow-hidden"
        initial={false}
        animate={isMinimized ? { borderRadius: "0.75rem" } : { borderRadius: "0" }}
        transition={{ duration: 0.3 }}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/70" />
        {/* Animated shimmer overlay on header */}
        <motion.div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            background: "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.4) 50%, transparent 60%)",
            backgroundSize: "250% 100%",
          }}
          animate={{ backgroundPosition: ["250% 0", "-250% 0"] }}
          transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
        />
        <div className="flex items-center gap-2.5 min-w-0">
          <ComplieeAvatar size="md" animate={isLoading} />
          <div className="min-w-0">
            <h3 className="font-semibold text-sm leading-tight">Compli-ee</h3>
            <div className="flex items-center gap-1.5">
              {/* Animated status dot */}
              <motion.div
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  availabilityLoading
                    ? "bg-white/50"
                    : assistantAvailable
                      ? "bg-emerald-300"
                      : limitedMode
                        ? "bg-amber-300"
                        : "bg-red-300"
                )}
                animate={
                  availabilityLoading
                    ? { scale: [1, 1.4, 1], opacity: [0.5, 1, 0.5] }
                    : assistantAvailable
                      ? { scale: [1, 1.2, 1] }
                      : {}
                }
                transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
              />
              <p className="text-[11px] text-white/85 truncate">
                {availabilityLoading
                  ? "Checking availability..."
                  : assistantAvailable
                    ? "Ready to help"
                    : limitedMode
                      ? "Limited guidance mode"
                      : "Currently unavailable"}
              </p>
            </div>
          </div>
        </div>
          <div className="flex items-center gap-1">
          {!isMinimized && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white hover:bg-white/20 rounded-lg"
              onClick={downloadTranscript}
              title="Download transcript"
              aria-label="Download transcript"
              disabled={messages.length === 0}
            >
              <Download className="h-4 w-4" />
            </Button>
          )}
          {!isMinimized && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white hover:bg-white/20 rounded-lg"
              onClick={resetConversation}
              title="Start new chat"
              aria-label="Start new chat"
              disabled={isLoading}
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white hover:bg-white/20 rounded-lg"
            onClick={() => setIsMinimized((current) => !current)}
            title={isMinimized ? "Expand" : "Minimize"}
            aria-label={isMinimized ? "Expand chat" : "Minimize chat"}
          >
            <Minimize2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white hover:bg-white/20 rounded-lg"
            onClick={onClose}
            title="Close"
            aria-label="Close chat assistant"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </motion.div>

      {!isMinimized && (
        <>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gradient-to-b from-muted/45 via-muted/20 to-background/35">
            {statusMessage && (
              <motion.div
                initial={{ opacity: 0, y: -8, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={{ opacity: 0, y: -8, height: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                className={cn(
                  "rounded-xl border px-3 py-2.5 text-xs flex items-start justify-between gap-2",
                  assistantAvailable
                    ? "border-success/25 bg-success/[0.06] text-success-foreground"
                    : limitedMode
                      ? "border-warning/25 bg-warning/[0.06] text-foreground"
                      : "border-destructive/30 bg-destructive/10 text-destructive"
                )}
              >
                <div className="flex items-start gap-2">
                  <Sparkles className="h-3.5 w-3.5 mt-0.5" />
                  <span>{statusMessage}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5"
                  onClick={refreshAssistantAvailability}
                  disabled={availabilityLoading}
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", availabilityLoading && "animate-spin")} />
                </Button>
              </motion.div>
            )}

            {!hasUserPrompt && canSendMessages && !availabilityLoading && (
              <motion.div
                className="rounded-xl border border-border/70 bg-background/80 p-3"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.2 }}
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-2">
                  {assistantAvailable ? "Try one of these" : "Limited mode prompts"}
                </p>
                <div className="flex flex-wrap gap-2">
                  {QUICK_PROMPTS.map((prompt, index) => (
                    <motion.button
                      key={prompt}
                      type="button"
                      onClick={() => void sendMessage(prompt)}
                      initial={{ opacity: 0, scale: 0.9, y: 6 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      transition={{
                        delay: 0.3 + index * 0.08,
                        type: "spring",
                        stiffness: 300,
                        damping: 20,
                      }}
                      whileHover={{ scale: 1.04, y: -1 }}
                      whileTap={{ scale: 0.96 }}
                      className="rounded-full border border-border bg-muted/50 hover:bg-muted text-xs px-3 py-1.5 text-foreground transition-colors"
                      disabled={isLoading}
                    >
                      {prompt}
                    </motion.button>
                  ))}
                </div>
                <div className="mt-3 border-t border-border/60 pt-3">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Open workspace
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {WORKSPACE_SHORTCUTS.map((shortcut, index) => (
                      <motion.button
                        key={shortcut.path}
                        type="button"
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{
                          delay: 0.5 + index * 0.06,
                          type: "spring",
                          stiffness: 300,
                          damping: 22,
                        }}
                        whileHover={{ scale: 1.04, y: -1 }}
                        whileTap={{ scale: 0.96 }}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/50 transition-colors"
                        onClick={() => openWorkspace(shortcut.path)}
                      >
                        {shortcut.label}
                        <ArrowUpRight className="h-3 w-3" />
                      </motion.button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            <AnimatePresence initial={false}>
            {messages.map((message, index) => (
              <motion.div
                layout
                initial={{ opacity: 0, y: 14, scale: 0.92 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{
                  type: "spring",
                  stiffness: 320,
                  damping: 24,
                  delay: index === messages.length - 1 ? 0.05 : 0,
                }}
                key={message.id}
                className={cn(
                  "group/msg flex gap-2.5",
                  message.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {message.role === "assistant" && (
                  <motion.div
                    className="flex-shrink-0 mt-0.5"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 20, delay: 0.1 }}
                  >
                    <ComplieeAvatar size="sm" />
                  </motion.div>
                )}

                <motion.div
                  whileHover={{ y: -1 }}
                  transition={{ duration: 0.15 }}
                  className={cn(
                    "max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm shadow-[var(--shadow-xs)] transition-shadow duration-200",
                    message.role === "user"
                      ? "bg-secondary text-secondary-foreground rounded-br-md border border-secondary/40 shadow-secondary/20 hover:shadow-[0_8px_20px_-10px_color-mix(in_oklab,var(--color-secondary)_30%,transparent)]"
                      : "bg-background/95 border border-border/70 rounded-bl-md shadow-[0_8px_20px_-14px_rgba(15,23,42,0.35)] hover:shadow-[0_12px_28px_-14px_rgba(15,23,42,0.45)]"
                  )}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span
                      className={cn(
                        "text-[10px] font-semibold uppercase tracking-[0.08em]",
                        message.role === "user" ? "text-white/80" : "text-muted-foreground"
                      )}
                    >
                      {message.role === "user" ? "You" : "Compli-ee"}
                    </span>
                    <span
                      className={cn(
                        "text-[10px]",
                        message.role === "user" ? "text-white/70" : "text-muted-foreground"
                      )}
                    >
                      {formatTime(message.timestamp)}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>

                  {message.role === "assistant" && (
                    <div className="mt-2 flex justify-end opacity-0 group-hover/msg:opacity-100 transition-opacity duration-200">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[11px]"
                        onClick={() => void copyMessage(message)}
                      >
                        {copiedMessageId === message.id ? (
                          <>
                            <motion.span
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ type: "spring", stiffness: 400, damping: 15 }}
                            >
                              <Check className="h-3 w-3 mr-1" />
                            </motion.span>
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3 mr-1" />
                            Copy
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </motion.div>

                {message.role === "user" && (
                  <div className="h-7 w-7 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                )}
              </motion.div>
            ))}
            </AnimatePresence>

                        {isLoading && (
              <motion.div 
                initial={{ opacity: 0, y: 14, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ type: "spring", stiffness: 300, damping: 22 }}
                className="flex gap-2.5 justify-start"
              >
                <motion.div
                  className="flex-shrink-0 mt-0.5"
                  animate={{ scale: [1, 1.08, 1] }}
                  transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                >
                  <ComplieeAvatar size="sm" animate />
                </motion.div>
                <div className="bg-background border border-border/70 shadow-[var(--shadow-xs)] rounded-2xl rounded-bl-md px-4 py-3 flex items-center h-[38px]">
                  <div className="flex gap-1.5 items-center justify-center">
                    <motion.div
                      className="h-2 w-2 bg-primary/70 rounded-full"
                      animate={{ y: [0, -5, 0], scale: [1, 1.2, 1], opacity: [0.4, 1, 0.4] }}
                      transition={{ duration: 0.7, repeat: Infinity, ease: "easeInOut", delay: 0 }}
                    />
                    <motion.div
                      className="h-2 w-2 bg-primary/70 rounded-full"
                      animate={{ y: [0, -5, 0], scale: [1, 1.2, 1], opacity: [0.4, 1, 0.4] }}
                      transition={{ duration: 0.7, repeat: Infinity, ease: "easeInOut", delay: 0.15 }}
                    />
                    <motion.div
                      className="h-2 w-2 bg-primary/70 rounded-full"
                      animate={{ y: [0, -5, 0], scale: [1, 1.2, 1], opacity: [0.4, 1, 0.4] }}
                      transition={{ duration: 0.7, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
                    />
                  </div>
                </div>
              </motion.div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <motion.div
            className="p-3 border-t border-border/80 bg-background/95"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.3 }}
          >
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={
                  assistantAvailable
                    ? "Ask Compli-ee anything about the platform..."
                    : limitedMode
                      ? "Limited mode: ask for workflow steps or where to find features..."
                      : "Assistant unavailable - refresh status to retry"
                }
                rows={1}
                dir="ltr"
                className={cn(
                  "flex-1 resize-none bg-muted/55 border border-border/80 rounded-xl px-3.5 py-2.5 text-sm text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]",
                  "focus:outline-none focus:ring-2 focus:ring-secondary/40 focus:border-secondary/40",
                  "min-h-[42px] max-h-[140px] placeholder:text-muted-foreground overflow-y-auto transition-shadow duration-200"
                )}
                disabled={isLoading || availabilityLoading || !canSendMessages}
              />

              <motion.div whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.92 }}>
                <Button
                  onClick={() => void sendMessage()}
                  disabled={
                    !inputValue.trim() ||
                    isLoading ||
                    availabilityLoading ||
                    !canSendMessages
                  }
                  size="icon"
                  aria-label="Send message"
                  className="h-[42px] w-[42px] rounded-xl flex-shrink-0 bg-secondary hover:bg-secondary/90 shadow-[0_12px_24px_-14px_color-mix(in_oklab,var(--color-secondary)_40%,transparent)] transition-shadow duration-200 hover:shadow-[0_16px_32px_-14px_color-mix(in_oklab,var(--color-secondary)_50%,transparent)]"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <motion.div
                      animate={inputValue.trim() ? { x: [0, 2, 0] } : {}}
                      transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 2 }}
                    >
                      <Send className="h-4 w-4" />
                    </motion.div>
                  )}
                </Button>
              </motion.div>
            </div>

            <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
              <span>Enter to send, Shift+Enter for newline</span>
              <motion.span
                key={inputValue.trim().length}
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
              >
                {inputValue.trim().length} chars
              </motion.span>
            </div>
          </motion.div>
        </>
      )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
