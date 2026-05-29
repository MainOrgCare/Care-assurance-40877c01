import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { usePageTitle } from "@/hooks/usePageTitle";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Download,
  ExternalLink,
  FileCheck,
  FileText,
  Loader2,
  RefreshCcw,
  Search,
  Send,
  Shield,
  ShieldCheck,
  Upload,
  Zap,
} from "lucide-react";

let postMessageRequestCounter = 0;

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

interface ExtensionRuntimeConfigResponse {
  config: Record<string, unknown>;
  defaults?: Record<string, unknown>;
  updatedAt?: string | null;
  updatedBy?: string | null;
  source?: "default" | "stored" | string;
}

type AdminAcpWorkflow = "risk" | "emar" | "care-plan";
type ExtensionTestStatus = "idle" | "testing" | "success" | "failed";

const ADMIN_ACP_WORKFLOWS: Record<
  AdminAcpWorkflow,
  { label: string; path: string; icon: typeof Shield }
> = {
  risk: { label: "Risk Assess", path: "/service-users/risk-assessment", icon: Shield },
  emar: { label: "EMAR", path: "/care-workers/emar-audit", icon: FileCheck },
  "care-plan": { label: "Care Plan", path: "/service-users/care-planning", icon: FileText },
};

function formatBytes(bytes: number | null | undefined): string {
  if (typeof bytes !== "number" || Number.isNaN(bytes) || bytes < 0) return "Unavailable";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function withApiBase(path: string | null): string | null {
  if (!path) return null;
  const base = (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/+$/, "");

  if (base && path.startsWith("/")) {
    try {
      return new URL(path, `${base}/`).toString();
    } catch {
      return null;
    }
  }

  return path;
}

function formatExtensionTestError(error?: string) {
  const base = error?.trim() || "Unknown extension error.";

  if (/updated|refresh this page/i.test(base)) {
    return `${base} Refresh this page so the content script matches the current extension build.`;
  }

  if (/background service unavailable/i.test(base)) {
    return `${base} Open the extension popup once, then retry if Edge suspended the background worker.`;
  }

  if (/invalid|unsupported/i.test(base)) {
    return `${base} The test payload was rejected before it could be stored in the extension.`;
  }

  return `Extension responded with error: ${base}`;
}

function formatRuntimeConfigJson(value: unknown): string {
  return JSON.stringify(value ?? {}, null, 2);
}

export default function ExtensionManager() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [extensionInfo, setExtensionInfo] = useState<ExtensionPackageInfo | null>(null);
  const [extensionInfoLoading, setExtensionInfoLoading] = useState(false);
  const [extensionInfoRefreshing, setExtensionInfoRefreshing] = useState(false);
  const [extensionInfoUpdating, setExtensionInfoUpdating] = useState(false);
  const [installedExtensionStatus, setInstalledExtensionStatus] = useState<InstalledExtensionStatus | null>(null);
  const [extensionTestStatus, setExtensionTestStatus] = useState<ExtensionTestStatus>("idle");
  const [extensionTestMessage, setExtensionTestMessage] = useState("");
  const [acpServiceUsersLoading, setAcpServiceUsersLoading] = useState(false);
  const [acpServiceUsers, setAcpServiceUsers] = useState<AdminAcpServiceUser[]>([]);
  const [acpServiceUserPickerOpen, setAcpServiceUserPickerOpen] = useState(false);
  const [selectedAcpServiceUser, setSelectedAcpServiceUser] = useState<AdminAcpServiceUser | null>(null);
  const [runtimeConfigLoading, setRuntimeConfigLoading] = useState(false);
  const [runtimeConfigSaving, setRuntimeConfigSaving] = useState(false);
  const [runtimeConfigPushing, setRuntimeConfigPushing] = useState(false);
  const [runtimeConfigValue, setRuntimeConfigValue] = useState("{}");
  const [runtimeConfigDefaultsValue, setRuntimeConfigDefaultsValue] = useState("{}");
  const [runtimeConfigUpdatedAt, setRuntimeConfigUpdatedAt] = useState<string | null>(null);
  const [runtimeConfigUpdatedBy, setRuntimeConfigUpdatedBy] = useState<string | null>(null);
  const [runtimeConfigSource, setRuntimeConfigSource] = useState<string | null>(null);

  usePageTitle("Extension Manager");

  const applyRuntimeConfigResponse = (data: ExtensionRuntimeConfigResponse) => {
    setRuntimeConfigValue(formatRuntimeConfigJson(data.config || {}));
    setRuntimeConfigDefaultsValue(formatRuntimeConfigJson(data.defaults || data.config || {}));
    setRuntimeConfigUpdatedAt(typeof data.updatedAt === "string" ? data.updatedAt : null);
    setRuntimeConfigUpdatedBy(typeof data.updatedBy === "string" ? data.updatedBy : null);
    setRuntimeConfigSource(typeof data.source === "string" ? data.source : null);
  };

  const fetchAdminRuntimeConfig = useCallback(async () => {
    setRuntimeConfigLoading(true);

    try {
      const response = await fetch("/api/admin/extension/runtime-config", {
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data && typeof data === "object" && "message" in data
            ? String((data as { message?: string }).message || "Failed to load runtime config.")
            : "Failed to load runtime config.",
        );
      }

      applyRuntimeConfigResponse(data as ExtensionRuntimeConfigResponse);
    } catch (error) {
      console.error("Failed to fetch extension runtime config:", error);
      toast({
        title: "Runtime config unavailable",
        description: error instanceof Error ? error.message : "Could not load extension runtime config.",
        variant: "destructive",
      });
    } finally {
      setRuntimeConfigLoading(false);
    }
  }, [toast]);

  const parseRuntimeConfigValue = () => {
    try {
      return JSON.parse(runtimeConfigValue) as Record<string, unknown>;
    } catch (error) {
      toast({
        title: "Invalid runtime config JSON",
        description: error instanceof Error ? error.message : "The runtime config editor contains invalid JSON.",
        variant: "destructive",
      });
      return null;
    }
  };

  const saveAdminRuntimeConfig = async () => {
    const parsedConfig = parseRuntimeConfigValue();
    if (!parsedConfig) return;

    setRuntimeConfigSaving(true);

    try {
      const response = await fetch("/api/admin/extension/runtime-config", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ config: parsedConfig }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data && typeof data === "object" && "message" in data
            ? String((data as { message?: string }).message || "Failed to save runtime config.")
            : "Failed to save runtime config.",
        );
      }

      applyRuntimeConfigResponse(data as ExtensionRuntimeConfigResponse);
      toast({
        title: "Runtime config saved",
        description: "The extension will fetch this config on its next CareAssurance connection, or you can push it into this browser immediately.",
      });
    } catch (error) {
      console.error("Failed to save extension runtime config:", error);
      toast({
        title: "Runtime config save failed",
        description: error instanceof Error ? error.message : "Could not save extension runtime config.",
        variant: "destructive",
      });
    } finally {
      setRuntimeConfigSaving(false);
    }
  };

  const fetchExtensionPackageInfo = useCallback(async ({
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
        throw new Error(
          data && typeof data === "object" && "message" in data
            ? String((data as { message?: string }).message || "Failed to fetch extension package status.")
            : "Failed to fetch extension package status.",
        );
      }

      setExtensionInfo(data as ExtensionPackageInfo);

      if (updateVersion) {
        const previousVersion = typeof data.previousManifestVersion === "string" ? data.previousManifestVersion : null;
        const nextVersion = typeof data.manifestVersion === "string" ? data.manifestVersion : null;
        toast({
          title: "Extension updated",
          description:
            previousVersion && nextVersion && previousVersion !== nextVersion
              ? `Manifest version bumped from ${previousVersion} to ${nextVersion}. Download the updated package below.`
              : "Extension package rebuilt. Download the latest package below.",
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
  }, [extensionInfo, toast]);

  const fetchAcpServiceUsers = useCallback(async () => {
    setAcpServiceUsersLoading(true);

    try {
      const response = await fetch("/api/admin/extension/acp-service-users", {
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data && typeof data === "object" && "message" in data
            ? String((data as { message?: string }).message || "Failed to load ACP service users.")
            : "Failed to load ACP service users.",
        );
      }

      const nextUsers = Array.isArray((data as { users?: unknown }).users)
        ? ((data as { users: AdminAcpServiceUser[] }).users)
        : [];
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
  }, [toast]);

  useEffect(() => {
    void fetchExtensionPackageInfo();
    void fetchAcpServiceUsers();
    void fetchAdminRuntimeConfig();
  }, [fetchExtensionPackageInfo, fetchAcpServiceUsers, fetchAdminRuntimeConfig]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const requestInstalledExtensionStatus = () => {
      window.postMessage({ type: "CA_EXTENSION_REQUEST_STATUS" }, window.location.origin);
    };

    const handleInstalledExtensionStatus = (event: MessageEvent) => {
      if (event.source !== window) return;
      if (!event.data || event.data.type !== "CA_EXTENSION_STATUS") return;

      const payload = event.data.payload;
      if (!payload || typeof payload !== "object") return;

      const nextPayload = payload as Record<string, unknown>;
      setInstalledExtensionStatus({
        detected: Boolean(nextPayload.detected),
        refreshRequired: Boolean(nextPayload.refreshRequired),
        version: typeof nextPayload.version === "string" ? nextPayload.version : null,
        name: typeof nextPayload.name === "string" ? nextPayload.name : null,
        origin: typeof nextPayload.origin === "string" ? nextPayload.origin : null,
        error: typeof nextPayload.error === "string" ? nextPayload.error : null,
        lastSeenAt: typeof nextPayload.lastSeenAt === "string" ? nextPayload.lastSeenAt : null,
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
  }, []);

  const postMessageToInstalledExtension = async ({
    messageType,
    payload,
    timeoutMessage,
  }: {
    messageType: "CA_SEND_TO_ACP_EXTENSION" | "CA_EXTENSION_STORE_PAYLOAD" | "CA_EXTENSION_SYNC_RUNTIME_CONFIG";
    payload: Record<string, unknown>;
    timeoutMessage: string;
  }) => {
    if (typeof window === "undefined") {
      throw new Error(timeoutMessage);
    }

    const requestId =
      typeof window.crypto !== "undefined" && typeof window.crypto.randomUUID === "function"
        ? window.crypto.randomUUID()
        : (() => {
            postMessageRequestCounter += 1;
            return `fallback-${Date.now()}-${postMessageRequestCounter}`;
          })();

    return new Promise<{ ok: boolean; error?: string }>((resolve, reject) => {
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
  };

  const sendExtensionTestPayload = async ({
    messageType,
    payload,
    pendingMessage,
    successMessage,
    timeoutMessage,
  }: {
    messageType: "CA_SEND_TO_ACP_EXTENSION" | "CA_EXTENSION_STORE_PAYLOAD" | "CA_EXTENSION_SYNC_RUNTIME_CONFIG";
    payload: Record<string, unknown>;
    pendingMessage: string;
    successMessage: string;
    timeoutMessage: string;
  }) => {
    if (typeof window === "undefined") return;

    setExtensionTestStatus("testing");
    setExtensionTestMessage(pendingMessage);

    try {
      const response = await postMessageToInstalledExtension({
        messageType,
        payload,
        timeoutMessage,
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
      launchSource: "extension-manager",
    });

    navigate(`${ADMIN_ACP_WORKFLOWS[workflow].path}?${params.toString()}`);
  };

  const runWithLoadingAndToast = async ({
    setLoading,
    action,
    errorTitle,
    fallbackErrorDescription,
  }: {
    setLoading: (value: boolean) => void;
    action: () => Promise<void>;
    errorTitle: string;
    fallbackErrorDescription: string;
  }) => {
    setLoading(true);
    try {
      await action();
    } catch (error) {
      toast({
        title: errorTitle,
        description: error instanceof Error ? error.message : fallbackErrorDescription,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const pushRuntimeConfigToInstalledExtension = async () => {
    const parsedConfig = parseRuntimeConfigValue();
    if (!parsedConfig) return;

    await runWithLoadingAndToast({
      setLoading: setRuntimeConfigPushing,
      errorTitle: "Runtime config push failed",
      fallbackErrorDescription: "Could not push runtime config into the installed extension.",
      action: async () => {
        const response = await postMessageToInstalledExtension({
          messageType: "CA_EXTENSION_SYNC_RUNTIME_CONFIG",
          payload: { config: parsedConfig },
          timeoutMessage: "Installed extension did not acknowledge the runtime config push. Refresh this page after enabling the extension, then retry.",
        });

        if (!response.ok) {
          throw new Error(formatExtensionTestError(response.error));
        }

        toast({
          title: "Runtime config pushed",
          description: "The installed extension on this browser acknowledged the new runtime config.",
        });
      },
    });
  };

  const extensionDownloadUrl = withApiBase(extensionInfo?.downloadUrl || "/api/admin/extension/package?fresh=1");
  const extensionCrxDownloadUrl = withApiBase(extensionInfo?.crxDownloadUrl || null);

  const extensionManifestVersion = extensionInfo?.manifestVersion || "Unknown";
  const extensionSizeLabel = formatBytes(extensionInfo?.package?.sizeBytes);
  const extensionPackagedAt = extensionInfo?.package?.packagedAt
    ? new Date(extensionInfo.package.packagedAt).toLocaleString()
    : "Unavailable";
  const extensionHashShort = extensionInfo?.package?.sha256
    ? `${extensionInfo.package.sha256.slice(0, 12)}...${extensionInfo.package.sha256.slice(-8)}`
    : "Unavailable";
  const installedExtensionVersion = installedExtensionStatus?.detected
    ? installedExtensionStatus.version || "Detected"
    : installedExtensionStatus?.refreshRequired
      ? "Refresh required"
      : "Not detected";
  const installedExtensionSeenAt = installedExtensionStatus?.lastSeenAt
    ? new Date(installedExtensionStatus.lastSeenAt).toLocaleTimeString()
    : "Unavailable";
  const extensionVersionMismatch = Boolean(
    extensionInfo?.manifestVersion &&
      installedExtensionStatus?.version &&
      extensionInfo.manifestVersion !== installedExtensionStatus.version,
  );

  const extensionSyncSummary = useMemo(() => {
    if (installedExtensionStatus?.refreshRequired) {
      return "This page is attached to an older extension context. Refresh after updating the browser extension.";
    }

    if (!installedExtensionStatus?.detected) {
      return "The website has not detected an installed Care Assurance extension on this page yet.";
    }

    if (extensionVersionMismatch) {
      return `The page currently sees extension v${installedExtensionStatus.version}. Refresh after loading v${extensionInfo?.manifestVersion || "latest"}.`;
    }

    return "The installed extension version matches the package currently published from CareAssurance.";
  }, [extensionInfo?.manifestVersion, extensionVersionMismatch, installedExtensionStatus]);

  const installGuide = [
    {
      title: "Update the published build",
      detail: "Use Update Extension to bump the manifest version and rebuild the ZIP and .crx package in one action.",
    },
    {
      title: "Install the new package in Edge",
      detail: "Use the .crx for direct install, or extract the ZIP and load it via Extensions → Load unpacked.",
    },
    {
      title: "Refresh CareAssurance tabs",
      detail: "Refresh open CareAssurance pages after any extension update so the content scripts and website bridge stay in sync.",
    },
  ];

  const connectionToneClass =
    extensionTestStatus === "success"
      ? "border-success/30 bg-success/10 text-success"
      : extensionTestStatus === "failed"
        ? "border-destructive/30 bg-destructive/10 text-destructive"
        : "border-border bg-muted/30 text-muted-foreground";

  const runtimeConfigUpdatedLabel = runtimeConfigUpdatedAt
    ? new Date(runtimeConfigUpdatedAt).toLocaleString()
    : "Not saved yet";

  return (
    <div className="page-shell space-y-6 pb-8">
      <div className="relative overflow-hidden rounded-[1.75rem] border border-border/60 bg-card/90 p-6 shadow-medium backdrop-blur sm:p-8">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.16),transparent_42%),radial-gradient(circle_at_15%_20%,rgba(16,185,129,0.12),transparent_40%)]" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
              <ShieldCheck className="h-3.5 w-3.5" />
              Extension Ops
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-heading font-bold tracking-tight text-foreground sm:text-3xl">
                Extension Manager
              </h2>
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                Publish, install, validate, and hand off the latest ACP Autofill build from one admin workspace.
                This page keeps the package metadata, website-extension sync state, and ACP quick-launch tools together.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-primary/25 bg-primary/8 text-primary">
                Published v{extensionManifestVersion}
              </Badge>
              <Badge
                variant="outline"
                className={installedExtensionStatus?.detected ? "border-success/30 bg-success/10 text-success" : "border-border bg-background/60 text-muted-foreground"}
              >
                Browser {installedExtensionVersion}
              </Badge>
              <Badge
                variant="outline"
                className={extensionVersionMismatch || installedExtensionStatus?.refreshRequired ? "border-warning/40 bg-warning/10 text-warning" : "border-border bg-background/60 text-muted-foreground"}
              >
                {extensionVersionMismatch || installedExtensionStatus?.refreshRequired ? "Refresh required" : "Website sync ready"}
              </Badge>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/shadow-admin-portal")}
            >
              Admin Portal
            </Button>
            {extensionDownloadUrl && (
              <Button asChild>
                <a href={extensionDownloadUrl} target="_blank" rel="noopener noreferrer">
                  <Download className="mr-2 h-4 w-4" />
                  Download ZIP
                </a>
              </Button>
            )}
          </div>
        </div>
      </div>

      <Card className="border-border/60 bg-background/70 shadow-medium">
        <CardHeader className="border-b border-border/30">
          <CardTitle className="flex items-center gap-3 text-sm">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/8">
              <Zap className="h-4 w-4 text-primary" />
            </div>
            Runtime Config
          </CardTitle>
          <CardDescription>
            Change extension hosts, Mobizio routes, and queue timings without rebuilding the package. Saved config is fetched by the popup on connect, and you can push it into this browser instantly.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 p-6">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Saved At</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{runtimeConfigUpdatedLabel}</p>
            </div>
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Saved By</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{runtimeConfigUpdatedBy || "Unknown"}</p>
            </div>
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Config Source</p>
              <p className="mt-1 text-sm font-semibold capitalize text-foreground">{runtimeConfigSource || "Unavailable"}</p>
            </div>
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Instant Push</p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {installedExtensionStatus?.detected ? "Ready on this browser" : "Extension not detected"}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-border/60 bg-card/50 p-4 text-sm leading-6 text-muted-foreground">
            This covers runtime knobs only: known CareAssurance hosts, document lookup routes, default Mobizio IDs, and background timing windows. Manifest permissions, new content scripts, and code changes still require a packaged extension update.
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void fetchAdminRuntimeConfig()}
              disabled={runtimeConfigLoading || runtimeConfigSaving || runtimeConfigPushing}
            >
              {runtimeConfigLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="mr-2 h-4 w-4" />
              )}
              Reload Config
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRuntimeConfigValue(runtimeConfigDefaultsValue)}
              disabled={runtimeConfigLoading || runtimeConfigSaving || runtimeConfigPushing}
            >
              <FileText className="mr-2 h-4 w-4" />
              Load Defaults Into Editor
            </Button>
            <Button
              type="button"
              onClick={() => void saveAdminRuntimeConfig()}
              disabled={runtimeConfigLoading || runtimeConfigSaving || runtimeConfigPushing}
            >
              {runtimeConfigSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              Save Runtime Config
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void pushRuntimeConfigToInstalledExtension()}
              disabled={runtimeConfigLoading || runtimeConfigSaving || runtimeConfigPushing}
            >
              {runtimeConfigPushing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Push To This Browser Extension
            </Button>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.85fr)]">
            <div className="space-y-3">
              <p className="text-sm font-semibold text-foreground">Editable JSON</p>
              <Textarea
                value={runtimeConfigValue}
                onChange={(event) => setRuntimeConfigValue(event.target.value)}
                className="min-h-[420px] font-mono text-xs leading-6"
                spellCheck={false}
              />
            </div>

            <div className="space-y-3">
              <p className="text-sm font-semibold text-foreground">Default reference</p>
              <Textarea
                value={runtimeConfigDefaultsValue}
                readOnly
                className="min-h-[420px] font-mono text-xs leading-6 opacity-90"
                spellCheck={false}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.95fr)]">
        <Card className="border-border/60 bg-background/70 shadow-medium">
          <CardHeader className="border-b border-border/30">
            <CardTitle className="flex items-center gap-3 text-sm">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/8">
                <Download className="h-4 w-4 text-primary" />
              </div>
              Publish And Download
            </CardTitle>
            <CardDescription>
              Rebuild the newest extension package, compare the browser-installed version, and download the exact ZIP or .crx operators need.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 p-6">
            {extensionInfoLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading extension package metadata...
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
                <div className="min-w-0 rounded-xl border border-border bg-muted/30 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Version</p>
                  <p className="mt-1 break-words text-sm font-semibold leading-snug text-foreground">{extensionManifestVersion}</p>
                </div>
                <div className="min-w-0 rounded-xl border border-border bg-muted/30 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Package Size</p>
                  <p className="mt-1 break-words text-sm font-semibold leading-snug text-foreground">{extensionSizeLabel}</p>
                </div>
                <div className="min-w-0 rounded-xl border border-border bg-muted/30 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Packaged At</p>
                  <p className="mt-1 break-words text-sm font-semibold leading-snug text-foreground">{extensionPackagedAt}</p>
                </div>
                <div className="min-w-0 rounded-xl border border-border bg-muted/30 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">SHA-256</p>
                  <p className="mt-1 break-all text-sm font-semibold leading-snug text-foreground">{extensionHashShort}</p>
                </div>
                <div className="min-w-0 rounded-xl border border-border bg-muted/30 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Installed In Browser</p>
                  <p className="mt-1 break-words text-sm font-semibold leading-snug text-foreground">{installedExtensionVersion}</p>
                  <p className="mt-1 break-words text-[11px] leading-snug text-muted-foreground">Last seen {installedExtensionSeenAt}</p>
                </div>
              </div>
            )}

            <div className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">Website sync:</span> {extensionSyncSummary}
              {installedExtensionStatus?.error ? ` ${installedExtensionStatus.error}` : ""}
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                {extensionDownloadUrl && (
                  <Button asChild>
                    <a href={extensionDownloadUrl} target="_blank" rel="noopener noreferrer">
                      <Download className="mr-2 h-4 w-4" />
                      Download Edge Extension (.zip)
                    </a>
                  </Button>
                )}
                {extensionCrxDownloadUrl && (
                  <Button asChild variant="outline">
                    <a href={extensionCrxDownloadUrl} target="_blank" rel="noopener noreferrer">
                      <Download className="mr-2 h-4 w-4" />
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
                >
                  {extensionInfoRefreshing ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCcw className="mr-2 h-4 w-4" />
                  )}
                  Refresh Status
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void fetchExtensionPackageInfo({ fresh: true, updateVersion: true })}
                  disabled={extensionInfoLoading || extensionInfoRefreshing || extensionInfoUpdating}
                >
                  {extensionInfoUpdating ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Zap className="mr-2 h-4 w-4" />
                  )}
                  Update Extension
                </Button>
              </div>

              <Badge variant="outline" className="border-success/30 bg-success/10 text-success whitespace-normal text-center">
                {extensionInfo?.versionUpdated
                  ? `Updated to v${extensionInfo.manifestVersion || "latest"}`
                  : extensionInfo?.package?.rebuilt
                    ? "Package rebuilt this refresh"
                    : "Package freshness verified"}
              </Badge>
            </div>

            <div className="rounded-2xl border border-border/60 bg-card/50 p-4">
              <p className="text-sm font-semibold text-foreground">Operator handoff</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Use the Update Extension action when you need a new version, give operators the .crx for a direct browser install,
                or send the ZIP if they are using Extensions → Load unpacked or Edge Add-ons submission.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-background/70 shadow-medium">
          <CardHeader className="border-b border-border/30">
            <CardTitle className="flex items-center gap-3 text-sm">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/8">
                <ShieldCheck className="h-4 w-4 text-primary" />
              </div>
              Install Checklist
            </CardTitle>
            <CardDescription>
              Shorten the update cycle to three steps so operators are not guessing which package or refresh action comes next.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-6">
            {installGuide.map((step, index) => (
              <div key={step.title} className="flex gap-3 rounded-xl border border-border/60 bg-muted/20 p-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  {index + 1}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{step.title}</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{step.detail}</p>
                </div>
              </div>
            ))}

            <div className="rounded-xl border border-border/60 bg-background/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Current browser state</p>
              <p className="mt-2 text-base font-semibold text-foreground">
                {installedExtensionStatus?.detected ? installedExtensionStatus.name || "Care Assurance extension detected" : "Extension not detected on this page"}
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {extensionSyncSummary}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-background/70 shadow-medium">
          <CardHeader className="border-b border-border/30">
            <CardTitle className="flex items-center gap-3 text-sm">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/8">
                <Send className="h-4 w-4 text-primary" />
              </div>
              Website To Extension Tests
            </CardTitle>
            <CardDescription>
              Confirm the installed extension can still accept ACP and Initial Assessment payloads from the live website bridge.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-6">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
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
                    timeoutMessage: "Extension not detected. Ensure the CareAssurance Edge extension is installed and enabled, then refresh this page after any install or update.",
                  });
                }}
              >
                {extensionTestStatus === "testing" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Test ACP Send
              </Button>

              <Button
                type="button"
                variant="outline"
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
                    timeoutMessage: "Extension not detected for the Initial Assessment test. Ensure the extension is installed and enabled, then refresh this page after any install or update.",
                  });
                }}
              >
                {extensionTestStatus === "testing" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                Test Plan Enhancer Send
              </Button>

              {extensionTestStatus !== "idle" && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setExtensionTestStatus("idle");
                    setExtensionTestMessage("");
                  }}
                >
                  Clear
                </Button>
              )}
            </div>

            {extensionTestMessage && (
              <div className={`rounded-xl border p-3 text-sm ${connectionToneClass}`}>
                <div className="flex items-start gap-2">
                  {extensionTestStatus === "success" && <Check className="mt-0.5 h-4 w-4 shrink-0" />}
                  {extensionTestStatus === "failed" && <Shield className="mt-0.5 h-4 w-4 shrink-0" />}
                  {extensionTestStatus === "testing" && <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />}
                  <span>{extensionTestMessage}</span>
                </div>
              </div>
            )}

            <p className="text-xs leading-6 text-muted-foreground">
              These tests send a dummy payload via window.postMessage and wait for the extension ACK. After a successful test,
              open the extension popup and review Autofill → Latest Payload to inspect the stored JSON.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-background/70 shadow-medium">
          <CardHeader className="border-b border-border/30">
            <CardTitle className="flex items-center gap-3 text-sm">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/8">
                <Search className="h-4 w-4 text-primary" />
              </div>
              ACP Quick Launch
            </CardTitle>
            <CardDescription>
              Search imported service users, open their Mobizio dashboard, then jump straight into Risk Assess, EMAR, or Care Plan work inside CareAssurance.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-6">
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
                  >
                    <span className="truncate text-left">
                      {selectedAcpServiceUser
                        ? `${selectedAcpServiceUser.serviceUserName} (${selectedAcpServiceUser.accessCarePlanningId})`
                        : acpServiceUsersLoading
                          ? "Loading ACP service users..."
                          : "Search service user or ACP ID..."}
                    </span>
                    {acpServiceUsersLoading ? (
                      <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin" />
                    ) : (
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0" />
                    )}
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
                              <div className="text-xs text-muted-foreground">ACP ID {serviceUser.accessCarePlanningId}</div>
                            </div>
                            <Check
                              className={selectedAcpServiceUser?.accessCarePlanningId === serviceUser.accessCarePlanningId ? "h-4 w-4 opacity-100 text-primary" : "h-4 w-4 opacity-0"}
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
                >
                  {acpServiceUsersLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCcw className="mr-2 h-4 w-4" />
                  )}
                  Refresh Users
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => selectedAcpServiceUser && openAcpDashboard(selectedAcpServiceUser)}
                  disabled={!selectedAcpServiceUser}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open ACP Dashboard
                </Button>
              </div>
            </div>

            {selectedAcpServiceUser ? (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-border bg-muted/30 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Service User</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{selectedAcpServiceUser.serviceUserName}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/30 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">ACP ID</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{selectedAcpServiceUser.accessCarePlanningId}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/30 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Last Synced</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{new Date(selectedAcpServiceUser.updatedAt).toLocaleString()}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {(Object.entries(ADMIN_ACP_WORKFLOWS) as Array<[
                    AdminAcpWorkflow,
                    (typeof ADMIN_ACP_WORKFLOWS)[AdminAcpWorkflow],
                  ]>).map(([workflowKey, workflow]) => {
                    const WorkflowIcon = workflow.icon;
                    return (
                      <Button
                        key={workflowKey}
                        type="button"
                        onClick={() => handleLaunchAcpWorkflow(workflowKey)}
                      >
                        <WorkflowIcon className="mr-2 h-4 w-4" />
                        {workflow.label}
                      </Button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
                Pick a service user to open their ACP case dashboard and enable the workflow buttons.
              </div>
            )}

            <div className="rounded-2xl border border-border/60 bg-card/50 p-4 text-sm text-muted-foreground">
              Selecting a service user opens case_dashboard?id=&lt;ACP ID&gt; on Mobizio in a new tab using the imported ACP mapping.
              The workflow buttons keep you in CareAssurance while working that record.
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-background/70 shadow-medium">
          <CardHeader className="border-b border-border/30">
            <CardTitle className="flex items-center gap-3 text-sm">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/8">
                <ArrowUpRight className="h-4 w-4 text-primary" />
              </div>
              Rollout Notes
            </CardTitle>
            <CardDescription>
              Keep the browser, website, and extension popup pointed at the same build during operator testing.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-6 text-sm text-muted-foreground">
            <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
              After any update, refresh the website tab before running the connection test. That avoids stale content scripts reporting a false mismatch.
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
              If the browser reports a background service issue, open the extension popup once. Edge can suspend the worker until the extension is brought back into focus.
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
              When handing the build to staff, prefer the .crx for direct installs and keep the ZIP for unpacked installs or add-on submission.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
