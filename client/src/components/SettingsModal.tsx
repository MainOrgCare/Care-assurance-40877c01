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
      <DialogContent className="sm:max-w-lg" style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0' }}>
        <DialogHeader>
          <DialogTitle className="text-xl" style={{ color: '#0f172a' }}>Settings</DialogTitle>
          <DialogDescription style={{ color: '#64748b' }}>Customize your experience</DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
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
              <Layout size={16} style={{ color: '#3b82f6' }} />
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
      </DialogContent>
    </Dialog>
  );
}
