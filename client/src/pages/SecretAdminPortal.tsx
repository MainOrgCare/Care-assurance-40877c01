import { useState, useEffect, useMemo, memo, useSyncExternalStore } from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { validatePassword, MIN_PASSWORD_LENGTH } from "@/lib/validation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, Lock, UserX, Activity, AlertTriangle, Terminal, Check, X, UserPlus, ShieldCheck, ArrowRightLeft, EyeOff, Clock, FileKey, Pencil, Search, Filter, Trash2, Save, FileWarning, Loader2, Unplug, FileText, Upload, FileCheck, FileX, DollarSign, Cpu, TrendingUp, Mail, MailOpen, Archive, ExternalLink, Database, Server, Zap, RefreshCcw, RotateCcw, Megaphone, Power, CalendarClock, Download, ChevronDown, ChevronUp, ChevronRight, ChevronsUpDown, Send, Route, Timer, CheckCircle2, BarChart3, AlertCircle, Users, MapPin } from "lucide-react";
import { CURRENT_TERMS_VERSION } from "@shared/schema";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link, useLocation } from "wouter";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import AdminDatabasePanel from "@/components/rostering/AdminDatabasePanel";
import { DEFAULT_USER_ROLE, getUserRoleLabel, type UserRole } from "@shared/roles";
import {
  getSharedAllSlots,
  getSharedRecommendations,
  getSharedRecommendationDecisions,
  subscribeSharedRosteringData,
  subscribeSharedRecommendationDecisions,
} from "@/pages/rosteringRunsStore";

const USER_ROLE_OPTIONS: readonly UserRole[] = ["staff", "pilot", "admin"];

const getRoleBadgeClassName = (role: string): string => {
  switch (role) {
    case "admin":
      return "border-primary/40 text-primary bg-primary/10";
    case "pilot":
      return "border-secondary/40 text-secondary bg-secondary/10";
    default:
      return "border-border text-muted-foreground bg-muted/50";
  }
};

interface AdminAlert {
  id: string;
  careWorkerId: string;
  careWorkerName: string;
  message: string;
  discrepancyType: string;
  discrepancyCount: number;
  isRead: boolean;
  createdAt: string;
}

interface AiUsageLog {
  id: string;
  userId: string | null;
  username: string | null;
  featureName: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costMicroDollars: number;
  durationMs: number | null;
  createdAt: string;
}

interface AiUsageStats {
  totalCost: number;
  totalCalls: number;
  byFeature: Record<string, { calls: number; cost: number; tokens: number }>;
}

interface AIRequestLog {
  id: string;
  userId: string | null;
  username: string | null;
  endpoint: string;
  featureName: string;
  retryCount?: number;
  lastRetryReason?: string | null;
  requestBody: any;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costMicroDollars: number;
  model: string;
  provider: string;
  createdAt: string;
}

interface ContactMessage {
  id: string;
  name: string;
  email: string;
  organisation: string | null;
  message: string;
  isRead: boolean;
  isArchived: boolean;
  readBy: string | null;
  readAt: string | null;
  createdAt: string;
}

type AnnouncementSeverity = "info" | "warning" | "critical";

interface PlatformControlsState {
  maintenanceMode: boolean;
  readOnlyMode: boolean;
  maintenanceActive?: boolean;
  readOnlyActive?: boolean;
  maintenanceMessage: string;
  maintenanceWindowStart: string | null;
  maintenanceWindowEnd: string | null;
  maintenanceWindowActive?: boolean;
  maintenanceWindowUpcoming?: boolean;
  announcementEnabled: boolean;
  announcementText: string;
  announcementSeverity: AnnouncementSeverity;
  updatedAt: string;
  updatedBy: string | null;
}

interface OpsHealthSnapshot {
  generatedAt: string;
  runtime: {
    uptimeSeconds: number;
    nodeVersion: string;
    platform: string;
    loadAverage: number[];
  };
  memory: {
    rssMb: number;
    heapUsedMb: number;
    heapTotalMb: number;
    externalMb: number;
    arrayBuffersMb: number;
  };
  sessions: {
    total: number;
    nonAdmin: number;
    webSocketClients: number;
  };
  users: {
    total: number;
    admins: number;
    staff: number;
    active: number;
    pending: number;
    suspended: number;
  };
  alerts: {
    unreadAdminAlerts: number;
    unreadContactMessages: number;
  };
  security: {
    blockedIps: number;
  };
}

interface OpsIncident {
  id: string;
  eventType: string;
  username: string;
  createdAt: string;
  severity: "info" | "warning" | "critical";
  action: string;
  status: string;
}

interface ExtensionPackageInfo {
  manifestVersion: string | null;
  previousManifestVersion?: string | null;
  versionUpdated?: boolean;
  downloadUrl: string;
  crxDownloadUrl: string | null;
  package: {
    available: boolean;
    filename: string | null;
    sizeBytes: number | null;
    sha256: string | null;
    packagedAt: string | null;
    rebuilt?: boolean;
  };
  crx: {
    available: boolean;
  };
}

interface InstalledExtensionStatus {
  detected: boolean;
  refreshRequired: boolean;
  version: string | null;
  name: string | null;
  origin: string | null;
  error?: string | null;
  lastSeenAt: string | null;
}

interface AdminAcpServiceUser {
  accessCarePlanningId: string;
  serviceUserName: string;
  initials: string;
  dashboardUrl: string;
  updatedAt: string;
}

type AdminAcpWorkflow = "risk" | "emar" | "care-plan";
type AdminPortalTab = "overview" | "command" | "users" | "presence" | "messages" | "policies" | "ai" | "database";
type AdminActionTone = "success" | "primary" | "warning" | "danger";

interface AdminActionQueueItem {
  id: string;
  label: string;
  description: string;
  countLabel: string;
  tone: AdminActionTone;
  icon: typeof Shield;
  actionLabel: string;
  onSelect: () => void;
}

const ADMIN_ACTION_TONE_CLASSES: Record<AdminActionTone, string> = {
  success: "border-success/30 bg-success/8 text-success",
  primary: "border-primary/30 bg-primary/8 text-primary",
  warning: "border-warning/35 bg-warning/10 text-warning",
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
};

const ADMIN_ACP_WORKFLOWS: Record<AdminAcpWorkflow, { label: string; path: string; icon: typeof Shield }> = {
  risk: { label: "Risk Assess", path: "/service-users/risk-assessment", icon: Shield },
  emar: { label: "EMAR", path: "/care-workers/emar-audit", icon: FileCheck },
  "care-plan": { label: "Care Plan", path: "/service-users/care-planning", icon: FileText },
};

function formatCost(microDollars: number): string {
  const dollars = microDollars / 1000000;
  if (dollars < 0.01) {
    return `$${dollars.toFixed(4)}`;
  } else if (dollars < 1) {
    return `$${dollars.toFixed(3)}`;
  } else {
    return `$${dollars.toFixed(2)}`;
  }
}

