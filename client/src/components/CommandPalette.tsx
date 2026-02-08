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
  Calculator,
  FlaskConical,
  Terminal,
  FileSpreadsheet,
  Search,
  Moon,
  Sun,
  LogOut,
  Keyboard,
  Clock,
  Star,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useRecentPages } from "@/hooks/useRecentPages";
import { useFavorites } from "@/hooks/useFavorites";
import { cn } from "@/lib/utils";

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
  { label: "Features & Benefits", icon: Calculator, path: "/roi-calculator", keywords: ["roi", "cost", "savings", "features"] },
  { label: "Testing Features", icon: FlaskConical, path: "/testing-features", keywords: ["test", "debug", "experiment"] },
  { label: "System Logs", icon: Terminal, path: "/system-logs", keywords: ["logs", "events", "activity", "audit trail"] },
  { label: "Rostering Studio", icon: ClipboardList, path: "/rostering-unified", keywords: ["rota", "schedule", "roster", "shift"] },
  { label: "Billing Tool", icon: FileSpreadsheet, path: "/billing-tool", keywords: ["billing", "invoice", "payment"] },
];

const ALL_ROUTES_MAP = new Map<string, CommandRoute>(
  [...NAVIGATION_ROUTES, ...SERVICE_USER_ROUTES, ...CARE_WORKER_ROUTES, ...ADMIN_ROUTES].map(
    (r) => [r.path, r] as const,
  ),
);

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
  const [currentPath, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const recentPages = useRecentPages();
  const { favorites, toggleFavorite, isFavorite } = useFavorites();
  const isAdmin = user?.role === "admin";
  const currentPageName = ALL_ROUTES_MAP.get(currentPath)?.label;
  const currentPageIsFav = isFavorite(currentPath);
  const [search, setSearch] = useState("");

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

  const toggleTheme = useCallback(() => {
    const root = document.documentElement;
    const current = root.classList.contains("dark") ? "dark" : "light";
    const next = current === "dark" ? "light" : "dark";
    root.classList.remove(current);
    root.classList.add(next);
    localStorage.setItem("theme", next);
    onOpenChange(false);
  }, [onOpenChange]);

  const handleLogout = useCallback(() => {
    onOpenChange(false);
    logout();
  }, [onOpenChange, logout]);

  const isDark = useMemo(() => {
    if (typeof document === "undefined") return false;
    return document.documentElement.classList.contains("dark");
  }, [open]); // re-check each time palette opens

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
            <Search className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No results found</p>
            <p className="text-xs text-muted-foreground/60">Try a different search term</p>
          </div>
        </CommandEmpty>

        {/* Favorite pages — shown when there's no search query */}
        {!search && favorites.length > 0 && (
          <>
            <CommandGroup heading="Favorites">
              {favorites.map((path) => {
                const route = ALL_ROUTES_MAP.get(path);
                if (!route) return null;
                return (
                  <CommandItem
                    key={`fav-${path}`}
                    value={`favorite ${route.label}`}
                    onSelect={() => navigate(path)}
                  >
                    <Star className="mr-2 h-4 w-4 text-amber-400 fill-amber-400" />
                    <span>{route.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* Recent pages — shown when there's no search query */}
        {!search && recentPages.length > 1 && (
          <>
            <CommandGroup heading="Recent">
              {recentPages.slice(1).map((page) => (
                <CommandItem
                  key={`recent-${page.path}`}
                  value={`recent ${page.label}`}
                  onSelect={() => navigate(page.path)}
                >
                  <Clock className="mr-2 h-4 w-4 text-muted-foreground/60" />
                  <span>{page.label}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground/40">
                    {formatTimeAgo(page.visitedAt)}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        <CommandGroup heading="Navigation">
          {NAVIGATION_ROUTES.map((route) => (
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

        <CommandSeparator />

        <CommandGroup heading="Service Users">
          {SERVICE_USER_ROUTES.map((route) => (
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

        <CommandSeparator />

        <CommandGroup heading="Care Workers">
          {CARE_WORKER_ROUTES.map((route) => (
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

        {isAdmin && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Administration">
              {ADMIN_ROUTES.map((route) => (
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

        <CommandGroup heading="Actions">
          {currentPageName && (
            <CommandItem
              value={`favorite star bookmark ${currentPageName}`}
              onSelect={() => {
                toggleFavorite(currentPath);
                onOpenChange(false);
              }}
            >
              <Star className={cn(
                "mr-2 h-4 w-4",
                currentPageIsFav ? "text-amber-400 fill-amber-400" : "text-muted-foreground"
              )} />
              <span>{currentPageIsFav ? `Remove ${currentPageName} from Favorites` : `Add ${currentPageName} to Favorites`}</span>
            </CommandItem>
          )}
          <CommandItem
            value="toggle theme dark light mode appearance"
            onSelect={toggleTheme}
          >
            {isDark ? (
              <Sun className="mr-2 h-4 w-4 text-muted-foreground" />
            ) : (
              <Moon className="mr-2 h-4 w-4 text-muted-foreground" />
            )}
            <span>{isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}</span>
          </CommandItem>
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
            className="text-red-500"
          >
            <LogOut className="mr-2 h-4 w-4" />
            <span>Terminate Session</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
