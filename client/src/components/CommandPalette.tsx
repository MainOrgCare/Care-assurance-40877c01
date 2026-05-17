import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  LayoutDashboard,
  Inbox,
  Mail,
  CheckCircle,
  Upload,
  FileText,
  ShieldAlert,
  Sparkles,
  Users,
  Activity,
  ClipboardList,
  BarChart,
  Settings,
  ShieldCheck,
  Download,
  Calculator,
  FlaskConical,
  Terminal,
  FileSpreadsheet,
  Search,
  Moon,
  Sun,
  Type,
  Eye,
  LogOut,
  Keyboard,
  Clock,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useSettings, type AppTheme, type FontSize } from "@/context/SettingsContext";
import { canAccessAppPath } from "@shared/roles";

interface CommandRoute {
  label: string;
  icon: LucideIcon;
  path: string;
  keywords: string[];
  shortcut?: string;
}

const NAVIGATION_ROUTES: CommandRoute[] = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/dashboard", keywords: ["home", "overview", "stats", "metrics"], shortcut: "G D" },
  { label: "Messages", icon: Inbox, path: "/messages", keywords: ["inbox", "notifications", "unread"], shortcut: "G M" },
  { label: "Email Assistant", icon: Mail, path: "/email-assistant", keywords: ["compose", "email", "write", "letter"], shortcut: "G E" },
  { label: "Compliance Hub", icon: CheckCircle, path: "/compliance", keywords: ["audit", "regulatory", "compliance", "report"], shortcut: "G C" },
  { label: "Settings", icon: Settings, path: "/settings", keywords: ["preferences", "configuration", "theme", "display"] },
];

const SERVICE_USER_ROUTES: CommandRoute[] = [
  { label: "Data Upload", icon: Upload, path: "/service-users/upload", keywords: ["import", "upload", "file", "document", "pdf"] },
  { label: "Care Planning", icon: FileText, path: "/service-users/care-planning", keywords: ["care plan", "support", "planning"] },
  { label: "Risk Assessment", icon: ShieldAlert, path: "/service-users/risk-assessment", keywords: ["risk", "assessment", "safety", "hazard"] },
  { label: "Plan Enhancer", icon: Sparkles, path: "/service-users/plan-enhancer", keywords: ["enhance", "improve", "ai", "quality"] },
];

const CARE_WORKER_ROUTES: CommandRoute[] = [
  { label: "Carers", icon: Users, path: "/care-workers/list", keywords: ["staff", "workers", "team", "personnel"] },
  { label: "EMAR Audit", icon: Activity, path: "/care-workers/emar-audit", keywords: ["medication", "emar", "drug", "pharmacy"] },
  { label: "Visit Audit", icon: ClipboardList, path: "/care-workers/visit-audit", keywords: ["visit", "call", "attendance", "log"] },
  { label: "Performance", icon: BarChart, path: "/care-workers/performance", keywords: ["stats", "metrics", "kpi", "performance"] },
];

const ADMIN_ROUTES: CommandRoute[] = [
  { label: "Administrator Controls", icon: ShieldCheck, path: "/shadow-admin-portal", keywords: ["admin", "platform", "controls", "management"] },
  { label: "Extension Manager", icon: Download, path: "/admin/extension-manager", keywords: ["extension", "edge", "autofill", "install", "update"] },
  { label: "Features & Benefits", icon: Calculator, path: "/roi-calculator", keywords: ["roi", "cost", "savings", "features"] },
  { label: "Rostering Tool", icon: FlaskConical, path: "/rostering-tool", keywords: ["rostering", "workbook", "rota", "planning"] },
  { label: "System Logs", icon: Terminal, path: "/system-logs", keywords: ["logs", "events", "activity", "audit trail"] },
  { label: "Rostering Studio", icon: ClipboardList, path: "/rostering-unified", keywords: ["rota", "schedule", "roster", "shift"] },
  { label: "Billing Tool", icon: FileSpreadsheet, path: "/billing-tool", keywords: ["billing", "invoice", "payment"] },
];

const ALL_ROUTES_MAP = new Map<string, CommandRoute>(
  [...NAVIGATION_ROUTES, ...SERVICE_USER_ROUTES, ...CARE_WORKER_ROUTES, ...ADMIN_ROUTES].map(
    (r) => [r.path, r] as const,
  ),
);

const THEME_SEQUENCE: readonly AppTheme[] = ["light", "sunrise", "dark", "midnight", "ocean", "aurora"];
const DARK_THEME_VALUES = new Set<AppTheme>(["dark", "midnight", "ocean", "aurora"]);
const FONT_SIZE_SEQUENCE: readonly FontSize[] = ["small", "medium", "large"];

const formatThemeLabel = (value: AppTheme): string =>
  value.charAt(0).toUpperCase() + value.slice(1);