function formatBytes(bytes: number | null | undefined): string {
  if (typeof bytes !== "number" || Number.isNaN(bytes) || bytes < 0) return "Unavailable";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatRelativeTime(value: string | null | undefined): { label: string; full: string } {
  if (!value) return { label: "Never", full: "Has not signed in" };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { label: "—", full: "Unknown" };
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const full = date.toLocaleString();
  if (minutes < 1) return { label: "Just now", full };
  if (minutes < 60) return { label: `${minutes}m ago`, full };
  if (hours < 24) return { label: `${hours}h ago`, full };
  if (days < 30) return { label: `${days}d ago`, full };
  return { label: date.toLocaleDateString(), full };
}

const PASSWORD_RULES_TEXT = `Password must be at least ${MIN_PASSWORD_LENGTH} characters and include an uppercase letter, lowercase letter, number, and special character.`;
const AI_LOG_PROVIDER_SORT_KEY = "aiLogProviderSortMode";
const AI_LOG_PROBLEMATIC_ONLY_KEY = "aiLogProblematicProvidersOnly";
const AI_LOG_SEARCH_KEY = "aiLogSearchQuery";
const AI_LOG_USER_FILTER_KEY = "aiLogUserFilter";
const AI_LOG_ENDPOINT_FILTER_KEY = "aiLogEndpointFilter";
const AI_LOG_RETRY_FILTER_KEY = "aiLogRetryFilter";
const AI_LOG_PROVIDER_FILTER_KEY = "aiLogProviderFilter";
const AI_LOG_START_DATE_KEY = "aiLogStartDate";
const AI_LOG_END_DATE_KEY = "aiLogEndDate";
type AiLogPreset = "high_retries" | "local_only" | "prn_focus" | "all" | "custom";
type AiLogRetryFilter = "all" | "with_retries" | "no_retries";

const getStoredProviderSortMode = (): "volume" | "retry_rate" => {
  if (typeof window === "undefined") return "retry_rate";
  const stored = window.localStorage.getItem(AI_LOG_PROVIDER_SORT_KEY);
  return stored === "volume" ? "volume" : "retry_rate";
};

const getStoredProblematicOnly = (): boolean => {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(AI_LOG_PROBLEMATIC_ONLY_KEY) === "true";
};

const getStoredString = (key: string, fallback: string): string => {
  if (typeof window === "undefined") return fallback;
  const stored = window.localStorage.getItem(key);
  return stored && stored.trim().length > 0 ? stored : fallback;
};

const getUrlParam = (key: string): string | undefined => {
  if (typeof window === "undefined") return undefined;
  const value = new URLSearchParams(window.location.search).get(key);
  return value && value.trim().length > 0 ? value : undefined;
};

const getInitialAiLogString = (storageKey: string, urlKey: string, fallback: string): string => {
  const fromUrl = getUrlParam(urlKey);
  if (fromUrl) return fromUrl;
  return getStoredString(storageKey, fallback);
};

const getInitialAiLogPage = (): number => {
  const fromUrl = getUrlParam("aiPage");
  if (!fromUrl) return 1;
  const parsed = Number.parseInt(fromUrl, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
};

const AIAdminLog = memo(function AIAdminLog() {
  const initialRetryFilter = getInitialAiLogString(AI_LOG_RETRY_FILTER_KEY, "aiRetry", "all");
  const [logs, setLogs] = useState<AIRequestLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState(() => getInitialAiLogString(AI_LOG_SEARCH_KEY, "aiSearch", ""));
  const [userFilter, setUserFilter] = useState<string>(() => getInitialAiLogString(AI_LOG_USER_FILTER_KEY, "aiUser", "all"));
  const [endpointFilter, setEndpointFilter] = useState<string>(() => getInitialAiLogString(AI_LOG_ENDPOINT_FILTER_KEY, "aiEndpoint", "all"));
  const [retryFilter, setRetryFilter] = useState<AiLogRetryFilter>(
    initialRetryFilter === "with_retries" || initialRetryFilter === "no_retries" ? initialRetryFilter : "all"
  );
  const [providerFilter, setProviderFilter] = useState<string>(() => getInitialAiLogString(AI_LOG_PROVIDER_FILTER_KEY, "aiProvider", "all"));
  const [startDateFilter, setStartDateFilter] = useState<string>(() => getInitialAiLogString(AI_LOG_START_DATE_KEY, "aiStart", ""));
  const [endDateFilter, setEndDateFilter] = useState<string>(() => getInitialAiLogString(AI_LOG_END_DATE_KEY, "aiEnd", ""));
  const [providerSortMode, setProviderSortMode] = useState<"volume" | "retry_rate">(getStoredProviderSortMode);
  const [showProblematicProvidersOnly, setShowProblematicProvidersOnly] = useState(getStoredProblematicOnly);
  const [currentPage, setCurrentPage] = useState(getInitialAiLogPage);
  const [totalPages, setTotalPages] = useState(1);
  const [totalLogs, setTotalLogs] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [filterOptions, setFilterOptions] = useState<{ users: string[]; endpoints: string[]; providers: string[] }>({
    users: [],
    endpoints: [],
    providers: [],
  });
  const [retryReasonSummary, setRetryReasonSummary] = useState<Record<string, number>>({});
  const [analyticsTotals, setAnalyticsTotals] = useState({
    retriedRequestCount: 0,
    totalRetryAttempts: 0,
    retryRatePercent: 0,
  });
  const [providerRetryStatsRaw, setProviderRetryStatsRaw] = useState<Array<{ provider: string; requests: number; retried: number; retries: number }>>([]);

  useEffect(() => {
    fetchAILogs();
  }, [searchQuery, userFilter, endpointFilter, retryFilter, providerFilter, startDateFilter, endDateFilter, currentPage]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(AI_LOG_PROVIDER_SORT_KEY, providerSortMode);
  }, [providerSortMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(AI_LOG_PROBLEMATIC_ONLY_KEY, showProblematicProvidersOnly ? "true" : "false");
  }, [showProblematicProvidersOnly]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(AI_LOG_SEARCH_KEY, searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(AI_LOG_USER_FILTER_KEY, userFilter);
  }, [userFilter]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(AI_LOG_ENDPOINT_FILTER_KEY, endpointFilter);
  }, [endpointFilter]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(AI_LOG_RETRY_FILTER_KEY, retryFilter);
  }, [retryFilter]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(AI_LOG_PROVIDER_FILTER_KEY, providerFilter);
  }, [providerFilter]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(AI_LOG_START_DATE_KEY, startDateFilter);
  }, [startDateFilter]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(AI_LOG_END_DATE_KEY, endDateFilter);
  }, [endDateFilter]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);

    if (searchQuery.trim()) params.set("aiSearch", searchQuery.trim());
    else params.delete("aiSearch");

    if (userFilter !== "all") params.set("aiUser", userFilter);
    else params.delete("aiUser");

    if (endpointFilter !== "all") params.set("aiEndpoint", endpointFilter);
    else params.delete("aiEndpoint");

    if (retryFilter !== "all") params.set("aiRetry", retryFilter);
    else params.delete("aiRetry");

    if (providerFilter !== "all") params.set("aiProvider", providerFilter);
    else params.delete("aiProvider");

    if (startDateFilter) params.set("aiStart", startDateFilter);
    else params.delete("aiStart");

    if (endDateFilter) params.set("aiEnd", endDateFilter);
    else params.delete("aiEnd");

    if (currentPage > 1) params.set("aiPage", String(currentPage));
    else params.delete("aiPage");

    const queryString = params.toString();
    const nextUrl = `${window.location.pathname}${queryString ? `?${queryString}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", nextUrl);
  }, [searchQuery, userFilter, endpointFilter, retryFilter, providerFilter, startDateFilter, endDateFilter, currentPage]);

  const fetchAILogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(currentPage),
        limit: String(itemsPerPage),
      });

      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      if (userFilter !== "all") params.set("user", userFilter);
      if (endpointFilter !== "all") params.set("endpoint", endpointFilter);
      if (retryFilter !== "all") params.set("retryState", retryFilter);
      if (providerFilter !== "all") params.set("provider", providerFilter);
      if (startDateFilter) params.set("startDate", `${startDateFilter}T00:00:00.000Z`);
      if (endDateFilter) params.set("endDate", `${endDateFilter}T23:59:59.999Z`);

      const response = await fetch(`/api/admin/ai-logs?${params.toString()}`, {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        setLogs(data.logs || []);
        const pagination = data.pagination || {};
        setTotalPages(Math.max(1, Number(pagination.totalPages || 1)));
        setTotalLogs(Math.max(0, Number(pagination.total || 0)));
        setItemsPerPage(Math.max(1, Number(pagination.limit || itemsPerPage)));

        if (typeof pagination.page === "number" && pagination.page !== currentPage) {
          setCurrentPage(Math.max(1, pagination.page));
        }

        const analytics = data.analytics || {};
        setRetryReasonSummary(analytics.retryReasonSummary || {});
        setProviderRetryStatsRaw(Array.isArray(analytics.providerRetryStats) ? analytics.providerRetryStats : []);
        setAnalyticsTotals({
          retriedRequestCount: Number(analytics.retriedRequestCount || 0),
          totalRetryAttempts: Number(analytics.totalRetryAttempts || 0),
          retryRatePercent: Number(analytics.retryRatePercent || 0),
        });

        const nextFilterOptions = data.filterOptions || {};
        setFilterOptions({
          users: Array.isArray(nextFilterOptions.users) ? nextFilterOptions.users : [],
          endpoints: Array.isArray(nextFilterOptions.endpoints) ? nextFilterOptions.endpoints : [],
          providers: Array.isArray(nextFilterOptions.providers) ? nextFilterOptions.providers : [],
        });
      }
    } catch (error) {
      console.error("Failed to fetch AI logs:", error);
    } finally {
      setLoading(false);
    }
  };

  const uniqueUsers = useMemo(() => {
    if (filterOptions.users.length > 0) return [...filterOptions.users].sort();
    const users = new Set<string>();
    logs.forEach(log => {
      if (log.username) users.add(log.username);
    });
    return Array.from(users).sort();
  }, [filterOptions.users, logs]);

  const uniqueEndpoints = useMemo(() => {
    if (filterOptions.endpoints.length > 0) return [...filterOptions.endpoints].sort();
    const endpoints = new Set<string>();
    logs.forEach(log => endpoints.add(log.endpoint));
    return Array.from(endpoints).sort();
  }, [filterOptions.endpoints, logs]);

  const uniqueProviders = useMemo(() => {
    if (filterOptions.providers.length > 0) return [...filterOptions.providers].sort();
    const providers = new Set<string>();
    logs.forEach(log => {
      if (log.provider) providers.add(log.provider);
    });
    return Array.from(providers).sort();
  }, [filterOptions.providers, logs]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, userFilter, endpointFilter, retryFilter, providerFilter, startDateFilter, endDateFilter]);

  const startIndex = totalLogs === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const endIndex = totalLogs === 0 ? 0 : Math.min(totalLogs, (currentPage - 1) * itemsPerPage + logs.length);
  const displayedLogs = logs;
  const retriedRequestCount = analyticsTotals.retriedRequestCount;
  const totalRetryAttempts = analyticsTotals.totalRetryAttempts;
  const retryRatePercent = analyticsTotals.retryRatePercent;
  const providerRetryStats = useMemo(() => {
    const entries = providerRetryStatsRaw
      .map((item) => ({
        provider: (item.provider || "unknown").toLowerCase(),
        requests: Number(item.requests || 0),
        retried: Number(item.retried || 0),
        retries: Number(item.retries || 0),
        retryRate: Number(item.requests || 0) > 0 ? (Number(item.retried || 0) / Number(item.requests || 0)) * 100 : 0,
      }));

    const filtered = showProblematicProvidersOnly
      ? entries.filter((item) => item.retryRate > 0 || item.retries > 0)
      : entries;

    return filtered.sort((a, b) => {
      if (providerSortMode === "retry_rate") {
        return b.retryRate - a.retryRate || b.retries - a.retries || b.requests - a.requests;
      }
      return b.requests - a.requests;
    });
  }, [providerRetryStatsRaw, providerSortMode, showProblematicProvidersOnly]);

  const formatProviderName = (provider: string): string => {
    const normalized = (provider || "unknown").toLowerCase();
    if (normalized === "openai") return "OpenAI";
    if (normalized === "local") return "Local LLM";
    if (normalized === "github") return "GitHub AI";
    return normalized === "unknown" ? "Unknown" : provider;
  };

  const providerRetryBadgeClass = (provider: string): string => {
    const normalized = (provider || "unknown").toLowerCase();
    if (normalized === "openai") return "border-success/30 bg-success/10 text-success";
    if (normalized === "local") return "border-secondary/35 bg-secondary/10 text-secondary";
    if (normalized === "github") return "border-primary/35 bg-primary/10 text-primary";
    return "border-border/60 bg-muted/30 text-muted-foreground";
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-GB', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const handleResetFilters = () => {
    setSearchQuery("");
    setUserFilter("all");
    setEndpointFilter("all");
    setRetryFilter("all");
    setProviderFilter("all");
    setStartDateFilter("");
    setEndDateFilter("");
    setCurrentPage(1);
    setProviderSortMode("retry_rate");
    setShowProblematicProvidersOnly(false);

    if (typeof window !== "undefined") {
      window.localStorage.removeItem(AI_LOG_SEARCH_KEY);
      window.localStorage.removeItem(AI_LOG_USER_FILTER_KEY);
      window.localStorage.removeItem(AI_LOG_ENDPOINT_FILTER_KEY);
      window.localStorage.removeItem(AI_LOG_RETRY_FILTER_KEY);
      window.localStorage.removeItem(AI_LOG_PROVIDER_FILTER_KEY);
      window.localStorage.removeItem(AI_LOG_START_DATE_KEY);
      window.localStorage.removeItem(AI_LOG_END_DATE_KEY);
      window.localStorage.removeItem(AI_LOG_PROVIDER_SORT_KEY);
      window.localStorage.removeItem(AI_LOG_PROBLEMATIC_ONLY_KEY);
    }
  };

  const applyPreset = (preset: "high_retries" | "local_only" | "prn_focus" | "all") => {
    if (preset === "all") {
      handleResetFilters();
      return;
    }

    setCurrentPage(1);

    if (preset === "high_retries") {
      setSearchQuery("");
      setUserFilter("all");
      setEndpointFilter("all");
      setRetryFilter("with_retries");
      setProviderFilter("all");
      setStartDateFilter("");
      setEndDateFilter("");
      setProviderSortMode("retry_rate");
      setShowProblematicProvidersOnly(true);
      return;
    }

    if (preset === "local_only") {
      setSearchQuery("local");
      setUserFilter("all");
      setEndpointFilter("all");
      setRetryFilter("all");
      setProviderFilter("all");
      setStartDateFilter("");
      setEndDateFilter("");
      setProviderSortMode("retry_rate");
      setShowProblematicProvidersOnly(false);
      return;
    }

    if (preset === "prn_focus") {
      setSearchQuery("prn");
      setUserFilter("all");
      setEndpointFilter("all");
      setRetryFilter("all");
      setProviderFilter("all");
      setStartDateFilter("");
      setEndDateFilter("");
      setProviderSortMode("retry_rate");
      setShowProblematicProvidersOnly(false);
    }
  };

  const activePreset = useMemo<AiLogPreset>(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    const isAllView =
      normalizedSearch.length === 0 &&
      userFilter === "all" &&
      endpointFilter === "all" &&
      retryFilter === "all" &&
      providerFilter === "all" &&
      !startDateFilter &&
      !endDateFilter &&
      providerSortMode === "retry_rate" &&
      !showProblematicProvidersOnly;

    if (isAllView) return "all";

    const isHighRetriesView =
      normalizedSearch.length === 0 &&
      userFilter === "all" &&
      endpointFilter === "all" &&
      retryFilter === "with_retries" &&
      providerFilter === "all" &&
      !startDateFilter &&
      !endDateFilter &&
      providerSortMode === "retry_rate" &&
      showProblematicProvidersOnly;

    if (isHighRetriesView) return "high_retries";

    const isLocalOnlyView =
      normalizedSearch === "local" &&
      userFilter === "all" &&
      endpointFilter === "all" &&
      retryFilter === "all" &&
      providerFilter === "all" &&
      !startDateFilter &&
      !endDateFilter &&
      providerSortMode === "retry_rate" &&
      !showProblematicProvidersOnly;

    if (isLocalOnlyView) return "local_only";

    const isPrnFocusView =
      normalizedSearch === "prn" &&
      userFilter === "all" &&
      endpointFilter === "all" &&
      retryFilter === "all" &&
      providerFilter === "all" &&
      !startDateFilter &&
      !endDateFilter &&
      providerSortMode === "retry_rate" &&
      !showProblematicProvidersOnly;

    if (isPrnFocusView) return "prn_focus";

    return "custom";
  }, [searchQuery, userFilter, endpointFilter, retryFilter, providerFilter, startDateFilter, endDateFilter, providerSortMode, showProblematicProvidersOnly]);

  const activePresetLabel =
    activePreset === "high_retries"
      ? "High Retries"
      : activePreset === "local_only"
        ? "Local Only"
        : activePreset === "prn_focus"
          ? "PRN Focus"
          : activePreset === "all"
            ? "All Logs"
            : "Custom";

  if (loading) {
    return (
      <Card className="border-border/60 bg-background/70 shadow-medium">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/60 bg-background/70 shadow-medium hover-elevate">
      <CardHeader className="border-b border-border/40 bg-muted/30">
        <CardTitle className="flex items-center gap-2">
          <Terminal className="h-5 w-5" />
          AI Request Log
        </CardTitle>
        <CardDescription>
          Detailed log of all AI requests with full request payloads
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[200px]">
            <Input
              placeholder="Search logs..."
              aria-label="Search AI request logs"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full"
            />
          </div>
          <Select value={userFilter} onValueChange={setUserFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by user" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Users</SelectItem>
              {uniqueUsers.map(user => (
                <SelectItem key={user} value={user}>{user}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={endpointFilter} onValueChange={setEndpointFilter}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Filter by endpoint" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Endpoints</SelectItem>
              {uniqueEndpoints.map(endpoint => (
                <SelectItem key={endpoint} value={endpoint}>
                  {endpoint.replace('/api/', '')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={retryFilter}
            onValueChange={(value) => setRetryFilter(value === "with_retries" || value === "no_retries" ? value : "all")}
          >
            <SelectTrigger className="w-[190px]">
              <SelectValue placeholder="Filter by retries" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Retry States</SelectItem>
              <SelectItem value="with_retries">With Retries</SelectItem>
              <SelectItem value="no_retries">No Retries</SelectItem>
            </SelectContent>
          </Select>
          <Select value={providerFilter} onValueChange={setProviderFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Providers</SelectItem>
              {uniqueProviders.map(provider => (
                <SelectItem key={provider} value={provider}>
                  {formatProviderName(provider)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="date"
            aria-label="Filter from date"
            value={startDateFilter}
            onChange={(e) => setStartDateFilter(e.target.value)}
            className="w-[170px]"
          />
          <Input
            type="date"
            aria-label="Filter to date"
            value={endDateFilter}
            onChange={(e) => setEndDateFilter(e.target.value)}
            className="w-[170px]"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleResetFilters}
            className="h-9"
          >
            <RefreshCcw className="mr-2 h-3.5 w-3.5" />
            Reset Filters
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Saved Views:</span>
          <Badge variant="outline" className="text-[10px]">
            Active: {activePresetLabel}
          </Badge>
          <Button
            type="button"
            variant={activePreset === "high_retries" ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs"
            aria-pressed={activePreset === "high_retries"}
            disabled={activePreset === "high_retries"}
            onClick={() => applyPreset("high_retries")}
          >
            High Retries
          </Button>
          <Button
            type="button"
            variant={activePreset === "local_only" ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs"
            aria-pressed={activePreset === "local_only"}
            disabled={activePreset === "local_only"}
            onClick={() => applyPreset("local_only")}
          >
            Local Only
          </Button>
          <Button
            type="button"
            variant={activePreset === "prn_focus" ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs"
            aria-pressed={activePreset === "prn_focus"}
            disabled={activePreset === "prn_focus"}
            onClick={() => applyPreset("prn_focus")}
          >
            PRN Focus
          </Button>
          <Button
            type="button"
            variant={activePreset === "all" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 text-xs"
            aria-pressed={activePreset === "all"}
            disabled={activePreset === "all"}
            onClick={() => applyPreset("all")}
          >
            Clear View
          </Button>
        </div>

        {Object.keys(retryReasonSummary).length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
            <span className="text-xs font-medium text-muted-foreground">Retry Reasons:</span>
            {Object.entries(retryReasonSummary)
              .sort((a, b) => b[1] - a[1])
              .map(([reason, count]) => (
                <Badge key={reason} variant="outline" className="text-xs">
                  {reason}: {count}
                </Badge>
              ))}
          </div>
        )}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-border/50 bg-muted/10 px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Requests Retried</div>
            <div className="text-sm font-semibold text-foreground">{retriedRequestCount.toLocaleString()}</div>
          </div>
          <div className="rounded-lg border border-border/50 bg-muted/10 px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Total Retry Attempts</div>
            <div className="text-sm font-semibold text-foreground">{totalRetryAttempts.toLocaleString()}</div>
          </div>
          <div className="rounded-lg border border-border/50 bg-muted/10 px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Retry Rate</div>
            <div className="text-sm font-semibold text-foreground">{retryRatePercent.toFixed(1)}%</div>
          </div>
        </div>

        {providerRetryStats.length > 0 && (
          <div className="rounded-lg border border-border/50 bg-muted/10 px-3 py-2">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Provider Retry Comparison</div>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={providerSortMode} onValueChange={(value: "volume" | "retry_rate") => setProviderSortMode(value)}>
                  <SelectTrigger className="h-7 w-[160px] text-xs">
                    <SelectValue placeholder="Sort providers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="retry_rate">Sort: Retry Rate</SelectItem>
                    <SelectItem value="volume">Sort: Volume</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1.5 rounded-md border border-border/60 bg-background/60 px-2 py-1">
                  <Label htmlFor="problematic-providers-only" className="text-[11px] text-muted-foreground">
                    Problematic only
                  </Label>
                  <Switch
                    id="problematic-providers-only"
                    checked={showProblematicProvidersOnly}
                    onCheckedChange={setShowProblematicProvidersOnly}
                  />
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {providerRetryStats.map((item) => (
                <Badge
                  key={item.provider}
                  variant="outline"
                  className={`text-xs ${providerRetryBadgeClass(item.provider)}`}
                >
                  {formatProviderName(item.provider)}: {item.retryRate.toFixed(1)}% ({item.retried}/{item.requests}) · retries {item.retries}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Results count */}
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {totalLogs > 0 ? `Showing ${startIndex}-${endIndex} of ${totalLogs} requests` : "Showing 0-0 of 0 requests"}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Next
              </Button>
            </div>
          )}
        </div>

        {/* Logs */}
        {displayedLogs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Terminal className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p>No AI requests logged yet</p>
          </div>
        ) : (
          <Accordion type="single" collapsible className="space-y-2">
            {displayedLogs.map((log) => (
              <AccordionItem 
                key={log.id} 
                value={log.id}
                className="border border-border/60 rounded-xl bg-background/60"
              >
                <AccordionTrigger className="px-4 py-3 hover:no-underline">
                  <div className="flex items-center justify-between w-full pr-4 gap-2">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <Badge variant="outline" className="font-mono text-xs shrink-0">
                        {formatTimestamp(log.createdAt)}
                      </Badge>
                      <Badge variant="secondary" className="text-xs max-w-[160px] truncate">
                        {log.username || "Unknown User"}
                      </Badge>
                      <span className="text-sm font-medium text-foreground truncate min-w-0">
                        {log.endpoint.replace('/api/', '')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {(log.retryCount || 0) > 0 && (
                        <Badge variant="secondary" className="text-xs bg-warning/15 text-warning border-warning/30">
                          {log.retryCount} retry{(log.retryCount || 0) > 1 ? "ies" : ""}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs">
                        {log.totalTokens.toLocaleString()} tokens
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {formatCost(log.costMicroDollars)}
                      </Badge>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4">
                  <div className="space-y-3 mt-2">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="font-semibold text-muted-foreground">Feature:</span>
                        <span className="ml-2">{log.featureName}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-muted-foreground">Model:</span>
                        <span className="ml-2 break-all">{log.model} ({log.provider})</span>
                      </div>
                      <div>
                        <span className="font-semibold text-muted-foreground">Input Tokens:</span>
                        <span className="ml-2">{log.inputTokens.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-muted-foreground">Output Tokens:</span>
                        <span className="ml-2">{log.outputTokens.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-muted-foreground">Retries:</span>
                        <span className="ml-2">{(log.retryCount || 0).toLocaleString()}</span>
                      </div>
                      <div className="min-w-0">
                        <span className="font-semibold text-muted-foreground">Retry Reason:</span>
                        <span className="ml-2 break-words">{log.lastRetryReason || "none"}</span>
                      </div>
                    </div>
                    
                    <div className="border-t pt-3">
                      <div className="font-semibold text-sm mb-2">Request Payload:</div>
                      <pre className="bg-muted p-3 rounded-md overflow-x-auto text-xs font-mono max-h-[400px] overflow-y-auto">
                        {JSON.stringify(log.requestBody, null, 2)}
                      </pre>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
});

const AICostSection = memo(function AICostSection() {
  const [logs, setLogs] = useState<AiUsageLog[]>([]);
  const [stats, setStats] = useState<AiUsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [logSearch, setLogSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState("all");

  useEffect(() => {
    fetchAiUsage();
  }, []);

  const fetchAiUsage = async () => {
    try {
      const response = await fetch("/api/ai-usage", {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        setLogs(data.logs || []);
        setStats(data.stats || null);
      }
    } catch (error) {
      console.error("Failed to fetch AI usage:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="border-border/60 bg-background/70 shadow-medium">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const featureColors: Record<string, string> = {
    "emar_metadata": "bg-primary/10 text-primary",
    "emar_entries": "bg-primary/10 text-primary",
    "emar_pass": "bg-primary/10 text-primary",
    "drug_interactions": "bg-destructive/10 text-destructive",
    "care_plan": "bg-success/10 text-success",
    "risk_assessment": "bg-warning/10 text-warning",
    "plan_enhancer": "bg-secondary/10 text-secondary",
  };

  const getFeatureColor = (feature: string): string => {
    for (const [key, color] of Object.entries(featureColors)) {
      if (feature.toLowerCase().includes(key.toLowerCase())) {
        return color;
      }
    }
    return "bg-muted text-muted-foreground";
  };

  const totalCost = stats?.totalCost ?? 0;
  const totalCalls = stats?.totalCalls ?? 0;
  const totalTokens = stats
    ? Object.values(stats.byFeature).reduce((sum, feature) => sum + (feature.tokens || 0), 0)
    : 0;
  const avgCostPerCall = totalCalls > 0 ? totalCost / totalCalls : 0;
  const avgTokensPerCall = totalCalls > 0 ? totalTokens / totalCalls : 0;
  const costPerThousandTokens = totalTokens > 0 ? (totalCost / totalTokens) * 1000 : 0;

  const featureEntries = stats
    ? Object.entries(stats.byFeature).sort((a, b) => b[1].cost - a[1].cost)
    : [];
  const topFeature = featureEntries[0];

  const providerSummary = logs.reduce<Record<string, { calls: number; cost: number; tokens: number }>>(
    (acc, log) => {
      const key = log.provider || "unknown";
      if (!acc[key]) acc[key] = { calls: 0, cost: 0, tokens: 0 };
      acc[key].calls += 1;
      acc[key].cost += log.costMicroDollars || 0;
      acc[key].tokens += log.totalTokens || 0;
      return acc;
    },
    {}
  );
  const providerEntries = Object.entries(providerSummary).sort((a, b) => b[1].cost - a[1].cost);

  const formatProviderLabel = (value: string): string => {
    if (!value || value === "unknown") return "Unknown";
    if (value === "openai") return "OpenAI";
    return "Other Provider";
  };

  const providerBadgeClass = (value: string): string => (
    value === "openai"
      ? "border-success/30 text-success bg-success/10"
      : "border-white/10 text-muted-foreground bg-muted/30"
  );

  const filteredLogs = logs.filter((log) => {
    const searchValue = logSearch.toLowerCase().trim();
    const matchesSearch =
      !searchValue ||
      log.username?.toLowerCase().includes(searchValue) ||
      log.featureName?.toLowerCase().includes(searchValue) ||
      log.model?.toLowerCase().includes(searchValue);
    const matchesProvider =
      providerFilter === "all" ||
      (providerFilter === "openai" && log.provider === "openai") ||
      (providerFilter === "other" && log.provider !== "openai");
    return matchesSearch && matchesProvider;
  });

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card className="border-border/60 bg-background/70 shadow-soft">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider flex items-center gap-2 text-muted-foreground">
              <DollarSign size={14} className="text-success" /> Total Spend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-success">{stats ? formatCost(totalCost) : "$0.00"}</div>
            <p className="text-xs text-muted-foreground">All time AI costs</p>
          </CardContent>
        </Card>
        
        <Card className="border-border/60 bg-background/70 shadow-soft">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider flex items-center gap-2 text-muted-foreground">
              <Cpu size={14} className="text-primary" /> API Calls
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-primary">{totalCalls.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Total AI requests</p>
          </CardContent>
        </Card>
        
        <Card className="border-border/60 bg-background/70 shadow-soft">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider flex items-center gap-2 text-muted-foreground">
              <TrendingUp size={14} className="text-primary" /> Features Used
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-primary">{stats ? Object.keys(stats.byFeature).length : 0}</div>
            <p className="text-xs text-muted-foreground">Unique AI features</p>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-background/70 shadow-soft">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider flex items-center gap-2 text-muted-foreground">
              <Activity size={14} className="text-warning" /> Avg Cost / Call
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-warning">{formatCost(avgCostPerCall)}</div>
            <p className="text-xs text-muted-foreground">{avgTokensPerCall.toFixed(0)} tokens per call</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="border-border/60 bg-background/70 shadow-soft">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider flex items-center gap-2 text-muted-foreground">
              <Cpu size={14} className="text-secondary" /> Cost Efficiency
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Cost per 1k tokens</span>
              <span className="font-semibold text-foreground">{formatCost(costPerThousandTokens)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total tokens processed</span>
              <span className="font-semibold text-foreground">{totalTokens.toLocaleString()}</span>
            </div>
            {providerEntries.length > 0 && (
              <div className="pt-2 space-y-2 border-t border-border">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Provider Mix</p>
                <div className="flex flex-wrap gap-2">
                  {providerEntries.map(([provider, data]) => (
                    <Badge
                      key={provider}
                      variant="outline"
                      className={providerBadgeClass(provider)}
                    >
                      {formatProviderLabel(provider)} · {formatCost(data.cost)}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-background/70 shadow-soft">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider flex items-center gap-2 text-muted-foreground">
              <TrendingUp size={14} className="text-success" /> Top Cost Driver
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {topFeature ? (
              <>
                <div className="flex items-center justify-between">
                  <Badge variant="secondary" className={getFeatureColor(topFeature[0])}>
                    {topFeature[0].replace(/_/g, " ")}
                  </Badge>
                  <span className="font-semibold text-foreground">{formatCost(topFeature[1].cost)}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {topFeature[1].calls.toLocaleString()} calls · {topFeature[1].tokens.toLocaleString()} tokens
                </div>
                <div className="h-2 rounded-full bg-muted/30 overflow-hidden">
                  <div
                    className="h-full bg-success/10"
                    style={{ width: `${Math.max(6, Math.min(100, totalCost > 0 ? (topFeature[1].cost / totalCost) * 100 : 0))}%` }}
                  />
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No AI usage yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {stats && Object.keys(stats.byFeature).length > 0 && (
        <Card className="border-border/60 bg-background/70 shadow-medium hover-elevate">
          <CardHeader className="border-b border-border/30 bg-muted/30">
            <CardTitle className="flex items-center gap-2 text-foreground text-base">
              <DollarSign size={18} className="text-success" />
              Cost Breakdown by Feature
            </CardTitle>
            <CardDescription className="text-muted-foreground text-sm">
              See how much each AI feature costs
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <div className="space-y-3">
              {featureEntries.map(([feature, data]) => {
                const share = totalCost > 0 ? (data.cost / totalCost) * 100 : 0;
                const avgCost = data.calls > 0 ? data.cost / data.calls : 0;
                const avgTokens = data.calls > 0 ? data.tokens / data.calls : 0;

                return (
                  <div key={feature} className="p-3 rounded-lg bg-background/60 border border-border/40 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Badge variant="secondary" className={getFeatureColor(feature)}>
                          {feature.replace(/_/g, " ")}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {data.calls.toLocaleString()} calls · {avgTokens.toFixed(0)} tokens/call
                        </span>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-foreground">{formatCost(data.cost)}</div>
                        <div className="text-xs text-muted-foreground">{formatCost(avgCost)} per call</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="h-2 flex-1 rounded-full bg-muted/30 overflow-hidden">
                        <div
                          className="h-full bg-primary/40"
                          style={{ width: `${Math.max(6, Math.min(100, share))}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">{share.toFixed(1)}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

	      <Card className="overflow-hidden border-border/60 bg-background/70 shadow-medium hover-elevate">
        <CardHeader className="border-b border-border/30 bg-muted/30">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-foreground text-base">
                <Activity size={18} className="text-primary" />
                Recent AI Calls
              </CardTitle>
              <CardDescription className="text-muted-foreground text-sm">
                Last 100 AI API requests with user and cost info
              </CardDescription>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  placeholder="Search user, feature, model..."
                  aria-label="Search AI usage logs"
                  className="pl-9 bg-muted border-border text-foreground placeholder:text-muted-foreground w-[220px]"
                  data-testid="input-ai-usage-search"
                />
              </div>
              <Select value={providerFilter} onValueChange={setProviderFilter}>
                <SelectTrigger className="bg-muted border-border text-foreground w-[160px]" data-testid="select-ai-provider">
                  <SelectValue placeholder="All providers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All providers</SelectItem>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="other">Other providers</SelectItem>
                </SelectContent>
              </Select>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={filteredLogs.length === 0 ? 0 : -1}>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        disabled={filteredLogs.length === 0}
                        onClick={() => {
                          const headers = ["Timestamp", "User", "Feature", "Provider", "Model", "Input Tokens", "Output Tokens", "Total Tokens", "Cost (micro $)", "Duration (ms)"];
                          const rows = filteredLogs.map(log => [
                            new Date(log.createdAt).toISOString(),
                            log.username || "System",
                            log.featureName,
                            log.provider || "unknown",
                            log.model,
                            log.inputTokens,
                            log.outputTokens,
                            log.totalTokens,
                            log.costMicroDollars,
                            log.durationMs ?? "",
                          ]);
                          const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
                          const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `ai-usage-${new Date().toISOString().slice(0, 10)}.csv`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                      >
                        <Download size={14} />
                        Export CSV
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {filteredLogs.length === 0 && (
                    <TooltipContent>
                      <p>No AI usage logs to export</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/40 hover:bg-transparent">
                  <TableHead className="text-muted-foreground">Time</TableHead>
                  <TableHead className="text-muted-foreground">User</TableHead>
                  <TableHead className="text-muted-foreground">Feature</TableHead>
                  <TableHead className="text-muted-foreground">Billed To</TableHead>
                  <TableHead className="text-muted-foreground">Model</TableHead>
                  <TableHead className="text-muted-foreground text-right">Tokens</TableHead>
                  <TableHead className="text-muted-foreground text-right">Cost</TableHead>
                  <TableHead className="text-muted-foreground text-right">Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((log) => (
                  <TableRow key={log.id} className="border-border/40" data-testid={`ai-log-${log.id}`}>
                    <TableCell className="text-muted-foreground text-xs">
                      {new Date(log.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-foreground">
                      {log.username || <span className="text-muted-foreground italic">System</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={getFeatureColor(log.featureName)}>
                        {log.featureName.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant="outline" 
                        className={providerBadgeClass(log.provider)}
                      >
                        {formatProviderLabel(log.provider)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs break-all">
                      {log.model}
                    </TableCell>
                    <TableCell className="text-right text-foreground">
                      {log.totalTokens.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-success">
                      {formatCost(log.costMicroDollars)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {log.durationMs ? `${(log.durationMs / 1000).toFixed(1)}s` : "-"}
                    </TableCell>
                  </TableRow>
                ))}
                {filteredLogs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No AI usage recorded yet. Run an EMAR analysis or generate a care plan to see data here.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
});

const AIProviderSection = memo(function AIProviderSection() {
  const { toast } = useToast();
  const [hasOpenAIKey, setHasOpenAIKey] = useState(false);
  const [hasPATKey, setHasPATKey] = useState(false);
  const [hasLocalLLM, setHasLocalLLM] = useState(false);
  const [testingLocalLLM, setTestingLocalLLM] = useState(false);
  const [savingLocalLLMUrl, setSavingLocalLLMUrl] = useState(false);
  const [updatingLocalWebPolicy, setUpdatingLocalWebPolicy] = useState(false);
  const [lastLocalCheckAt, setLastLocalCheckAt] = useState<string | null>(null);
  const [localLLMUrl, setLocalLLMUrl] = useState("");
  const [localLLMUrlInput, setLocalLLMUrlInput] = useState("");
  const [localLLMModel, setLocalLLMModel] = useState("qwen2.5-64k");
  const [requireLiveWebForLocal, setRequireLiveWebForLocal] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState<"openai" | "github" | "local">("openai");
  const [selectedModel, setSelectedModel] = useState("gpt-4.1-mini");
  const [useEmarAgent, setUseEmarAgent] = useState(true);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [updatingEmar, setUpdatingEmar] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const providerRes = await fetch("/api/admin/ai-provider", { credentials: "include" });
      const emarRes = await fetch("/api/admin/emar-agent", { credentials: "include" });
      
      if (providerRes.ok) {
        const data = await providerRes.json();
        setHasOpenAIKey(Boolean(data.hasOpenAIKey));
        setHasPATKey(Boolean(data.hasPATKey));
        setHasLocalLLM(Boolean(data.hasLocalLLM));
        setLocalLLMUrl(data.localLLMUrl || "");
        setLocalLLMUrlInput(data.localLLMUrl || "");
        if (data.localLLMModel) setLocalLLMModel(data.localLLMModel);
        setRequireLiveWebForLocal(data.requireLiveWebForLocal !== false);
        setSelectedProvider(data.provider || "openai");
        if (data.model) setSelectedModel(data.model);
      }
      
      if (emarRes.ok) {
        const data = await emarRes.json();
        setUseEmarAgent(Boolean(data.useEmarAgent));
      }
    } catch (error) {
      console.error("Failed to fetch AI settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleProviderChange = async (newProvider: "openai" | "github" | "local") => {
    if (newProvider === selectedProvider) return;
    
    // Check if the target provider is available
    if (newProvider === "openai" && !hasOpenAIKey) {
      toast({ title: "Provider Unavailable", description: "OpenAI API key is not configured.", variant: "destructive" });
      return;
    }
    if (newProvider === "github" && !hasPATKey) {
      toast({ title: "Provider Unavailable", description: "GitHub AI key (PAT_AI_KEY) is not configured.", variant: "destructive" });
      return;
    }
    if (newProvider === "local" && !hasLocalLLM) {
      toast({ title: "Provider Unavailable", description: `Local LLM not available at ${localLLMUrl}. Ensure the local-llm service is running.`, variant: "destructive" });
      return;
    }
    
    setUpdating(true);
    try {
      const res = await fetch("/api/admin/ai-provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ provider: newProvider }),
      });
      
      if (res.ok) {
        setSelectedProvider(newProvider);
        toast({ title: "Provider Updated", description: `Switched to ${newProvider} provider.` });
      } else {
        const data = await res.json();
        toast({ title: "Update Failed", description: data.message || "Failed to update provider", variant: "destructive" });
      }
    } catch (error) {
      console.error("Failed to update provider:", error);
      toast({ title: "Error", description: "Failed to update provider", variant: "destructive" });
    } finally {
      setUpdating(false);
    }
  };

  const handleEmarAgentToggle = async () => {
    const newValue = !useEmarAgent;
    
    setUpdatingEmar(true);
    try {
      const res = await fetch("/api/admin/emar-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ useEmarAgent: newValue }),
      });
      
      if (res.ok) {
        setUseEmarAgent(newValue);
        toast({ title: "EMAR Agent Updated", description: `EMAR agent ${newValue ? "enabled" : "disabled"}.` });
      } else {
        const data = await res.json();
        toast({ title: "Update Failed", description: data.message || "Failed to update EMAR agent preference", variant: "destructive" });
      }
    } catch (error) {
      console.error("Failed to update EMAR agent:", error);
      toast({ title: "Error", description: "Failed to update EMAR agent preference", variant: "destructive" });
    } finally {
      setUpdatingEmar(false);
    }
  };

  const handleRetestLocalLLM = async () => {
    setTestingLocalLLM(true);
    try {
      const res = await fetch("/api/admin/ai-provider", { credentials: "include" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || "Failed to refresh provider status");
      }

      const data = await res.json();
      const localAvailable = Boolean(data.hasLocalLLM);
      const nextLocalUrl = data.localLLMUrl || localLLMUrl;

      setHasOpenAIKey(Boolean(data.hasOpenAIKey));
      setHasPATKey(Boolean(data.hasPATKey));
      setHasLocalLLM(localAvailable);
      setLocalLLMUrl(nextLocalUrl);
      setLocalLLMUrlInput(nextLocalUrl);
      if (data.provider) setSelectedProvider(data.provider);
      if (data.model) setSelectedModel(data.model);
      setLastLocalCheckAt(new Date().toISOString());

      if (localAvailable) {
        toast({
          title: "Local LLM Reachable",
          description: `Connected at ${nextLocalUrl}.`,
        });
      } else {
        toast({
          title: "Local LLM Unreachable",
          description: `No response from ${nextLocalUrl}. Check your LM Studio/Ollama server and endpoint URL.`,
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("Failed to retest Local LLM:", error);
      toast({
        title: "Retest Failed",
        description: error?.message || "Failed to retest Local LLM",
        variant: "destructive",
      });
    } finally {
      setTestingLocalLLM(false);
    }
  };

  const handleSaveLocalLLMUrl = async () => {
    const nextUrl = localLLMUrlInput.trim();
    if (!nextUrl) {
      toast({ title: "URL Required", description: "Enter a Local LLM URL to save.", variant: "destructive" });
      return;
    }

    setSavingLocalLLMUrl(true);
    try {
      const res = await fetch("/api/admin/local-llm-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ url: nextUrl }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || "Failed to save Local LLM URL");
      }

      const data = await res.json();
      const savedUrl = data.localLLMUrl || nextUrl;
      const localAvailable = Boolean(data.hasLocalLLM);
      setLocalLLMUrl(savedUrl);
      setLocalLLMUrlInput(savedUrl);
      setHasLocalLLM(localAvailable);
      setLastLocalCheckAt(new Date().toISOString());

      toast({
        title: "Local LLM URL Saved",
        description: localAvailable
          ? `Saved and reachable at ${savedUrl}.`
          : `Saved, but currently unreachable at ${savedUrl}.`,
        variant: localAvailable ? "default" : "destructive",
      });
    } catch (error: any) {
      console.error("Failed to save Local LLM URL:", error);
      toast({
        title: "Save Failed",
        description: error?.message || "Failed to save Local LLM URL",
        variant: "destructive",
      });
    } finally {
      setSavingLocalLLMUrl(false);
    }
  };

  const handleLocalWebPolicyToggle = async () => {
    const nextValue = !requireLiveWebForLocal;
    setUpdatingLocalWebPolicy(true);
    try {
      const res = await fetch("/api/admin/local-web-policy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ requireLiveWebForLocal: nextValue }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || "Failed to update local web policy");
      }

      const data = await res.json();
      const enabled = Boolean(data.requireLiveWebForLocal);
      setRequireLiveWebForLocal(enabled);
      toast({
        title: "Local Web Policy Updated",
        description: enabled
          ? "Local medication/fetch AI tasks now require live internet/BNF access."
          : "Local medication/fetch AI tasks can run without live internet/BNF enforcement.",
      });
    } catch (error: any) {
      console.error("Failed to update local web policy:", error);
      toast({
        title: "Update Failed",
        description: error?.message || "Failed to update local web policy",
        variant: "destructive",
      });
    } finally {
      setUpdatingLocalWebPolicy(false);
    }
  };

  if (loading) {
    return (
      <Card className="border-border/60 bg-background/70 shadow-medium">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/60 bg-background/70 shadow-medium hover-elevate">
      <CardHeader className="border-b border-border/30 bg-muted/30">
        <CardTitle className="flex items-center gap-2 text-foreground text-base">
          <Cpu size={18} className="text-primary" />
          AI Configuration
        </CardTitle>
        <CardDescription className="text-muted-foreground text-sm">
          Configure AI provider, EMAR analysis method, and model strategy. All settings take effect immediately.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        <div>
          <h4 className="text-sm font-medium text-foreground mb-3">AI Provider</h4>
          
          {/* Provider Selection */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* OpenAI Card */}
            <button
              onClick={() => handleProviderChange("openai")}
              disabled={updating || !hasOpenAIKey}
              className={`p-4 rounded-lg border-2 text-left transition-all ${
                selectedProvider === "openai" 
                  ? "border-success/30 bg-success/10" 
                  : hasOpenAIKey 
                    ? "border-border/40 bg-muted/30 hover:border-success/30" 
                    : "border-border/40 bg-muted/40 opacity-60 cursor-not-allowed"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  hasOpenAIKey ? "bg-success/10" : "bg-muted/50"
                }`}>
                  <Cpu size={20} className={hasOpenAIKey ? "text-success" : "text-muted-foreground/60"} />
                </div>
                <div>
                  <div className="font-medium text-foreground">OpenAI</div>
                  <div className="text-xs text-muted-foreground">
                    {hasOpenAIKey ? "API configured" : "Key not set"}
                  </div>
                </div>
              </div>
              <Badge
                variant="secondary"
                className={`mt-2 ${
                  selectedProvider === "openai"
                    ? "bg-success/10 text-success"
                    : hasOpenAIKey
                      ? "bg-muted/50 text-muted-foreground"
                      : "bg-warning/10 text-warning"
                }`}
              >
                {!hasOpenAIKey ? "Key Missing" : selectedProvider === "openai" ? "Active" : "Available"}
              </Badge>
            </button>
            
            {/* GitHub AI Card */}
            <button
              onClick={() => handleProviderChange("github")}
              disabled={updating || !hasPATKey}
              className={`p-4 rounded-lg border-2 text-left transition-all ${
                selectedProvider === "github" 
                  ? "border-primary/50 bg-primary/5" 
                  : hasPATKey 
                    ? "border-border/40 bg-muted/30 hover:border-primary/40" 
                    : "border-border/40 bg-muted/40 opacity-60 cursor-not-allowed"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  hasPATKey ? "bg-primary/20" : "bg-muted/50"
                }`}>
                  <Cpu size={20} className={hasPATKey ? "text-primary" : "text-muted-foreground/60"} />
                </div>
                <div>
                  <div className="font-medium text-foreground">GitHub AI</div>
                  <div className="text-xs text-muted-foreground">
                    {hasPATKey ? "PAT configured" : "PAT not set"}
                  </div>
                </div>
              </div>
              <Badge
                variant="secondary"
                className={`mt-2 ${
                  selectedProvider === "github"
                    ? "bg-primary/20 text-primary"
                    : hasPATKey
                      ? "bg-muted/50 text-muted-foreground"
                      : "bg-warning/10 text-warning"
                }`}
              >
                {!hasPATKey ? "Key Missing" : selectedProvider === "github" ? "Active" : "Available"}
              </Badge>
            </button>
            
            {/* Local LLM Card */}
            <button
              onClick={() => handleProviderChange("local")}
              disabled={updating || !hasLocalLLM}
              className={`p-4 rounded-lg border-2 text-left transition-all ${
                selectedProvider === "local" 
                  ? "border-secondary/50 bg-secondary/5" 
                  : hasLocalLLM 
                    ? "border-border/40 bg-muted/30 hover:border-secondary/40" 
                    : "border-border/40 bg-muted/40 opacity-60 cursor-not-allowed"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  hasLocalLLM ? "bg-secondary/20" : "bg-muted/50"
                }`}>
                  <Server size={20} className={hasLocalLLM ? "text-secondary" : "text-muted-foreground/60"} />
                </div>
                <div>
                  <div className="font-medium text-foreground">Local ({localLLMModel.split("/").pop() || localLLMModel})</div>
                  <div className="text-xs text-muted-foreground">
                    {hasLocalLLM ? "LLM running" : "Not available"}
                  </div>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge
                  variant="secondary"
                  className={`${
                    selectedProvider === "local"
                      ? "bg-secondary/20 text-secondary"
                      : hasLocalLLM
                        ? "bg-muted/50 text-muted-foreground"
                        : "bg-warning/10 text-warning"
                  }`}
                >
                  {!hasLocalLLM ? "Offline" : selectedProvider === "local" ? "Active" : "Available"}
                </Badge>
                <Badge
                  variant="outline"
                  className={requireLiveWebForLocal ? "border-secondary/35 bg-secondary/10 text-secondary" : "border-border/60 bg-muted/40 text-muted-foreground"}
                >
                  {requireLiveWebForLocal ? "Web Policy: Enforced" : "Web Policy: Permissive"}
                </Badge>
              </div>
            </button>
          </div>
          
          {updating && (
            <div className="flex items-center justify-center mt-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mr-2" />
              <span className="text-xs text-muted-foreground">Switching provider...</span>
            </div>
          )}

          <div className="mt-3 flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRetestLocalLLM}
              disabled={testingLocalLLM || savingLocalLLMUrl || updating}
              className="h-8"
              data-testid="button-test-local-llm"
            >
              {testingLocalLLM ? (
                <>
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  Testing Local LLM...
                </>
              ) : (
                <>
                  <RefreshCcw className="mr-2 h-3.5 w-3.5" />
                  Test Local LLM
                </>
              )}
            </Button>
            {lastLocalCheckAt && (
              <span className="text-xs text-muted-foreground">
                Last checked {new Date(lastLocalCheckAt).toLocaleTimeString()}
              </span>
            )}
          </div>

          <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center">
            <Input
              value={localLLMUrlInput}
              onChange={(e) => setLocalLLMUrlInput(e.target.value)}
              placeholder="https://your-cloudflare-tunnel.trycloudflare.com"
              className="h-8 md:max-w-[560px]"
              disabled={savingLocalLLMUrl || testingLocalLLM || updating}
              data-testid="input-local-llm-url"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSaveLocalLLMUrl}
              disabled={savingLocalLLMUrl || testingLocalLLM || updating}
              className="h-8"
              data-testid="button-save-local-llm-url"
            >
              {savingLocalLLMUrl ? (
                <>
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save URL"
              )}
            </Button>
          </div>
          
          {selectedProvider === "local" && (
            <div className="mt-3 p-3 bg-secondary/10 rounded-lg border border-secondary/20">
              <div className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Local LLM ({localLLMModel.split("/").pop() || localLLMModel})</span> - All data stays on your servers. No external API calls. $0 cost.
              </div>

              <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-secondary/30 bg-background/70 p-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-medium text-foreground">Require live web/BNF access</span>
                  <span className="text-[11px] text-muted-foreground">
                    When enabled, Local medication/fetch tasks fail fast if internet access to BNF is unavailable.
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {updatingLocalWebPolicy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                  <Switch
                    checked={requireLiveWebForLocal}
                    onCheckedChange={handleLocalWebPolicyToggle}
                    disabled={updatingLocalWebPolicy || updating || testingLocalLLM || savingLocalLLMUrl}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border/30 pt-6">
          <h4 className="text-sm font-medium text-foreground mb-3">EMAR Analysis Method</h4>
          
          {/* EMAR Agent Toggle */}
          <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30 mb-3">
            <div className="flex items-center gap-3">
              <div className="flex flex-col">
                <span className="text-sm font-medium text-foreground">Use EMAR Agent</span>
                <span className="text-xs text-muted-foreground">
                  Advanced AI extraction for thorough discrepancy detection
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {updatingEmar && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              <Switch
                checked={useEmarAgent}
                onCheckedChange={handleEmarAgentToggle}
                disabled={updatingEmar}
              />
            </div>
          </div>
          
          <div className="p-3 bg-primary/10 rounded-lg border border-primary/20">
            <div className="text-xs text-muted-foreground space-y-1">
              <div className="flex items-start gap-2">
                <Badge variant="secondary" className="bg-primary/20 text-primary border-primary/30 shrink-0">
                  {useEmarAgent ? selectedModel : "Standard"}
                </Badge>
                <span className="font-medium text-foreground">
                  {useEmarAgent 
                    ? "Using advanced EMAR agent for maximum accuracy and completeness"
                    : "Using standard extraction (faster, less thorough)"}
                </span>
              </div>
              {useEmarAgent && (
                <div className="ml-[66px] text-xs">
                  • 3-pass consensus extraction<br/>
                  • Drug interaction checks<br/>
                  • Enhanced metadata detection<br/>
                  • Comprehensive discrepancy analysis
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-border/30 pt-6">
          <h4 className="text-sm font-medium text-foreground mb-3">AI Model Strategy</h4>
          <div className="p-4 bg-primary/10 rounded-lg border border-primary/20">
            <div className="font-medium text-foreground mb-2">Optimized Tiered Approach</div>
            <div className="text-xs text-muted-foreground space-y-2">
              <div className="flex items-start gap-2">
                <Badge variant="secondary" className="bg-primary/20 text-primary border-primary/30 shrink-0">{selectedModel}</Badge>
                <span>Core EMAR extraction (accuracy critical)</span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="secondary" className="bg-success/10 text-success border-success/30 shrink-0">{selectedModel}</Badge>
                <span>Count validation, equivalence checks, drug interactions, validation passes (cost-efficient with temperature support)</span>
              </div>
            </div>
          </div>
        </div>

        <AIOptimizationSection />

        <div className="p-3 bg-muted/30 rounded-lg border border-border/40 text-xs text-muted-foreground">
          <strong className="text-foreground">Note:</strong> AI models are automatically selected based on task complexity. 
          Drug interaction checks are computed on each run to avoid reusing previous responses.
          Currently using: <strong className="text-foreground">{selectedProvider === "openai" ? "OpenAI" : selectedProvider === "github" ? "GitHub AI" : `Local (${localLLMModel.split("/").pop() || localLLMModel})`}</strong> provider
          {useEmarAgent ? " with advanced EMAR agent enabled" : " with standard EMAR extraction"}.
        </div>
      </CardContent>
    </Card>
  );
});

// AI Optimization Settings Component - reduces API calls and costs
const AIOptimizationSection = memo(function AIOptimizationSection() {
  const [showClearCacheConfirm, setShowClearCacheConfirm] = useState(false);
  const [useCache, setUseCache] = useState(true);
  const [useRulesFirst, setUseRulesFirst] = useState(true);
  const [liteMode, setLiteMode] = useState(false);
  const [cacheStats, setCacheStats] = useState<{
    size: number;
    maxSize: number;
    hits: number;
    misses: number;
    hitRate: string;
    tokensSaved: number;
    evictions: number;
    estimatedCostSaved: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    fetchOptimizationSettings();
  }, []);

  const fetchOptimizationSettings = async () => {
    try {
      const res = await fetch("/api/admin/ai-optimization", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setUseCache(data.useCache);
        setUseRulesFirst(data.useRulesFirst);
        setLiteMode(data.liteMode);
        setCacheStats(data.cacheStats);
      }
    } catch (error) {
      console.error("Failed to fetch AI optimization settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const updateSetting = async (key: string, value: boolean) => {
    setUpdating(true);
    try {
      const res = await fetch("/api/admin/ai-optimization", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ [key]: value }),
      });
      if (res.ok) {
        const data = await res.json();
        setUseCache(data.useCache);
        setUseRulesFirst(data.useRulesFirst);
        setLiteMode(data.liteMode);
        setCacheStats(data.cacheStats);
      }
    } catch (error) {
      console.error("Failed to update AI optimization setting:", error);
    } finally {
      setUpdating(false);
    }
  };

  const clearCache = async () => {
    setShowClearCacheConfirm(false);
    setUpdating(true);
    try {
      const res = await fetch("/api/admin/ai-optimization", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ clearCacheNow: true }),
      });
      if (res.ok) {
        const data = await res.json();
        setCacheStats(data.cacheStats);
      }
    } catch (error) {
      console.error("Failed to clear cache:", error);
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
    <div className="border-t border-border/30 pt-6">
      <h4 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
        <Zap size={16} className="text-warning" />
        AI Optimization (Cost Reduction)
      </h4>
      
      <div className="space-y-3">
        {/* Cache Toggle */}
        <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
          <div>
            <span className="text-sm font-medium text-foreground">Response Caching</span>
            <p className="text-xs text-muted-foreground">Cache identical AI requests (24h TTL)</p>
          </div>
          <Switch
            checked={useCache}
            onCheckedChange={(v) => { setUseCache(v); updateSetting("useCache", v); }}
            disabled={updating}
          />
        </div>

        {/* Rules-First Toggle */}
        <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
          <div>
            <span className="text-sm font-medium text-foreground">Rules-First Engine</span>
            <p className="text-xs text-muted-foreground">Use deterministic patterns before AI</p>
          </div>
          <Switch
            checked={useRulesFirst}
            onCheckedChange={(v) => { setUseRulesFirst(v); updateSetting("useRulesFirst", v); }}
            disabled={updating}
          />
        </div>

        {/* Lite Mode Toggle */}
        <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
          <div>
            <span className="text-sm font-medium text-foreground">Lite Mode</span>
            <p className="text-xs text-muted-foreground">Minimal prompts for faster/cheaper calls</p>
          </div>
          <Switch
            checked={liteMode}
            onCheckedChange={(v) => { setLiteMode(v); updateSetting("liteMode", v); }}
            disabled={updating}
          />
        </div>
      </div>

      {/* Cache Stats */}
      {cacheStats && (
        <div className="mt-4 p-3 bg-warning/10 rounded-lg border border-warning/20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-foreground">Cache Statistics</span>
            <button
              onClick={() => setShowClearCacheConfirm(true)}
              disabled={updating}
              className="text-xs text-destructive hover:text-destructive/80 disabled:opacity-50"
            >
              Clear Cache
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="bg-background/60 rounded p-2 text-center">
              <div className="font-semibold text-foreground">{cacheStats.hitRate}</div>
              <div className="text-muted-foreground">Hit Rate</div>
            </div>
            <div className="bg-background/60 rounded p-2 text-center">
              <div className="font-semibold text-foreground">{cacheStats.tokensSaved.toLocaleString()}</div>
              <div className="text-muted-foreground">Tokens Saved</div>
            </div>
            <div className="bg-background/60 rounded p-2 text-center">
              <div className="font-semibold text-success">{cacheStats.estimatedCostSaved}</div>
              <div className="text-muted-foreground">Cost Saved</div>
            </div>
          </div>
          <div className="text-xs text-muted-foreground mt-2 text-center">
            {cacheStats.size}/{cacheStats.maxSize} entries in cache ({cacheStats.hits} hits / {cacheStats.misses} misses{cacheStats.evictions > 0 ? ` / ${cacheStats.evictions} evictions` : ""})
          </div>
        </div>
      )}
      
      {/* Feature Benefits Summary */}
      <div className="mt-4 p-3 bg-success/10 rounded-lg border border-success/30">
        <span className="text-xs font-medium text-foreground mb-2 block">Optimization Benefits</span>
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Response Caching:</span>
            <span className={`font-medium ${useCache ? "text-success" : "text-muted-foreground"}`}>
              {useCache ? "~30% API cost reduction" : "Disabled"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Rules-First Engine:</span>
            <span className={`font-medium ${useRulesFirst ? "text-success" : "text-muted-foreground"}`}>
              {useRulesFirst ? "~40% fewer AI calls" : "Disabled"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Lite Mode:</span>
            <span className={`font-medium ${liteMode ? "text-success" : "text-muted-foreground"}`}>
              {liteMode ? "~25% smaller prompts" : "Disabled"}
            </span>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-success/30">
            <span className="text-muted-foreground font-medium">Estimated Total Savings:</span>
            <span className="font-semibold text-success">
              ~{((useCache ? 30 : 0) + (useRulesFirst ? 40 : 0) + (liteMode ? 15 : 0))}%
            </span>
          </div>
        </div>
      </div>
    </div>

    <Dialog open={showClearCacheConfirm} onOpenChange={setShowClearCacheConfirm}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Clear AI Cache</DialogTitle>
          <DialogDescription>
            Clear the entire AI response cache? This will force fresh API calls for all subsequent requests.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowClearCacheConfirm(false)}>Cancel</Button>
          <Button variant="destructive" onClick={clearCache}>Clear Cache</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
});

// RiskAssessmentLogsSection, AuditTrailSection, and UnifiedSystemLogSection
// were removed as dead code — their functionality is covered by the Operations
// Command Center and the System Log dialog.

interface UserPresence {
  id: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  status: string;
  jobTitle: string | null;
  suspendedUntil: string | null;
  lastOnlineAt: string | null;
  isOnline: boolean;
  currentSession: { 
    createdAt: string; 
    lastActivity: string;
    ipAddress?: string | null;
    city?: string | null;
    region?: string | null;
    country?: string | null;
  } | null;
}

interface BlockedIp {
  id: string;
  ipAddress: string;
  blockedBy: string;
  reason: string | null;
  username: string | null;
  createdAt: string;
}

const ActivePresenceSection = memo(function ActivePresenceSection() {
  const [users, setUsers] = useState<UserPresence[]>([]);
  const [loading, setLoading] = useState(true);
  const [suspendingUser, setSuspendingUser] = useState<string | null>(null);
  const [suspendDuration, setSuspendDuration] = useState(5);
  const [suspendReason, setSuspendReason] = useState("");
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [blockingIp, setBlockingIp] = useState<{ip: string; username: string} | null>(null);
  const [blockReason, setBlockReason] = useState("");
  const { toast } = useToast();

  const toggleExpanded = (userId: string) => {
    setExpandedUsers(prev => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const handleBlockIp = async () => {
    if (!blockingIp || !blockingIp.ip || blockingIp.ip === "Unknown") {
      toast({ title: "Error", description: "Cannot block - no valid IP address.", variant: "destructive" });
      return;
    }
    try {
      const response = await fetch("/api/admin/block-ip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          ipAddress: blockingIp.ip, 
          reason: blockReason || undefined,
          username: blockingIp.username,
        }),
        credentials: "include",
      });
      if (response.ok) {
        toast({ title: "IP Blocked", description: `${blockingIp.ip} has been blocked.` });
        setBlockingIp(null);
        setBlockReason("");
        fetchPresence();
      } else {
        const data = await response.json();
        toast({ title: "Error", description: data.message, variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to block IP.", variant: "destructive" });
    }
  };

  useEffect(() => {
    fetchPresence();
    const interval = setInterval(fetchPresence, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchPresence = async () => {
    try {
      const response = await fetch("/api/admin/users-presence", { credentials: "include" });
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      }
    } catch (error) {
      console.error("Failed to fetch presence:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSuspend = async (userId: string) => {
    try {
      const response = await fetch(`/api/admin/users/${userId}/suspend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ durationMinutes: suspendDuration, reason: suspendReason || undefined }),
        credentials: "include",
      });
      if (response.ok) {
        toast({ title: "User Suspended", description: `User suspended for ${suspendDuration} minutes.` });
        setSuspendingUser(null);
        setSuspendDuration(5);
        setSuspendReason("");
        fetchPresence();
      } else {
        const data = await response.json();
        toast({ title: "Error", description: data.message, variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to suspend user.", variant: "destructive" });
    }
  };

  const handleKick = async (userId: string) => {
    try {
      const response = await fetch(`/api/admin/users/${userId}/kick`, {
        method: "POST",
        credentials: "include",
      });
      if (response.ok) {
        toast({ title: "User Kicked", description: "User has been logged out." });
        fetchPresence();
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to kick user.", variant: "destructive" });
    }
  };

  const handleReinstate = async (userId: string) => {
    try {
      const response = await fetch(`/api/admin/users/${userId}/reinstate`, {
        method: "POST",
        credentials: "include",
      });
      if (response.ok) {
        toast({ title: "User Reinstated", description: "Suspension has been lifted." });
        fetchPresence();
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to reinstate user.", variant: "destructive" });
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "-";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const getSessionDuration = (session: { createdAt: string } | null) => {
    if (!session) return "-";
    const start = new Date(session.createdAt);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - start.getTime()) / 1000);
    return formatDuration(seconds);
  };

  const onlineUsers = useMemo(() => users.filter(u => u.isOnline), [users]);
  const offlineUsers = useMemo(() => users.filter(u => !u.isOnline && u.role !== "admin"), [users]);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
	      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border/30 bg-muted/30">
          <CardTitle className="flex items-center gap-2 text-foreground text-base">
            <Activity size={18} className="text-success" />
            Online Users ({onlineUsers.length})
          </CardTitle>
          <CardDescription className="text-muted-foreground text-xs">Click on a user to see more details</CardDescription>
        </CardHeader>
        <CardContent className="p-4 space-y-2">
          {onlineUsers.map((user) => {
            const isExpanded = expandedUsers.has(user.id);
            const ipAddress = user.currentSession?.ipAddress || "Unknown";
            const location = [user.currentSession?.city, user.currentSession?.region, user.currentSession?.country]
              .filter(Boolean).join(", ") || null;
            
            return (
              <div 
                key={user.id} 
                className="border border-border rounded-lg overflow-hidden transition-all"
                data-testid={`card-presence-${user.id}`}
              >
                <div 
                  className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => toggleExpanded(user.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpanded(user.id); } }}
                  role="button"
                  tabIndex={0}
                  aria-expanded={isExpanded}
                  aria-label={`${user.username} session details`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-2.5 w-2.5 rounded-full bg-success animate-pulse shrink-0" />
                    <div className="min-w-0">
                      <span className="font-medium text-foreground break-all">{user.username}</span>
                      <Badge variant="outline" className={`ml-2 text-xs ${user.role === "admin" ? "border-primary/50 text-primary" : "border-border text-foreground"}`}>
                        {user.role}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm text-muted-foreground font-mono">{getSessionDuration(user.currentSession)}</span>
                    <svg 
                      className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
                
                {isExpanded && (
                  <div className="border-t border-border bg-muted/30 p-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">IP Address</p>
                        <p className="text-sm text-foreground font-mono break-all">{ipAddress}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Last Activity</p>
                        <p className="text-sm text-foreground">
                          {user.currentSession?.lastActivity ? new Date(user.currentSession.lastActivity).toLocaleTimeString() : "-"}
                        </p>
                      </div>
                      {location && (
                        <div className="md:col-span-2">
                          <p className="text-xs text-muted-foreground mb-1">Approximate Location</p>
                          <p className="text-sm text-foreground break-words">{location}</p>
                        </div>
                      )}
                    </div>
                    
                    {user.role !== "admin" && (
                      <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="border-destructive/30 text-destructive hover:bg-destructive/10"
                          onClick={(e) => { e.stopPropagation(); handleKick(user.id); }}
                          data-testid={`button-kick-${user.id}`}
                        >
                          <UserX size={14} className="mr-1" /> End Session
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="border-warning/50 text-warning hover:bg-warning"
                          onClick={(e) => { e.stopPropagation(); setSuspendingUser(user.id); }}
                          data-testid={`button-suspend-${user.id}`}
                        >
                          <Clock size={14} className="mr-1" /> Suspend
                        </Button>
                        {ipAddress !== "Unknown" && (
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="border-destructive/50 text-destructive hover:bg-destructive/10"
                            onClick={(e) => { e.stopPropagation(); setBlockingIp({ ip: ipAddress, username: user.username }); }}
                            data-testid={`button-block-ip-${user.id}`}
                          >
                            <Shield size={14} className="mr-1" /> Block IP
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {onlineUsers.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">No users currently online.</div>
          )}
        </CardContent>
      </Card>

	      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border/30 bg-muted/30">
          <CardTitle className="flex items-center gap-2 text-foreground text-base">
            <EyeOff size={18} className="text-muted-foreground" />
            Offline Staff ({offlineUsers.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-border/30 hover:bg-transparent">
                <TableHead className="text-muted-foreground font-medium">User</TableHead>
                <TableHead className="text-muted-foreground font-medium">Status</TableHead>
                <TableHead className="text-muted-foreground font-medium">Last Online</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {offlineUsers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                    No offline staff members.
                  </TableCell>
                </TableRow>
              )}
              {offlineUsers.slice(0, 10).map((user) => (
                <TableRow key={user.id} className="border-border/30 hover:bg-muted/20">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-muted-foreground" />
                      <span className="text-muted-foreground break-all min-w-0">{user.username}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {user.suspendedUntil && new Date(user.suspendedUntil) > new Date() ? (
                      <div className="flex items-center gap-2">
                        <Badge variant="destructive" className="text-xs">Suspended</Badge>
                        <Button size="sm" variant="ghost" className="text-xs text-success hover:text-success/80" onClick={() => handleReinstate(user.id)}>Reinstate</Button>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">Offline</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {user.lastOnlineAt ? new Date(user.lastOnlineAt).toLocaleString() : "Never"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
        {offlineUsers.length > 10 && (
          <CardFooter className="border-t py-3 border-border/30 bg-muted/30">
            <p className="text-xs text-muted-foreground">
              Showing 10 of {offlineUsers.length} offline staff
            </p>
          </CardFooter>
        )}
      </Card>

      <Dialog open={!!suspendingUser} onOpenChange={() => setSuspendingUser(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Suspend User</DialogTitle>
            <DialogDescription className="text-muted-foreground">Set the suspension duration (2 minutes to 24 hours).</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground">Duration: {suspendDuration} minutes</Label>
              <Slider value={[suspendDuration]} onValueChange={(v) => setSuspendDuration(v[0])} min={2} max={1440} step={1} className="w-full" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>2 min</span><span>1 hour</span><span>24 hours</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">Reason (optional)</Label>
              <Input value={suspendReason} onChange={(e) => setSuspendReason(e.target.value)} placeholder="Enter reason..." className="bg-muted border-border text-foreground" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspendingUser(null)} className="border-border text-foreground">Cancel</Button>
            <Button onClick={() => suspendingUser && handleSuspend(suspendingUser)} className="bg-warning hover:bg-warning/100 text-white">Suspend User</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!blockingIp} onOpenChange={() => { setBlockingIp(null); setBlockReason(""); }}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Block IP Address</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              This will prevent anyone from logging in from IP: <span className="font-mono text-foreground break-all">{blockingIp?.ip}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground">Associated User</Label>
              <p className="text-sm text-foreground break-all">{blockingIp?.username || "Unknown"}</p>
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">Reason (optional)</Label>
              <Input 
                value={blockReason} 
                onChange={(e) => setBlockReason(e.target.value)} 
                placeholder="Enter reason for blocking..." 
                className="bg-muted border-border text-foreground" 
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setBlockingIp(null); setBlockReason(""); }} className="border-border text-foreground">Cancel</Button>
            <Button onClick={handleBlockIp} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">Block IP</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});

const BlockedIpsSection = memo(function BlockedIpsSection() {
  const [blockedIps, setBlockedIps] = useState<BlockedIp[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchBlockedIps();
  }, []);

  const fetchBlockedIps = async () => {
    try {
      const response = await fetch("/api/admin/blocked-ips", { credentials: "include" });
      if (response.ok) {
        const data = await response.json();
        setBlockedIps(data);
      }
    } catch (error) {
      console.error("Failed to fetch blocked IPs:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleUnblock = async (id: string) => {
    try {
      const response = await fetch(`/api/admin/blocked-ips/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (response.ok) {
        toast({ title: "IP Unblocked", description: "The IP address has been unblocked." });
        fetchBlockedIps();
      } else {
        toast({ title: "Error", description: "Failed to unblock IP.", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to unblock IP.", variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
	    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/30 bg-muted/30">
        <CardTitle className="flex items-center gap-2 text-foreground text-base">
          <Shield size={18} className="text-destructive" />
          Blocked IP Addresses ({blockedIps.length})
        </CardTitle>
        <CardDescription className="text-muted-foreground text-xs">
          IP addresses that are blocked from logging in
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="border-border/30 hover:bg-transparent">
              <TableHead className="text-muted-foreground font-medium">IP Address</TableHead>
              <TableHead className="text-muted-foreground font-medium">Associated User</TableHead>
              <TableHead className="text-muted-foreground font-medium">Blocked By</TableHead>
              <TableHead className="text-muted-foreground font-medium">Reason</TableHead>
              <TableHead className="text-muted-foreground font-medium">Blocked At</TableHead>
              <TableHead className="text-muted-foreground font-medium text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {blockedIps.map((blocked) => (
              <TableRow key={blocked.id} className="border-border/30 hover:bg-muted/20" data-testid={`row-blocked-ip-${blocked.id}`}>
                <TableCell className="font-mono text-foreground break-all">{blocked.ipAddress}</TableCell>
                <TableCell className="text-muted-foreground break-all">{blocked.username || "-"}</TableCell>
                <TableCell className="text-muted-foreground break-words">{blocked.blockedBy}</TableCell>
                <TableCell className="text-muted-foreground break-words">{blocked.reason || "-"}</TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {new Date(blocked.createdAt).toLocaleString()}
                </TableCell>
                <TableCell className="text-right">
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="border-success/30 text-success hover:bg-success/10"
                    onClick={() => handleUnblock(blocked.id)}
                    data-testid={`button-unblock-${blocked.id}`}
                  >
                    <Check size={14} className="mr-1" /> Unblock
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {blockedIps.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No blocked IP addresses.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
});

interface SystemLog {
  id: string | number;
  user: string;
  action: string;
  target: string;
  time: string;
  status: string;
  alert?: string;
}

interface PolicyDocument {
  id: string;
  name: string;
  category: string;
  content: string;
  version: string | null;
  lastUpdated: string;
  createdAt: string;
}

const POLICY_CATEGORIES = [
  { value: "medication", label: "Medication Policy" },
  { value: "emar_audit", label: "EMAR Audit SOP" },
  { value: "visit_audit", label: "Visit Audit SOP" },
  { value: "care_plan", label: "Care Plan Template" },
  { value: "care_tasks", label: "Approved Care Tasks" },
  { value: "initial_assessment", label: "Initial Assessment Template" },
  { value: "risk_assessment", label: "Risk Assessment Guidelines" },
];

const PolicyDocumentsSection = memo(function PolicyDocumentsSection() {
  const [documents, setDocuments] = useState<PolicyDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadName, setUploadName] = useState("");
  const [uploadCategory, setUploadCategory] = useState("");
  const [uploadVersion, setUploadVersion] = useState("1.0");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      const response = await fetch("/api/policy-documents", { credentials: "include" });
      if (response.ok) {
        const data = await response.json();
        setDocuments(data);
      }
    } catch (error) {
      console.error("Failed to fetch policy documents:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!uploadName || !uploadCategory) {
      toast({ title: "Error", description: "Please enter a name and select a category first", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", uploadName);
      formData.append("category", uploadCategory);
      formData.append("version", uploadVersion);

      const response = await fetch("/api/policy-documents/upload", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (response.ok) {
        toast({ title: "Success", description: "Policy document uploaded successfully" });
        setUploadName("");
        setUploadCategory("");
        setUploadVersion("1.0");
        fetchDocuments();
      } else {
        const data = await response.json();
        toast({ title: "Error", description: data.message || "Failed to upload document", variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleDelete = async (id: string) => {
    setDeleteConfirmId(null);
    try {
      const response = await fetch(`/api/policy-documents/${id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (response.ok) {
        toast({ title: "Success", description: "Policy document deleted" });
        fetchDocuments();
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete document", variant: "destructive" });
    }
  };

  const getCategoryLabel = (category: string) => {
    return POLICY_CATEGORIES.find(c => c.value === category)?.label || category;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="border-b border-border/30 bg-muted/30">
          <CardTitle className="flex items-center gap-2 text-foreground text-base">
            <Upload size={18} className="text-primary" />
            Upload Policy Document
          </CardTitle>
          <CardDescription className="text-muted-foreground text-sm">
            Upload PDF or Word documents containing your facility's policies. These will be used as reference by all AI analysis features.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Input
              placeholder="Document name"
              value={uploadName}
              onChange={(e) => setUploadName(e.target.value)}
              className="bg-muted border-border text-foreground"
              data-testid="input-policy-name"
            />
            <Select value={uploadCategory} onValueChange={setUploadCategory}>
              <SelectTrigger className="bg-muted border-border text-foreground" data-testid="select-policy-category">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {POLICY_CATEGORIES.map(cat => (
                  <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Version (e.g., 1.0)"
              value={uploadVersion}
              onChange={(e) => setUploadVersion(e.target.value)}
              className="bg-muted border-border text-foreground"
              data-testid="input-policy-version"
            />
            <div className="relative">
              <input
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={handleUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                disabled={uploading || !uploadName || !uploadCategory}
                data-testid="input-policy-file"
              />
              <Button 
                className="w-full" 
                disabled={uploading || !uploadName || !uploadCategory}
                data-testid="button-upload-policy"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                {uploading ? "Uploading..." : "Upload File"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

	      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border/30 bg-muted/30">
          <CardTitle className="flex items-center gap-2 text-foreground text-base">
            <FileText size={18} className="text-success" />
            Uploaded Policy Documents
          </CardTitle>
          <CardDescription className="text-muted-foreground text-sm">
            These documents are injected into AI prompts to ensure analysis follows your facility's specific policies.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-border/30 hover:bg-transparent">
                <TableHead className="text-muted-foreground font-medium">Name</TableHead>
                <TableHead className="text-muted-foreground font-medium">Category</TableHead>
                <TableHead className="text-muted-foreground font-medium">Version</TableHead>
                <TableHead className="text-muted-foreground font-medium">Last Updated</TableHead>
                <TableHead className="text-muted-foreground font-medium text-center">Content Length</TableHead>
                <TableHead className="text-muted-foreground font-medium text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((doc) => (
                <TableRow key={doc.id} className="border-border/30 hover:bg-muted/20 transition-colors" data-testid={`row-policy-${doc.id}`}>
                  <TableCell className="font-medium text-foreground break-words">{doc.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                      {getCategoryLabel(doc.category)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{doc.version || "1.0"}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(doc.lastUpdated).toLocaleDateString("en-GB")}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary" className="bg-muted/50 text-foreground">
                      {Math.round(doc.content.length / 1000)}K chars
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive/80 hover:bg-destructive/10"
                      onClick={() => setDeleteConfirmId(doc.id)}
                      data-testid={`button-delete-policy-${doc.id}`}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {documents.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No policy documents uploaded yet. Upload your facility's policies above.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Delete Policy Document Confirmation */}
      <Dialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete Policy Document</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this policy document? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}>
              <Trash2 size={14} className="mr-2" /> Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});

const ContactMessagesSection = memo(function ContactMessagesSection() {
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<ContactMessage | null>(null);
  const [messageSearch, setMessageSearch] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    fetchMessages();
  }, [showArchived]);

  const fetchMessages = async () => {
    try {
      const response = await fetch(`/api/contact/messages?includeArchived=${showArchived}`, {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        setMessages(data);
      }
    } catch (error) {
      console.error("Failed to fetch contact messages:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkRead = async (id: string) => {
    try {
      const response = await fetch(`/api/contact/messages/${id}/read`, {
        method: "PATCH",
        credentials: "include",
      });
      if (response.ok) {
        setMessages(messages.map(m => 
          m.id === id ? { ...m, isRead: true } : m
        ));
        if (selectedMessage?.id === id) {
          setSelectedMessage({ ...selectedMessage, isRead: true });
        }
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to mark message as read", variant: "destructive" });
    }
  };

  const handleArchive = async (id: string) => {
    try {
      const response = await fetch(`/api/contact/messages/${id}/archive`, {
        method: "PATCH",
        credentials: "include",
      });
      if (response.ok) {
        toast({ title: "Archived", description: "Message has been archived" });
        setMessages(messages.filter(m => m.id !== id));
        setSelectedMessage(null);
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to archive message", variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/contact/messages/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (response.ok) {
        toast({ title: "Deleted", description: "Message has been deleted" });
        setMessages(messages.filter(m => m.id !== id));
        setSelectedMessage(null);
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete message", variant: "destructive" });
    }
  };

  const unreadCount = useMemo(() => messages.filter(m => !m.isRead).length, [messages]);

  const filteredMessages = useMemo(() => {
    if (!messageSearch) return messages;
    const q = messageSearch.toLowerCase();
    return messages.filter(m => 
      m.name.toLowerCase().includes(q) || 
      m.email.toLowerCase().includes(q) || 
      m.message.toLowerCase().includes(q)
    );
  }, [messages, messageSearch]);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Mail size={14} className="text-primary" /> Total Messages
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-primary">{messages.length}</div>
            <p className="text-xs text-muted-foreground">Contact form submissions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <MailOpen size={14} className="text-warning" /> Unread
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-warning">{unreadCount}</div>
            <p className="text-xs text-muted-foreground">Awaiting review</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Archive size={14} className="text-muted-foreground" /> View
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Switch
                checked={showArchived}
                onCheckedChange={setShowArchived}
              />
              <span className="text-sm text-muted-foreground">
                {showArchived ? "Including archived" : "Active only"}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Messages List */}
	      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border/30 bg-muted/30">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-foreground text-base">
                <Mail size={18} className="text-secondary" />
                Contact Form Messages
              </CardTitle>
              <CardDescription className="text-muted-foreground text-sm">
                Messages from the public contact form on the homepage.
              </CardDescription>
            </div>
            <div className="relative w-full md:w-[260px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search messages..."
                aria-label="Search contact messages"
                value={messageSearch}
                onChange={(e) => setMessageSearch(e.target.value)}
                className="pl-9 bg-muted border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filteredMessages.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Mail className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>{messageSearch ? "No messages match your search" : "No messages yet"}</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {filteredMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`p-4 cursor-pointer hover:bg-muted/20 transition-colors ${
                    !msg.isRead ? "bg-primary/5 border-l-2 border-primary" : ""
                  } ${selectedMessage?.id === msg.id ? "bg-card/10" : ""}`}
                  onClick={() => {
                    setSelectedMessage(msg);
                    if (!msg.isRead) handleMarkRead(msg.id);
                  }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        {!msg.isRead && (
                          <span className="h-2 w-2 rounded-full bg-primary animate-pulse shrink-0" />
                        )}
                        <span className="font-medium text-foreground truncate min-w-0">{msg.name}</span>
                        {msg.organisation && (
                          <Badge variant="outline" className="text-xs border-white/20">
                            {msg.organisation}
                          </Badge>
                        )}
                        {msg.isArchived && (
                          <Badge variant="secondary" className="text-xs bg-muted text-muted-foreground">
                            Archived
                          </Badge>
                        )}
                      </div>
                      <a
                        href={`mailto:${msg.email}`}
                        className="text-sm text-secondary hover:underline break-all"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {msg.email}
                      </a>
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                        {msg.message}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-muted-foreground">
                        {new Date(msg.createdAt).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(msg.createdAt).toLocaleTimeString("en-GB", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Message Detail Dialog */}
      <Dialog open={!!selectedMessage} onOpenChange={() => setSelectedMessage(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail size={20} />
              Message from {selectedMessage?.name}
            </DialogTitle>
            <DialogDescription>
              Received {selectedMessage && new Date(selectedMessage.createdAt).toLocaleString("en-GB")}
            </DialogDescription>
          </DialogHeader>
          
          {selectedMessage && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg">
                <div>
                  <Label className="text-xs text-muted-foreground">Name</Label>
                  <p className="font-medium">{selectedMessage.name}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Email</Label>
                  <a href={`mailto:${selectedMessage.email}`} className="font-medium text-secondary hover:underline flex items-center gap-1">
                    {selectedMessage.email}
                    <ExternalLink size={12} />
                  </a>
                </div>
                {selectedMessage.organisation && (
                  <div className="col-span-2">
                    <Label className="text-xs text-muted-foreground">Organisation</Label>
                    <p className="font-medium">{selectedMessage.organisation}</p>
                  </div>
                )}
              </div>

              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">Message</Label>
                <div className="p-4 bg-muted/20 rounded-lg border border-border/30">
                  <p className="whitespace-pre-wrap text-foreground">{selectedMessage.message}</p>
                </div>
              </div>

              {selectedMessage.readBy && (
                <p className="text-xs text-muted-foreground">
                  Read by {selectedMessage.readBy} on {selectedMessage.readAt && new Date(selectedMessage.readAt).toLocaleString("en-GB")}
                </p>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => selectedMessage && handleArchive(selectedMessage.id)}
              className="border-warning/30 text-warning hover:bg-warning/10"
            >
              <Archive size={14} className="mr-2" />
              Archive
            </Button>
            <Button
              variant="outline"
              onClick={() => selectedMessage && handleDelete(selectedMessage.id)}
              className="border-destructive/30 text-destructive hover:bg-destructive/10"
            >
              <Trash2 size={14} className="mr-2" />
              Delete
            </Button>
            <Button
              variant="default"
              onClick={() => selectedMessage && window.open(`mailto:${selectedMessage.email}?subject=Re: Your CareAssurance Inquiry`, "_blank")}
            >
              <Mail size={14} className="mr-2" />
              Reply via Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});

function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0m";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function toLocalDateTimeInputValue(isoValue: string | null | undefined): string {
  if (!isoValue) return "";
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function formatOpsEventName(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const OperationsCommandCenter = memo(function OperationsCommandCenter({
  currentAlertCount,
  onRefreshAlerts,
}: {
  currentAlertCount: number;
  onRefreshAlerts: () => Promise<void> | void;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [controls, setControls] = useState<PlatformControlsState | null>(null);
  const [health, setHealth] = useState<OpsHealthSnapshot | null>(null);
  const [incidents, setIncidents] = useState<OpsIncident[]>([]);
  const [maintenanceMessageDraft, setMaintenanceMessageDraft] = useState("");
  const [scheduleStartDraft, setScheduleStartDraft] = useState("");
  const [scheduleEndDraft, setScheduleEndDraft] = useState("");
  const [announcementEnabledDraft, setAnnouncementEnabledDraft] = useState(false);
  const [announcementTextDraft, setAnnouncementTextDraft] = useState("");
  const [announcementSeverityDraft, setAnnouncementSeverityDraft] = useState<AnnouncementSeverity>("info");

  const syncDrafts = (next: PlatformControlsState) => {
    setMaintenanceMessageDraft(next.maintenanceMessage || "");
    setScheduleStartDraft(toLocalDateTimeInputValue(next.maintenanceWindowStart));
    setScheduleEndDraft(toLocalDateTimeInputValue(next.maintenanceWindowEnd));
    setAnnouncementEnabledDraft(Boolean(next.announcementEnabled));
    setAnnouncementTextDraft(next.announcementText || "");
    setAnnouncementSeverityDraft(next.announcementSeverity || "info");
  };

  const fetchControls = async () => {
    const response = await fetch("/api/admin/platform-controls", { credentials: "include" });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(errorBody.message || "Failed to load platform controls");
    }
    const data: PlatformControlsState = await response.json();
    setControls(data);
    syncDrafts(data);
    return data;
  };

  const fetchHealth = async () => {
    const response = await fetch("/api/admin/ops-health", { credentials: "include" });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(errorBody.message || "Failed to load operations health");
    }
    const data: OpsHealthSnapshot = await response.json();
    setHealth(data);
    return data;
  };

  const fetchIncidents = async () => {
    const response = await fetch("/api/admin/ops-incidents?limit=12", { credentials: "include" });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(errorBody.message || "Failed to load recent incidents");
    }
    const data = await response.json();
    const incidentData: OpsIncident[] = Array.isArray(data.incidents) ? data.incidents : [];
    setIncidents(incidentData);
    return incidentData;
  };

  const refreshHealth = async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchHealth(), fetchIncidents()]);
    } catch (error) {
      toast({
        title: "Refresh failed",
        description: error instanceof Error ? error.message : "Unable to refresh health metrics",
        variant: "destructive",
      });
    } finally {
      setRefreshing(false);
    }
  };

  const updateControls = async (
    payload: Partial<PlatformControlsState>,
    successTitle: string
  ): Promise<PlatformControlsState | null> => {
    setSaving(true);
    try {
      const response = await fetch("/api/admin/platform-controls", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || "Failed to update platform controls");
      }

      const next = data.controls as PlatformControlsState;
      if (next) {
        setControls(next);
        syncDrafts(next);
      }
      toast({
        title: successTitle,
        description: "Administrative platform controls were updated.",
      });
      return next || null;
    } catch (error) {
      toast({
        title: "Update failed",
        description: error instanceof Error ? error.message : "Failed to update platform controls",
        variant: "destructive",
      });
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveMessaging = async () => {
    if (announcementEnabledDraft && !announcementTextDraft.trim()) {
      toast({
        title: "Announcement text required",
        description: "Add announcement text before enabling global announcement.",
        variant: "destructive",
      });
      return;
    }
    await updateControls(
      {
        maintenanceMessage: maintenanceMessageDraft.trim(),
        announcementEnabled: announcementEnabledDraft,
        announcementText: announcementTextDraft.trim(),
        announcementSeverity: announcementSeverityDraft,
      },
      "Messaging controls saved"
    );
  };

  const [showStopAnnouncementConfirm, setShowStopAnnouncementConfirm] = useState(false);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);

  const handleStopAnnouncement = async () => {
    setShowStopAnnouncementConfirm(false);

    setSaving(true);
    try {
      const response = await fetch("/api/admin/platform-controls/announcement/stop", {
        method: "POST",
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || "Failed to stop global announcement");
      }

      const next = data.controls as PlatformControlsState | undefined;
      if (next) {
        setControls(next);
        syncDrafts(next);
      } else {
        setAnnouncementEnabledDraft(false);
        setAnnouncementTextDraft("");
      }

      toast({
        title: "Broadcast stopped",
        description: "Global announcement has been disabled and cleared.",
      });
    } catch (error) {
      toast({
        title: "Stop failed",
        description: error instanceof Error ? error.message : "Could not stop global announcement",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveMaintenanceWindow = async () => {
    if (!scheduleStartDraft || !scheduleEndDraft) {
      toast({
        title: "Schedule requires both times",
        description: "Set both start and end time, or clear both values.",
        variant: "destructive",
      });
      return;
    }

    const startDate = new Date(scheduleStartDraft);
    const endDate = new Date(scheduleEndDraft);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      toast({
        title: "Invalid maintenance window",
        description: "Please enter valid date/time values.",
        variant: "destructive",
      });
      return;
    }
    if (endDate <= startDate) {
      toast({
        title: "Invalid maintenance window",
        description: "End time must be later than start time.",
        variant: "destructive",
      });
      return;
    }

    await updateControls(
      {
        maintenanceWindowStart: scheduleStartDraft,
        maintenanceWindowEnd: scheduleEndDraft,
      },
      "Maintenance window scheduled"
    );
  };

  const handleClearMaintenanceWindow = async () => {
    const next = await updateControls(
      {
        maintenanceWindowStart: null,
        maintenanceWindowEnd: null,
      },
      "Maintenance window cleared"
    );
    if (next) {
      setScheduleStartDraft("");
      setScheduleEndDraft("");
    }
  };

  const handleExportSnapshot = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      controls,
      health,
      incidents,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const downloadUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = `careassurance-ops-snapshot-${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(downloadUrl);
  };

  const handleMarkAllAlertsRead = async () => {
    try {
      const response = await fetch("/api/admin-alerts/mark-all-read", {
        method: "POST",
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || "Failed to mark alerts as read");
      }
      toast({
        title: "Alerts cleared",
        description:
          data.cleared > 0
            ? `${data.cleared} alert${data.cleared === 1 ? "" : "s"} marked as read.`
            : "There were no unread alerts to clear.",
      });
      await onRefreshAlerts();
      await fetchHealth();
    } catch (error) {
      toast({
        title: "Action failed",
        description: error instanceof Error ? error.message : "Failed to clear alerts",
        variant: "destructive",
      });
    }
  };

  const handleDisconnectNonAdminSessions = async () => {
    setShowDisconnectConfirm(false);

    try {
      const response = await fetch("/api/admin/sessions/disconnect-non-admin", {
        method: "POST",
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || "Failed to disconnect sessions");
      }
      toast({
        title: "Sessions disconnected",
        description: `${data.disconnected || 0} non-admin session${data.disconnected === 1 ? "" : "s"} ended.`,
      });
      await fetchHealth();
    } catch (error) {
      toast({
        title: "Emergency action failed",
        description: error instanceof Error ? error.message : "Could not disconnect sessions",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    let active = true;
    const refreshRuntimeData = async () => {
      try {
        await Promise.all([fetchHealth(), fetchIncidents()]);
      } catch {
        // Keep polling resilient; initial load handles surfaced errors.
      }
    };
    const loadInitial = async () => {
      try {
        await Promise.all([fetchControls(), fetchHealth(), fetchIncidents()]);
      } catch (error) {
        if (!active) return;
        toast({
          title: "Unable to load command center",
          description: error instanceof Error ? error.message : "Failed to load admin data",
          variant: "destructive",
        });
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadInitial();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void refreshRuntimeData();
    }, 30000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshRuntimeData();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const severityCopy: Record<AnnouncementSeverity, string> = {
    info: "Informational",
    warning: "Warning",
    critical: "Critical",
  };
  const hasActiveAnnouncement = Boolean(
    controls?.announcementEnabled && controls.announcementText?.trim()
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider flex items-center gap-2 text-muted-foreground">
              <Activity size={14} className="text-primary" /> Active Sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-foreground">{health?.sessions.total ?? 0}</div>
            <p className="text-xs text-muted-foreground">{health?.sessions.nonAdmin ?? 0} non-admin active</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider flex items-center gap-2 text-muted-foreground">
              <AlertTriangle size={14} className="text-warning" /> Incident Queue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-foreground">
              {(health?.alerts.unreadAdminAlerts ?? 0) + (health?.alerts.unreadContactMessages ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {health?.alerts.unreadAdminAlerts ?? 0} admin alerts · {health?.alerts.unreadContactMessages ?? 0} contacts
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider flex items-center gap-2 text-muted-foreground">
              <Server size={14} className="text-secondary" /> Runtime Uptime
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-foreground">
              {health ? formatUptime(health.runtime.uptimeSeconds) : "0m"}
            </div>
            <p className="text-xs text-muted-foreground">
              Node {health?.runtime.nodeVersion || "-"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider flex items-center gap-2 text-muted-foreground">
              <Cpu size={14} className="text-primary" /> Memory (RSS)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-foreground">{health?.memory.rssMb ?? 0} MB</div>
            <p className="text-xs text-muted-foreground">
              Heap {health?.memory.heapUsedMb ?? 0}/{health?.memory.heapTotalMb ?? 0} MB
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="border-b border-border/30 bg-muted/30">
          <CardTitle className="flex items-center gap-2 text-base text-foreground">
            <Power size={18} className="text-destructive" />
            Platform Modes
          </CardTitle>
          <CardDescription className="text-muted-foreground text-sm">
            Manage maintenance/read-only behavior and global user messaging.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border p-4 space-y-3 border-border bg-muted/50">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Maintenance Mode</p>
                  <p className="text-xs text-muted-foreground">Shows maintenance status platform-wide.</p>
                </div>
                <Switch
                  checked={Boolean(controls?.maintenanceMode)}
                  disabled={saving}
                  onCheckedChange={(checked) => {
                    void updateControls(
                      {
                        maintenanceMode: checked,
                        maintenanceMessage: maintenanceMessageDraft.trim(),
                      },
                      checked ? "Maintenance mode enabled" : "Maintenance mode disabled"
                    );
                  }}
                />
              </div>
              <Badge variant="outline" className={controls?.maintenanceMode ? "border-warning/40 text-warning" : "border-border text-muted-foreground"}>
                {controls?.maintenanceMode ? "Enabled" : "Disabled"}
              </Badge>
            </div>

            <div className="rounded-lg border p-4 space-y-3 border-border bg-muted/50">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Read-Only Mode</p>
                  <p className="text-xs text-muted-foreground">Blocks non-admin write API requests.</p>
                </div>
                <Switch
                  checked={Boolean(controls?.readOnlyMode)}
                  disabled={saving}
                  onCheckedChange={(checked) => {
                    void updateControls(
                      { readOnlyMode: checked },
                      checked ? "Read-only mode enabled" : "Read-only mode disabled"
                    );
                  }}
                />
              </div>
              <Badge variant="outline" className={controls?.readOnlyMode ? "border-destructive/30 text-destructive" : "border-border text-muted-foreground"}>
                {controls?.readOnlyMode ? "Non-admin writes blocked" : "Writes allowed"}
              </Badge>
            </div>
          </div>

          <div className="rounded-lg border p-4 space-y-4 border-border bg-muted/50">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CalendarClock size={16} className="text-secondary" />
                <p className="text-sm font-semibold text-foreground">Scheduled Maintenance Window</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={
                    controls?.maintenanceWindowActive
                      ? "border-warning/40 text-warning"
                      : controls?.maintenanceWindowUpcoming
                        ? "border-primary/30 text-primary"
                        : "border-border text-muted-foreground"
                  }
                >
                  {controls?.maintenanceWindowActive
                    ? "Window Active"
                    : controls?.maintenanceWindowUpcoming
                      ? "Window Scheduled"
                      : "No Window"}
                </Badge>
                <Badge
                  variant="outline"
                  className={controls?.maintenanceActive ? "border-warning/40 text-warning" : "border-border text-muted-foreground"}
                >
                  Effective Maintenance: {controls?.maintenanceActive ? "On" : "Off"}
                </Badge>
                <Badge
                  variant="outline"
                  className={controls?.readOnlyActive ? "border-destructive/30 text-destructive" : "border-border text-muted-foreground"}
                >
                  Effective Read-Only: {controls?.readOnlyActive ? "On" : "Off"}
                </Badge>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Window Start</Label>
                <Input
                  type="datetime-local"
                  value={scheduleStartDraft}
                  onChange={(e) => setScheduleStartDraft(e.target.value)}
                  className="bg-card border-border text-foreground"
                  data-testid="input-maintenance-window-start"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Window End</Label>
                <Input
                  type="datetime-local"
                  value={scheduleEndDraft}
                  onChange={(e) => setScheduleEndDraft(e.target.value)}
                  className="bg-card border-border text-foreground"
                  data-testid="input-maintenance-window-end"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                onClick={handleClearMaintenanceWindow}
                disabled={saving}
                data-testid="button-clear-maintenance-window"
              >
                Clear Window
              </Button>
              <Button
                onClick={handleSaveMaintenanceWindow}
                disabled={saving}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
                data-testid="button-save-maintenance-window"
              >
                {saving ? <Loader2 size={14} className="mr-2 animate-spin" /> : <CalendarClock size={14} className="mr-2" />}
                Save Window
              </Button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Maintenance Message</Label>
              <Input
                value={maintenanceMessageDraft}
                onChange={(e) => setMaintenanceMessageDraft(e.target.value)}
                placeholder="Maintenance message shown to all users"
                className="bg-card border-border text-foreground"
                maxLength={280}
                data-testid="input-maintenance-message"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Announcement Severity</Label>
              <Select
                value={announcementSeverityDraft}
                onValueChange={(value: AnnouncementSeverity) => setAnnouncementSeverityDraft(value)}
              >
                <SelectTrigger className="bg-card border-border text-foreground" data-testid="select-announcement-severity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-lg border p-4 space-y-3 border-border bg-muted/50">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Megaphone size={16} className="text-primary" />
                <p className="text-sm font-semibold text-foreground">Global Announcement</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={
                    hasActiveAnnouncement
                      ? "border-success/30 text-success"
                      : "border-border text-muted-foreground"
                  }
                >
                  {hasActiveAnnouncement ? "Live" : "Stopped"}
                </Badge>
                <Switch
                  checked={announcementEnabledDraft}
                  disabled={saving}
                  onCheckedChange={setAnnouncementEnabledDraft}
                />
              </div>
            </div>
            <Input
              value={announcementTextDraft}
              onChange={(e) => setAnnouncementTextDraft(e.target.value)}
              placeholder="Broadcast message visible in app header"
              className="bg-card border-border text-foreground"
              maxLength={280}
              data-testid="input-global-announcement"
            />
            <div className="flex items-center justify-between gap-3">
              <Badge variant="outline" className="border-border text-muted-foreground">
                {severityCopy[announcementSeverityDraft]}
              </Badge>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowStopAnnouncementConfirm(true)}
                  disabled={saving || !hasActiveAnnouncement}
                  className="border-destructive/30 text-destructive hover:bg-destructive/10"
                  data-testid="button-stop-global-announcement"
                >
                  Stop Broadcast
                </Button>
                <Button
                  onClick={handleSaveMessaging}
                  disabled={saving}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground"
                  data-testid="button-save-platform-messaging"
                >
                  {saving ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Save size={14} className="mr-2" />}
                  Save Messaging Controls
                </Button>
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Last updated: {controls?.updatedAt ? new Date(controls.updatedAt).toLocaleString() : "Unknown"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-border/30 bg-muted/30">
          <CardTitle className="flex items-center gap-2 text-base text-foreground">
            <AlertTriangle size={18} className="text-warning" />
            Incident & Session Controls
          </CardTitle>
          <CardDescription className="text-muted-foreground text-sm">
            Execute high-impact operational actions with immediate effect.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Button
              variant="outline"
              className="justify-start border-warning/40 text-warning hover:bg-warning/10"
              onClick={handleMarkAllAlertsRead}
              data-testid="button-clear-all-alerts"
            >
              <Check size={15} className="mr-2" />
              Mark All Alerts Read ({currentAlertCount})
            </Button>
            <Button
              variant="outline"
              className="justify-start border-destructive/30 text-destructive hover:bg-destructive/10"
              onClick={() => setShowDisconnectConfirm(true)}
              data-testid="button-disconnect-non-admin-sessions"
            >
              <UserX size={15} className="mr-2" />
              Disconnect Non-Admin Sessions
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border p-3 border-border bg-muted/50">
              <p className="text-xs text-muted-foreground mb-1">Pending Users</p>
              <p className="text-xl font-semibold text-foreground">{health?.users.pending ?? 0}</p>
            </div>
            <div className="rounded-lg border p-3 border-border bg-muted/50">
              <p className="text-xs text-muted-foreground mb-1">Blocked IPs</p>
              <p className="text-xl font-semibold text-foreground">{health?.security.blockedIps ?? 0}</p>
            </div>
            <div className="rounded-lg border p-3 border-border bg-muted/50">
              <p className="text-xs text-muted-foreground mb-1">WebSocket Clients</p>
              <p className="text-xl font-semibold text-foreground">{health?.sessions.webSocketClients ?? 0}</p>
            </div>
          </div>

          <div className="rounded-lg border p-4 space-y-3 border-border bg-muted/50">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-foreground">Recent Operations Timeline</p>
              <Badge variant="outline" className="border-border text-muted-foreground">
                {incidents.length} event{incidents.length === 1 ? "" : "s"}
              </Badge>
            </div>
            <div className="space-y-2">
              {incidents.length === 0 && (
                <p className="text-xs text-muted-foreground">No recent operational incidents.</p>
              )}
              {incidents.map((incident) => (
                <div
                  key={incident.id}
                  className="rounded border px-3 py-2 flex items-start justify-between gap-3 border-border bg-card"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">{incident.action}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {formatOpsEventName(incident.eventType)} · {incident.username}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <Badge
                      variant="outline"
                      className={
                        incident.severity === "critical"
                          ? "border-destructive/30 text-destructive"
                          : incident.severity === "warning"
                            ? "border-warning/40 text-warning"
                            : "border-primary/30 text-primary"
                      }
                    >
                      {incident.severity}
                    </Badge>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {new Date(incident.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 pt-2">
            <p className="text-xs text-muted-foreground">
              Live metrics auto-refresh every 30s.
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleExportSnapshot} data-testid="button-export-ops-snapshot">
                <Download size={14} className="mr-2" />
                Export Snapshot
              </Button>
              <Button variant="outline" onClick={refreshHealth} disabled={refreshing} data-testid="button-refresh-ops-health">
                {refreshing ? <Loader2 size={14} className="mr-2 animate-spin" /> : <RefreshCcw size={14} className="mr-2" />}
                Refresh Health
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stop Announcement Confirmation */}
      <Dialog open={showStopAnnouncementConfirm} onOpenChange={setShowStopAnnouncementConfirm}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Stop Global Announcement</DialogTitle>
            <DialogDescription>
              Stop the global announcement now? This immediately disables the broadcast banner for all users.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStopAnnouncementConfirm(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleStopAnnouncement}>Stop Broadcast</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disconnect Sessions Confirmation */}
      <Dialog open={showDisconnectConfirm} onOpenChange={setShowDisconnectConfirm}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="text-destructive">Disconnect All Non-Admin Sessions</DialogTitle>
            <DialogDescription>
              This will immediately log out all active non-admin users. This action is typically used in emergency situations only.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDisconnectConfirm(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDisconnectNonAdminSessions}>
              <UserX size={14} className="mr-2" /> Disconnect All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});

interface EditingUser {
  id: string;
  username: string;
  role: UserRole;
  status: string;
  jobTitle: string;
  firstName: string;
  lastName: string;
}

// ---------------------------------------------------------------------------
// Rostering Operational Panel — admin view of ECM drift and rostering metrics
// ---------------------------------------------------------------------------
function RosteringOperationalPanel() {
  const allSlots = useSyncExternalStore(subscribeSharedRosteringData, getSharedAllSlots, getSharedAllSlots);
  const recommendations = useSyncExternalStore(subscribeSharedRosteringData, getSharedRecommendations, getSharedRecommendations);
  const decisions = useSyncExternalStore(subscribeSharedRecommendationDecisions, getSharedRecommendationDecisions, getSharedRecommendationDecisions);

  const [areaFilter, setAreaFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"risk" | "drift" | "calls" | "name">("risk");
  const [suSearch, setSuSearch] = useState("");
  const [expandedSU, setExpandedSU] = useState<string | null>(null);

  const areas = useMemo(() => {
    const set = new Set<string>();
    allSlots.forEach((s) => { if (s.serviceUserArea) set.add(s.serviceUserArea); });
    return ["all", ...Array.from(set).sort()];
  }, [allSlots]);

  const filteredSlots = useMemo(
    () => areaFilter === "all" ? allSlots : allSlots.filter((s) => s.serviceUserArea === areaFilter),
    [allSlots, areaFilter],
  );

  // Per-service-user aggregation
  const serviceUserStats = useMemo(() => {
    const map = new Map<string, {
      key: string; name: string; area: string | null;
      totalCalls: number; slotsWithDrift: number; totalDriftMinutes: number; signedDriftSum: number;
      durationAdherence: number[]; consistencyScores: number[]; hasRec: number; implemented: number; rejected: number;
    }>();
    for (const slot of filteredSlots) {
      let entry = map.get(slot.serviceUserKey);
      if (!entry) {
        entry = { key: slot.serviceUserKey, name: slot.serviceUserName, area: slot.serviceUserArea, totalCalls: 0, slotsWithDrift: 0, totalDriftMinutes: 0, signedDriftSum: 0, durationAdherence: [], consistencyScores: [], hasRec: 0, implemented: 0, rejected: 0 };
        map.set(slot.serviceUserKey, entry);
      }
      entry.totalCalls += slot.totalCalls;
      if (typeof slot.averageStartOffsetMinutes === "number") {
        entry.slotsWithDrift += 1;
        entry.totalDriftMinutes += Math.abs(slot.averageStartOffsetMinutes);
        entry.signedDriftSum += slot.averageStartOffsetMinutes;
      }
      if (typeof slot.averageDurationPercent === "number") entry.durationAdherence.push(slot.averageDurationPercent);
      if (typeof slot.offsetConsistency === "number") entry.consistencyScores.push(slot.offsetConsistency);
      if (slot.hasRecommendation) {
        entry.hasRec += 1;
        const d = decisions[slot.key];
        if (d === "implemented") entry.implemented += 1;
        else if (d === "rejected") entry.rejected += 1;
      }
    }
    return Array.from(map.values()).map((e) => {
      const avgDriftMinutes = e.slotsWithDrift > 0 ? e.totalDriftMinutes / e.slotsWithDrift : null;
      const avgSignedDrift = e.slotsWithDrift > 0 ? e.signedDriftSum / e.slotsWithDrift : null;
      const avgDurationPct = e.durationAdherence.length > 0
        ? e.durationAdherence.reduce((a, b) => a + b, 0) / e.durationAdherence.length : null;
      const avgConsistency = e.consistencyScores.length > 0
        ? e.consistencyScores.reduce((a, b) => a + b, 0) / e.consistencyScores.length : null;
      // Risk score 0–100: weighted combination of drift severity, duration shortfall, consistency
      const driftRisk = avgDriftMinutes != null ? Math.min(100, (avgDriftMinutes / 60) * 100) : 50;
      const durRisk = avgDurationPct != null ? Math.max(0, 100 - avgDurationPct) : 50;
      const consRisk = avgConsistency != null ? (1 - avgConsistency) * 100 : 50;
      const riskScore = Math.round(driftRisk * 0.5 + durRisk * 0.3 + consRisk * 0.2);
      return { ...e, avgDriftMinutes, avgSignedDrift, avgDurationPct, avgConsistency, riskScore };
    });
  }, [filteredSlots, decisions]);

  const sorted = useMemo(() => {
    let arr = [...serviceUserStats];
    if (suSearch.trim()) {
      const q = suSearch.toLowerCase();
      arr = arr.filter((s) => s.name.toLowerCase().includes(q) || (s.area?.toLowerCase() ?? "").includes(q));
    }
    if (sortBy === "risk") arr.sort((a, b) => b.riskScore - a.riskScore);
    else if (sortBy === "drift") arr.sort((a, b) => (b.avgDriftMinutes ?? -1) - (a.avgDriftMinutes ?? -1));
    else if (sortBy === "calls") arr.sort((a, b) => b.totalCalls - a.totalCalls);
    else arr.sort((a, b) => a.name.localeCompare(b.name));
    return arr;
  }, [serviceUserStats, sortBy, suSearch]);

  // Global summary stats
  const globalStats = useMemo(() => {
    const withDrift = filteredSlots.filter((s) => typeof s.averageStartOffsetMinutes === "number");
    const avgDrift = withDrift.length
      ? withDrift.reduce((acc, s) => acc + Math.abs(s.averageStartOffsetMinutes!), 0) / withDrift.length : null;
    const avgSignedDrift = withDrift.length
      ? withDrift.reduce((acc, s) => acc + s.averageStartOffsetMinutes!, 0) / withDrift.length : null;
    const withDuration = filteredSlots.filter((s) => typeof s.averageDurationPercent === "number");
    const avgDuration = withDuration.length
      ? withDuration.reduce((acc, s) => acc + s.averageDurationPercent!, 0) / withDuration.length : null;
    const withCons = filteredSlots.filter((s) => typeof s.offsetConsistency === "number");
    const avgConsistency = withCons.length
      ? withCons.reduce((acc, s) => acc + (s.offsetConsistency!), 0) / withCons.length : null;
    const totalRecs = recommendations.length;
    const implemented = Object.values(decisions).filter((d) => d === "implemented").length;
    const rejected = Object.values(decisions).filter((d) => d === "rejected").length;
    const pending = totalRecs - implemented - rejected;
    // Drift distribution bands
    const bands = { low: 0, moderate: 0, high: 0, critical: 0 };
    withDrift.forEach((s) => {
      const abs = Math.abs(s.averageStartOffsetMinutes!);
      if (abs < 10) bands.low++;
      else if (abs < 20) bands.moderate++;
      else if (abs < 45) bands.high++;
      else bands.critical++;
    });
    // Compliance SLA: % of measured slots with drift ≤15m
    const slaCompliant = withDrift.filter((s) => Math.abs(s.averageStartOffsetMinutes!) <= 15).length;
    const slaPct = withDrift.length > 0 ? Math.round((slaCompliant / withDrift.length) * 100) : null;
    // Potential savings: total drift-minutes that pending recs could eliminate
    const pendingRecSlots = filteredSlots.filter((s) => s.hasRecommendation && !decisions[s.key]);
    const potentialSavingsMinutes = Math.round(pendingRecSlots.reduce((acc, s) => {
      if (typeof s.averageStartOffsetMinutes !== "number") return acc;
      return acc + Math.abs(s.averageStartOffsetMinutes) * s.totalCalls;
    }, 0));
    return { avgDrift, avgSignedDrift, avgDuration, avgConsistency, totalRecs, implemented, rejected, pending,
      highDrift: bands.high + bands.critical, totalSlots: filteredSlots.length, bands, withDriftCount: withDrift.length,
      slaPct, slaCompliant, potentialSavingsMinutes };
  }, [filteredSlots, recommendations, decisions]);

  // Per-call-type aggregation
  const callTypeStats = useMemo(() => {
    const map = new Map<string, { type: string; count: number; driftSum: number; driftN: number }>();
    for (const slot of filteredSlots) {
      let e = map.get(slot.callTypeLabel);
      if (!e) { e = { type: slot.callTypeLabel, count: 0, driftSum: 0, driftN: 0 }; map.set(slot.callTypeLabel, e); }
      e.count += slot.totalCalls;
      if (typeof slot.averageStartOffsetMinutes === "number") {
        e.driftSum += Math.abs(slot.averageStartOffsetMinutes);
        e.driftN++;
      }
    }
    return Array.from(map.values())
      .map((e) => ({ ...e, avgDrift: e.driftN > 0 ? e.driftSum / e.driftN : null }))
      .sort((a, b) => (b.avgDrift ?? -1) - (a.avgDrift ?? -1));
  }, [filteredSlots]);

  // Per-area aggregation (drift chart like call-type chart)
  const areaStats = useMemo(() => {
    const map = new Map<string, { area: string; driftSum: number; driftN: number; slotCount: number }>();
    for (const slot of filteredSlots) {
      const areaKey = slot.serviceUserArea ?? "(No area)";
      let e = map.get(areaKey);
      if (!e) { e = { area: areaKey, driftSum: 0, driftN: 0, slotCount: 0 }; map.set(areaKey, e); }
      e.slotCount++;
      if (typeof slot.averageStartOffsetMinutes === "number") {
        e.driftSum += Math.abs(slot.averageStartOffsetMinutes);
        e.driftN++;
      }
    }
    return Array.from(map.values())
      .map((e) => ({ ...e, avgDrift: e.driftN > 0 ? e.driftSum / e.driftN : null }))
      .sort((a, b) => (b.avgDrift ?? -1) - (a.avgDrift ?? -1));
  }, [filteredSlots]);

  // Top-3 at-risk service users (risk ≥65, sorted by risk desc)
  const criticalSUs = useMemo(
    () => serviceUserStats.filter((s) => s.riskScore >= 65).sort((a, b) => b.riskScore - a.riskScore).slice(0, 3),
    [serviceUserStats],
  );

  // Per-time-band aggregation (heatmap of drift by hour/period)
  const timeBandStats = useMemo(() => {
    const map = new Map<string, { band: string; plannedMins: number | null; driftSum: number; driftN: number; count: number }>();
    for (const slot of filteredSlots) {
      let e = map.get(slot.timeBandLabel);
      if (!e) { e = { band: slot.timeBandLabel, plannedMins: slot.averagePlannedStartMinutes, driftSum: 0, driftN: 0, count: 0 }; map.set(slot.timeBandLabel, e); }
      e.count++;
      if (typeof slot.averageStartOffsetMinutes === "number") {
        e.driftSum += Math.abs(slot.averageStartOffsetMinutes);
        e.driftN++;
      }
    }
    return Array.from(map.values())
      .map((e) => ({ ...e, avgDrift: e.driftN > 0 ? e.driftSum / e.driftN : null }))
      .sort((a, b) => (a.plannedMins ?? 0) - (b.plannedMins ?? 0)); // chronological order
  }, [filteredSlots]);

  // Lookup: slotsByServiceUser for expandable rows
  const slotsByServiceUser = useMemo(() => {
    const map = new Map<string, typeof filteredSlots>();
    for (const slot of filteredSlots) {
      let arr = map.get(slot.serviceUserKey);
      if (!arr) { arr = []; map.set(slot.serviceUserKey, arr); }
      arr.push(slot);
    }
    return map;
  }, [filteredSlots]);

  // Priority recommendation queue: pending recs ranked by potential impact (drift × calls)
  const priorityRecs = useMemo(() => {
    return filteredSlots
      .filter((s) => s.hasRecommendation && !decisions[s.key])
      .map((s) => ({
        slot: s,
        impact: (typeof s.averageStartOffsetMinutes === "number" ? Math.abs(s.averageStartOffsetMinutes) : 0) * s.totalCalls,
      }))
      .sort((a, b) => b.impact - a.impact)
      .slice(0, 8);
  }, [filteredSlots, decisions]);

  // Data quality: per-SU coverage (callsWithTimes / totalCalls)
  const dataQuality = useMemo(() => {
    const map = new Map<string, { name: string; area: string | null; withTimes: number; total: number }>();
    for (const slot of filteredSlots) {
      let e = map.get(slot.serviceUserKey);
      if (!e) { e = { name: slot.serviceUserName, area: slot.serviceUserArea, withTimes: 0, total: 0 }; map.set(slot.serviceUserKey, e); }
      e.withTimes += slot.callsWithTimes;
      e.total += slot.totalCalls;
    }
    return Array.from(map.entries())
      .map(([key, e]) => ({ key, ...e, coveragePct: e.total > 0 ? Math.round((e.withTimes / e.total) * 100) : 0 }))
      .filter((e) => e.coveragePct < 70)
      .sort((a, b) => a.coveragePct - b.coveragePct)
      .slice(0, 5);
  }, [filteredSlots]);

  // CSV export
  const handleExport = () => {
    const rows = [
      ["Service User", "Area", "Total Calls", "Avg Drift (m)", "Signed Drift (m)", "Duration %", "Consistency %", "Risk Score", "Recs", "Implemented", "Pending", "Rejected"],
      ...sorted.map((s) => [
        s.name, s.area ?? "", s.totalCalls,
        s.avgDriftMinutes != null ? Math.round(s.avgDriftMinutes) : "",
        s.avgSignedDrift != null ? Math.round(s.avgSignedDrift) : "",
        s.avgDurationPct != null ? Math.round(s.avgDurationPct) : "",
        s.avgConsistency != null ? Math.round(s.avgConsistency * 100) : "",
        s.riskScore, s.hasRec, s.implemented, s.hasRec - s.implemented - s.rejected, s.rejected,
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url;
    a.download = `rostering-drift-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  if (allSlots.length === 0) {
    return (
      <Card className="border-border/60 bg-card shadow-medium">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
            <Route className="h-7 w-7 text-primary" />
          </div>
          <p className="text-sm font-medium text-foreground">No rostering data loaded</p>
          <p className="text-xs text-muted-foreground max-w-sm">
            Upload and analyse an ECM export from the Rostering workspace first. Metrics will appear here automatically.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Auto-generated narrative summary
  const narrative = (() => {
    const parts: string[] = [];
    const suCount = serviceUserStats.length;
    parts.push(`Analysis covers **${allSlots.length} call slots** across **${suCount} service user${suCount !== 1 ? "s" : ""}**.`);
    if (globalStats.avgDrift != null) {
      const dir = globalStats.avgSignedDrift != null && globalStats.avgSignedDrift < 0 ? "early" : "late";
      parts.push(`Average schedule drift is **${Math.round(globalStats.avgDrift)}m** (typically running ${dir}).`);
    }
    if (globalStats.slaPct != null) {
      const slaDesc = globalStats.slaPct >= 85 ? "good" : globalStats.slaPct >= 70 ? "moderate" : "poor";
      parts.push(`SLA compliance (≤15m drift) is **${slaDesc}** at **${globalStats.slaPct}%**.`);
    }
    if (criticalSUs.length > 0) {
      parts.push(`**${criticalSUs.length} service user${criticalSUs.length > 1 ? "s" : ""}** have a risk score ≥65 and need immediate attention.`);
    }
    if (globalStats.pending > 0 && globalStats.potentialSavingsMinutes > 0) {
      parts.push(`Implementing **${globalStats.pending} pending recommendation${globalStats.pending !== 1 ? "s" : ""}** could address up to **${globalStats.potentialSavingsMinutes.toLocaleString()} call-minutes** of drift.`);
    } else if (globalStats.implemented > 0 && globalStats.pending === 0) {
      parts.push(`All **${globalStats.totalRecs} recommendation${globalStats.totalRecs !== 1 ? "s" : ""}** have been actioned — well done.`);
    }
    const worstArea = areaStats[0];
    if (worstArea?.avgDrift != null && areaStats.length > 1) {
      parts.push(`**${worstArea.area}** shows the highest area drift at **${Math.round(worstArea.avgDrift)}m**.`);
    }
    return parts;
  })();

  const maxCallTypeDrift = Math.max(...callTypeStats.map((c) => c.avgDrift ?? 0), 1);

  return (
    <div className="space-y-6">

      {/* Auto-generated narrative summary */}
      <div className="rounded-xl border border-border/50 bg-muted/20 px-4 py-3 flex gap-3">
        <BarChart3 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <div className="text-xs text-foreground/80 space-y-0.5">
          {narrative.map((part, i) => (
            <p key={i} dangerouslySetInnerHTML={{ __html: part.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
          ))}
        </div>
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          {
            label: "Avg Schedule Drift",
            value: globalStats.avgDrift != null ? `${Math.round(globalStats.avgDrift)}m` : "—",
            sub: globalStats.avgSignedDrift != null
              ? `${globalStats.avgSignedDrift > 0 ? "+" : ""}${Math.round(globalStats.avgSignedDrift)}m signed avg`
              : `across ${globalStats.totalSlots} slots`,
            icon: <Clock className="h-4 w-4" />,
            colour: globalStats.avgDrift != null && globalStats.avgDrift >= 20 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400",
            bg: "bg-amber-500/8",
            iconColour: "text-amber-500",
          },
          {
            label: "Compliance SLA (≤15m)",
            value: globalStats.slaPct != null ? `${globalStats.slaPct}%` : "—",
            sub: globalStats.slaPct != null ? `${globalStats.slaCompliant} of ${globalStats.withDriftCount} slots on-target` : `across ${globalStats.totalSlots} slots`,
            icon: <AlertTriangle className="h-4 w-4" />,
            colour: globalStats.slaPct != null && globalStats.slaPct < 70 ? "text-rose-600 dark:text-rose-400" : globalStats.slaPct != null && globalStats.slaPct < 85 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400",
            bg: "bg-rose-500/8",
            iconColour: "text-rose-500",
          },
          {
            label: "Avg Duration Adherence",
            value: globalStats.avgDuration != null ? `${Math.round(globalStats.avgDuration)}%` : "—",
            sub: "planned vs actual call length",
            icon: <Timer className="h-4 w-4" />,
            colour: globalStats.avgDuration != null && globalStats.avgDuration < 85 ? "text-amber-600 dark:text-amber-400" : "text-foreground",
            bg: "bg-primary/8",
            iconColour: "text-primary",
          },
          {
            label: "Avg Consistency",
            value: globalStats.avgConsistency != null ? `${Math.round(globalStats.avgConsistency * 100)}%` : "—",
            sub: "directional drift agreement",
            icon: <TrendingUp className="h-4 w-4" />,
            colour: globalStats.avgConsistency != null && globalStats.avgConsistency < 0.6 ? "text-amber-600 dark:text-amber-400" : "text-foreground",
            bg: "bg-emerald-500/8",
            iconColour: "text-emerald-500",
          },
        ].map((stat) => (
          <Card key={stat.label} className="border-border/60 bg-card shadow-sm">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-start justify-between gap-2">
                <div className={`h-8 w-8 rounded-lg ${stat.bg} flex items-center justify-center ${stat.iconColour} shrink-0`}>{stat.icon}</div>
                <span className={`text-xl font-bold tabular-nums ${stat.colour}`}>{stat.value}</span>
              </div>
              <p className="mt-2 text-xs font-medium text-foreground">{stat.label}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{stat.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Attention Needed callout — top critical service users */}
      {criticalSUs.length > 0 && (
        <div className="rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-950/20 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
            <span className="text-sm font-semibold text-rose-700 dark:text-rose-300">Attention Needed</span>
            <span className="text-xs text-rose-500 dark:text-rose-400 ml-1">{criticalSUs.length} service user{criticalSUs.length > 1 ? "s" : ""} with risk ≥65</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {criticalSUs.map((su) => {
              const pending = su.hasRec - su.implemented - su.rejected;
              return (
                <div key={su.key} className="rounded-lg border border-rose-200/70 dark:border-rose-800/50 bg-white/70 dark:bg-rose-950/30 px-3 py-2.5 flex flex-col gap-1">
                  <div className="flex items-start justify-between gap-1">
                    <div>
                      <p className="text-xs font-semibold text-foreground truncate">{su.name}</p>
                      {su.area && <p className="text-[10px] text-muted-foreground">{su.area}</p>}
                    </div>
                    <span className="text-sm font-bold text-rose-600 dark:text-rose-400 tabular-nums shrink-0">{su.riskScore}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground mt-0.5">
                    {su.avgDriftMinutes != null && <span>Drift <span className="font-medium text-foreground">{Math.round(su.avgDriftMinutes)}m</span></span>}
                    {su.avgDurationPct != null && <span>Duration <span className="font-medium text-foreground">{Math.round(su.avgDurationPct)}%</span></span>}
                    {pending > 0 && <span className="text-amber-600 dark:text-amber-400 font-medium">{pending} rec{pending > 1 ? "s" : ""} pending</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Drift distribution + Recommendation adoption row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Drift distribution histogram */}
        <Card className="border-border/60 bg-card shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Drift Distribution
            </CardTitle>
            <CardDescription className="text-xs">{globalStats.withDriftCount} slots with timing data</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {([
              { label: "Low &lt;10m", count: globalStats.bands.low, colour: "bg-emerald-500" },
              { label: "Moderate 10–20m", count: globalStats.bands.moderate, colour: "bg-yellow-400" },
              { label: "High 20–45m", count: globalStats.bands.high, colour: "bg-amber-500" },
              { label: "Critical ≥45m", count: globalStats.bands.critical, colour: "bg-rose-500" },
            ] as const).map((band) => {
              const pct = globalStats.withDriftCount > 0 ? (band.count / globalStats.withDriftCount) * 100 : 0;
              return (
                <div key={band.label} className="flex items-center gap-2">
                  <span className="w-28 text-[10px] text-muted-foreground shrink-0" dangerouslySetInnerHTML={{ __html: band.label }} />
                  <div className="flex-1 h-2.5 rounded-full bg-muted/50 overflow-hidden">
                    <div className={`h-full rounded-full ${band.colour} transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-8 text-right text-[10px] tabular-nums text-muted-foreground">{band.count}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Recommendation adoption */}
        <Card className="border-border/60 bg-card shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Recommendation Adoption
            </CardTitle>
            <CardDescription className="text-xs">
              {globalStats.totalRecs} total · {globalStats.implemented} done · {globalStats.rejected} skipped · {globalStats.pending} pending
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {globalStats.totalRecs > 0 ? (
              <>
                <div className="h-4 rounded-full bg-muted/60 overflow-hidden flex">
                  <div className="bg-emerald-500 transition-all flex items-center justify-center" style={{ width: `${(globalStats.implemented / globalStats.totalRecs) * 100}%` }}>
                    {globalStats.implemented > 0 && <span className="text-[9px] text-white font-bold px-1">{Math.round((globalStats.implemented / globalStats.totalRecs) * 100)}%</span>}
                  </div>
                  <div className="bg-rose-500/70 transition-all" style={{ width: `${(globalStats.rejected / globalStats.totalRecs) * 100}%` }} />
                </div>
                <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />Implemented</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500/70 inline-block" />Rejected</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-muted-foreground/30 inline-block" />Pending</span>
                </div>
                {globalStats.potentialSavingsMinutes > 0 && (
                  <div className="mt-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 px-3 py-2 flex items-center gap-2">
                    <TrendingUp className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span className="text-[11px] text-amber-700 dark:text-amber-300">
                      <span className="font-semibold">{globalStats.potentialSavingsMinutes.toLocaleString()} call-minutes</span> of drift could be addressed from {globalStats.pending} pending rec{globalStats.pending !== 1 ? "s" : ""}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-2">No recommendations generated yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Call type breakdown */}
      {callTypeStats.length > 0 && (
        <Card className="border-border/60 bg-card shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-primary" />
              Avg Drift by Call Type
            </CardTitle>
            <CardDescription className="text-xs">Which call types have the most schedule drift</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {callTypeStats.slice(0, 8).map((ct) => {
              const pct = ct.avgDrift != null ? (ct.avgDrift / maxCallTypeDrift) * 100 : 0;
              const barColour = (ct.avgDrift ?? 0) >= 45 ? "bg-rose-500" : (ct.avgDrift ?? 0) >= 20 ? "bg-amber-500" : (ct.avgDrift ?? 0) >= 10 ? "bg-yellow-400" : "bg-emerald-500";
              return (
                <div key={ct.type} className="flex items-center gap-2">
                  <span className="w-32 text-[10px] text-muted-foreground truncate shrink-0">{ct.type}</span>
                  <div className="flex-1 h-2.5 rounded-full bg-muted/50 overflow-hidden">
                    <div className={`h-full rounded-full ${barColour} transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-12 text-right text-[10px] tabular-nums text-muted-foreground">
                    {ct.avgDrift != null ? `${Math.round(ct.avgDrift)}m` : "—"}
                  </span>
                  <span className="w-16 text-right text-[10px] tabular-nums text-muted-foreground/60">
                    {ct.count.toLocaleString()} calls
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Area performance chart */}
      {areaStats.length > 1 && (
        <Card className="border-border/60 bg-card shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              Avg Drift by Area
            </CardTitle>
            <CardDescription className="text-xs">Which geographic areas show most schedule deviation</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(() => {
              const maxAreaDrift = Math.max(...areaStats.map((a) => a.avgDrift ?? 0), 1);
              return areaStats.slice(0, 8).map((area) => {
                const pct = area.avgDrift != null ? (area.avgDrift / maxAreaDrift) * 100 : 0;
                const barColour = (area.avgDrift ?? 0) >= 45 ? "bg-rose-500" : (area.avgDrift ?? 0) >= 20 ? "bg-amber-500" : (area.avgDrift ?? 0) >= 10 ? "bg-yellow-400" : "bg-emerald-500";
                return (
                  <div key={area.area} className="flex items-center gap-2">
                    <span className="w-32 text-[10px] text-muted-foreground truncate shrink-0">{area.area}</span>
                    <div className="flex-1 h-2.5 rounded-full bg-muted/50 overflow-hidden">
                      <div className={`h-full rounded-full ${barColour} transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-12 text-right text-[10px] tabular-nums text-muted-foreground">
                      {area.avgDrift != null ? `${Math.round(area.avgDrift)}m` : "—"}
                    </span>
                    <span className="w-14 text-right text-[10px] tabular-nums text-muted-foreground/60">
                      {area.slotCount} slot{area.slotCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                );
              });
            })()}
          </CardContent>
        </Card>
      )}

      {/* Time-of-day drift heatmap */}
      {timeBandStats.length > 1 && (
        <Card className="border-border/60 bg-card shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Schedule Drift by Time of Day
            </CardTitle>
            <CardDescription className="text-xs">Which time bands show most deviation from planned start times</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-1.5 h-20">
              {(() => {
                const maxDrift = Math.max(...timeBandStats.map((t) => t.avgDrift ?? 0), 1);
                return timeBandStats.map((t) => {
                  const heightPct = t.avgDrift != null ? (t.avgDrift / maxDrift) * 100 : 0;
                  const barColour = (t.avgDrift ?? 0) >= 45 ? "bg-rose-500" : (t.avgDrift ?? 0) >= 20 ? "bg-amber-500" : (t.avgDrift ?? 0) >= 10 ? "bg-yellow-400" : "bg-emerald-400";
                  return (
                    <div key={t.band} className="flex-1 flex flex-col items-center gap-1" title={`${t.band}: ${t.avgDrift != null ? Math.round(t.avgDrift) + "m avg drift" : "no data"} (${t.count} slots)`}>
                      <span className="text-[9px] tabular-nums text-muted-foreground leading-none">
                        {t.avgDrift != null ? `${Math.round(t.avgDrift)}m` : ""}
                      </span>
                      <div className="w-full rounded-t-sm transition-all" style={{ height: `${Math.max(heightPct, 4)}%`, backgroundColor: `var(--bar-bg)` }}>
                        <div className={`w-full h-full rounded-t-sm ${barColour}`} style={{ height: "100%" }} />
                      </div>
                      <span className="text-[8px] text-muted-foreground truncate w-full text-center leading-none mt-0.5">{t.band}</span>
                    </div>
                  );
                });
              })()}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <select
            value={areaFilter}
            onChange={(e) => setAreaFilter(e.target.value)}
            className="h-8 rounded-md border border-border/70 bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {areas.map((a) => <option key={a} value={a}>{a === "all" ? "All areas" : a}</option>)}
          </select>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            value={suSearch}
            onChange={(e) => setSuSearch(e.target.value)}
            placeholder="Search service users…"
            className="h-8 pl-8 pr-3 rounded-md border border-border/70 bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary w-44"
          />
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-xs text-muted-foreground">Sort:</span>
          {(["risk", "drift", "calls", "name"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSortBy(s)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${sortBy === s ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border/60 text-muted-foreground hover:border-primary/40"}`}
            >
              {s === "risk" ? "Risk" : s === "drift" ? "Drift" : s === "calls" ? "Calls" : "Name"}
            </button>
          ))}
          <button
            type="button"
            onClick={handleExport}
            title="Export to CSV"
            className="ml-1 h-8 px-2.5 rounded-md border border-border/60 bg-background text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors flex items-center gap-1"
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            title="Print report"
            className="h-8 px-2.5 rounded-md border border-border/60 bg-background text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors flex items-center gap-1"
          >
            <FileText className="h-3.5 w-3.5" />
            Print
          </button>
        </div>
      </div>

      {/* Per-service-user table */}
      <Card className="border-border/60 bg-card shadow-medium overflow-hidden">
        <CardHeader className="border-b border-border/30 bg-muted/25 py-3 px-4 flex flex-row items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Service User Risk Breakdown
            <Badge variant="secondary" className="text-[10px] tabular-nums">{sorted.length}</Badge>
          </CardTitle>
          <CardDescription className="text-xs">Risk = weighted score combining drift · duration adherence · consistency</CardDescription>
        </CardHeader>
        <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10">
              <tr className="bg-muted/60 text-left text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border/40">
                <th className="px-2 py-2.5 w-6" />
                <th className="px-4 py-2.5 font-semibold">Service User</th>
                <th className="px-3 py-2.5 font-semibold text-right">Risk</th>
                <th className="px-3 py-2.5 font-semibold text-right">Avg Drift</th>
                <th className="px-3 py-2.5 font-semibold w-28">Drift bar</th>
                <th className="px-3 py-2.5 font-semibold text-right">Duration</th>
                <th className="px-3 py-2.5 font-semibold text-right">Consistency</th>
                <th className="px-3 py-2.5 font-semibold text-right">Calls</th>
                <th className="px-3 py-2.5 font-semibold text-right">Recs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {sorted.map((su) => {
                const driftAbs = su.avgDriftMinutes;
                const driftBand = driftAbs == null ? "none"
                  : driftAbs >= 45 ? "critical" : driftAbs >= 20 ? "high" : driftAbs >= 10 ? "moderate" : "low";
                const driftColour = driftBand === "critical" ? "text-rose-600 dark:text-rose-400 font-bold"
                  : driftBand === "high" ? "text-amber-600 dark:text-amber-400 font-semibold"
                  : driftBand === "moderate" ? "text-yellow-600 dark:text-yellow-400"
                  : driftAbs != null ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground";
                const barColour = driftBand === "critical" ? "bg-rose-500" : driftBand === "high" ? "bg-amber-500" : driftBand === "moderate" ? "bg-yellow-400" : "bg-emerald-500";
                const barPct = driftAbs != null ? Math.min(100, (driftAbs / 60) * 100) : 0;
                const durColour = su.avgDurationPct == null ? "" : su.avgDurationPct < 80 ? "text-rose-600 dark:text-rose-400" : su.avgDurationPct < 95 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400";
                const riskColour = su.riskScore >= 65 ? "text-rose-600 dark:text-rose-400" : su.riskScore >= 40 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400";
                const pending = su.hasRec - su.implemented - su.rejected;
                const isExpanded = expandedSU === su.key;
                const suSlots = slotsByServiceUser.get(su.key) ?? [];
                return (
                  <>
                    <tr
                      key={su.key}
                      className="hover:bg-muted/20 transition-colors cursor-pointer select-none"
                      onClick={() => setExpandedSU(isExpanded ? null : su.key)}
                    >
                      <td className="px-2 py-2.5 text-muted-foreground">
                        {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-foreground truncate max-w-[160px]">{su.name}</div>
                        {su.area && <div className="text-[10px] text-muted-foreground">{su.area}</div>}
                      </td>
                      <td className={`px-3 py-2.5 text-right tabular-nums font-bold ${riskColour}`}>
                        {su.riskScore}
                      </td>
                      <td className={`px-3 py-2.5 text-right tabular-nums ${driftColour}`}>
                        {driftAbs != null ? (
                          <span title={su.avgSignedDrift != null ? `Signed: ${su.avgSignedDrift > 0 ? "+" : ""}${Math.round(su.avgSignedDrift)}m` : ""}>
                            {Math.round(driftAbs)}m
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="h-2 rounded-full bg-muted/50 overflow-hidden w-24">
                          <div className={`h-full rounded-full ${barColour}`} style={{ width: `${barPct}%` }} />
                        </div>
                      </td>
                      <td className={`px-3 py-2.5 text-right tabular-nums ${durColour || "text-muted-foreground"}`}>
                        {su.avgDurationPct != null ? `${Math.round(su.avgDurationPct)}%` : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                        {su.avgConsistency != null ? `${Math.round(su.avgConsistency * 100)}%` : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{su.totalCalls.toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-right">
                        {su.hasRec > 0 ? (
                          <div className="flex items-center justify-end gap-1">
                            {su.implemented > 0 && <span className="text-emerald-600 dark:text-emerald-400 tabular-nums">{su.implemented}✓</span>}
                            {pending > 0 && <span className="text-amber-600 dark:text-amber-400 tabular-nums">{pending}p</span>}
                            {su.rejected > 0 && <span className="text-rose-500 tabular-nums">{su.rejected}✗</span>}
                          </div>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${su.key}-expand`}>
                        <td colSpan={9} className="px-0 py-0 bg-muted/10">
                          <div className="overflow-x-auto border-t border-border/20">
                            <table className="w-full text-[11px]">
                              <thead>
                                <tr className="bg-muted/30 text-left text-[9px] uppercase tracking-wide text-muted-foreground border-b border-border/30">
                                  <th className="pl-10 pr-3 py-1.5 font-semibold">Call Type</th>
                                  <th className="px-3 py-1.5 font-semibold">Time Band</th>
                                  <th className="px-3 py-1.5 font-semibold text-right">Planned</th>
                                  <th className="px-3 py-1.5 font-semibold text-right">Avg Start</th>
                                  <th className="px-3 py-1.5 font-semibold text-right">Drift</th>
                                  <th className="px-3 py-1.5 font-semibold text-right">Duration%</th>
                                  <th className="px-3 py-1.5 font-semibold text-right">Calls</th>
                                  <th className="px-3 py-1.5 font-semibold text-right">Rec</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border/20">
                                {suSlots
                                  .slice()
                                  .sort((a, b) => (a.averagePlannedStartMinutes ?? 0) - (b.averagePlannedStartMinutes ?? 0))
                                  .map((slot) => {
                                    const sDrift = slot.averageStartOffsetMinutes;
                                    const sAbs = sDrift != null ? Math.abs(sDrift) : null;
                                    const sDriftColour = sAbs == null ? "text-muted-foreground" : sAbs >= 45 ? "text-rose-600 dark:text-rose-400 font-bold" : sAbs >= 20 ? "text-amber-600 dark:text-amber-400 font-semibold" : sAbs >= 10 ? "text-yellow-600 dark:text-yellow-400" : "text-emerald-600 dark:text-emerald-400";
                                    const fmtMins = (m: number | null) => {
                                      if (m == null) return "—";
                                      const h = Math.floor(m / 60); const mm = Math.round(m % 60);
                                      return `${h.toString().padStart(2, "0")}:${mm.toString().padStart(2, "0")}`;
                                    };
                                    const dec = decisions[slot.key];
                                    return (
                                      <tr key={slot.key} className="hover:bg-muted/20 transition-colors">
                                        <td className="pl-10 pr-3 py-1.5 text-foreground/80">{slot.callTypeLabel}</td>
                                        <td className="px-3 py-1.5 text-muted-foreground">{slot.timeBandLabel}</td>
                                        <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{fmtMins(slot.averagePlannedStartMinutes)}</td>
                                        <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{fmtMins(slot.averageActualStartMinutes)}</td>
                                        <td className={`px-3 py-1.5 text-right tabular-nums ${sDriftColour}`}>
                                          {sDrift != null ? (sDrift > 0 ? `+${Math.round(sDrift)}m` : `${Math.round(sDrift)}m`) : "—"}
                                        </td>
                                        <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                                          {slot.averageDurationPercent != null ? `${Math.round(slot.averageDurationPercent)}%` : "—"}
                                        </td>
                                        <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{slot.totalCalls}</td>
                                        <td className="px-3 py-1.5 text-right">
                                          {slot.hasRecommendation ? (
                                            <span className={`text-[9px] font-medium ${dec === "implemented" ? "text-emerald-600 dark:text-emerald-400" : dec === "rejected" ? "text-rose-500" : "text-amber-600 dark:text-amber-400"}`}>
                                              {dec === "implemented" ? "✓ Done" : dec === "rejected" ? "✗ Skip" : "Pending"}
                                            </span>
                                          ) : <span className="text-muted-foreground/50">—</span>}
                                        </td>
                                      </tr>
                                    );
                                  })}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Top 10 highest-drift call slots */}
      {(() => {
        const top = [...filteredSlots]
          .filter((s) => typeof s.averageStartOffsetMinutes === "number")
          .sort((a, b) => Math.abs(b.averageStartOffsetMinutes!) - Math.abs(a.averageStartOffsetMinutes!))
          .slice(0, 10);
        if (top.length === 0) return null;
        return (
          <Card className="border-border/60 bg-card shadow-medium overflow-hidden">
            <CardHeader className="border-b border-border/30 bg-muted/25 py-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-500" />
                Top 10 Highest-Drift Call Slots
              </CardTitle>
              <CardDescription className="text-xs">
                Calls where the average actual start deviates most from the planned time
              </CardDescription>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/30 text-left text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border/40">
                    <th className="px-4 py-2 font-semibold">Service User</th>
                    <th className="px-3 py-2 font-semibold">Call Type</th>
                    <th className="px-3 py-2 font-semibold">Time Band</th>
                    <th className="px-3 py-2 font-semibold text-right">Planned</th>
                    <th className="px-3 py-2 font-semibold text-right">Avg Actual</th>
                    <th className="px-3 py-2 font-semibold text-right">Drift</th>
                    <th className="px-3 py-2 font-semibold text-right" title="Avg actual minus planned duration">Dur Gap</th>
                    <th className="px-3 py-2 font-semibold text-right">Consistency</th>
                    <th className="px-3 py-2 font-semibold text-right">Rec</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {top.map((slot) => {
                    const drift = Math.round(slot.averageStartOffsetMinutes!);
                    const abs = Math.abs(drift);
                    const driftColour = abs >= 45 ? "text-rose-600 dark:text-rose-400 font-bold"
                      : abs >= 20 ? "text-amber-600 dark:text-amber-400 font-semibold"
                      : "text-yellow-600 dark:text-yellow-400";
                    const fmt = (m: number | null) => {
                      if (m == null) return "—";
                      const h = Math.floor(m / 60); const mm = Math.round(m % 60);
                      return `${h.toString().padStart(2, "0")}:${mm.toString().padStart(2, "0")}`;
                    };
                    const durGap = slot.averageActualDurationMinutes != null && slot.averagePlannedDurationMinutes != null
                      ? Math.round(slot.averageActualDurationMinutes - slot.averagePlannedDurationMinutes) : null;
                    const durGapColour = durGap == null ? "text-muted-foreground" : durGap < -5 ? "text-rose-600 dark:text-rose-400 font-semibold" : durGap > 5 ? "text-sky-600 dark:text-sky-400" : "text-muted-foreground";
                    return (
                      <tr key={slot.key} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-2 font-medium text-foreground truncate max-w-[140px]">{slot.serviceUserName}</td>
                        <td className="px-3 py-2 text-muted-foreground">{slot.callTypeLabel}</td>
                        <td className="px-3 py-2 text-muted-foreground">{slot.timeBandLabel}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmt(slot.averagePlannedStartMinutes)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmt(slot.averageActualStartMinutes)}</td>
                        <td className={`px-3 py-2 text-right tabular-nums ${driftColour}`}>
                          {drift > 0 ? `+${drift}m` : `${drift}m`}
                        </td>
                        <td className={`px-3 py-2 text-right tabular-nums ${durGapColour}`}>
                          {durGap != null ? (durGap > 0 ? `+${durGap}m` : `${durGap}m`) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {typeof slot.offsetConsistency === "number" ? `${Math.round(slot.offsetConsistency * 100)}%` : "—"}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {slot.hasRecommendation ? (
                            <Badge variant="secondary" className={`text-[9px] px-1.5 ${decisions[slot.key] === "implemented" ? "text-emerald-600 dark:text-emerald-400" : decisions[slot.key] === "rejected" ? "text-rose-500" : ""}`}>
                              {decisions[slot.key] === "implemented" ? "✓ Done" : decisions[slot.key] === "rejected" ? "✗ Skip" : "Pending"}
                            </Badge>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        );
      })()}

      {/* Priority Recommendation Queue */}
      {priorityRecs.length > 0 && (
        <Card className="border-border/60 bg-card shadow-medium overflow-hidden">
          <CardHeader className="border-b border-border/30 bg-muted/25 py-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-amber-500" />
              Priority Recommendation Queue
              <Badge variant="secondary" className="text-[10px] tabular-nums">{priorityRecs.length}</Badge>
            </CardTitle>
            <CardDescription className="text-xs">Highest-impact pending recommendations ranked by drift × call volume</CardDescription>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/30 text-left text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border/40">
                  <th className="px-4 py-2 font-semibold">#</th>
                  <th className="px-3 py-2 font-semibold">Service User</th>
                  <th className="px-3 py-2 font-semibold">Call</th>
                  <th className="px-3 py-2 font-semibold">Time Band</th>
                  <th className="px-3 py-2 font-semibold text-right">Current</th>
                  <th className="px-3 py-2 font-semibold text-right">Suggested</th>
                  <th className="px-3 py-2 font-semibold text-right">Drift</th>
                  <th className="px-3 py-2 font-semibold text-right">Impact</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {priorityRecs.map(({ slot, impact }, idx) => {
                  const drift = slot.averageStartOffsetMinutes != null ? Math.round(slot.averageStartOffsetMinutes) : null;
                  const abs = drift != null ? Math.abs(drift) : 0;
                  const driftColour = abs >= 45 ? "text-rose-600 dark:text-rose-400 font-bold" : abs >= 20 ? "text-amber-600 dark:text-amber-400 font-semibold" : "text-yellow-600 dark:text-yellow-400";
                  const impactHours = Math.round(impact / 60);
                  return (
                    <tr key={slot.key} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2 text-muted-foreground font-mono">{idx + 1}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-foreground truncate max-w-[130px]">{slot.serviceUserName}</div>
                        {slot.serviceUserArea && <div className="text-[10px] text-muted-foreground">{slot.serviceUserArea}</div>}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{slot.callTypeLabel}</td>
                      <td className="px-3 py-2 text-muted-foreground">{slot.timeBandLabel}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{slot.averagePlannedStartMinutes != null ? (() => { const h = Math.floor(slot.averagePlannedStartMinutes / 60); const m = Math.round(slot.averagePlannedStartMinutes % 60); return `${h.toString().padStart(2,"0")}:${m.toString().padStart(2,"0")}`; })() : "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-primary font-medium">{slot.suggestedPlannedTimeLabel ?? "—"}</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${driftColour}`}>
                        {drift != null ? (drift > 0 ? `+${abs}m` : `-${abs}m`) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                          {impactHours > 0 ? `~${impactHours}h` : `${Math.round(impact)}m`}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Data quality warning */}
      {dataQuality.length > 0 && (
        <Card className="border-amber-200 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/10 shadow-sm overflow-hidden">
          <CardHeader className="border-b border-amber-200/60 dark:border-amber-800/30 py-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Low Data Coverage
            </CardTitle>
            <CardDescription className="text-xs">These service users have fewer than 70% of calls with timing data — drift analysis may be inaccurate</CardDescription>
          </CardHeader>
          <CardContent className="pt-3 pb-3">
            <div className="flex flex-wrap gap-2">
              {dataQuality.map((su) => (
                <div key={su.key} className="flex items-center gap-1.5 rounded-md border border-amber-200 dark:border-amber-800/50 bg-white/60 dark:bg-amber-950/20 px-2.5 py-1">
                  <span className="text-xs font-medium text-foreground">{su.name}</span>
                  {su.area && <span className="text-[10px] text-muted-foreground">· {su.area}</span>}
                  <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 tabular-nums ml-1">{su.coveragePct}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  );
}

export default function SecretAdminPortal() {
  usePageTitle("Admin Portal");
  const { users, approveUser, rejectUser, auditLogs, fetchUsers } = useAuth();
  const [, navigate] = useLocation();
  const [mounted, setMounted] = useState(false);
  const [adminTab, setAdminTab] = useState<AdminPortalTab>("overview");
  const [adminAlerts, setAdminAlerts] = useState<AdminAlert[]>([]);
  const { toast } = useToast();
  
  // New User State
  const [newUserUsername, setNewUserUsername] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<UserRole>(DEFAULT_USER_ROLE);
  const [newUserJobTitle, setNewUserJobTitle] = useState("");
  const [newUserFirstName, setNewUserFirstName] = useState("");
  const [newUserLastName, setNewUserLastName] = useState("");

  // System Logs State
  const [logSearch, setLogSearch] = useState("");
  const [logStatusFilter, setLogStatusFilter] = useState<string>("all");
  const [systemLogs, setSystemLogs] = useState<SystemLog[]>(auditLogs);

  // User Management State
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState<string>("all");
  const [userStatusFilter, setUserStatusFilter] = useState<string>("all");
  type UserSortKey = "username" | "jobTitle" | "role" | "status" | "lastOnlineAt";
  const [userSortKey, setUserSortKey] = useState<UserSortKey>("lastOnlineAt");
  const [userSortDir, setUserSortDir] = useState<"asc" | "desc">("desc");
  const toggleUserSort = (key: UserSortKey) => {
    if (userSortKey === key) {
      setUserSortDir(prev => (prev === "asc" ? "desc" : "asc"));
    } else {
      setUserSortKey(key);
      // Sensible defaults: time newest-first, text A→Z
      setUserSortDir(key === "lastOnlineAt" ? "desc" : "asc");
    }
  };
  const [editingUser, setEditingUser] = useState<EditingUser | null>(null);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<string | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<{ id: string; username: string } | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState("");

  // System Log Dialog State
  const [systemLogDialogOpen, setSystemLogDialogOpen] = useState(false);
  const [showResetDataConfirm, setShowResetDataConfirm] = useState(false);
  const [userActionLoading, setUserActionLoading] = useState(false);
  const [auditCompletionLogs, setAuditCompletionLogs] = useState<Array<{
    id: string;
    auditType: string;
    serviceUserInitials: string;
    auditor: string;
    periodStart: string;
    periodEnd: string;
    createdAt: string;
  }>>([]);
  const [extensionInfo, setExtensionInfo] = useState<ExtensionPackageInfo | null>(null);
  const [extensionInfoLoading, setExtensionInfoLoading] = useState(false);
  const [extensionInfoRefreshing, setExtensionInfoRefreshing] = useState(false);
  const [extensionInfoUpdating, setExtensionInfoUpdating] = useState(false);
  const [installedExtensionStatus, setInstalledExtensionStatus] = useState<InstalledExtensionStatus | null>(null);
  const [extensionTestStatus, setExtensionTestStatus] = useState<"idle" | "testing" | "success" | "failed">("idle");
  const [extensionTestMessage, setExtensionTestMessage] = useState("");
  const [acpServiceUsers, setAcpServiceUsers] = useState<AdminAcpServiceUser[]>([]);
  const [acpServiceUsersLoading, setAcpServiceUsersLoading] = useState(false);
  const [acpServiceUserPickerOpen, setAcpServiceUserPickerOpen] = useState(false);
  const [selectedAcpServiceUser, setSelectedAcpServiceUser] = useState<AdminAcpServiceUser | null>(null);
  const [acpServiceUsersDeletingLoading, setAcpServiceUsersDeletingLoading] = useState(false);
  const [opsHealth, setOpsHealth] = useState<OpsHealthSnapshot | null>(null);

  const formatExtensionTestError = (error?: string) => {
    const base = error?.trim() || "Unknown extension error.";

    if (/updated|refresh this page/i.test(base)) {
      return `${base} Refresh this admin page so the content script matches the current extension build.`;
    }

    if (/background service unavailable/i.test(base)) {
      return `${base} Open the extension popup once, then retry if Edge suspended the background worker.`;
    }

    if (/invalid|unsupported/i.test(base)) {
      return `${base} The test payload was rejected before it could be stored in the extension.`;
    }

    return `Extension responded with error: ${base}`;
  };

  const sendExtensionTestPayload = async ({
    messageType,
    payload,
    pendingMessage,
    successMessage,
    timeoutMessage,
  }: {
    messageType: "CA_SEND_TO_ACP_EXTENSION" | "CA_EXTENSION_STORE_PAYLOAD";
    payload: Record<string, unknown>;
    pendingMessage: string;
    successMessage: string;
    timeoutMessage: string;
  }) => {
    if (typeof window === "undefined") return;

    setExtensionTestStatus("testing");
    setExtensionTestMessage(pendingMessage);

    const requestId =
      typeof window.crypto !== "undefined" && typeof window.crypto.randomUUID === "function"
        ? window.crypto.randomUUID()
        : `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    try {
      const response = await new Promise<{ ok: boolean; error?: string }>((resolve, reject) => {
        let handler: ((event: MessageEvent) => void) | null = null;
        const timeoutId = window.setTimeout(() => {
          if (handler) window.removeEventListener("message", handler);
          reject(new Error(timeoutMessage));
        }, 3000);

        handler = (event: MessageEvent) => {
          if (event.source !== window) return;
          if (!event.data || event.data.type !== "CA_EXTENSION_ACK") return;
          if (event.data.requestId !== requestId) return;
          window.clearTimeout(timeoutId);
          window.removeEventListener("message", handler!);
          resolve({ ok: Boolean(event.data.ok), error: event.data.error });
        };

        window.addEventListener("message", handler);
        window.postMessage({ type: messageType, requestId, payload }, window.location.origin);
      });

      if (response.ok) {
        setExtensionTestStatus("success");
        setExtensionTestMessage(successMessage);
        return;
      }

      setExtensionTestStatus("failed");
      setExtensionTestMessage(formatExtensionTestError(response.error));
    } catch (error) {
      setExtensionTestStatus("failed");
      setExtensionTestMessage(error instanceof Error ? error.message : timeoutMessage);
    }
  };

  useEffect(() => {
    setMounted(true);
    fetchAdminAlerts();
    fetch("/api/admin/ops-health", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setOpsHealth(d); })
      .catch(() => {});
  }, []);

  const fetchAuditCompletionLogs = async () => {
    try {
      const response = await fetch("/api/audits", {
        credentials: "include",
      });
      if (response.ok) {
        const audits = await response.json();
        const formattedLogs = audits.map((audit: any) => ({
          id: audit.id,
          auditType: audit.auditType,
          serviceUserInitials: audit.serviceUserName,
          auditor: audit.auditor,
          periodStart: audit.periodStart,
          periodEnd: audit.periodEnd,
          createdAt: audit.createdAt,
        }));
        setAuditCompletionLogs(formattedLogs);
      }
    } catch (error) {
      console.error("Failed to fetch audit logs:", error);
    }
  };

  const handleOpenSystemLogDialog = () => {
    setSystemLogDialogOpen(true);
    fetchAuditCompletionLogs();
  };

  const handleResetPerformanceData = async () => {
    setShowResetDataConfirm(false);
    try {
      const res = await fetch("/api/admin/reset-performance-data", {
        method: "POST",
        credentials: "include"
      });
      if (res.ok) {
        const data = await res.json();
        toast({ 
          title: "Data Cleared", 
          description: `Deleted: ${data.deleted.careWorkers} workers, ${data.deleted.discrepancies} discrepancies, ${data.deleted.audits} audits, ${data.deleted.adminAlerts} alerts` 
        });
      } else {
        toast({ title: "Error", description: "Failed to reset data", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to reset data", variant: "destructive" });
    }
  };

  useEffect(() => {
    setSystemLogs(auditLogs);
  }, [auditLogs]);

  const fetchAdminAlerts = async () => {
    try {
      const response = await fetch("/api/admin-alerts", {
        credentials: "include",
      });
      
      if (response.ok) {
        const alerts = await response.json();
        setAdminAlerts(alerts);
      }
    } catch (error) {
      console.error("Failed to fetch admin alerts:", error);
    }
  };

  const fetchExtensionPackageInfo = async ({
    fresh = false,
    updateVersion = false,
  }: {
    fresh?: boolean;
    updateVersion?: boolean;
  } = {}) => {
    if (!extensionInfo) {
      setExtensionInfoLoading(true);
    } else if (updateVersion) {
      setExtensionInfoUpdating(true);
    } else {
      setExtensionInfoRefreshing(true);
    }

    try {
      const params = new URLSearchParams();
      if (fresh) params.set("fresh", "1");
      if (updateVersion) params.set("update", "1");
      const query = params.toString();

      const response = await fetch(`/api/admin/extension/info${query ? `?${query}` : ""}`, {
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || "Failed to fetch extension package status.");
      }

      setExtensionInfo(data as ExtensionPackageInfo);
      if (updateVersion) {
        const previousVersion = typeof data.previousManifestVersion === "string" ? data.previousManifestVersion : null;
        const nextVersion = typeof data.manifestVersion === "string" ? data.manifestVersion : null;
        toast({
          title: "Extension updated",
          description:
            previousVersion && nextVersion && previousVersion !== nextVersion
              ? `Manifest version bumped from ${previousVersion} to ${nextVersion}. Download the updated Edge package below.`
              : "Extension package rebuilt. Download the latest Edge package below.",
        });
      } else if (fresh) {
        toast({
          title: "Extension package refreshed",
          description: "Latest Edge extension build is ready to download.",
        });
      }
    } catch (error) {
      console.error("Failed to fetch extension package info:", error);
      toast({
        title: "Extension status unavailable",
        description: error instanceof Error ? error.message : "Could not load extension package metadata.",
        variant: "destructive",
      });
    } finally {
      setExtensionInfoLoading(false);
      setExtensionInfoRefreshing(false);
      setExtensionInfoUpdating(false);
    }
  };

  const fetchAcpServiceUsers = async () => {
    setAcpServiceUsersLoading(true);

    try {
      const response = await fetch("/api/admin/extension/acp-service-users", {
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || "Failed to load ACP service users.");
      }

      const nextUsers = Array.isArray(data.users) ? data.users as AdminAcpServiceUser[] : [];
      setAcpServiceUsers(nextUsers);
      setSelectedAcpServiceUser((current) => {
        if (!current) return null;
        return nextUsers.find((user) => user.accessCarePlanningId === current.accessCarePlanningId) ?? null;
      });
    } catch (error) {
      console.error("Failed to fetch ACP service users:", error);
      toast({
        title: "ACP service users unavailable",
        description: error instanceof Error ? error.message : "Could not load the ACP service user launcher.",
        variant: "destructive",
      });
    } finally {
      setAcpServiceUsersLoading(false);
    }
  };

  const deleteAllAcpServiceUsers = async () => {
    if (!window.confirm(`Delete all ${acpServiceUsers.length} imported ACP service users? This cannot be undone.`)) {
      return;
    }

    setAcpServiceUsersDeletingLoading(true);

    try {
      const response = await fetch("/api/admin/extension/acp-service-users", {
        method: "DELETE",
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || "Failed to delete ACP service users.");
      }

      setAcpServiceUsers([]);
      setSelectedAcpServiceUser(null);
      toast({
        title: "Service users deleted",
        description: `Successfully deleted ${data.deletedCount} service users.`,
      });
    } catch (error) {
      console.error("Failed to delete ACP service users:", error);
      toast({
        title: "Deletion failed",
        description: error instanceof Error ? error.message : "Could not delete the ACP service users.",
        variant: "destructive",
      });
    } finally {
      setAcpServiceUsersDeletingLoading(false);
    }
  };

  useEffect(() => {
    if (!mounted) return;
    void fetchExtensionPackageInfo();
    void fetchAcpServiceUsers();
  }, [mounted]);

  useEffect(() => {
    if (!mounted || typeof window === "undefined") return;

    const requestInstalledExtensionStatus = () => {
      window.postMessage({ type: "CA_EXTENSION_REQUEST_STATUS" }, window.location.origin);
    };

    const handleInstalledExtensionStatus = (event: MessageEvent) => {
      if (event.source !== window) return;
      if (!event.data || event.data.type !== "CA_EXTENSION_STATUS") return;

      const payload = event.data.payload;
      if (!payload || typeof payload !== "object") return;

      setInstalledExtensionStatus({
        detected: Boolean((payload as Record<string, unknown>).detected),
        refreshRequired: Boolean((payload as Record<string, unknown>).refreshRequired),
        version:
          typeof (payload as Record<string, unknown>).version === "string"
            ? ((payload as Record<string, unknown>).version as string)
            : null,
        name:
          typeof (payload as Record<string, unknown>).name === "string"
            ? ((payload as Record<string, unknown>).name as string)
            : null,
        origin:
          typeof (payload as Record<string, unknown>).origin === "string"
            ? ((payload as Record<string, unknown>).origin as string)
            : null,
        error:
          typeof (payload as Record<string, unknown>).error === "string"
            ? ((payload as Record<string, unknown>).error as string)
            : null,
        lastSeenAt:
          typeof (payload as Record<string, unknown>).lastSeenAt === "string"
            ? ((payload as Record<string, unknown>).lastSeenAt as string)
            : null,
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        requestInstalledExtensionStatus();
      }
    };

    window.addEventListener("message", handleInstalledExtensionStatus);
    window.addEventListener("focus", requestInstalledExtensionStatus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    requestInstalledExtensionStatus();

    return () => {
      window.removeEventListener("message", handleInstalledExtensionStatus);
      window.removeEventListener("focus", requestInstalledExtensionStatus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [mounted]);

  const openAcpDashboard = (serviceUser: AdminAcpServiceUser) => {
    if (typeof window === "undefined") return;

    const popup = window.open(serviceUser.dashboardUrl, "_blank", "noopener,noreferrer");
    if (!popup) {
      toast({
        title: "Dashboard tab blocked",
        description: `Allow pop-ups for CareAssurance, then retry opening ${serviceUser.serviceUserName}.`,
        variant: "destructive",
      });
    }
  };

  const handleSelectAcpServiceUser = (serviceUser: AdminAcpServiceUser) => {
    setSelectedAcpServiceUser(serviceUser);
    setAcpServiceUserPickerOpen(false);
    openAcpDashboard(serviceUser);
    toast({
      title: "ACP dashboard opened",
      description: `${serviceUser.serviceUserName} (${serviceUser.accessCarePlanningId}) was opened in a new tab.`,
    });
  };

  const handleLaunchAcpWorkflow = (workflow: AdminAcpWorkflow) => {
    if (!selectedAcpServiceUser) {
      toast({
        title: "Select a service user",
        description: "Choose an ACP service user first to launch a workflow.",
        variant: "destructive",
      });
      return;
    }

    const params = new URLSearchParams({
      serviceUserName: selectedAcpServiceUser.serviceUserName,
      acpId: selectedAcpServiceUser.accessCarePlanningId,
      launchSource: "admin-portal",
    });

    navigate(`${ADMIN_ACP_WORKFLOWS[workflow].path}?${params.toString()}`);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserUsername || !newUserPassword) return;
    const pwError = validatePassword(newUserPassword);
    if (pwError) {
      toast({
        title: "Password Too Weak",
        description: pwError,
        variant: "destructive",
      });
      return;
    }
    
    setUserActionLoading(true);
    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: newUserUsername,
          password: newUserPassword,
          role: newUserRole,
          jobTitle: newUserJobTitle || undefined,
          firstName: newUserFirstName || undefined,
          lastName: newUserLastName || undefined,
        }),
        credentials: "include",
      });

      if (response.ok) {
        await fetchUsers();
        setNewUserUsername("");
        setNewUserPassword("");
        setNewUserRole(DEFAULT_USER_ROLE);
        setNewUserJobTitle("");
        setNewUserFirstName("");
        setNewUserLastName("");
        toast({
          title: "User Created",
          description: `Account for ${newUserUsername} has been created.`,
        });
      } else {
        const data = await response.json();
        toast({
          title: "Creation Failed",
          description: data.message || "Could not create user.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create user.",
        variant: "destructive",
      });
    } finally {
      setUserActionLoading(false);
    }
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;
    
    setUserActionLoading(true);
    try {
      const originalUser = users.find(u => u.id === editingUser.id);
      let hasError = false;
      
      // Update username if changed
      if (originalUser && originalUser.username !== editingUser.username) {
        const usernameRes = await fetch(`/api/users/${editingUser.id}/username`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: editingUser.username }),
          credentials: "include",
        });

        if (!usernameRes.ok) {
          const data = await usernameRes.json().catch(() => ({}));
          toast({
            title: "Username Update Failed",
            description: data.message || "Could not update username.",
            variant: "destructive",
          });
          hasError = true;
        }
      }
      
      // Update first/last name
      const nameRes = await fetch(`/api/admin/users/${editingUser.id}/name`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          firstName: editingUser.firstName || null, 
          lastName: editingUser.lastName || null 
        }),
        credentials: "include",
      });

      if (!nameRes.ok) {
        const data = await nameRes.json().catch(() => ({}));
        toast({
          title: "Name Update Failed",
          description: data.message || "Could not update name.",
          variant: "destructive",
        });
        hasError = true;
      }
      
      // Update job title
      const jobTitleRes = await fetch(`/api/users/${editingUser.id}/job-title`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobTitle: editingUser.jobTitle }),
        credentials: "include",
      });

      if (!jobTitleRes.ok) {
        const data = await jobTitleRes.json().catch(() => ({}));
        toast({
          title: "Job Title Update Failed",
          description: data.message || "Could not update job title.",
          variant: "destructive",
        });
        hasError = true;
      }

      // Update role if changed
      if (originalUser && originalUser.role !== editingUser.role) {
        const roleRes = await fetch(`/api/users/${editingUser.id}/role`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: editingUser.role }),
          credentials: "include",
        });

        if (!roleRes.ok) {
          const data = await roleRes.json().catch(() => ({}));
          toast({
            title: "Role Update Failed",
            description: data.message || "Could not update role.",
            variant: "destructive",
          });
          hasError = true;
        }
      }

      await fetchUsers();
      setEditingUser(null);
      
      if (!hasError) {
        toast({
          title: "User Updated",
          description: "User details have been saved.",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update user.",
        variant: "destructive",
      });
    } finally {
      setUserActionLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetPasswordUser) return;
    if (!resetPasswordValue || !resetPasswordConfirm) {
      toast({ title: "Missing Password", description: "Enter and confirm the new password.", variant: "destructive" });
      return;
    }
    if (resetPasswordValue !== resetPasswordConfirm) {
      toast({ title: "Password Mismatch", description: "Passwords do not match.", variant: "destructive" });
      return;
    }
    const resetPwError = validatePassword(resetPasswordValue);
    if (resetPwError) {
      toast({ title: "Password Too Weak", description: resetPwError, variant: "destructive" });
      return;
    }

    setUserActionLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${resetPasswordUser.id}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: resetPasswordValue }),
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({ title: "Password Reset", description: data.message || "Password reset successfully." });
        setResetPasswordUser(null);
        setResetPasswordValue("");
        setResetPasswordConfirm("");
      } else {
        const data = await res.json().catch(() => ({}));
        toast({ title: "Error", description: data.message || "Failed to reset password", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to reset password", variant: "destructive" });
    } finally {
      setUserActionLoading(false);
    }
  };

  const handleDisconnectSession = async (userId: string, username: string) => {
    try {
      const response = await fetch(`/api/sessions/${userId}/disconnect`, {
        method: "POST",
        credentials: "include",
      });

      if (response.ok) {
        toast({
          title: "Session Disconnected",
          description: `${username}'s session has been terminated.`,
        });
        await fetchUsers();
      } else {
        const data = await response.json();
        toast({
          title: "Disconnect Failed",
          description: data.message || "Could not disconnect user session.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to disconnect session.",
        variant: "destructive",
      });
    }
  };

  const handleArchiveUserAccount = async (userId: string, username: string) => {
    setUserActionLoading(true);
    try {
      const response = await fetch(`/api/users/${userId}/archive`, {
        method: "PATCH",
        credentials: "include",
      });
      if (response.ok) {
        await fetchUsers();
        toast({
          title: "User Archived",
          description: `${username} can no longer log in. Use the Archived filter to restore them.`,
        });
      } else {
        const data = await response.json().catch(() => ({}));
        toast({
          title: "Failed to Archive User",
          description: data.message || `Server returned ${response.status}`,
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: "Error", description: "Failed to archive user.", variant: "destructive" });
    } finally {
      setUserActionLoading(false);
    }
  };

  const handleUnarchiveUserAccount = async (userId: string, username: string) => {
    setUserActionLoading(true);
    try {
      const response = await fetch(`/api/users/${userId}/unarchive`, {
        method: "PATCH",
        credentials: "include",
      });
      if (response.ok) {
        await fetchUsers();
        toast({
          title: "User Restored",
          description: `${username} has been restored to an active account.`,
        });
      } else {
        const data = await response.json().catch(() => ({}));
        toast({
          title: "Failed to Restore User",
          description: data.message || `Server returned ${response.status}`,
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: "Error", description: "Failed to restore user.", variant: "destructive" });
    } finally {
      setUserActionLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    setUserActionLoading(true);
    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (response.ok) {
        await fetchUsers();
        setDeleteConfirmUser(null);
        toast({
          title: "User Removed",
          description: "The user has been removed from the system.",
        });
      } else {
        const data = await response.json().catch(() => ({ message: "Unknown error" }));
        toast({
          title: "Failed to Remove User",
          description: data.message || `Server returned ${response.status}`,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete user.",
        variant: "destructive",
      });
    } finally {
      setUserActionLoading(false);
    }
  };

  const handleMarkAlertRead = async (alertId: string) => {
    try {
      const response = await fetch(`/api/admin-alerts/${alertId}/read`, {
        method: "PATCH",
        credentials: "include",
      });
      
      if (response.ok) {
        setAdminAlerts(prev => prev.filter(a => a.id !== alertId));
        toast({
          title: "Alert Dismissed",
          description: "Alert marked as read.",
        });
      }
    } catch (error) {
      console.error("Failed to mark alert as read:", error);
    }
  };

  // Filter logs
  const filteredLogs = useMemo(() => systemLogs.filter(log => {
    const matchesSearch = logSearch === "" || 
      log.user.toLowerCase().includes(logSearch.toLowerCase()) ||
      log.action.toLowerCase().includes(logSearch.toLowerCase()) ||
      log.target?.toLowerCase().includes(logSearch.toLowerCase());
    
    const matchesStatus = logStatusFilter === "all" || log.status === logStatusFilter;
    
    return matchesSearch && matchesStatus;
  }), [systemLogs, logSearch, logStatusFilter]);

  // Filter users
  const filteredUsers = useMemo(() => {
    const filtered = users.filter(u => {
      const matchesSearch = userSearch === "" ||
        u.username.toLowerCase().includes(userSearch.toLowerCase()) ||
        (u.jobTitle && u.jobTitle.toLowerCase().includes(userSearch.toLowerCase()));

      const matchesRole = userRoleFilter === "all" || u.role === userRoleFilter;
      // "All Status" hides archived users; they only appear when explicitly filtered to "archived".
      const matchesStatus = userStatusFilter === "all"
        ? u.status !== "archived"
        : u.status === userStatusFilter;

      return matchesSearch && matchesRole && matchesStatus;
    });

    const dir = userSortDir === "asc" ? 1 : -1;
    const getSortValue = (u: typeof users[number]): string | number => {
      switch (userSortKey) {
        case "username": return (u.username || "").toLowerCase();
        case "jobTitle": return (u.jobTitle || "").toLowerCase();
        case "role": return (u.role || "").toLowerCase();
        case "status": return (u.status || "").toLowerCase();
        case "lastOnlineAt": return u.lastOnlineAt ? new Date(u.lastOnlineAt).getTime() : 0;
      }
    };
    return [...filtered].sort((a, b) => {
      const av = getSortValue(a);
      const bv = getSortValue(b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [users, userSearch, userRoleFilter, userStatusFilter, userSortKey, userSortDir]);

  const pendingUsers = useMemo(() => users.filter(u => u.status === "pending"), [users]);
  const activeUsers = useMemo(() => users.filter(u => u.status === "active"), [users]);
  const suspendedUsers = useMemo(() => users.filter(u => u.status === "suspended"), [users]);
  const archivedUsers = useMemo(() => users.filter(u => u.status === "archived"), [users]);
  const inactiveActiveUsers = useMemo(() => {
    const staleAfterMs = 14 * 24 * 60 * 60 * 1000;
    return activeUsers.filter((u) => {
      if (!u.lastOnlineAt) return true;
      const lastSeen = new Date(u.lastOnlineAt).getTime();
      return Number.isNaN(lastSeen) || Date.now() - lastSeen > staleAfterMs;
    });
  }, [activeUsers]);
  const extensionManifestVersion = extensionInfo?.manifestVersion || "Unknown";
  const extensionSizeLabel = formatBytes(extensionInfo?.package?.sizeBytes);
  const extensionPackagedAt = extensionInfo?.package?.packagedAt
    ? new Date(extensionInfo.package.packagedAt).toLocaleString()
    : "Unavailable";
  const extensionHashShort = extensionInfo?.package?.sha256
    ? `${extensionInfo.package.sha256.slice(0, 12)}...${extensionInfo.package.sha256.slice(-8)}`
    : "Unavailable";
  const extensionDownloadUrl = (() => {
    const raw = extensionInfo?.downloadUrl || "/api/admin/extension/package?fresh=1";
    // Prefix with API base URL so <a href> navigates to the API origin,
    // not the static-site origin (which would 404 on /api routes).
    const base = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");
    return base && raw.startsWith("/") ? `${base}${raw}` : raw;
  })();
  const extensionCrxDownloadUrl = (() => {
    const raw = extensionInfo?.crxDownloadUrl || null;
    if (!raw) return null;
    const base = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");
    return base && raw.startsWith("/") ? `${base}${raw}` : raw;
  })();
  const installedExtensionVersion = installedExtensionStatus?.detected
    ? installedExtensionStatus.version || "Detected"
    : installedExtensionStatus?.refreshRequired
    ? "Refresh required"
    : "Not detected";
  const extensionVersionMismatch = Boolean(
    extensionInfo?.manifestVersion &&
      installedExtensionStatus?.version &&
      extensionInfo.manifestVersion !== installedExtensionStatus.version
  );
  const installedExtensionSeenAt = installedExtensionStatus?.lastSeenAt
    ? new Date(installedExtensionStatus.lastSeenAt).toLocaleTimeString()
    : "Unavailable";
  const extensionSyncSummary = installedExtensionStatus?.refreshRequired
    ? "This page is attached to an older extension context. Refresh after updating the browser extension."
    : !installedExtensionStatus?.detected
    ? "The website has not detected an installed Care Assurance extension on this page yet."
    : extensionVersionMismatch
    ? `The page currently sees extension v${installedExtensionStatus.version}. Refresh after loading v${extensionInfo?.manifestVersion || "latest"}.`
    : "The installed extension version matches the package currently published from CareAssurance.";
  const unreadOperationsCount = opsHealth
    ? opsHealth.alerts.unreadAdminAlerts + opsHealth.alerts.unreadContactMessages
    : adminAlerts.length;
  const hasExtensionAttention = Boolean(
    installedExtensionStatus?.refreshRequired ||
      extensionVersionMismatch ||
      (installedExtensionStatus && !installedExtensionStatus.detected)
  );
  const totalAttentionCount =
    pendingUsers.length +
    unreadOperationsCount +
    suspendedUsers.length +
    (hasExtensionAttention ? 1 : 0);
  const operationalStatusLabel = totalAttentionCount > 0 ? "Attention needed" : "Stable";
  const operationalStatusClass =
    totalAttentionCount > 0
      ? "border-warning/35 bg-warning/10 text-warning"
      : "border-success/30 bg-success/8 text-success";
  const adminActionQueue: AdminActionQueueItem[] = [];

  if (pendingUsers.length > 0) {
    adminActionQueue.push({
      id: "pending-users",
      label: "Review pending user approvals",
      description: "Approve or reject new accounts before they reach operational modules.",
      countLabel: `${pendingUsers.length} waiting`,
      tone: "warning",
      icon: UserPlus,
      actionLabel: "Open users",
      onSelect: () => {
        setUserStatusFilter("pending");
        setAdminTab("users");
      },
    });
  }

  if (unreadOperationsCount > 0 || adminAlerts.length > 0) {
    adminActionQueue.push({
      id: "ops-alerts",
      label: "Clear the incident queue",
      description: "Review staff discrepancy alerts, contact messages, and recent platform events.",
      countLabel: `${Math.max(unreadOperationsCount, adminAlerts.length)} open`,
      tone: unreadOperationsCount > 3 ? "danger" : "warning",
      icon: AlertTriangle,
      actionLabel: "Open command",
      onSelect: () => setAdminTab("command"),
    });
  }

  if (hasExtensionAttention) {
    adminActionQueue.push({
      id: "extension-sync",
      label: "Check browser extension rollout",
      description: extensionSyncSummary,
      countLabel: installedExtensionVersion,
      tone: installedExtensionStatus?.refreshRequired ? "danger" : "primary",
      icon: Download,
      actionLabel: "Open manager",
      onSelect: () => navigate("/admin/extension-manager"),
    });
  }

  if (suspendedUsers.length > 0) {
    adminActionQueue.push({
      id: "suspended-users",
      label: "Audit suspended accounts",
      description: "Review suspended users and reinstate or archive records where appropriate.",
      countLabel: `${suspendedUsers.length} suspended`,
      tone: "danger",
      icon: Lock,
      actionLabel: "Review users",
      onSelect: () => {
        setUserStatusFilter("suspended");
        setAdminTab("users");
      },
    });
  }

  if (adminActionQueue.length === 0) {
    adminActionQueue.push({
      id: "all-clear",
      label: "No high-priority admin actions",
      description: "Core access, alert, and extension signals are currently clear.",
      countLabel: "All clear",
      tone: "success",
      icon: ShieldCheck,
      actionLabel: "View command",
      onSelect: () => setAdminTab("command"),
    });
  }

  if (!mounted) return null;

  return (
    <div className="page-shell-compact animate-fade-in p-2 md:p-6">
      {/* Header */}
      <Card className="overflow-hidden border-border/60 bg-card shadow-medium">
        <CardContent className="p-5 md:p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary text-primary-foreground shadow-soft">
                <Shield size={24} />
              </div>
              <div className="min-w-0 space-y-2">
                <div>
                  <p className="page-kicker">Administration</p>
                  <h2 className="text-2xl font-heading font-bold tracking-normal text-foreground">
                    Administrator Control Room
                  </h2>
                </div>
                <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                  Manage access, platform modes, extension rollout, policy assets, AI controls, and operational recovery from one command surface.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="border-primary/30 bg-primary/8 text-primary">
                    Level 0 access
                  </Badge>
                  <Badge variant="outline" className={operationalStatusClass}>
                    {operationalStatusLabel}
                  </Badge>
                  <Badge variant="outline" className="border-border bg-muted/40 text-muted-foreground">
                    {activeUsers.length} active users
                  </Badge>
                </div>
              </div>
            </div>

            <div className="grid w-full gap-2 sm:grid-cols-2 xl:w-auto xl:min-w-[28rem]">
              {[
                { label: "Attention", value: totalAttentionCount, detail: "items", tone: "text-warning" },
                { label: "Sessions", value: opsHealth?.sessions.total ?? "—", detail: "active", tone: "text-primary" },
                { label: "Alerts", value: unreadOperationsCount, detail: "unread", tone: unreadOperationsCount > 0 ? "text-warning" : "text-success" },
                { label: "Extension", value: installedExtensionVersion, detail: "browser", tone: hasExtensionAttention ? "text-warning" : "text-success" },
              ].map((metric) => (
                <div key={metric.label} className="rounded-lg border border-border bg-muted/25 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{metric.label}</p>
                  <p className={`mt-1 truncate text-sm font-semibold ${metric.tone}`}>{metric.value}</p>
                  <p className="text-[10px] text-muted-foreground">{metric.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Navigation & Tools */}
        <div className="lg:col-span-8 space-y-8">
          
          {/* Critical Tools Section */}
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
            <Button
              type="button"
              variant="ghost"
              className="h-auto justify-start rounded-xl border border-border/60 bg-card p-4 text-left shadow-soft hover-elevate"
              onClick={() => setAdminTab("command")}
              data-testid="button-open-admin-command-center"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary">
                  <Power size={18} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground">Command Center</span>
                  <span className="mt-1 block whitespace-normal text-xs leading-5 text-muted-foreground">Maintenance, read-only, announcements, snapshots.</span>
                </span>
              </div>
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="h-auto justify-start rounded-xl border border-border/60 bg-card p-4 text-left shadow-soft hover-elevate"
              onClick={() => {
                setUserStatusFilter("pending");
                setAdminTab("users");
              }}
              data-testid="button-open-admin-user-review"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-warning">
                  <UserPlus size={18} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground">User Review</span>
                  <span className="mt-1 block whitespace-normal text-xs leading-5 text-muted-foreground">{pendingUsers.length} pending approval{pendingUsers.length === 1 ? "" : "s"}.</span>
                </span>
              </div>
            </Button>

            <Button asChild variant="ghost" className="h-auto justify-start rounded-xl border border-border/60 bg-card p-4 text-left shadow-soft hover-elevate">
              <Link href="/call-reconciliation">
                <span className="flex min-w-0 items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary">
                    <ArrowRightLeft size={18} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-foreground">Call Reconciliation</span>
                    <span className="mt-1 block whitespace-normal text-xs leading-5 text-muted-foreground">Match ECM evidence and operational exceptions.</span>
                  </span>
                </span>
              </Link>
            </Button>

            <Button
              className="h-auto justify-start rounded-xl border border-border/60 bg-card p-4 text-left shadow-soft hover-elevate"
              onClick={handleOpenSystemLogDialog}
              data-testid="button-system-log"
              variant="ghost"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Terminal size={18} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground">Audit Completion Log</span>
                  <span className="mt-1 block whitespace-normal text-xs leading-5 text-muted-foreground">Open the focused audit-completion record.</span>
                </span>
              </div>
            </Button>
          </div>

          {/* Admin Tabs */}
          <Tabs value={adminTab} onValueChange={(value) => setAdminTab(value as AdminPortalTab)} className="w-full">
            <div className="overflow-x-auto -mx-2 px-2 pb-1 scrollbar-hide">
              <TabsList className="inline-flex h-10 w-max gap-1 border p-1 rounded-xl mb-6 bg-muted/40 border-border/60">
                <TabsTrigger value="overview" className="rounded-lg px-3 py-1.5 text-xs font-semibold gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-[var(--shadow-xs)] data-[state=active]:text-foreground text-muted-foreground">
                  <Activity className="h-3.5 w-3.5" />
                  Overview
                </TabsTrigger>
                <TabsTrigger value="command" className="rounded-lg px-3 py-1.5 text-xs font-semibold gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-[var(--shadow-xs)] data-[state=active]:text-foreground text-muted-foreground">
                  <Power className="h-3.5 w-3.5" />
                  Command
                </TabsTrigger>
                <TabsTrigger value="users" className="rounded-lg px-3 py-1.5 text-xs font-semibold gap-1.5 relative data-[state=active]:bg-background data-[state=active]:shadow-[var(--shadow-xs)] data-[state=active]:text-foreground text-muted-foreground">
                  <Shield className="h-3.5 w-3.5" />
                  Users
                  {pendingUsers.length > 0 && <span className="absolute -top-1 -right-1 h-2 w-2 bg-warning/100 rounded-full animate-pulse" />}
                </TabsTrigger>
                <TabsTrigger value="presence" className="rounded-lg px-3 py-1.5 text-xs font-semibold gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-[var(--shadow-xs)] data-[state=active]:text-foreground text-muted-foreground">
                  <Activity className="h-3.5 w-3.5" />
                  Presence
                </TabsTrigger>
                <TabsTrigger value="messages" className="rounded-lg px-3 py-1.5 text-xs font-semibold gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-[var(--shadow-xs)] data-[state=active]:text-foreground text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" />
                  Messages
                </TabsTrigger>
                <TabsTrigger value="policies" className="rounded-lg px-3 py-1.5 text-xs font-semibold gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-[var(--shadow-xs)] data-[state=active]:text-foreground text-muted-foreground">
                  <FileText className="h-3.5 w-3.5" />
                  Policies
                </TabsTrigger>
                <TabsTrigger value="ai" className="rounded-lg px-3 py-1.5 text-xs font-semibold gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-[var(--shadow-xs)] data-[state=active]:text-foreground text-muted-foreground">
                  <Cpu className="h-3.5 w-3.5" />
                  AI
                </TabsTrigger>
                <TabsTrigger value="database" className="rounded-lg px-3 py-1.5 text-xs font-semibold gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-[var(--shadow-xs)] data-[state=active]:text-foreground text-muted-foreground">
                  <Database className="h-3.5 w-3.5" />
                  Database
                </TabsTrigger>
                <TabsTrigger value="rostering" className="rounded-lg px-3 py-1.5 text-xs font-semibold gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-[var(--shadow-xs)] data-[state=active]:text-foreground text-muted-foreground">
                  <Route className="h-3.5 w-3.5" />
                  Rostering
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="overview" className="space-y-6">
              <Card className="overflow-hidden border-border/60 bg-card shadow-medium">
                <CardHeader className="border-b border-border/30 bg-muted/25">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Activity className="h-4 w-4 text-primary" />
                        Admin Action Queue
                      </CardTitle>
                      <CardDescription>
                        Prioritized work from users, operations health, extension sync, and alert state.
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className={operationalStatusClass}>
                      {totalAttentionCount} attention item{totalAttentionCount === 1 ? "" : "s"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="grid gap-3 xl:grid-cols-2">
                    {adminActionQueue.map((item) => {
                      const QueueIcon = item.icon;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={item.onSelect}
                          className="group flex min-w-0 items-start justify-between gap-4 rounded-xl border border-border bg-muted/20 p-4 text-left transition-colors hover:border-primary/30 hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
                          data-testid={`button-admin-action-${item.id}`}
                        >
                          <span className="flex min-w-0 items-start gap-3">
                            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${ADMIN_ACTION_TONE_CLASSES[item.tone]}`}>
                              <QueueIcon size={17} />
                            </span>
                            <span className="min-w-0">
                              <span className="block text-sm font-semibold text-foreground">{item.label}</span>
                              <span className="mt-1 block text-xs leading-5 text-muted-foreground">{item.description}</span>
                            </span>
                          </span>
                          <span className="flex shrink-0 flex-col items-end gap-2">
                            <Badge variant="outline" className={ADMIN_ACTION_TONE_CLASSES[item.tone]}>
                              {item.countLabel}
                            </Badge>
                            <span className="text-[11px] font-semibold text-primary transition-colors group-hover:text-primary/80">
                              {item.actionLabel}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
              
              {/* Admin Quick Metrics */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="rounded-xl border border-border/60 bg-background/70 p-4 shadow-soft">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-6 w-6 rounded-md bg-primary/8 flex items-center justify-center">
                      <Activity className="h-3 w-3 text-primary" />
                    </div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">System Uptime</p>
                  </div>
                  <p className="text-lg font-bold text-foreground">
                    {opsHealth ? `${Math.floor(opsHealth.runtime.uptimeSeconds / 3600)}h ${Math.floor((opsHealth.runtime.uptimeSeconds % 3600) / 60)}m` : '—'}
                  </p>
                </div>
                <div className="rounded-xl border border-border/60 bg-background/70 p-4 shadow-soft">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-6 w-6 rounded-md bg-secondary/8 flex items-center justify-center">
                      <Server className="h-3 w-3 text-secondary" />
                    </div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Memory Usage</p>
                  </div>
                  <p className="text-lg font-bold text-foreground">
                    {opsHealth ? `${opsHealth.memory.heapUsedMb.toFixed(0)} MB` : '—'}
                  </p>
                </div>
                <div className="rounded-xl border border-border/60 bg-background/70 p-4 shadow-soft">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-6 w-6 rounded-md bg-warning/8 flex items-center justify-center">
                      <AlertTriangle className="h-3 w-3 text-warning" />
                    </div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Unread Alerts</p>
                  </div>
                  <p className="text-lg font-bold text-foreground">
                    {opsHealth ? String(opsHealth.alerts.unreadAdminAlerts + opsHealth.alerts.unreadContactMessages) : '—'}
                  </p>
                </div>
                <div className="rounded-xl border border-border/60 bg-background/70 p-4 shadow-soft">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-6 w-6 rounded-md bg-success/8 flex items-center justify-center">
                      <Shield className="h-3 w-3 text-success" />
                    </div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Blocked IPs</p>
                  </div>
                  <p className="text-lg font-bold text-foreground">
                    {opsHealth ? String(opsHealth.security.blockedIps) : '—'}
                  </p>
                </div>
              </div>

              {/* Private Alert Section */}
              {adminAlerts.length > 0 && (
                <Card className="bg-warning/20 border-warning/30 backdrop-blur-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-warning flex items-center gap-2">
                      <AlertTriangle /> Priority Staff Alerts
                    </CardTitle>
                    <CardDescription className="text-warning/70">
                      Staff members with 3+ discrepancies of the same type.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {adminAlerts.map((alert) => (
                        <div key={alert.id} className="flex items-center justify-between p-3 bg-warning/40 rounded border border-warning/30" data-testid={`alert-${alert.id}`}>
                          <div>
                            <p className="text-foreground font-semibold" data-testid={`alert-name-${alert.careWorkerId}`}>{alert.careWorkerName}</p>
                            <p className="text-xs text-warning" data-testid={`alert-message-${alert.id}`}>{alert.discrepancyCount}x {alert.discrepancyType} Discrepancies</p>
                          </div>
                          <Button 
                            size="sm" 
                            variant="outline"
                            className="border-warning/50 text-warning hover:bg-warning"
                            onClick={() => handleMarkAlertRead(alert.id)}
                            data-testid={`button-dismiss-alert-${alert.id}`}
                          >
                            Dismiss
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card data-testid="card-download-edge-extension" className="border-border/60 bg-background/70 shadow-medium hover-elevate">
                <CardHeader className="border-b border-border/30">
                  <CardTitle className="flex items-center gap-3 text-[0.8125rem]">
                    <div className="h-7 w-7 rounded-md bg-primary/8 flex items-center justify-center">
                      <Download className="h-3.5 w-3.5 text-primary" />
                    </div>
                    Edge Extension Download
                  </CardTitle>
                  <CardDescription>
                    Download or rebuild the latest ACP Autofill Edge extension — available as a ZIP (for manual install or Edge Add-ons) or as a signed .crx file.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  {extensionInfoLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 size={16} className="animate-spin" />
                      Loading extension package metadata...
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5" data-testid="extension-package-metadata">
                      <div className="min-w-0 rounded-lg border border-border bg-muted/30 p-3">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Version</p>
                        <p className="mt-1 break-words text-sm font-semibold leading-snug text-foreground">{extensionManifestVersion}</p>
                      </div>
                      <div className="min-w-0 rounded-lg border border-border bg-muted/30 p-3">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Package Size</p>
                        <p className="mt-1 break-words text-sm font-semibold leading-snug text-foreground">{extensionSizeLabel}</p>
                      </div>
                      <div className="min-w-0 rounded-lg border border-border bg-muted/30 p-3">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Packaged At</p>
                        <p className="mt-1 break-words text-sm font-semibold leading-snug text-foreground">{extensionPackagedAt}</p>
                      </div>
                      <div className="min-w-0 rounded-lg border border-border bg-muted/30 p-3">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">SHA-256</p>
                        <p className="mt-1 break-all text-sm font-semibold leading-snug text-foreground">{extensionHashShort}</p>
                      </div>
                      <div className="min-w-0 rounded-lg border border-border bg-muted/30 p-3">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Installed In Browser</p>
                        <p className="mt-1 break-words text-sm font-semibold leading-snug text-foreground">{installedExtensionVersion}</p>
                        <p className="mt-1 break-words text-[11px] leading-snug text-muted-foreground">Last seen {installedExtensionSeenAt}</p>
                      </div>
                    </div>
                  )}

                  <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">Website sync:</span> {extensionSyncSummary}
                    {installedExtensionStatus?.error ? ` ${installedExtensionStatus.error}` : ""}
                  </div>

                  <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button asChild variant="outline">
                        <Link href="/admin/extension-manager">
                          <ExternalLink size={16} />
                          Open Full Manager
                        </Link>
                      </Button>
                      <Button asChild data-testid="button-download-edge-extension">
                        <a href={extensionDownloadUrl} target="_blank" rel="noopener noreferrer">
                          <Download size={16} />
                          Download Edge Extension (.zip)
                        </a>
                      </Button>
                      {extensionCrxDownloadUrl && (
                        <Button asChild variant="outline" data-testid="button-download-edge-extension-crx">
                          <a href={extensionCrxDownloadUrl} target="_blank" rel="noopener noreferrer">
                            <Download size={16} />
                            Download .crx
                          </a>
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          void fetchExtensionPackageInfo({ fresh: false });
                          if (typeof window !== "undefined") {
                            window.postMessage({ type: "CA_EXTENSION_REQUEST_STATUS" }, window.location.origin);
                          }
                        }}
                        disabled={extensionInfoLoading || extensionInfoRefreshing || extensionInfoUpdating}
                        data-testid="button-refresh-edge-extension-status"
                      >
                        {extensionInfoRefreshing ? <Loader2 size={14} className="mr-2 animate-spin" /> : <RefreshCcw size={14} className="mr-2" />}
                        Refresh Status
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void fetchExtensionPackageInfo({ fresh: true, updateVersion: true })}
                        disabled={extensionInfoLoading || extensionInfoRefreshing || extensionInfoUpdating}
                        data-testid="button-rebuild-edge-extension"
                      >
                        {extensionInfoUpdating ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Zap size={14} className="mr-2" />}
                        Update Extension
                      </Button>
                    </div>
                    <Badge variant="outline" className="border-success/30 text-success bg-success/10 whitespace-normal text-center">
                      {extensionInfo?.versionUpdated
                        ? `Updated to v${extensionInfo.manifestVersion || "latest"}`
                        : extensionInfo?.package?.rebuilt
                        ? "Package rebuilt this refresh"
                        : "Package freshness verified"}
                    </Badge>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    The update button bumps the extension manifest version and rebuilds the ZIP and .crx packages. Use the .crx for direct browser install, extract the ZIP for <strong>Extensions</strong> → <strong>Load unpacked</strong>, or upload the ZIP to Edge Add-ons.
                  </p>
                </CardContent>
              </Card>

              {/* Extension Connection Test */}
              <Card data-testid="card-test-extension" className="border-border/60 bg-background/70 shadow-medium hover-elevate">
                <CardHeader className="border-b border-border/30">
                  <CardTitle className="flex items-center gap-3 text-[0.8125rem]">
                    <div className="h-7 w-7 rounded-md bg-primary/8 flex items-center justify-center">
                      <Send className="h-3.5 w-3.5 text-primary" />
                    </div>
                    Extension Connection Test
                  </CardTitle>
                  <CardDescription>
                    Test communication between this page and the Edge extension. The extension must be installed and this page must be open.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      data-testid="button-test-extension-connection"
                      disabled={extensionTestStatus === "testing"}
                      onClick={() => {
                        const testPayload = {
                          formType: "acp" as const,
                          assessments: [{
                            category: "Extension Connection Test",
                            signedBy: "Admin Test",
                            jobTitle: "System Administrator",
                            trainingNeeds: "No",
                            risks: [{
                              riskDefinition: "This is a test risk payload used to verify ACP extension connectivity.",
                              howItsARisk: "It confirms the installed extension can accept a strict ACP risk-assessment payload from CareAssurance.",
                              controlMeasures: "No action is needed. This row is only for an extension connectivity check.",
                              whoWillBeHarmed: "N/A",
                              ratingAfterControls: "Low",
                              initialRating: "Low",
                            }],
                          }],
                          serviceUserInitials: "T.E.",
                          serviceUserDisplayName: "Test Extension",
                        };

                        void sendExtensionTestPayload({
                          messageType: "CA_SEND_TO_ACP_EXTENSION",
                          payload: testPayload,
                          pendingMessage: "Sending ACP test payload to the extension...",
                          successMessage: "Extension connected and stored the ACP test payload. Open the extension popup, go to Autofill, and review Latest Payload.",
                          timeoutMessage: "Extension not detected. Ensure the CareAssurance Edge extension is installed and enabled, then refresh this admin page after any install or update.",
                        });
                      }}
                    >
                      {extensionTestStatus === "testing" ? (
                        <Loader2 size={14} className="mr-2 animate-spin" />
                      ) : (
                        <Send size={14} className="mr-2" />
                      )}
                      Test Send to Extension
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      data-testid="button-test-extension-store"
                      disabled={extensionTestStatus === "testing"}
                      onClick={() => {
                        const testPayload = {
                          formType: "initialAssessment" as const,
                          initialAssessmentData: {
                            thisIsMe: { whoIAm: "Test service user — extension connectivity check" },
                          },
                          assessor: "Admin Test",
                          date: new Date().toISOString().split("T")[0],
                        };

                        void sendExtensionTestPayload({
                          messageType: "CA_EXTENSION_STORE_PAYLOAD",
                          payload: testPayload,
                          pendingMessage: "Sending Initial Assessment test payload to the extension...",
                          successMessage: "Extension connected and stored the Initial Assessment test payload. Open the extension popup, go to Autofill, and review Latest Payload.",
                          timeoutMessage: "Extension not detected for the Initial Assessment test. Ensure the extension is installed and enabled, then refresh this admin page after any install or update.",
                        });
                      }}
                    >
                      {extensionTestStatus === "testing" ? (
                        <Loader2 size={14} className="mr-2 animate-spin" />
                      ) : (
                        <Upload size={14} className="mr-2" />
                      )}
                      Test Plan Enhancer Send
                    </Button>
                    {extensionTestStatus !== "idle" && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => { setExtensionTestStatus("idle"); setExtensionTestMessage(""); }}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                  {extensionTestMessage && (
                    <div className={`rounded-lg border p-3 text-sm ${
                      extensionTestStatus === "success" 
                        ? "border-success/30 bg-success/10 text-success" 
                        : extensionTestStatus === "failed"
                        ? "border-destructive/30 bg-destructive/10 text-destructive"
                        : "border-border bg-muted/30 text-muted-foreground"
                    }`}>
                      <div className="flex items-start gap-2">
                        {extensionTestStatus === "success" && <Check size={16} className="mt-0.5 shrink-0" />}
                        {extensionTestStatus === "failed" && <X size={16} className="mt-0.5 shrink-0" />}
                        {extensionTestStatus === "testing" && <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin" />}
                        <span>{extensionTestMessage}</span>
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Tests send a dummy payload via <code>window.postMessage</code> and wait for the extension's ACK. After a successful test, open the extension popup and check <strong>Autofill</strong> → <strong>Latest Payload</strong> to inspect the stored JSON.
                  </p>
                </CardContent>
              </Card>

              <Card data-testid="card-admin-acp-quick-launch" className="border-border/60 bg-background/70 shadow-medium hover-elevate">
                <CardHeader className="border-b border-border/30">
                  <CardTitle className="flex items-center gap-3 text-[0.8125rem]">
                    <div className="h-7 w-7 rounded-md bg-primary/8 flex items-center justify-center">
                      <Search className="h-3.5 w-3.5 text-primary" />
                    </div>
                    ACP Service User Quick Launch
                  </CardTitle>
                  <CardDescription>
                    Search imported service users, open their Mobizio dashboard automatically, then jump into Risk Assess, EMAR, or Care Plan workflows.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <Popover open={acpServiceUserPickerOpen} onOpenChange={setAcpServiceUserPickerOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          role="combobox"
                          aria-expanded={acpServiceUserPickerOpen}
                          className="w-full justify-between xl:max-w-xl"
                          disabled={acpServiceUsersLoading}
                          data-testid="button-admin-acp-service-user-picker"
                        >
                          <span className="truncate text-left">
                            {selectedAcpServiceUser
                              ? `${selectedAcpServiceUser.serviceUserName} (${selectedAcpServiceUser.accessCarePlanningId})`
                              : acpServiceUsersLoading
                              ? "Loading ACP service users..."
                              : "Search service user or ACP ID..."}
                          </span>
                          {acpServiceUsersLoading ? <Loader2 size={14} className="ml-2 shrink-0 animate-spin" /> : <ChevronDown size={14} className="ml-2 shrink-0" />}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[420px] max-w-[calc(100vw-2rem)] p-0" align="start">
                        <Command shouldFilter>
                          <CommandInput placeholder="Search by service user name or ACP ID..." />
                          <CommandList>
                            <CommandEmpty>No ACP service users found.</CommandEmpty>
                            <CommandGroup heading={`Imported Users (${acpServiceUsers.length})`}>
                              {acpServiceUsers.map((serviceUser) => (
                                <CommandItem
                                  key={serviceUser.accessCarePlanningId}
                                  value={`${serviceUser.serviceUserName} ${serviceUser.accessCarePlanningId} ${serviceUser.initials}`}
                                  onSelect={() => handleSelectAcpServiceUser(serviceUser)}
                                  className="items-start gap-3 py-3"
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="truncate font-medium text-foreground">{serviceUser.serviceUserName}</div>
                                    <div className="text-xs text-muted-foreground">
                                      ACP ID {serviceUser.accessCarePlanningId}
                                    </div>
                                  </div>
                                  <Check
                                    size={14}
                                    className={selectedAcpServiceUser?.accessCarePlanningId === serviceUser.accessCarePlanningId ? "opacity-100 text-primary" : "opacity-0"}
                                  />
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>

                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">
                        {acpServiceUsers.length} imported ACP users
                      </Badge>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void fetchAcpServiceUsers()}
                        disabled={acpServiceUsersLoading}
                        data-testid="button-refresh-admin-acp-service-users"
                      >
                        {acpServiceUsersLoading ? <Loader2 size={14} className="mr-2 animate-spin" /> : <RefreshCcw size={14} className="mr-2" />}
                        Refresh Users
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => selectedAcpServiceUser && openAcpDashboard(selectedAcpServiceUser)}
                        disabled={!selectedAcpServiceUser}
                        data-testid="button-open-selected-acp-dashboard"
                      >
                        <ExternalLink size={14} className="mr-2" />
                        Open ACP Dashboard
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setSelectedAcpServiceUser(null)}
                        disabled={!selectedAcpServiceUser}
                        title="Clear selection"
                        data-testid="button-reset-selected-acp-service-user"
                      >
                        <RotateCcw size={14} className="mr-2" />
                        Reset
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={() => void deleteAllAcpServiceUsers()}
                        disabled={acpServiceUsersDeletingLoading || acpServiceUsers.length === 0}
                        data-testid="button-delete-all-acp-service-users"
                      >
                        {acpServiceUsersDeletingLoading ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Trash2 size={14} className="mr-2" />}
                        Delete All Users
                      </Button>
                    </div>
                  </div>

                  {selectedAcpServiceUser ? (
                    <div className="space-y-4">
                      <div className="grid gap-3 md:grid-cols-3">
                        <div className="rounded-lg border border-border bg-muted/30 p-3">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Service User</p>
                          <p className="mt-1 text-sm font-semibold text-foreground">{selectedAcpServiceUser.serviceUserName}</p>
                        </div>
                        <div className="rounded-lg border border-border bg-muted/30 p-3">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">ACP ID</p>
                          <p className="mt-1 text-sm font-semibold text-foreground">{selectedAcpServiceUser.accessCarePlanningId}</p>
                        </div>
                        <div className="rounded-lg border border-border bg-muted/30 p-3">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Last Synced</p>
                          <p className="mt-1 text-sm font-semibold text-foreground">{new Date(selectedAcpServiceUser.updatedAt).toLocaleString()}</p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {(Object.entries(ADMIN_ACP_WORKFLOWS) as Array<[AdminAcpWorkflow, (typeof ADMIN_ACP_WORKFLOWS)[AdminAcpWorkflow]]>).map(([workflowKey, workflow]) => {
                          const WorkflowIcon = workflow.icon;
                          return (
                            <Button
                              key={workflowKey}
                              type="button"
                              onClick={() => handleLaunchAcpWorkflow(workflowKey)}
                              data-testid={`button-admin-acp-workflow-${workflowKey}`}
                            >
                              <WorkflowIcon size={14} className="mr-2" />
                              {workflow.label}
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
                      Pick a service user to open their ACP case dashboard and enable the workflow buttons.
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground">
                    Selecting a service user opens <code>case_dashboard?id=&lt;ACP ID&gt;</code> on Mobizio in a new tab using the imported ACP mapping. The workflow buttons keep you in CareAssurance while working that record.
                  </p>
                </CardContent>
              </Card>

              <div className="grid md:grid-cols-4 gap-4">
                {[
                  { label: "Active Users", value: activeUsers.length.toString(), sub: "Currently approved", iconCls: "text-success", bgCls: "bg-success/10", icon: ShieldCheck },
                  { label: "Pending Approvals", value: pendingUsers.length.toString(), sub: "Awaiting review", iconCls: "text-warning", bgCls: "bg-warning/10", icon: Clock },
                  { label: "Suspended", value: users.filter(u => (u.status as string) === "suspended").length.toString(), sub: "Account suspensions", iconCls: "text-destructive", bgCls: "bg-destructive/10", icon: Lock },
                  { label: "Total Logs", value: systemLogs.length.toString(), sub: "Session activity", iconCls: "text-primary", bgCls: "bg-primary/10", icon: Activity }
                ].map((stat, i) => (
                  <Card key={i} className="relative overflow-hidden border-border/60 bg-background/70 shadow-soft hover-elevate">
                    <div className={`absolute inset-0 ${stat.bgCls} opacity-[0.03]`} />
                    <CardHeader className="pb-2">
                      <CardTitle className="text-[10px] font-semibold uppercase tracking-wider flex items-center gap-2.5 text-muted-foreground">
                        <div className={`h-7 w-7 rounded-md flex items-center justify-center ${stat.bgCls}`}>
                          <stat.icon className={`h-3.5 w-3.5 ${stat.iconCls}`} />
                        </div>
                        {stat.label}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-foreground">{stat.value}</div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{stat.sub}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Quick User List */}
              <Card className="overflow-hidden border-border/60 bg-background/70 shadow-medium hover-elevate">
                <CardHeader className="border-b border-border/30">
                  <CardTitle className="flex items-center gap-3 text-[0.8125rem]">
                    <div className="h-7 w-7 rounded-md bg-primary/8 flex items-center justify-center">
                      <UserPlus className="h-3.5 w-3.5 text-primary" />
                    </div>
                    Active Team Members
                  </CardTitle>
                </CardHeader>
                <div className="max-h-[250px] overflow-auto">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-muted/50">
                      <TableRow className="border-border">
                        <TableHead className="text-muted-foreground">Username</TableHead>
                        <TableHead className="text-muted-foreground">Job Title</TableHead>
                        <TableHead className="text-muted-foreground">Role</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activeUsers.slice(0, 5).map((u) => (
                        <TableRow key={u.id} className="hover:bg-muted/20 transition-colors border-border">
                          <TableCell className="font-medium text-foreground">{u.username}</TableCell>
                          <TableCell className="text-muted-foreground">{u.jobTitle || "-"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={getRoleBadgeClassName(u.role)}>
                              {getUserRoleLabel(u.role)}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                      {activeUsers.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                            No active team members.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="command" className="space-y-6">
              <OperationsCommandCenter
                currentAlertCount={adminAlerts.length}
                onRefreshAlerts={fetchAdminAlerts}
              />
            </TabsContent>

            <TabsContent value="users" className="space-y-6">
              {/* Add New User */}
              <Card className="border-border/60 bg-background/70 shadow-medium hover-elevate">
                <CardHeader className="border-b border-border/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-[0.8125rem]">Add New User</CardTitle>
                      <CardDescription>Create a new user account with immediate access.</CardDescription>
                    </div>
                    <UserPlus className="text-muted-foreground" />
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  <form onSubmit={handleCreateUser} className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-4">
                      <div className="space-y-2">
                        <Label className="text-muted-foreground text-xs">First Name</Label>
                        <Input 
                          placeholder="Enter first name" 
                          value={newUserFirstName}
                          onChange={(e) => setNewUserFirstName(e.target.value)}
                          className="bg-card border-border text-foreground" 
                          data-testid="input-new-first-name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-muted-foreground text-xs">Last Name</Label>
                        <Input 
                          placeholder="Enter last name" 
                          value={newUserLastName}
                          onChange={(e) => setNewUserLastName(e.target.value)}
                          className="bg-card border-border text-foreground" 
                          data-testid="input-new-last-name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-muted-foreground text-xs">Username</Label>
                        <Input 
                          placeholder="Enter username" 
                          value={newUserUsername}
                          onChange={(e) => setNewUserUsername(e.target.value)}
                          autoComplete="username"
                          className="bg-card border-border text-foreground" 
                          data-testid="input-new-username"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-muted-foreground text-xs">Password</Label>
                        <Input 
                          type="password" 
                          placeholder="Enter password" 
                          value={newUserPassword}
                          onChange={(e) => setNewUserPassword(e.target.value)}
                          autoComplete="new-password"
                          className="bg-card border-border text-foreground" 
                          data-testid="input-new-password"
                        />
                        <p className="text-[11px] text-muted-foreground">{PASSWORD_RULES_TEXT}</p>
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-4">
                      <div className="space-y-2">
                        <Label className="text-muted-foreground text-xs">Job Title</Label>
                        <Input 
                          placeholder="e.g. Care Coordinator" 
                          value={newUserJobTitle}
                          onChange={(e) => setNewUserJobTitle(e.target.value)}
                          className="bg-card border-border text-foreground" 
                          data-testid="input-new-job-title"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-muted-foreground text-xs">Role</Label>
                        <Select value={newUserRole} onValueChange={(value) => setNewUserRole(value as UserRole)}>
                          <SelectTrigger className="bg-card border-border text-foreground" data-testid="select-new-role">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {USER_ROLE_OPTIONS.map((role) => (
                              <SelectItem key={role} value={role}>{getUserRoleLabel(role)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="md:col-span-2 flex items-end">
                        <Button type="submit" className="w-full" disabled={userActionLoading} data-testid="button-create-user">
                          {userActionLoading ? <Loader2 size={16} className="mr-2 animate-spin" /> : <UserPlus size={16} className="mr-2" />} Create User
                        </Button>
                      </div>
                    </div>
                  </form>
                </CardContent>
              </Card>

              {/* Pending Approvals */}
              <Card className="bg-warning/20 border-warning/30 backdrop-blur-sm">
                <CardHeader className="border-b border-warning/30 bg-muted/20">
                  <CardTitle className="text-warning text-base flex items-center gap-2">
                    <Clock size={18} /> Pending Approvals
                    {pendingUsers.length > 0 && (
                      <Badge className="bg-warning text-foreground ml-2">{pendingUsers.length}</Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  {pendingUsers.length === 0 ? (
                    <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                      <Check size={16} className="text-success" />
                      No pending approvals — all caught up.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {pendingUsers.map((u) => (
                        <div key={u.id} className="flex items-center justify-between p-3 bg-muted/20 rounded-lg border border-border/30">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-foreground">
                              {u.username.substring(0,2).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-foreground">{u.username}</p>
                              <p className="text-xs text-muted-foreground">{getUserRoleLabel(u.role)} • Requested access</p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:text-destructive/80 hover:bg-destructive/10" onClick={() => rejectUser(u.id)} data-testid={`button-reject-${u.id}`} aria-label="Reject user">
                              <X size={14} />
                            </Button>
                            <Button size="sm" className="h-8 w-8 p-0 bg-success hover:bg-success/80 text-success-foreground" onClick={() => approveUser(u.id)} data-testid={`button-approve-${u.id}`} aria-label="Approve user">
                              <Check size={14} />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* All Users Table */}
              <Card className="overflow-hidden border-border/60 bg-background/70 shadow-medium hover-elevate">
                <CardHeader className="border-b border-border/30">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <CardTitle className="text-[0.8125rem]">All Users</CardTitle>
                      <CardDescription>Manage user accounts, roles, and permissions.</CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                        <Input 
                          placeholder="Search users..."
                          aria-label="Search users"
                          value={userSearch}
                          onChange={(e) => setUserSearch(e.target.value)}
                          className="bg-card border-border text-foreground pl-9 w-[200px]"
                          data-testid="input-user-search"
                        />
                      </div>
                      <Select value={userRoleFilter} onValueChange={setUserRoleFilter}>
                        <SelectTrigger className="bg-card border-border text-foreground w-[100px]" data-testid="select-role-filter">
                          <SelectValue placeholder="Role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Roles</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="pilot">Pilot</SelectItem>
                          <SelectItem value="staff">Staff</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={userStatusFilter} onValueChange={setUserStatusFilter}>
                        <SelectTrigger className="bg-card border-border text-foreground w-[110px]" data-testid="select-status-filter">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Status</SelectItem>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="suspended">Suspended</SelectItem>
                          <SelectItem value="archived">Archived</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardHeader>
                <div className="max-h-[400px] overflow-auto">
                  <Table>
                    <TableHeader className="bg-muted sticky top-0 backdrop-blur-sm z-10">
                      <TableRow className="border-border/30 hover:bg-transparent">
                        {(() => {
                          const SortIcon = ({ k }: { k: UserSortKey }) =>
                            userSortKey !== k
                              ? <ChevronsUpDown size={12} className="opacity-40" />
                              : userSortDir === "asc"
                                ? <ChevronUp size={12} />
                                : <ChevronDown size={12} />;
                          const SortBtn = ({ k, label, className }: { k: UserSortKey; label: string; className?: string }) => (
                            <TableHead className={`text-muted-foreground ${className || ""}`}>
                              <button
                                type="button"
                                onClick={() => toggleUserSort(k)}
                                className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                                data-testid={`sort-users-${k}`}
                                aria-label={`Sort by ${label}`}
                              >
                                <span>{label}</span>
                                <SortIcon k={k} />
                              </button>
                            </TableHead>
                          );
                          return (
                            <>
                              <SortBtn k="username" label="Username" />
                              <SortBtn k="jobTitle" label="Job Title" className="hidden sm:table-cell" />
                              <SortBtn k="role" label="Role" className="hidden sm:table-cell" />
                              <SortBtn k="status" label="Status" className="hidden sm:table-cell" />
                              <SortBtn k="lastOnlineAt" label="Last Login" className="hidden lg:table-cell" />
                            </>
                          );
                        })()}
                        <TableHead className="text-muted-foreground hidden md:table-cell">Terms</TableHead>
                        <TableHead className="text-muted-foreground text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUsers.map((u) => (
                        <TableRow key={u.id} className="border-border/30 hover:bg-muted/20 transition-colors" data-testid={`row-user-${u.id}`}>
                          <TableCell className="font-medium text-foreground" data-testid={`text-username-${u.id}`}>
                            <div>{u.username}</div>
                            <div className="sm:hidden text-xs text-muted-foreground mt-1">
                              {getUserRoleLabel(u.role)} - {u.status}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground hidden sm:table-cell" data-testid={`text-jobtitle-${u.id}`}>{u.jobTitle || "-"}</TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <Badge variant="outline" className={getRoleBadgeClassName(u.role)} data-testid={`badge-role-${u.id}`}>
                              {getUserRoleLabel(u.role)}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <Badge
                              variant="outline"
                              className={
                                u.status === "active"
                                  ? "border-success/30 text-success"
                                  : u.status === "archived"
                                    ? "border-muted-foreground/40 text-muted-foreground"
                                    : "border-warning/30 text-warning"
                              }
                              data-testid={`badge-status-${u.id}`}
                            >
                              {u.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell" data-testid={`text-last-login-${u.id}`}>
                            {(() => {
                              const rel = formatRelativeTime(u.lastOnlineAt);
                              return (
                                <span
                                  className={`text-xs ${u.lastOnlineAt ? "text-muted-foreground" : "text-muted-foreground/60 italic"}`}
                                  title={rel.full}
                                >
                                  {rel.label}
                                </span>
                              );
                            })()}
                          </TableCell>
                          <TableCell className="hidden md:table-cell" data-testid={`text-terms-${u.id}`}>
                            {u.termsVersion ? (
                              <div className="flex items-center gap-1.5">
                                <FileCheck size={14} className={u.termsVersion === CURRENT_TERMS_VERSION ? "text-success" : "text-warning"} />
                                <div className="text-xs">
                                  <span className={u.termsVersion === CURRENT_TERMS_VERSION ? "text-success" : "text-warning"}>
                                    v{u.termsVersion}
                                  </span>
                                  {u.termsSignatureName && (
                                    <div className="text-foreground font-medium truncate max-w-[120px]" title={u.termsSignatureName}>
                                      {u.termsSignatureName}
                                    </div>
                                  )}
                                  {u.termsSignatureDate && (
                                    <div className="text-muted-foreground">
                                      {u.termsSignatureDate}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 text-destructive">
                                <FileX size={14} />
                                <span className="text-xs">Not signed</span>
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                onClick={() => setEditingUser({
                                  id: u.id,
                                  username: u.username,
                                  role: u.role,
                                  status: u.status,
                                  jobTitle: u.jobTitle || "",
                                  firstName: u.firstName || "",
                                  lastName: u.lastName || ""
                                })}
                                data-testid={`button-edit-${u.id}`}
                                title="Edit user details"
                                aria-label="Edit user details"
                              >
                                <Pencil size={14} />
                              </Button>
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                className="h-7 w-7 p-0 text-warning hover:text-warning/80 hover:bg-warning/10"
                                onClick={() => handleDisconnectSession(u.id, u.username)}
                                title="Disconnect user session"
                                aria-label="Disconnect user session"
                                data-testid={`button-disconnect-${u.id}`}
                              >
                                <Unplug size={14} />
                              </Button>
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                className="h-7 w-7 p-0 text-warning hover:text-warning hover:bg-warning/30"
                                onClick={() => {
                                  setResetPasswordUser({ id: u.id, username: u.username });
                                  setResetPasswordValue("");
                                  setResetPasswordConfirm("");
                                }}
                                title="Reset user password"
                                aria-label="Reset user password"
                                data-testid={`button-reset-password-${u.id}`}
                              >
                                <FileKey size={14} />
                              </Button>
                              {u.status === "archived" ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0 text-success hover:text-success/80 hover:bg-success/10"
                                  onClick={() => handleUnarchiveUserAccount(u.id, u.username)}
                                  title="Restore archived user"
                                  aria-label="Restore archived user"
                                  data-testid={`button-unarchive-${u.id}`}
                                  disabled={userActionLoading}
                                >
                                  <RefreshCcw size={14} />
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-muted"
                                  onClick={() => handleArchiveUserAccount(u.id, u.username)}
                                  title="Archive user (hide from list, keep data)"
                                  aria-label="Archive user"
                                  data-testid={`button-archive-${u.id}`}
                                  disabled={userActionLoading}
                                >
                                  <Archive size={14} />
                                </Button>
                              )}
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                className="h-7 w-7 p-0 text-destructive hover:text-destructive/80 hover:bg-destructive/10"
                                onClick={() => setDeleteConfirmUser(u.id)}
                                data-testid={`button-delete-${u.id}`}
                                title="Delete user"
                                aria-label="Delete user"
                              >
                                <Trash2 size={14} />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {filteredUsers.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                            No users found matching your filters.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="presence" className="space-y-6">
              <ActivePresenceSection />
              <BlockedIpsSection />
            </TabsContent>

            <TabsContent value="policies" className="space-y-6">
              <PolicyDocumentsSection />
            </TabsContent>

            <TabsContent value="messages" className="space-y-6">
              <ContactMessagesSection />
            </TabsContent>

            <TabsContent value="ai" className="space-y-6">
              <AIAdminLog />
              <AIProviderSection />
              <AICostSection />
            </TabsContent>

            <TabsContent value="database" className="space-y-6">
              <AdminDatabasePanel />
            </TabsContent>
            <TabsContent value="rostering" className="space-y-6">
              <RosteringOperationalPanel />
            </TabsContent>
          </Tabs>
        </div>

        {/* Right Column: Status & Info */}
        <div className="lg:col-span-4 space-y-6">
           <Card className="overflow-hidden border-border/60 bg-background/70 shadow-medium hover-elevate">
             <CardHeader className="border-b border-border/30 bg-muted/30">
                <CardTitle className="flex items-center gap-2 text-sm text-foreground">
                   <div className="h-7 w-7 rounded-md bg-primary/8 flex items-center justify-center"><Shield className="h-3.5 w-3.5 text-primary" /></div> Access Level
                </CardTitle>
             </CardHeader>
             <CardContent className="space-y-4 pt-4">
                <div className="flex items-center justify-between text-sm">
                   <span className="text-muted-foreground">Access Type</span>
                   <span className="font-mono text-primary">Level 0 (Owner)</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                   <span className="text-muted-foreground">Session Status</span>
                   <span className="font-mono text-success">ACTIVE</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                   <span className="text-muted-foreground">Session Timeout</span>
                   <span className="font-mono text-foreground">30 minutes</span>
                </div>
                <div className="mt-4 p-3 rounded-lg text-xs leading-relaxed bg-primary/5 border border-primary/20 text-primary">
                   <strong>Note:</strong> This console provides full administrative access. All actions are logged for your records.
                </div>
             </CardContent>
          </Card>

           <Card className="border-border/60 bg-card shadow-medium hover-elevate">
             <CardHeader className="border-b border-border/30 bg-muted/30">
                <CardTitle className="text-sm flex items-center gap-2 text-foreground">
                   <div className="h-7 w-7 rounded-md bg-muted flex items-center justify-center"><Activity className="h-3.5 w-3.5 text-muted-foreground" /></div> Access Signals
                </CardTitle>
             </CardHeader>
             <CardContent className="pt-4">
                <div className="space-y-3">
                   <div className="flex items-center justify-between p-2 rounded bg-muted/30 border border-border/30">
                      <span className="text-xs text-muted-foreground">Total Users</span>
                      <span className="text-sm font-semibold text-foreground">{users.length}</span>
                   </div>
                   <div className="flex items-center justify-between p-2 rounded bg-muted/30 border border-border/30">
                      <span className="text-xs text-muted-foreground">Pending Approval</span>
                      <span className="text-sm font-semibold text-warning">{pendingUsers.length}</span>
                   </div>
                   <div className="flex items-center justify-between p-2 rounded bg-muted/30 border border-border/30">
                     <span className="text-xs text-muted-foreground">Suspended</span>
                     <span className="text-sm font-semibold text-destructive">{suspendedUsers.length}</span>
                   </div>
                   <div className="flex items-center justify-between p-2 rounded bg-muted/30 border border-border/30">
                      <span className="text-xs text-muted-foreground">Inactive Active Users</span>
                      <span className="text-sm font-semibold text-foreground">{inactiveActiveUsers.length}</span>
                   </div>
                   <div className="flex items-center justify-between p-2 rounded bg-muted/30 border border-border/30">
                      <span className="text-xs text-muted-foreground">Archived</span>
                      <span className="text-sm font-semibold text-muted-foreground">{archivedUsers.length}</span>
                   </div>
                </div>
             </CardContent>
          </Card>

           <Card className="bg-destructive/5 border-destructive/20 shadow-medium hover-elevate">
             <CardHeader className="border-b border-destructive/30">
                <CardTitle className="text-sm flex items-center gap-2 text-destructive">
                   <div className="h-7 w-7 rounded-md bg-destructive/10 flex items-center justify-center"><Trash2 className="h-3.5 w-3.5 text-destructive" /></div> Data Management
                </CardTitle>
             </CardHeader>
             <CardContent className="space-y-3 pt-4">
                <p className="text-xs text-muted-foreground">Clear all care worker performance data, discrepancies, audits and alerts.</p>
                <Button 
                  variant="destructive" 
                  size="sm" 
                  className="w-full"
                  onClick={() => setShowResetDataConfirm(true)}
                  data-testid="button-reset-performance-data"
                >
                  <Trash2 size={14} className="mr-2" /> Reset All Performance Data
                </Button>
             </CardContent>
          </Card>
        </div>

      </div>

      {/* Edit User Dialog */}
      <Dialog open={!!editingUser} onOpenChange={() => setEditingUser(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Edit User</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Update user details and permissions.
            </DialogDescription>
          </DialogHeader>
          {editingUser && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-muted-foreground">First Name</Label>
                  <Input 
                    value={editingUser.firstName}
                    onChange={(e) => setEditingUser({...editingUser, firstName: e.target.value})}
                    placeholder="Enter first name"
                    className="bg-muted border-border text-foreground"
                    data-testid="input-edit-first-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Last Name</Label>
                  <Input 
                    value={editingUser.lastName}
                    onChange={(e) => setEditingUser({...editingUser, lastName: e.target.value})}
                    placeholder="Enter last name"
                    className="bg-muted border-border text-foreground"
                    data-testid="input-edit-last-name"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Username</Label>
                <Input 
                  value={editingUser.username}
                  onChange={(e) => setEditingUser({...editingUser, username: e.target.value})}
                  placeholder="Enter username"
                  className="bg-muted border-border text-foreground"
                  data-testid="input-edit-username"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Job Title</Label>
                <Input 
                  value={editingUser.jobTitle}
                  onChange={(e) => setEditingUser({...editingUser, jobTitle: e.target.value})}
                  placeholder="e.g. Care Coordinator"
                  className="bg-muted border-border text-foreground"
                  data-testid="input-edit-job-title"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Role</Label>
                <Select value={editingUser.role} onValueChange={(val) => setEditingUser({...editingUser, role: val as UserRole})}>
                  <SelectTrigger className="bg-muted border-border text-foreground" data-testid="select-edit-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {USER_ROLE_OPTIONS.map((role) => (
                      <SelectItem key={role} value={role}>{getUserRoleLabel(role)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)} className="border-border text-foreground">
              Cancel
            </Button>
            <Button onClick={handleUpdateUser} disabled={userActionLoading} className="bg-primary hover:bg-primary/90 text-primary-foreground" data-testid="button-save-user">
              {userActionLoading ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Save size={16} className="mr-2" />} Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog
        open={!!resetPasswordUser}
        onOpenChange={(open) => {
          if (!open) {
            setResetPasswordUser(null);
            setResetPasswordValue("");
            setResetPasswordConfirm("");
          }
        }}
      >
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Reset Password</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Set a new password for {resetPasswordUser?.username || "this user"}.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleResetPassword();
            }}
          >
            {/* Keeps password reset form compliant for browser autofill heuristics */}
            <input
              type="text"
              name="username"
              autoComplete="username"
              value={resetPasswordUser?.username ?? ""}
              readOnly
              tabIndex={-1}
              aria-hidden="true"
              className="sr-only"
            />
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label className="text-muted-foreground">New Password</Label>
                <Input
                  value={resetPasswordValue}
                  onChange={(e) => setResetPasswordValue(e.target.value)}
                  type="password"
                  placeholder="Enter new password"
                  autoComplete="new-password"
                  className="bg-muted border-border text-foreground"
                  data-testid="input-reset-password"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Confirm Password</Label>
                <Input
                  value={resetPasswordConfirm}
                  onChange={(e) => setResetPasswordConfirm(e.target.value)}
                  type="password"
                  placeholder="Confirm new password"
                  autoComplete="new-password"
                  className="bg-muted border-border text-foreground"
                  data-testid="input-reset-password-confirm"
                />
                <p className="text-xs text-muted-foreground">{PASSWORD_RULES_TEXT}</p>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setResetPasswordUser(null);
                  setResetPasswordValue("");
                  setResetPasswordConfirm("");
                }}
                className="border-border text-foreground"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={userActionLoading}
                className="bg-warning hover:bg-warning/100 text-white"
                data-testid="button-confirm-reset-password"
              >
                {userActionLoading ? <Loader2 size={16} className="mr-2 animate-spin" /> : <FileKey size={16} className="mr-2" />} Reset Password
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirmUser} onOpenChange={() => setDeleteConfirmUser(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Remove User</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Are you sure you want to remove this user? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmUser(null)} className="border-border text-foreground">
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              disabled={userActionLoading}
              onClick={() => deleteConfirmUser && handleDeleteUser(deleteConfirmUser)}
              data-testid="button-confirm-delete"
            >
              {userActionLoading ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Trash2 size={16} className="mr-2" />} Remove User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* System Log Dialog */}
      <Dialog open={systemLogDialogOpen} onOpenChange={setSystemLogDialogOpen}>
        <DialogContent className="bg-card border-border max-w-4xl max-h-[80vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Terminal size={20} className="text-primary" /> System Log
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Audit completion records showing EMAR and Visit audits with service user initials only.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] overflow-auto">
            <Table>
              <TableHeader className="bg-muted sticky top-0 backdrop-blur-sm z-10">
                <TableRow className="border-border/30 hover:bg-transparent">
                  <TableHead className="text-muted-foreground">Date</TableHead>
                  <TableHead className="text-muted-foreground">Audit Type</TableHead>
                  <TableHead className="text-muted-foreground">Service User</TableHead>
                  <TableHead className="text-muted-foreground">Auditor</TableHead>
                  <TableHead className="text-muted-foreground">Period</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {auditCompletionLogs.map((log) => (
                  <TableRow key={log.id} className="border-border/30 hover:bg-muted/20 transition-colors" data-testid={`row-audit-log-${log.id}`}>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {new Date(log.createdAt).toLocaleDateString("en-GB", { 
                        day: "2-digit", 
                        month: "short", 
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant="outline" 
                        className={log.auditType === "EMAR" 
                          ? "border-primary/30 text-primary" 
                          : "border-success/30 text-success"
                        }
                      >
                        {log.auditType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-foreground font-medium">
                      {log.serviceUserInitials}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {log.auditor}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {log.periodStart} - {log.periodEnd}
                    </TableCell>
                  </TableRow>
                ))}
                {auditCompletionLogs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No audit completion logs yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <p className="text-xs text-muted-foreground mr-auto">
              Showing {auditCompletionLogs.length} audit record{auditCompletionLogs.length !== 1 ? 's' : ''}
            </p>
            <Button variant="outline" onClick={() => setSystemLogDialogOpen(false)} className="border-border text-foreground">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Performance Data Confirmation */}
      <Dialog open={showResetDataConfirm} onOpenChange={setShowResetDataConfirm}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete All Performance Data</DialogTitle>
            <DialogDescription>
              This will permanently delete ALL care worker performance data, discrepancies, audits, and alerts. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetDataConfirm(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleResetPerformanceData}>
              <Trash2 size={14} className="mr-2" /> Delete Everything
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
