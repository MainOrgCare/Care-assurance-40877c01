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
    <div
      className={cn(
        sizeClasses[size],
        "relative rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-md",
        animate && "animate-pulse"
      )}
      title="Compli-ee - Your Compliance Assistant"
    >
      <div className="absolute inset-[15%] bg-white rounded-sm border-2 border-emerald-600/30">
        <div className="absolute -top-[4px] left-1/2 -translate-x-1/2 w-[40%] h-[6px] bg-amber-400 rounded-sm border border-amber-500" />
        <div className="absolute top-[35%] left-[20%] w-[60%] h-[2px] bg-emerald-500 rounded" />
        <div className="absolute top-[55%] left-[20%] w-[40%] h-[2px] bg-emerald-500 rounded" />
        <div className="absolute top-[75%] left-[20%] w-[50%] h-[2px] bg-emerald-400 rounded" />
      </div>
      <div className="absolute bottom-[18%] left-1/2 -translate-x-1/2 flex gap-[3px]">
        <div className="h-[3px] w-[3px] bg-emerald-700 rounded-full" />
        <div className="h-[3px] w-[3px] bg-emerald-700 rounded-full" />
      </div>
      <div
        className="absolute bottom-[10%] left-1/2 -translate-x-1/2 w-[20%] h-[2px] bg-emerald-700 rounded-full"
        style={{ borderRadius: "0 0 50% 50%" }}
      />
    </div>
  );
});

export const ChatTriggerButton = React.memo(function ChatTriggerButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium transition-colors"
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
    <div
      className={cn(
        "fixed z-50 transition-all duration-250 bg-background border-l border-border shadow-lg overflow-hidden flex flex-col",
        isOpen ? "translate-x-0" : "translate-x-full",
        isMinimized
          ? "bottom-4 right-4 w-[300px] h-14 rounded-xl"
          : "top-0 right-0 w-full sm:w-[430px] h-full"
      )}
    >
      <div className="relative flex items-center justify-between px-3.5 py-3 bg-emerald-600 text-white">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/70" />
        <div className="flex items-center gap-2.5 min-w-0">
          <ComplieeAvatar size="md" animate={isLoading} />
          <div className="min-w-0">
            <h3 className="font-semibold text-sm leading-tight">Compli-ee</h3>
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
      </div>

      {!isMinimized && (
        <>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gradient-to-b from-muted/45 via-muted/20 to-background/35">
            {statusMessage && (
              <div
                className={cn(
                  "rounded-xl border px-3 py-2.5 text-xs flex items-start justify-between gap-2",
                  assistantAvailable
                    ? "border-emerald-300/60 bg-emerald-50 text-emerald-800"
                    : limitedMode
                      ? "border-amber-300/60 bg-amber-50 text-amber-900"
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
              </div>
            )}

            {!hasUserPrompt && canSendMessages && !availabilityLoading && (
              <div className="rounded-xl border border-border/70 bg-background/80 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-2">
                  {assistantAvailable ? "Try one of these" : "Limited mode prompts"}
                </p>
                <div className="flex flex-wrap gap-2">
                  {QUICK_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => void sendMessage(prompt)}
                      className="rounded-full border border-border bg-muted/50 hover:bg-muted text-xs px-3 py-1.5 text-foreground transition-colors"
                      disabled={isLoading}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
                <div className="mt-3 border-t border-border/60 pt-3">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Open workspace
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {WORKSPACE_SHORTCUTS.map((shortcut) => (
                      <button
                        key={shortcut.path}
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/50 transition-colors"
                        onClick={() => openWorkspace(shortcut.path)}
                      >
                        {shortcut.label}
                        <ArrowUpRight className="h-3 w-3" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex gap-2.5",
                  message.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {message.role === "assistant" && (
                  <div className="flex-shrink-0 mt-0.5">
                    <ComplieeAvatar size="sm" />
                  </div>
                )}

                <div
                  className={cn(
                    "max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm",
                    message.role === "user"
                      ? "bg-emerald-500 text-white rounded-br-md border border-emerald-400/60 shadow-emerald-700/25"
                      : "bg-background/95 border border-border/70 rounded-bl-md shadow-[0_8px_20px_-14px_rgba(15,23,42,0.35)]"
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
                    <div className="mt-2 flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[11px]"
                        onClick={() => void copyMessage(message)}
                      >
                        {copiedMessageId === message.id ? (
                          <>
                            <Check className="h-3 w-3 mr-1" />
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
                </div>

                {message.role === "user" && (
                  <div className="h-7 w-7 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-2.5 justify-start">
                <div className="flex-shrink-0 mt-0.5">
                  <ComplieeAvatar size="sm" animate />
                </div>
                <div className="bg-background border border-border/70 shadow-sm rounded-2xl rounded-bl-md px-3.5 py-3">
                  <div className="flex gap-1.5">
                    <span
                      className="h-2 w-2 bg-emerald-400 rounded-full animate-bounce"
                      style={{ animationDelay: "0ms" }}
                    />
                    <span
                      className="h-2 w-2 bg-emerald-400 rounded-full animate-bounce"
                      style={{ animationDelay: "120ms" }}
                    />
                    <span
                      className="h-2 w-2 bg-emerald-400 rounded-full animate-bounce"
                      style={{ animationDelay: "240ms" }}
                    />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div className="p-3 border-t border-border/80 bg-background/95">
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
                  "focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50",
                  "min-h-[42px] max-h-[140px] placeholder:text-muted-foreground overflow-y-auto"
                )}
                disabled={isLoading || availabilityLoading || !canSendMessages}
              />

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
                className="h-[42px] w-[42px] rounded-xl flex-shrink-0 bg-emerald-500 hover:bg-emerald-600 shadow-[0_12px_24px_-14px_rgba(5,150,105,0.75)]"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>

            <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
              <span>Enter to send, Shift+Enter for newline</span>
              <span>{inputValue.trim().length} chars</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
