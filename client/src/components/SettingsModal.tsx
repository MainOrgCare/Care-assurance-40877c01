import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { useSettings, FontSize } from "@/context/SettingsContext";
import { Type, Layout, Bell } from "lucide-react";

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const fontSizeOptions: { value: FontSize; label: string }[] = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
];

export default function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-background border border-border">
        <DialogHeader>
          <DialogTitle className="text-xl text-foreground">Settings</DialogTitle>
          <DialogDescription className="text-muted-foreground">Customize your experience</DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
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
                  className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg cursor-pointer transition-all ${
                    fontSize === option.value
                      ? 'bg-primary/10 border border-primary'
                      : 'bg-muted/50 border border-border'
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
              
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
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
          </div>

          <Separator className="bg-border" />

          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Bell size={16} className="text-primary" />
              Notifications
            </div>
            
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
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
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
