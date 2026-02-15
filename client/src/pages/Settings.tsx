import { useState } from "react";
import { useLocation } from "wouter";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useSettings, FontSize, AppTheme } from "@/context/SettingsContext";
import { useAuth } from "@/context/AuthContext";
import { Type, Layout as LayoutIcon, Bell, ArrowLeft, KeyRound, Loader2, SwatchBook, Download, Keyboard, Database, FileText, Shield, Settings as SettingsIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const fontSizeOptions: { value: FontSize; label: string }[] = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
];

const themeOptions: Array<{
  value: AppTheme;
  label: string;
  description: string;
  bgStart: string;
  bgEnd: string;
  accent: string;
  surface: string;
}> = [
  {
    value: "light",
    label: "Light",
    description: "Clean daytime workspace",
    bgStart: "#f8fafc",
    bgEnd: "#ffffff",
    accent: "#2563eb",
    surface: "#e2e8f0",
  },
  {
    value: "dark",
    label: "Dark",
    description: "Balanced low-glare mode",
    bgStart: "#0b1220",
    bgEnd: "#151f33",
    accent: "#60a5fa",
    surface: "#243044",
  },
  {
    value: "midnight",
    label: "Midnight",
    description: "Deep executive contrast",
    bgStart: "#0f172a",
    bgEnd: "#1e1b4b",
    accent: "#38bdf8",
    surface: "#312e81",
  },
  {
    value: "ocean",
    label: "Ocean",
    description: "Calm teal-led palette",
    bgStart: "#0a2230",
    bgEnd: "#0f3a46",
    accent: "#14b8a6",
    surface: "#134e4a",
  },
];

const PASSWORD_RULES_TEXT = "Password must be at least 8 characters and include a letter and a number.";

const isValidPassword = (value: string): boolean => {
  if (!value || value.length < 8) return false;
  return /[A-Za-z]/.test(value) && /\d/.test(value);
};

