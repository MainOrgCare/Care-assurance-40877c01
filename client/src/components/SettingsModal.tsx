import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { useSettings, Theme, FontSize } from "@/context/SettingsContext";
import { Palette, Type, Layout, Bell, ChevronRight } from "lucide-react";

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const themeOptions: { value: Theme; label: string; description: string; colors: string[] }[] = [
  { value: "dark", label: "Dark", description: "Default dark theme", colors: ["#0f172a", "#1e293b", "#0ea5e9"] },
  { value: "midnight", label: "Midnight", description: "Deep purple tones", colors: ["#0c0a1d", "#1a1730", "#8b5cf6"] },
  { value: "ocean", label: "Ocean", description: "Blue-green palette", colors: ["#0a1929", "#132f4c", "#14b8a6"] },
];

const fontSizeOptions: { value: FontSize; label: string }[] = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
];

export default function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-xl">Settings</DialogTitle>
          <DialogDescription>Customize your experience</DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Palette size={16} className="text-primary" />
              Theme
            </div>
            <RadioGroup value={theme} onValueChange={(v) => setTheme(v as Theme)} className="grid grid-cols-2 gap-3">
              {themeOptions.map((option) => (
                <Label
                  key={option.value}
                  htmlFor={option.value}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                    theme === option.value 
                      ? "border-primary bg-primary/10" 
                      : "border-border hover:border-primary/50 bg-muted/50"
                  }`}
                  data-testid={`theme-${option.value}`}
                >
                  <RadioGroupItem value={option.value} id={option.value} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{option.label}</span>
                      <div className="flex gap-1">
                        {option.colors.map((color, i) => (
                          <div 
                            key={i} 
                            className="w-3 h-3 rounded-full border border-border" 
                            style={{ backgroundColor: color }} 
                          />
                        ))}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">{option.description}</span>
                  </div>
                </Label>
              ))}
            </RadioGroup>
          </div>

          <Separator className="bg-border" />

          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Type size={16} className="text-primary" />
              Font Size
            </div>
            <RadioGroup value={fontSize} onValueChange={(v) => setFontSize(v as FontSize)} className="flex gap-3">
              {fontSizeOptions.map((option) => (
                <Label
                  key={option.value}
                  htmlFor={`font-${option.value}`}
                  className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border cursor-pointer transition-all ${
                    fontSize === option.value 
                      ? "border-primary bg-primary/10" 
                      : "border-border hover:border-primary/50 bg-muted/50"
                  }`}
                  data-testid={`font-${option.value}`}
                >
                  <RadioGroupItem value={option.value} id={`font-${option.value}`} />
                  <span className="font-medium text-foreground">{option.label}</span>
                </Label>
              ))}
            </RadioGroup>
          </div>

          <Separator className="bg-border" />

          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Layout size={16} className="text-primary" />
              Display
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
                <div>
                  <Label htmlFor="compact-mode" className="text-foreground cursor-pointer">Compact Mode</Label>
                  <p className="text-xs text-muted-foreground">Reduce spacing for more content</p>
                </div>
                <Switch 
                  id="compact-mode" 
                  checked={compactMode} 
                  onCheckedChange={setCompactMode}
                  data-testid="switch-compact-mode"
                />
              </div>
              
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
                <div>
                  <Label htmlFor="auto-expand" className="text-foreground cursor-pointer">Auto-expand Sections</Label>
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
          </div>

          <Separator className="bg-border" />

          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Bell size={16} className="text-primary" />
              Notifications
            </div>
            
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
              <div>
                <Label htmlFor="copy-confirmation" className="text-foreground cursor-pointer">Copy Confirmations</Label>
                <p className="text-xs text-muted-foreground">Show toast when copying to clipboard</p>
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
      </DialogContent>
    </Dialog>
  );
}
