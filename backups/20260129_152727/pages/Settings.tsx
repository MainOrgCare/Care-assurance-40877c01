import { useState } from "react";
import { useLocation } from "wouter";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSettings, FontSize } from "@/context/SettingsContext";
import { Type, Layout as LayoutIcon, Bell, ArrowLeft, KeyRound, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const fontSizeOptions: { value: FontSize; label: string }[] = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
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
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation("/")}
          data-testid="button-back"
          style={{ color: '#334155' }}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0f172a' }}>Settings</h1>
          <p className="text-sm" style={{ color: '#64748b' }}>Customize your experience</p>
        </div>
      </div>

      <div className="space-y-6 rounded-xl p-6" style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0' }}>
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium" style={{ color: '#0f172a' }}>
            <KeyRound size={16} style={{ color: '#3b82f6' }} />
            Change Password
          </div>
          <div className="space-y-3">
            <Input
              type="password"
              placeholder="Current password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', color: '#0f172a' }}
              data-testid="input-current-password"
            />
            <Input
              type="password"
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', color: '#0f172a' }}
              data-testid="input-new-password"
            />
            <Input
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', color: '#0f172a' }}
              data-testid="input-confirm-password"
            />
            <p className="text-xs" style={{ color: '#64748b' }}>{PASSWORD_RULES_TEXT}</p>
            <Button
              onClick={handleChangePassword}
              disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
              className="w-full text-white"
              style={{ backgroundColor: '#3b82f6' }}
              data-testid="button-change-password"
            >
              {changingPassword ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Change Password
            </Button>
          </div>
        </div>

        <Separator style={{ backgroundColor: '#e2e8f0' }} />

        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium" style={{ color: '#0f172a' }}>
            <Type size={16} style={{ color: '#3b82f6' }} />
            Font Size
          </div>
          <RadioGroup value={fontSize} onValueChange={(v) => setFontSize(v as FontSize)} className="flex gap-3">
            {fontSizeOptions.map((option) => (
              <Label
                key={option.value}
                htmlFor={`font-${option.value}`}
                className="flex-1 flex items-center justify-center gap-2 p-3 rounded-lg cursor-pointer transition-all"
                style={{ 
                  backgroundColor: fontSize === option.value ? 'rgba(59, 130, 246, 0.1)' : '#f8fafc',
                  border: fontSize === option.value ? '1px solid #3b82f6' : '1px solid #e2e8f0'
                }}
                data-testid={`font-${option.value}`}
              >
                <RadioGroupItem value={option.value} id={`font-${option.value}`} />
                <span className="font-medium" style={{ color: '#0f172a' }}>{option.label}</span>
              </Label>
            ))}
          </RadioGroup>
        </div>

        <Separator style={{ backgroundColor: '#e2e8f0' }} />

        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium" style={{ color: '#0f172a' }}>
            <LayoutIcon size={16} style={{ color: '#3b82f6' }} />
            Display
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg" style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <div>
                <Label htmlFor="compact-mode" className="cursor-pointer" style={{ color: '#0f172a' }}>Compact Mode</Label>
                <p className="text-xs" style={{ color: '#64748b' }}>Reduce spacing for more content</p>
              </div>
              <Switch
                id="compact-mode"
                checked={compactMode}
                onCheckedChange={setCompactMode}
                data-testid="switch-compact-mode"
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg" style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <div>
                <Label htmlFor="auto-expand" className="cursor-pointer" style={{ color: '#0f172a' }}>Auto-expand Sections</Label>
                <p className="text-xs" style={{ color: '#64748b' }}>Automatically expand menu sections</p>
              </div>
              <Switch
                id="auto-expand"
                checked={autoExpandSections}
                onCheckedChange={setAutoExpandSections}
                data-testid="switch-auto-expand"
              />
            </div>
          </div>
        </div>

        <Separator style={{ backgroundColor: '#e2e8f0' }} />

        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium" style={{ color: '#0f172a' }}>
            <Bell size={16} style={{ color: '#3b82f6' }} />
            Notifications
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg" style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
            <div>
              <Label htmlFor="copy-confirmation" className="cursor-pointer" style={{ color: '#0f172a' }}>Copy Confirmations</Label>
              <p className="text-xs" style={{ color: '#64748b' }}>Show toast when copying to clipboard</p>
            </div>
            <Switch
              id="copy-confirmation"
              checked={showCopyConfirmation}
              onCheckedChange={setShowCopyConfirmation}
              data-testid="switch-copy-confirmation"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
