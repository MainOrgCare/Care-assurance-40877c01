import { useEffect, useState } from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { validatePassword, MIN_PASSWORD_LENGTH } from "@/lib/validation";
import { apiRequest, normalizeApiPayload } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useSettings, FontSize } from "@/context/SettingsContext";
import { THEME_CATALOG } from "@/config/themeCatalog";
import { useAuth } from "@/context/AuthContext";
import { Type, Layout as LayoutIcon, Bell, ArrowLeft, KeyRound, Loader2, SwatchBook, Download, Keyboard, Database, FileText, Shield, Settings as SettingsIcon, Eye, Info, ShieldCheck, ClipboardCopy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const fontSizeOptions: { value: FontSize; label: string }[] = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
];

const PASSWORD_RULES_TEXT = `Password must be at least ${MIN_PASSWORD_LENGTH} characters and include an uppercase letter, lowercase letter, number, and special character.`;

export default function Settings() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, refetchUser } = useAuth();
  usePageTitle("Settings");
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
    reduceMotion,
    setReduceMotion,
    highContrast,
    setHighContrast,
    dyslexiaFriendly,
    setDyslexiaFriendly,
  } = useSettings();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(Boolean(user?.twoFactorEnabled));
  const [twoFactorLoading, setTwoFactorLoading] = useState(false);
  const [twoFactorHasPendingSetup, setTwoFactorHasPendingSetup] = useState(false);
  const [twoFactorSetupSecret, setTwoFactorSetupSecret] = useState("");
  const [twoFactorSetupUri, setTwoFactorSetupUri] = useState("");
  const [twoFactorSetupCode, setTwoFactorSetupCode] = useState("");
  const [twoFactorDisablePassword, setTwoFactorDisablePassword] = useState("");
  const [twoFactorDisableCode, setTwoFactorDisableCode] = useState("");
  const [exporting, setExporting] = useState(false);
  const workspaceProfile = compactMode ? "Compact" : "Comfortable";
  const readingMode = dyslexiaFriendly ? "Dyslexia-friendly" : "Standard";
  const securityStatus = user?.isDemo ? "Demo access" : twoFactorEnabled ? "Protected + 2FA" : "Protected";

  useEffect(() => {
    setTwoFactorEnabled(Boolean(user?.twoFactorEnabled));
  }, [user?.twoFactorEnabled]);

  useEffect(() => {
    if (!user || user.isDemo) {
      return;
    }

    let cancelled = false;

    const loadTwoFactorStatus = async () => {
      try {
        const response = await apiRequest("GET", "/api/auth/2fa/status");
        const payload = await response.json();
        const data = normalizeApiPayload<{ enabled: boolean; hasPendingSetup?: boolean }>(payload);
        if (cancelled) {
          return;
        }
        setTwoFactorEnabled(Boolean(data.enabled));
        setTwoFactorHasPendingSetup(Boolean(data.hasPendingSetup));
      } catch {
        if (!cancelled) {
          setTwoFactorHasPendingSetup(false);
        }
      }
    };

    void loadTwoFactorStatus();

    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.isDemo]);

  const readApiErrorMessage = (error: any, fallback: string) => {
    try {
      if (error?.body) {
        const parsed = JSON.parse(error.body);
        if (typeof parsed?.message === "string" && parsed.message.length > 0) {
          return parsed.message;
        }
      }
    } catch {
      // Ignore parse errors and use fallback.
    }
    return fallback;
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) {
      toast({ title: "Error", description: "Please fill in all password fields", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Error", description: "New passwords do not match", variant: "destructive" });
      return;
    }
    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      toast({ title: "Error", description: passwordError, variant: "destructive" });
      return;
    }

    setChangingPassword(true);
    try {
      await apiRequest("PATCH", "/api/auth/password", { currentPassword, newPassword });
      toast({ title: "Success", description: "Password changed successfully" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      let message = "Failed to change password";
      try {
        message = err?.body ? JSON.parse(err.body)?.message || message : message;
      } catch { /* body isn't valid JSON */ }
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setChangingPassword(false);
    }
  };

  const handleStartTwoFactorSetup = async () => {
    setTwoFactorLoading(true);
    try {
      const response = await apiRequest("POST", "/api/auth/2fa/setup", {});
      const payload = await response.json();
      const data = normalizeApiPayload<{ secret: string; otpauthUri: string }>(payload);

      setTwoFactorSetupSecret(data.secret);
      setTwoFactorSetupUri(data.otpauthUri);
      setTwoFactorSetupCode("");
      setTwoFactorHasPendingSetup(true);

      toast({
        title: "2FA Setup Started",
        description: "Add the key to your authenticator app, then enter the 6-digit code to enable.",
      });
    } catch (error: any) {
      toast({
        title: "Unable to Start 2FA",
        description: readApiErrorMessage(error, "Could not start two-factor setup."),
        variant: "destructive",
      });
    } finally {
      setTwoFactorLoading(false);
    }
  };

  const handleEnableTwoFactor = async () => {
    if (twoFactorSetupCode.replace(/\D/g, "").length !== 6) {
      toast({
        title: "Invalid Code",
        description: "Enter a valid 6-digit verification code.",
        variant: "destructive",
      });
      return;
    }

    setTwoFactorLoading(true);
    try {
      await apiRequest("POST", "/api/auth/2fa/enable", { code: twoFactorSetupCode });
      await refetchUser();

      setTwoFactorEnabled(true);
      setTwoFactorHasPendingSetup(false);
      setTwoFactorSetupSecret("");
      setTwoFactorSetupUri("");
      setTwoFactorSetupCode("");

      toast({
        title: "2FA Enabled",
        description: "Two-factor authentication is now active on your account.",
      });
    } catch (error: any) {
      toast({
        title: "Unable to Enable 2FA",
        description: readApiErrorMessage(error, "Could not verify the code."),
        variant: "destructive",
      });
    } finally {
      setTwoFactorLoading(false);
    }
  };

  const handleDisableTwoFactor = async () => {
    if (!twoFactorDisablePassword || twoFactorDisableCode.replace(/\D/g, "").length !== 6) {
      toast({
        title: "Missing Verification",
        description: "Enter your current password and a valid 6-digit code.",
        variant: "destructive",
      });
      return;
    }

    setTwoFactorLoading(true);
    try {
      await apiRequest("POST", "/api/auth/2fa/disable", {
        password: twoFactorDisablePassword,
        code: twoFactorDisableCode,
      });
      await refetchUser();

      setTwoFactorEnabled(false);
      setTwoFactorHasPendingSetup(false);
      setTwoFactorDisablePassword("");
      setTwoFactorDisableCode("");

      toast({
        title: "2FA Disabled",
        description: "Two-factor authentication has been removed from your account.",
      });
    } catch (error: any) {
      toast({
        title: "Unable to Disable 2FA",
        description: readApiErrorMessage(error, "Could not disable two-factor authentication."),
        variant: "destructive",
      });
    } finally {
      setTwoFactorLoading(false);
    }
  };

  const copyTwoFactorValue = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({
        title: "Copied",
        description: `${label} copied to clipboard.`,
      });
    } catch {
      toast({
        title: "Copy Failed",
        description: `Could not copy ${label.toLowerCase()}.`,
        variant: "destructive",
      });
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="page-shell page-shell-compact max-w-4xl mx-auto">
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
        <div className="h-9 w-9 rounded-lg bg-primary/10 border border-primary/12 flex items-center justify-center shrink-0 shadow-[var(--shadow-xs)]">
          <SettingsIcon className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle max-w-md">Manage security, display preferences, and notifications.</p>
        </div>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Card className="app-surface border-border/60">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/80">Workspace profile</p>
                <p className="mt-2 text-lg font-semibold text-foreground">{theme.charAt(0).toUpperCase() + theme.slice(1)} theme</p>
                <p className="mt-1 text-xs text-muted-foreground">Font size {fontSize} • {workspaceProfile} layout • {readingMode} text</p>
              </div>
              <div className="h-10 w-10 rounded-xl border border-primary/15 bg-primary/10 flex items-center justify-center text-primary">
                <SwatchBook className="h-4 w-4" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="app-surface border-border/60">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/80">Security posture</p>
                <p className="mt-2 text-lg font-semibold text-foreground">{securityStatus}</p>
                <p className="mt-1 text-xs text-muted-foreground">Password policy is enforced for {user?.username || "your"} account.</p>
              </div>
              <div className={cn("h-10 w-10 rounded-xl border flex items-center justify-center", user?.isDemo ? "border-warning/20 bg-warning/10 text-warning" : "border-success/20 bg-success/10 text-success")}>
                <Shield className="h-4 w-4" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="app-surface border-border/60">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/80">Productivity</p>
                <p className="mt-2 text-lg font-semibold text-foreground">{autoExpandSections ? "Guided navigation" : "Manual navigation"}</p>
                <p className="mt-1 text-xs text-muted-foreground">Copy confirmations {showCopyConfirmation ? "enabled" : "muted"} for faster day-to-day use.</p>
              </div>
              <div className="h-10 w-10 rounded-xl border border-secondary/20 bg-secondary/10 flex items-center justify-center text-secondary">
                <LayoutIcon className="h-4 w-4" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="app-surface">
        <CardContent className="space-y-8 pt-6">
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <SwatchBook className="h-4 w-4 text-primary/70" />
              <h3 className="text-[0.8125rem] font-bold text-foreground tracking-[-0.01em]">Theme</h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Theme selection">
              {THEME_CATALOG.map((option) => {
                const isActive = theme === option.value;
                return (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    onClick={() => setTheme(option.value)}
                    className={cn(
                      "rounded-xl border p-3 text-left transition-all duration-150",
                      isActive
                        ? "border-primary/50 bg-primary/[0.06] ring-2 ring-primary/20"
                        : "border-border/50 bg-muted/20 hover:border-primary/30 hover:bg-muted/35"
                    )}
                    data-testid={`theme-${option.value}`}
                  >
                    <div
                      className="relative h-16 overflow-hidden rounded-lg border"
                      style={{
                        background: `linear-gradient(135deg, ${option.preview.bgStart}, ${option.preview.bgEnd})`,
                        borderColor: isActive ? option.preview.accent : option.preview.border,
                      }}
                    >
                      <div className="absolute inset-0 p-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="h-1.5 w-9 rounded-sm" style={{ backgroundColor: option.preview.accent }} />
                          <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: option.preview.accentAlt }} />
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-1.5">
                          <div className="h-3 rounded-sm opacity-95" style={{ backgroundColor: option.preview.surface }} />
                          <div className="h-3 rounded-sm opacity-85" style={{ backgroundColor: option.preview.surfaceAlt }} />
                          <div className="h-3 rounded-sm opacity-70" style={{ backgroundColor: option.preview.surfaceAlt }} />
                          <div className="h-3 rounded-sm opacity-80" style={{ backgroundColor: option.preview.surface }} />
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
                  </motion.button>
                );
              })}
            </div>
            <div className="flex items-start gap-2 rounded-lg border border-border/40 bg-muted/15 p-3 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70" />
              <span>All theme palettes keep their colors, while high contrast and dyslexia-friendly text can be layered on top for readability.</span>
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
                aria-label="Current password"
                data-testid="input-current-password"
              />
              <Input
                type="password"
                placeholder="New password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                aria-label="New password"
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
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary/70" />
                <h3 className="text-[0.8125rem] font-bold text-foreground tracking-[-0.01em]">Two-Factor Authentication</h3>
              </div>
              <Badge variant={twoFactorEnabled ? "default" : "secondary"}>
                {twoFactorEnabled ? "Enabled" : "Disabled"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Add an authenticator app step to protect your account if your password is compromised.
            </p>

            {user?.isDemo ? (
              <div className="rounded-xl border border-border/50 bg-muted/20 p-3 text-xs text-muted-foreground">
                Two-factor authentication is unavailable in demo mode.
              </div>
            ) : twoFactorEnabled ? (
              <div className="space-y-3 rounded-xl border border-border/50 bg-muted/10 p-4">
                <p className="text-xs text-muted-foreground">
                  Two-factor authentication is active. To disable it, confirm with your current password and authenticator code.
                </p>
                <Input
                  type="password"
                  placeholder="Current password"
                  value={twoFactorDisablePassword}
                  onChange={(e) => setTwoFactorDisablePassword(e.target.value)}
                  autoComplete="current-password"
                />
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Current authenticator code</Label>
                  <div className="flex justify-center sm:justify-start py-1">
                    <InputOTP
                      maxLength={6}
                      value={twoFactorDisableCode}
                      onChange={setTwoFactorDisableCode}
                    >
                      <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                        <InputOTPSlot index={3} />
                        <InputOTPSlot index={4} />
                        <InputOTPSlot index={5} />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={twoFactorLoading || !twoFactorDisablePassword || twoFactorDisableCode.length !== 6}
                  onClick={handleDisableTwoFactor}
                >
                  {twoFactorLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Disable 2FA
                </Button>
              </div>
            ) : (
              <div className="space-y-3 rounded-xl border border-border/50 bg-muted/10 p-4">
                {!twoFactorSetupSecret ? (
                  <>
                    <p className="text-xs text-muted-foreground">
                      {twoFactorHasPendingSetup
                        ? "A previous setup is still pending. Restart setup to generate a fresh authenticator key."
                        : "Start setup to generate your authenticator key, then verify with a one-time code."}
                    </p>
                    <Button
                      type="button"
                      className="w-full"
                      disabled={twoFactorLoading}
                      onClick={handleStartTwoFactorSetup}
                    >
                      {twoFactorLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      {twoFactorHasPendingSetup ? "Restart 2FA Setup" : "Start 2FA Setup"}
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Authenticator key</Label>
                      <div className="flex gap-2">
                        <Input value={twoFactorSetupSecret} readOnly className="font-mono text-xs" />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void copyTwoFactorValue(twoFactorSetupSecret, "Authenticator key")}
                        >
                          <ClipboardCopy className="mr-2 h-4 w-4" />
                          Copy
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Provisioning URI (optional)</Label>
                      <div className="flex gap-2">
                        <Input value={twoFactorSetupUri} readOnly className="text-xs" />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void copyTwoFactorValue(twoFactorSetupUri, "Provisioning URI")}
                        >
                          <ClipboardCopy className="mr-2 h-4 w-4" />
                          Copy
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Verification code</Label>
                      <div className="flex justify-center sm:justify-start py-1">
                        <InputOTP
                          maxLength={6}
                          value={twoFactorSetupCode}
                          onChange={setTwoFactorSetupCode}
                        >
                          <InputOTPGroup>
                            <InputOTPSlot index={0} />
                            <InputOTPSlot index={1} />
                            <InputOTPSlot index={2} />
                            <InputOTPSlot index={3} />
                            <InputOTPSlot index={4} />
                            <InputOTPSlot index={5} />
                          </InputOTPGroup>
                        </InputOTP>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button
                        type="button"
                        className="w-full"
                        disabled={twoFactorLoading || twoFactorSetupCode.length !== 6}
                        onClick={handleEnableTwoFactor}
                      >
                        {twoFactorLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Enable 2FA
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        disabled={twoFactorLoading}
                        onClick={() => {
                          setTwoFactorSetupSecret("");
                          setTwoFactorSetupUri("");
                          setTwoFactorSetupCode("");
                          setTwoFactorHasPendingSetup(false);
                        }}
                      >
                        Cancel Setup
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
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
              <Eye className="h-4 w-4 text-primary/70" />
              <h3 className="text-[0.8125rem] font-bold text-foreground tracking-[-0.01em]">Accessibility</h3>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/15 p-3.5">
                <div>
                  <Label htmlFor="dyslexia-friendly" className="cursor-pointer text-sm font-medium text-foreground">Dyslexia-Friendly Text</Label>
                  <p className="text-xs text-muted-foreground/70">Use a calmer sans-serif stack, wider spacing, flatter backgrounds, and left-aligned copy across every theme.</p>
                </div>
                <Switch
                  id="dyslexia-friendly"
                  checked={dyslexiaFriendly}
                  onCheckedChange={setDyslexiaFriendly}
                  data-testid="switch-dyslexia-friendly"
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/15 p-3.5">
                <div>
                  <Label htmlFor="reduced-motion" className="cursor-pointer text-sm font-medium text-foreground">Reduce Motion</Label>
                  <p className="text-xs text-muted-foreground/70">Disable animations and transitions</p>
                </div>
                <Switch
                  id="reduced-motion"
                  checked={reduceMotion}
                  onCheckedChange={setReduceMotion}
                  data-testid="switch-reduced-motion"
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/15 p-3.5">
                <div>
                  <Label htmlFor="high-contrast" className="cursor-pointer text-sm font-medium text-foreground">High Contrast Text</Label>
                  <p className="text-xs text-muted-foreground/70">Increase text contrast for readability</p>
                </div>
                <Switch
                  id="high-contrast"
                  checked={highContrast}
                  onCheckedChange={setHighContrast}
                  data-testid="switch-high-contrast"
                />
              </div>
            </div>
          </section>

          <Separator />

          {user?.role === "admin" && (
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
          )}

          <Separator />

          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Keyboard className="h-4 w-4 text-primary/70" />
              <h3 className="text-[0.8125rem] font-bold text-foreground tracking-[-0.01em]">Keyboard Shortcuts</h3>
            </div>
            <div className="space-y-2">
              {[
                { keys: ["Ctrl/Cmd", "K"], description: "Open command palette" },
                { keys: ["Ctrl/Cmd", "B"], description: "Toggle sidebar" },
                { keys: ["Ctrl/Cmd", "/"], description: "Toggle Compli-ee assistant" },
                { keys: ["?"], description: "Open keyboard shortcuts" },
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
                <Badge variant="outline" className={cn("font-semibold", user?.isDemo ? "border-warning/30 text-warning" : "border-success/30 text-success")}>
                  {user?.isDemo ? "Demo" : "Production"}
                </Badge>
              </div>
            </div>
          </section>

          <Separator />

          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-primary/70" />
              <h3 className="text-[0.8125rem] font-bold text-foreground tracking-[-0.01em]">About CareAssurance</h3>
            </div>
            <div className="rounded-lg border border-border/40 bg-muted/15 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Application</span>
                <Badge variant="outline" className="font-semibold">CareAssurance Platform</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Environment</span>
                <Badge variant="outline" className={cn("font-semibold", user?.isDemo ? "border-warning/30 text-warning" : "border-success/30 text-success")}>
                  {user?.isDemo ? "Demo" : "Production"}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Support</span>
                <span className="text-xs text-muted-foreground">admin@careassurance.uk</span>
              </div>
            </div>
          </section>
        </CardContent>
      </Card>
    </motion.div>
  );
}