export default function Settings() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const {
    theme,
    setTheme,
    fontSize,
    setFontSize,
    compactMode,
    setCompactMode,
    showCopyConfirmation,
    setShowCopyConfirmation,
    autoExpandSections,
    setAutoExpandSections,
  } = useSettings();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) {
      toast({ title: "Error", description: "Please fill in all password fields", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Error", description: "New passwords do not match", variant: "destructive" });
      return;
    }
    if (!isValidPassword(newPassword)) {
      toast({ title: "Error", description: PASSWORD_RULES_TEXT, variant: "destructive" });
      return;
    }

    setChangingPassword(true);
    try {
      const res = await fetch("/api/auth/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (res.ok) {
        toast({ title: "Success", description: "Password changed successfully" });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        const data = await res.json();
        toast({ title: "Error", description: data.message || "Failed to change password", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to change password", variant: "destructive" });
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div className="page-shell max-w-3xl mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setLocation("/dashboard")}
          data-testid="button-back"
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="h-8 w-8 rounded-lg bg-primary/8 border border-primary/15 flex items-center justify-center shrink-0">
          <SettingsIcon className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Manage security, display preferences, and notifications.</p>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-8 pt-6">
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <SwatchBook className="h-4 w-4 text-primary/70" />
              <h3 className="text-[0.8125rem] font-bold text-foreground tracking-[-0.01em]">Theme</h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Theme selection">
              {themeOptions.map((option) => {
                const isActive = theme === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    onClick={() => setTheme(option.value)}
                    className={cn(
                      "rounded-xl border p-3 text-left transition-all duration-150",
                      isActive
                        ? "border-primary/50 bg-primary/[0.06] ring-1 ring-primary/15"
                        : "border-border/50 bg-muted/20 hover:border-primary/30 hover:bg-muted/35"
                    )}
                    data-testid={`theme-${option.value}`}
                  >
                    <div
                      className="relative h-16 overflow-hidden rounded-lg border"
                      style={{
                        background: `linear-gradient(135deg, ${option.bgStart}, ${option.bgEnd})`,
                        borderColor: isActive ? `${option.accent}80` : `${option.surface}90`,
                      }}
                    >
                      <div className="absolute inset-0 p-2">
                        <div className="h-1.5 w-9 rounded-sm" style={{ backgroundColor: option.accent }} />
                        <div className="mt-2 grid grid-cols-2 gap-1.5">
                          <div className="h-3 rounded-sm opacity-90" style={{ backgroundColor: option.surface }} />
                          <div className="h-3 rounded-sm opacity-75" style={{ backgroundColor: option.surface }} />
                          <div className="h-3 rounded-sm opacity-60" style={{ backgroundColor: option.surface }} />
                          <div className="h-3 rounded-sm opacity-80" style={{ backgroundColor: option.surface }} />
                        </div>
                      </div>
                    </div>
                    <div className="mt-2.5 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold" style={{ color: isActive ? "var(--color-primary)" : "var(--color-foreground)" }}>
                          {option.label}
                        </p>
                        <p className="text-xs text-muted-foreground">{option.description}</p>
                      </div>
                      <span
                        className={cn(
                          "mt-0.5 h-2.5 w-2.5 rounded-full border",
                          isActive ? "bg-primary border-primary" : "bg-transparent border-border"
                        )}
                        aria-hidden="true"
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <Separator />

          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary/70" />
              <h3 className="text-[0.8125rem] font-bold text-foreground tracking-[-0.01em]">Change Password</h3>
            </div>
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                void handleChangePassword();
              }}
            >
              {/* Helps password managers associate password change with the account */}
              <input
                type="text"
                name="username"
                autoComplete="username"
                value={user?.username ?? ""}
                readOnly
                tabIndex={-1}
                aria-hidden="true"
                className="sr-only"
              />
              <Input
                type="password"
                placeholder="Current password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                data-testid="input-current-password"
              />
              <Input
                type="password"
                placeholder="New password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                data-testid="input-new-password"
              />
              <Input
                type="password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                data-testid="input-confirm-password"
              />
              <p className="text-xs text-muted-foreground">{PASSWORD_RULES_TEXT}</p>
              <Button
                type="submit"
                disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
                className="w-full"
                data-testid="button-change-password"
              >
                {changingPassword ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Change Password
              </Button>
            </form>
          </section>

          <Separator />

          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Type className="h-4 w-4 text-primary/70" />
              <h3 className="text-[0.8125rem] font-bold text-foreground tracking-[-0.01em]">Font Size</h3>
            </div>
            <RadioGroup value={fontSize} onValueChange={(v) => setFontSize(v as FontSize)} className="grid gap-3 sm:grid-cols-3">
              {fontSizeOptions.map((option) => (
                <Label
                  key={option.value}
                  htmlFor={`font-${option.value}`}
                  className={cn(
                    "flex items-center justify-center gap-2 p-3 rounded-xl cursor-pointer transition-all duration-150 border",
                    fontSize === option.value
                      ? "border-primary/50 bg-primary/[0.06] text-primary ring-1 ring-primary/15"
                      : "border-border/50 bg-muted/20 hover:bg-muted/35 text-foreground"
                  )}
                  data-testid={`font-${option.value}`}
                >
                  <RadioGroupItem value={option.value} id={`font-${option.value}`} />
                  <span className="font-medium">{option.label}</span>
                </Label>
              ))}
            </RadioGroup>
          </section>

          <Separator />

          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <LayoutIcon className="h-4 w-4 text-primary/70" />
              <h3 className="text-[0.8125rem] font-bold text-foreground tracking-[-0.01em]">Display</h3>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/15 p-3.5">
                <div>
                  <Label htmlFor="compact-mode" className="cursor-pointer text-sm font-medium text-foreground">Compact Mode</Label>
                  <p className="text-xs text-muted-foreground/70">Reduce spacing for more content</p>
                </div>
                <Switch
                  id="compact-mode"
                  checked={compactMode}
                  onCheckedChange={setCompactMode}
                  data-testid="switch-compact-mode"
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/15 p-3.5">
                <div>
                  <Label htmlFor="auto-expand" className="cursor-pointer text-sm font-medium text-foreground">Auto-expand Sections</Label>
                  <p className="text-xs text-muted-foreground/70">Automatically expand menu sections</p>
                </div>
                <Switch
                  id="auto-expand"
                  checked={autoExpandSections}
                  onCheckedChange={setAutoExpandSections}
                  data-testid="switch-auto-expand"
                />
              </div>
            </div>
          </section>

          <Separator />

          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary/70" />
              <h3 className="text-[0.8125rem] font-bold text-foreground tracking-[-0.01em]">Notifications</h3>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/15 p-3.5">
              <div>
                <Label htmlFor="copy-confirmation" className="cursor-pointer text-sm font-medium text-foreground">Copy Confirmations</Label>
                <p className="text-xs text-muted-foreground/70">Show toast when copying to clipboard</p>
              </div>
              <Switch
                id="copy-confirmation"
                checked={showCopyConfirmation}
                onCheckedChange={setShowCopyConfirmation}
                data-testid="switch-copy-confirmation"
              />
            </div>
          </section>

          <Separator />

          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Download className="h-4 w-4 text-primary/70" />
              <h3 className="text-[0.8125rem] font-bold text-foreground tracking-[-0.01em]">Data Export</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Export your data for reporting, backup, or compliance purposes.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Button
                variant="outline"
                className="justify-start h-auto p-4"
                disabled={exporting}
                onClick={async () => {
                  setExporting(true);
                  try {
                    const res = await fetch("/api/audits", { credentials: "include" });
                    if (!res.ok) throw new Error("Failed to fetch audits");
                    const audits = await res.json();
                    const csv = "ID,Type,Date,Status\n" + (audits || []).map((a: any) =>
                      `"${a.id}","${a.auditType || 'EMAR'}","${new Date(a.createdAt).toLocaleDateString('en-GB')}","${a.status || 'completed'}"`
                    ).join("\n");
                    const blob = new Blob([csv], { type: "text/csv" });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = `audits-export-${new Date().toISOString().split("T")[0]}.csv`;
                    link.click();
                    URL.revokeObjectURL(url);
                    toast({ title: "Exported", description: "Audit data exported successfully." });
                  } catch (e: any) {
                    toast({ title: "Error", description: e.message, variant: "destructive" });
                  } finally {
                    setExporting(false);
                  }
                }}
                data-testid="button-export-audits"
              >
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-md bg-primary/8 flex items-center justify-center shrink-0">
                    <FileText className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="text-left">
                    <p className="text-[0.8125rem] font-semibold text-foreground">Export Audits</p>
                    <p className="text-[11px] text-muted-foreground">Download audit history as CSV</p>
                  </div>
                </div>
              </Button>
              <Button
                variant="outline"
                className="justify-start h-auto p-4"
                disabled={exporting}
                onClick={async () => {
                  setExporting(true);
                  try {
                    const res = await fetch("/api/discrepancies", { credentials: "include" });
                    if (!res.ok) throw new Error("Failed to fetch discrepancies");
                    const discs = await res.json();
                    const csv = "ID,Care Worker,Type,Issue,Date\n" + (discs || []).map((d: any) =>
                      `"${d.id}","${d.careWorkerName || ''}","${d.discrepancyType || ''}","${(d.issue || '').replace(/"/g, '""')}","${new Date(d.createdAt).toLocaleDateString('en-GB')}"`
                    ).join("\n");
                    const blob = new Blob([csv], { type: "text/csv" });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = `discrepancies-export-${new Date().toISOString().split("T")[0]}.csv`;
                    link.click();
                    URL.revokeObjectURL(url);
                    toast({ title: "Exported", description: "Discrepancy data exported successfully." });
                  } catch (e: any) {
                    toast({ title: "Error", description: e.message, variant: "destructive" });
                  } finally {
                    setExporting(false);
                  }
                }}
                data-testid="button-export-discrepancies"
              >
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-md bg-destructive/8 flex items-center justify-center shrink-0">
                    <Shield className="h-3.5 w-3.5 text-destructive" />
                  </div>
                  <div className="text-left">
                    <p className="text-[0.8125rem] font-semibold text-foreground">Export Discrepancies</p>
                    <p className="text-[11px] text-muted-foreground">Download compliance issues as CSV</p>
                  </div>
                </div>
              </Button>
            </div>
          </section>

          <Separator />

          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Keyboard className="h-4 w-4 text-primary/70" />
              <h3 className="text-[0.8125rem] font-bold text-foreground tracking-[-0.01em]">Keyboard Shortcuts</h3>
            </div>
            <div className="space-y-2">
              {[
                { keys: ["Ctrl", "K"], description: "Open command palette" },
                { keys: ["Ctrl", "B"], description: "Toggle sidebar" },
                { keys: ["Ctrl", "/"], description: "Open keyboard shortcuts" },
                { keys: ["Esc"], description: "Close dialog / modal" },
              ].map((shortcut, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/15 p-3">
                  <span className="text-sm text-foreground">{shortcut.description}</span>
                  <div className="flex items-center gap-1">
                    {shortcut.keys.map((key, ki) => (
                      <span key={ki}>
                        <kbd className="px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-background border border-border/60 rounded-md text-muted-foreground shadow-xs">{key}</kbd>
                        {ki < shortcut.keys.length - 1 && <span className="text-muted-foreground mx-0.5">+</span>}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <Separator />

          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-primary/70" />
              <h3 className="text-[0.8125rem] font-bold text-foreground tracking-[-0.01em]">Session Information</h3>
            </div>
            <div className="rounded-lg border border-border/40 bg-muted/15 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Logged in as</span>
                <Badge variant="outline" className="font-semibold">{user?.username || "Unknown"}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Role</span>
                <Badge variant="outline" className="font-semibold capitalize">{user?.role || "user"}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Account Type</span>
                <Badge variant="outline" className={cn("font-semibold", user?.isDemo ? "border-amber-500/30 text-amber-600" : "border-success/30 text-success")}>
                  {user?.isDemo ? "Demo" : "Production"}
                </Badge>
              </div>
            </div>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
