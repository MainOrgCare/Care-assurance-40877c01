import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { useSettings, FontSize, AppTheme } from "@/context/SettingsContext";
import { Type, Layout, Bell, Palette, Sparkles, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const fontSizeOptions: { value: FontSize; label: string; px: string }[] = [
  { value: "small", label: "Small", px: "12px" },
  { value: "medium", label: "Medium", px: "14px" },
  { value: "large", label: "Large", px: "16px" },
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
    theme,
    setTheme,
    dyslexiaFriendly,
    setDyslexiaFriendly,
  } = useSettings();

  const handleOpenChange = (newOpen: boolean) => {
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl bg-card border-border shadow-[0_24px_50px_rgba(0,0,0,0.12)] p-0 gap-0 overflow-hidden rounded-2xl">
        <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-8 py-6 border-b border-border/50">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 shadow-sm">
                <motion.div animate={{ rotate: [0, 15, -10, 0], scale: [1, 1.1, 1] }} transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}><Sparkles size={20} className="text-primary drop-shadow-[0_0_8px_rgba(var(--color-primary),0.5)]" /></motion.div>
              </div>
              <div>
                <DialogTitle className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
                  Preferences
                </DialogTitle>
                <DialogDescription className="text-muted-foreground mt-0.5">
                  Customize the Care Assurance workspace to fit your workflow.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>
        
        <div className="px-8 py-6 space-y-8 max-h-[60vh] overflow-y-auto custom-scrollbar">
          
          {/* Theme Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2.5 text-sm font-bold text-foreground uppercase tracking-wider">
              <Palette size={16} className="text-primary" />
              Appearance
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { id: "light", label: "Light", icon: "☀️", color: "bg-card border-border" },
                { id: "sunrise", label: "Sunrise", icon: "🌅", color: "bg-amber-100 border-amber-300" },
                { id: "dark", label: "Dark", icon: "🌙", color: "bg-foreground border-foreground/80" },
                { id: "midnight", label: "Midnight", icon: "🌌", color: "bg-primary border-primary/80" },
                { id: "ocean", label: "Ocean", icon: "🌊", color: "bg-secondary border-secondary/80" },
                { id: "aurora", label: "Aurora", icon: "🌲", color: "bg-emerald-900 border-emerald-600" },
              ].map((t: { id: AppTheme; label: string; icon: string; color: string }) => (
                <motion.div
                  key={t.id}
                  whileHover={{ y: -2, scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setTheme(t.id)}
                  className={cn(
                    "relative cursor-pointer flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all duration-200",
                    theme === t.id 
                      ? "border-primary bg-primary/5 shadow-md" 
                      : "border-border bg-muted/30 hover:bg-muted/60 hover:border-primary/40"
                  )}
                >
                  {theme === t.id && (
                    <motion.div 
                      layoutId="activeTheme"
                      className="absolute -top-2 -right-2 h-5 w-5 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-sm"
                    >
                      <CheckCircle2 size={12} fill="currentColor" stroke="none" />
                    </motion.div>
                  )}
                  <div className={cn("h-10 w-10 rounded-full border shadow-sm flex items-center justify-center text-lg", t.color)}>
                    {t.icon}
                  </div>
                  <span className={cn(
                    "text-xs font-semibold", 
                    theme === t.id ? "text-primary" : "text-muted-foreground"
                  )}>
                    {t.label}
                  </span>
                </motion.div>
              ))}
            </div>
          </div>

          <Separator className="bg-border/60" />

          {/* Typography Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2.5 text-sm font-bold text-foreground uppercase tracking-wider">
              <Type size={16} className="text-primary" />
              Typography
            </div>
            <RadioGroup value={fontSize} onValueChange={(v) => setFontSize(v as FontSize)} className="grid grid-cols-3 gap-3">
              {fontSizeOptions.map((option) => (
                <Label
                  key={option.value}
                  htmlFor={`font-${option.value}`}
                  className={cn(
                    "relative flex flex-col items-center gap-2 p-4 rounded-xl cursor-pointer transition-all duration-200 border-2",
                    fontSize === option.value
                      ? "bg-primary/5 border-primary shadow-sm"
                      : "bg-muted/30 border-border hover:bg-muted/60 hover:border-primary/40"
                  )}
                >
                  <RadioGroupItem value={option.value} id={`font-${option.value}`} className="sr-only" />
                  <span className="text-2xl font-serif text-foreground/80">Aa</span>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "font-semibold",
                      fontSize === option.value ? "text-primary" : "text-foreground"
                    )}>{option.label}</span>
                    <span className="text-[10px] text-muted-foreground font-mono bg-background px-1.5 py-0.5 rounded border">
                      {option.px}
                    </span>
                  </div>
                </Label>
              ))}
            </RadioGroup>
            <motion.div
              whileHover={{ scale: 1.01 }}
              className="flex items-start justify-between rounded-xl bg-card border border-border shadow-sm p-4"
            >
              <div className="pr-4">
                <Label htmlFor="modal-dyslexia-friendly" className="cursor-pointer text-sm font-semibold text-foreground">Dyslexia-Friendly Text</Label>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">Applies a calmer readable font stack, wider spacing, and cleaner backgrounds across every theme.</p>
              </div>
              <Switch
                id="modal-dyslexia-friendly"
                checked={dyslexiaFriendly}
                onCheckedChange={setDyslexiaFriendly}
              />
            </motion.div>
          </div>

          <Separator className="bg-border/60" />

          {/* Interface & Behavior */}
          <div className="space-y-4">
            <div className="flex items-center gap-2.5 text-sm font-bold text-foreground uppercase tracking-wider">
              <Layout size={16} className="text-primary" />
              Interface & Behavior
            </div>
            
            <div className="grid sm:grid-cols-2 gap-4">
              <motion.div 
                whileHover={{ scale: 1.01 }}
                className="flex items-start justify-between p-4 rounded-xl bg-card border border-border shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="pr-4">
                  <Label htmlFor="compact-mode" className="cursor-pointer text-sm font-semibold text-foreground">Compact Mode</Label>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">Condense padding and margins to fit more information on screen.</p>
                </div>
                <Switch id="compact-mode" checked={compactMode} onCheckedChange={setCompactMode} />
              </motion.div>
              
              <motion.div 
                whileHover={{ scale: 1.01 }}
                className="flex items-start justify-between p-4 rounded-xl bg-card border border-border shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="pr-4">
                  <Label htmlFor="auto-expand" className="cursor-pointer text-sm font-semibold text-foreground">Auto-expand Menus</Label>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">Automatically open sidebar sections when navigating.</p>
                </div>
                <Switch id="auto-expand" checked={autoExpandSections} onCheckedChange={setAutoExpandSections} />
              </motion.div>

              <motion.div 
                whileHover={{ scale: 1.01 }}
                className="flex items-start justify-between p-4 rounded-xl bg-card border border-border shadow-sm hover:shadow-md transition-shadow sm:col-span-2"
              >
                <div className="pr-4 flex gap-3">
                  <div className="mt-0.5">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Bell size={16} className="text-primary" />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="copy-confirmation" className="cursor-pointer text-sm font-semibold text-foreground">Copy Confirmations</Label>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed max-w-lg">Show a brief notification toast at the bottom of the screen whenever you copy text or plans to your clipboard.</p>
                  </div>
                </div>
                <div className="mt-1">
                  <Switch id="copy-confirmation" checked={showCopyConfirmation} onCheckedChange={setShowCopyConfirmation} />
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
