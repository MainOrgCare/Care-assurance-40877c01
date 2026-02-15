import { useEffect, useCallback, useRef } from "react";

export interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  action: () => void;
  description?: string;
}

/**
 * Hook for registering keyboard shortcuts for the rostering studio.
 * Supports modifier keys (Ctrl, Shift, Alt, Meta/Cmd).
 */
export const useRosteringKeyboardShortcuts = (
  shortcuts: KeyboardShortcut[],
  enabled: boolean = true
) => {
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      // Ignore shortcuts when typing in input fields
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      for (const shortcut of shortcutsRef.current) {
        const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase();
        const ctrlMatch = !!shortcut.ctrl === (event.ctrlKey || event.metaKey);
        const shiftMatch = !!shortcut.shift === event.shiftKey;
        const altMatch = !!shortcut.alt === event.altKey;

        if (keyMatch && ctrlMatch && shiftMatch && altMatch) {
          event.preventDefault();
          shortcut.action();
          return;
        }
      }
    },
    [enabled]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
};

/**
 * Build common rostering shortcuts.
 */
export const buildRosteringShortcuts = (handlers: {
  onUndo?: () => void;
  onRedo?: () => void;
  onSelectAll?: () => void;
  onClearSelection?: () => void;
  onToggleSidebar?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onSave?: () => void;
  onOptimize?: () => void;
  onNavigateLeft?: () => void;
  onNavigateRight?: () => void;
  onNavigateUp?: () => void;
  onNavigateDown?: () => void;
}): KeyboardShortcut[] => {
  const shortcuts: KeyboardShortcut[] = [];

  if (handlers.onUndo) {
    shortcuts.push({
      key: "z",
      ctrl: true,
      action: handlers.onUndo,
      description: "Undo last change",
    });
  }

  if (handlers.onRedo) {
    shortcuts.push({
      key: "z",
      ctrl: true,
      shift: true,
      action: handlers.onRedo,
      description: "Redo last change",
    });
    shortcuts.push({
      key: "y",
      ctrl: true,
      action: handlers.onRedo,
      description: "Redo last change",
    });
  }

  if (handlers.onSelectAll) {
    shortcuts.push({
      key: "a",
      ctrl: true,
      action: handlers.onSelectAll,
      description: "Select all entries",
    });
  }

  if (handlers.onClearSelection) {
    shortcuts.push({
      key: "Escape",
      action: handlers.onClearSelection,
      description: "Clear selection",
    });
  }

  if (handlers.onToggleSidebar) {
    shortcuts.push({
      key: "s",
      action: handlers.onToggleSidebar,
      description: "Toggle sidebar",
    });
  }

  if (handlers.onZoomIn) {
    shortcuts.push({
      key: "+",
      action: handlers.onZoomIn,
      description: "Zoom in",
    });
    shortcuts.push({
      key: "=",
      action: handlers.onZoomIn,
      description: "Zoom in",
    });
  }

  if (handlers.onZoomOut) {
    shortcuts.push({
      key: "-",
      action: handlers.onZoomOut,
      description: "Zoom out",
    });
  }

  if (handlers.onSave) {
    shortcuts.push({
      key: "s",
      ctrl: true,
      action: handlers.onSave,
      description: "Save changes",
    });
  }

  if (handlers.onOptimize) {
    shortcuts.push({
      key: "o",
      ctrl: true,
      action: handlers.onOptimize,
      description: "Optimize route",
    });
  }

  if (handlers.onNavigateLeft) {
    shortcuts.push({
      key: "ArrowLeft",
      action: handlers.onNavigateLeft,
      description: "Navigate left",
    });
  }

  if (handlers.onNavigateRight) {
    shortcuts.push({
      key: "ArrowRight",
      action: handlers.onNavigateRight,
      description: "Navigate right",
    });
  }

  if (handlers.onNavigateUp) {
    shortcuts.push({
      key: "ArrowUp",
      action: handlers.onNavigateUp,
      description: "Navigate up",
    });
  }

  if (handlers.onNavigateDown) {
    shortcuts.push({
      key: "ArrowDown",
      action: handlers.onNavigateDown,
      description: "Navigate down",
    });
  }

  return shortcuts;
};

export interface ShortcutHelpProps {
  shortcuts: KeyboardShortcut[];
}

export const formatShortcutKey = (shortcut: KeyboardShortcut): string => {
  const parts: string[] = [];
  if (shortcut.ctrl) parts.push("Ctrl");
  if (shortcut.shift) parts.push("Shift");
  if (shortcut.alt) parts.push("Alt");
  if (shortcut.meta) parts.push("⌘");
  
  let key = shortcut.key;
  if (key === " ") key = "Space";
  if (key.startsWith("Arrow")) key = key.replace("Arrow", "");
  parts.push(key.toUpperCase());
  
  return parts.join("+");
};
