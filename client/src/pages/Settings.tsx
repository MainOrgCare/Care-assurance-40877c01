import { useState } from "react";
import { useLocation } from "wouter";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useSettings, FontSize, AppTheme } from "@/context/SettingsContext";
import { Type, Layout as LayoutIcon, Bell, ArrowLeft, KeyRound, Loader2, SwatchBook } from "lucide-react";
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
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => setLocation("/dashboard")}
          data-testid="button-back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Manage security, display preferences, and notifications.</p>
        </div>
      </div>

      <Card className="glass-card">
        <CardContent className="space-y-6 pt-6">
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <SwatchBook className="h-4 w-4 text-primary" />
              Theme
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
                      "rounded-xl border p-3 text-left transition-all",
                      isActive
                        ? "border-primary/60 bg-primary/10 shadow-[0_10px_20px_-16px_rgba(37,99,235,0.6)]"
                        : "border-border/70 bg-muted/25 hover:border-primary/35 hover:bg-muted/45"
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
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <KeyRound className="h-4 w-4 text-primary" />
              Change Password
            </div>
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                void handleChangePassword();
              }}
            >
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
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Type className="h-4 w-4 text-primary" />
              Font Size
            </div>
            <RadioGroup value={fontSize} onValueChange={(v) => setFontSize(v as FontSize)} className="grid gap-3 sm:grid-cols-3">
              {fontSizeOptions.map((option) => (
                <Label
                  key={option.value}
                  htmlFor={`font-${option.value}`}
                  className={cn(
                    "flex items-center justify-center gap-2 p-3 rounded-xl cursor-pointer transition-all border",
                    fontSize === option.value
                      ? "border-primary/60 bg-primary/10 text-primary"
                      : "border-border/70 bg-muted/35 hover:bg-muted/55 text-foreground"
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
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <LayoutIcon className="h-4 w-4 text-primary" />
              Display
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-xl border border-border/70 bg-muted/35 p-3.5">
                <div>
                  <Label htmlFor="compact-mode" className="cursor-pointer text-foreground">Compact Mode</Label>
                  <p className="text-xs text-muted-foreground">Reduce spacing for more content</p>
                </div>
                <Switch
                  id="compact-mode"
                  checked={compactMode}
                  onCheckedChange={setCompactMode}
                  data-testid="switch-compact-mode"
                />
              </div>

              <div className="flex items-center justify-between rounded-xl border border-border/70 bg-muted/35 p-3.5">
                <div>
                  <Label htmlFor="auto-expand" className="cursor-pointer text-foreground">Auto-expand Sections</Label>
                  <p className="text-xs text-muted-foreground">Automatically expand menu sections</p>
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
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Bell className="h-4 w-4 text-primary" />
              Notifications
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border/70 bg-muted/35 p-3.5">
              <div>
                <Label htmlFor="copy-confirmation" className="cursor-pointer text-foreground">Copy Confirmations</Label>
                <p className="text-xs text-muted-foreground">Show toast when copying to clipboard</p>
              </div>
              <Switch
                id="copy-confirmation"
                checked={showCopyConfirmation}
                onCheckedChange={setShowCopyConfirmation}
                data-testid="switch-copy-confirmation"
              />
            </div>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
