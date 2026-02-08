import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ShortcutGroup {
  title: string;
  shortcuts: Array<{ keys: string[]; description: string }>;
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "General",
    shortcuts: [
      { keys: ["Ctrl", "K"], description: "Open command palette" },
      { keys: ["Ctrl", "/"], description: "Toggle Compli-ee assistant" },
      { keys: ["?"], description: "Open command palette" },
    ],
  },
  {
    title: "Navigation (press G, then…)",
    shortcuts: [
      { keys: ["G", "D"], description: "Go to Dashboard" },
      { keys: ["G", "M"], description: "Go to Messages" },
      { keys: ["G", "E"], description: "Go to Email Assistant" },
      { keys: ["G", "C"], description: "Go to Compliance" },
      { keys: ["G", "S"], description: "Go to Settings" },
      { keys: ["G", "U"], description: "Go to Data Upload" },
      { keys: ["G", "P"], description: "Go to Plan Enhancer" },
      { keys: ["G", "R"], description: "Go to Risk Assessment" },
      { keys: ["G", "W"], description: "Go to Care Workers" },
    ],
  },
];

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function KeyboardShortcutsDialog({
  open,
  onOpenChange,
}: KeyboardShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>
            Navigate quickly using keyboard shortcuts. Press keys sequentially for
            two-key combos.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 mt-2 max-h-[60vh] overflow-y-auto pr-1">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                {group.title}
              </h3>
              <div className="space-y-1">
                {group.shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.description}
                    className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-muted/40 transition-colors"
                  >
                    <span className="text-sm text-foreground">
                      {shortcut.description}
                    </span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, i) => (
                        <span key={i}>
                          {i > 0 && (
                            <span className="text-xs text-muted-foreground mx-0.5">
                              +
                            </span>
                          )}
                          <kbd className="inline-flex items-center justify-center rounded border border-border bg-muted/60 px-2 py-0.5 font-mono text-[11px] font-medium text-foreground min-w-[1.75rem] text-center shadow-[0_1px_0_0] shadow-border/50">
                            {key}
                          </kbd>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