const formatFontSizeLabel = (value: FontSize): string =>
  value.charAt(0).toUpperCase() + value.slice(1);

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenKeyboardShortcuts?: () => void;
}

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function CommandPalette({ open, onOpenChange, onOpenKeyboardShortcuts }: CommandPaletteProps) {
  const [, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const {
    theme,
    setTheme,
    compactMode,
    setCompactMode,
    fontSize,
    setFontSize,
    reduceMotion,
    setReduceMotion,
    highContrast,
    setHighContrast,
    dyslexiaFriendly,
    setDyslexiaFriendly,
  } = useSettings();
  const isAdmin = user?.role === "admin";
  const [search, setSearch] = useState("");
  const navigationRoutes = useMemo(
    () => NAVIGATION_ROUTES.filter((route) => canAccessAppPath(user?.role, route.path)),
    [user?.role],
  );
  const serviceUserRoutes = useMemo(
    () => SERVICE_USER_ROUTES.filter((route) => canAccessAppPath(user?.role, route.path)),
    [user?.role],
  );
  const careWorkerRoutes = useMemo(
    () => CARE_WORKER_ROUTES.filter((route) => canAccessAppPath(user?.role, route.path)),
    [user?.role],
  );
  const adminRoutes = useMemo(
    () => (isAdmin ? ADMIN_ROUTES.filter((route) => canAccessAppPath(user?.role, route.path)) : []),
    [isAdmin, user?.role],
  );

  // Reset search when palette opens
  useEffect(() => {
    if (open) setSearch("");
  }, [open]);

  const navigate = useCallback(
    (path: string) => {
      setLocation(path);
      onOpenChange(false);
    },
    [setLocation, onOpenChange],
  );

  const setThemeAndClose = useCallback((nextTheme: AppTheme) => {
    setTheme(nextTheme);
    onOpenChange(false);
  }, [setTheme, onOpenChange]);

  const cycleTheme = useCallback(() => {
    const currentIndex = THEME_SEQUENCE.indexOf(theme);
    const nextTheme = THEME_SEQUENCE[(currentIndex + 1) % THEME_SEQUENCE.length] || "light";
    setTheme(nextTheme);
    onOpenChange(false);
  }, [theme, setTheme, onOpenChange]);

  const cycleFontSize = useCallback(() => {
    const currentIndex = FONT_SIZE_SEQUENCE.indexOf(fontSize);
    const nextSize = FONT_SIZE_SEQUENCE[(currentIndex + 1) % FONT_SIZE_SEQUENCE.length] || "medium";
    setFontSize(nextSize);
    onOpenChange(false);
  }, [fontSize, setFontSize, onOpenChange]);

  const toggleCompactMode = useCallback(() => {
    setCompactMode(!compactMode);
    onOpenChange(false);
  }, [compactMode, setCompactMode, onOpenChange]);

  const toggleReduceMotion = useCallback(() => {
    setReduceMotion(!reduceMotion);
    onOpenChange(false);
  }, [reduceMotion, setReduceMotion, onOpenChange]);

  const toggleHighContrast = useCallback(() => {
    setHighContrast(!highContrast);
    onOpenChange(false);
  }, [highContrast, setHighContrast, onOpenChange]);

  const toggleDyslexiaFriendly = useCallback(() => {
    setDyslexiaFriendly(!dyslexiaFriendly);
    onOpenChange(false);
  }, [dyslexiaFriendly, setDyslexiaFriendly, onOpenChange]);

  const handleLogout = useCallback(() => {
    onOpenChange(false);
    logout();
  }, [onOpenChange, logout]);

  const isDark = useMemo(() => DARK_THEME_VALUES.has(theme), [theme]);
  const currentThemeLabel = useMemo(() => formatThemeLabel(theme), [theme]);
  const nextThemeLabel = useMemo(() => {
    const currentIndex = THEME_SEQUENCE.indexOf(theme);
    const nextTheme = THEME_SEQUENCE[(currentIndex + 1) % THEME_SEQUENCE.length] || "light";
    return formatThemeLabel(nextTheme);
  }, [theme]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search pages, actions, and settings..."
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>
          <div className="flex flex-col items-center gap-2 py-4">
            <Search className="h-8 w-8 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">No results found</p>
            <p className="text-xs text-muted-foreground">Try a different search term</p>
          </div>
        </CommandEmpty>

        <CommandGroup heading="Navigation">
          {navigationRoutes.map((route) => (
            <CommandItem
              key={route.path}
              value={`${route.label} ${route.keywords.join(" ")}`}
              onSelect={() => navigate(route.path)}
            >
              <route.icon className="mr-2 h-4 w-4 text-muted-foreground" />
              <span>{route.label}</span>
              {route.shortcut && (
                <CommandShortcut>{route.shortcut}</CommandShortcut>
              )}
            </CommandItem>
          ))}
        </CommandGroup>

        {serviceUserRoutes.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Service Users">
              {serviceUserRoutes.map((route) => (
                <CommandItem
                  key={route.path}
                  value={`${route.label} ${route.keywords.join(" ")}`}
                  onSelect={() => navigate(route.path)}
                >
                  <route.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span>{route.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {careWorkerRoutes.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Care Workers">
              {careWorkerRoutes.map((route) => (
                <CommandItem
                  key={route.path}
                  value={`${route.label} ${route.keywords.join(" ")}`}
                  onSelect={() => navigate(route.path)}
                >
                  <route.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span>{route.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {adminRoutes.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Administration">
              {adminRoutes.map((route) => (
                <CommandItem
                  key={route.path}
                  value={`${route.label} ${route.keywords.join(" ")}`}
                  onSelect={() => navigate(route.path)}
                >
                  <route.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span>{route.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        <CommandSeparator />

        <CommandGroup heading="Workspace Preferences">
          <CommandItem
            value={`theme appearance cycle ${currentThemeLabel.toLowerCase()} ${nextThemeLabel.toLowerCase()}`}
            onSelect={cycleTheme}
          >
            {isDark ? (
              <Sun className="mr-2 h-4 w-4 text-muted-foreground" />
            ) : (
              <Moon className="mr-2 h-4 w-4 text-muted-foreground" />
            )}
            <span>Cycle Theme ({currentThemeLabel} -&gt; {nextThemeLabel})</span>
          </CommandItem>

          {THEME_SEQUENCE.map((themeOption) => (
            <CommandItem
              key={`theme-${themeOption}`}
              value={`theme ${themeOption} appearance workspace style`}
              onSelect={() => setThemeAndClose(themeOption)}
            >
              {themeOption === "light" ? (
                <Sun className="mr-2 h-4 w-4 text-muted-foreground" />
              ) : (
                <Moon className="mr-2 h-4 w-4 text-muted-foreground" />
              )}
              <span>Switch to {formatThemeLabel(themeOption)} Theme</span>
              {theme === themeOption ? <CommandShortcut>Current</CommandShortcut> : null}
            </CommandItem>
          ))}

          <CommandItem
            value={`compact mode density spacing ${compactMode ? "disable" : "enable"}`}
            onSelect={toggleCompactMode}
          >
            <LayoutDashboard className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>{compactMode ? "Disable Compact Mode" : "Enable Compact Mode"}</span>
            <CommandShortcut>{compactMode ? "On" : "Off"}</CommandShortcut>
          </CommandItem>

          <CommandItem
            value={`font size text scale ${fontSize}`}
            onSelect={cycleFontSize}
          >
            <Type className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>Cycle Font Size</span>
            <CommandShortcut>{formatFontSizeLabel(fontSize)}</CommandShortcut>
          </CommandItem>

          <CommandItem
            value={`motion animation accessibility ${reduceMotion ? "disable" : "enable"}`}
            onSelect={toggleReduceMotion}
          >
            <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>{reduceMotion ? "Disable Reduced Motion" : "Enable Reduced Motion"}</span>
            <CommandShortcut>{reduceMotion ? "On" : "Off"}</CommandShortcut>
          </CommandItem>

          <CommandItem
            value={`high contrast accessibility readability ${highContrast ? "disable" : "enable"}`}
            onSelect={toggleHighContrast}
          >
            <Eye className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>{highContrast ? "Disable High Contrast" : "Enable High Contrast"}</span>
            <CommandShortcut>{highContrast ? "On" : "Off"}</CommandShortcut>
          </CommandItem>

          <CommandItem
            value={`dyslexia accessibility readability spacing font ${dyslexiaFriendly ? "disable" : "enable"}`}
            onSelect={toggleDyslexiaFriendly}
          >
            <Type className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>{dyslexiaFriendly ? "Disable Dyslexia-Friendly Text" : "Enable Dyslexia-Friendly Text"}</span>
            <CommandShortcut>{dyslexiaFriendly ? "On" : "Off"}</CommandShortcut>
          </CommandItem>

        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Actions">
          {onOpenKeyboardShortcuts && (
            <CommandItem
              value="keyboard shortcuts help hotkeys"
              onSelect={() => {
                onOpenChange(false);
                onOpenKeyboardShortcuts();
              }}
            >
              <Keyboard className="mr-2 h-4 w-4 text-muted-foreground" />
              <span>Keyboard Shortcuts</span>
              <CommandShortcut>?</CommandShortcut>
            </CommandItem>
          )}
          <CommandItem
            value="logout sign out terminate session"
            onSelect={handleLogout}
            className="text-destructive"
          >
            <LogOut className="mr-2 h-4 w-4" />
            <span>Terminate Session</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
