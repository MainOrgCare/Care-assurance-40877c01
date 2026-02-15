import { createContext, useContext, useState, useEffect, ReactNode, useMemo, useCallback } from "react";

export type FontSize = "small" | "medium" | "large";
export type AppTheme = "light" | "dark" | "midnight" | "ocean";

const THEME_CLASSES = ["theme-light", "theme-dark", "theme-midnight", "theme-ocean"];
const THEME_TRANSITION_CLASS = "theme-transitioning";

function isAppTheme(value: string | null): value is AppTheme {
  return value === "light" || value === "dark" || value === "midnight" || value === "ocean";
}

function applyThemeToDom(theme: AppTheme): void {
  if (typeof document === "undefined") return;

  const themeClass = `theme-${theme}`;
  const isDarkTheme = theme !== "light";
  const root = document.documentElement;
  const body = document.body;

  root.classList.remove(...THEME_CLASSES, "dark");
  root.classList.add(themeClass);
  root.setAttribute("data-theme", theme);
  root.style.colorScheme = isDarkTheme ? "dark" : "light";

  if (body) {
    body.classList.remove(...THEME_CLASSES, "dark");
    body.classList.add(themeClass);
    body.setAttribute("data-theme", theme);
    body.style.colorScheme = isDarkTheme ? "dark" : "light";
  }
}

function animateThemeSwap(): void {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  const body = document.body;
  root.classList.add(THEME_TRANSITION_CLASS);
  body?.classList.add(THEME_TRANSITION_CLASS);

  window.setTimeout(() => {
    root.classList.remove(THEME_TRANSITION_CLASS);
    body?.classList.remove(THEME_TRANSITION_CLASS);
  }, 220);
}

interface SettingsContextType {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
  fontSize: FontSize;
  setFontSize: (size: FontSize) => void;
  compactMode: boolean;
  setCompactMode: (compact: boolean) => void;
  showCopyConfirmation: boolean;
  setShowCopyConfirmation: (show: boolean) => void;
  autoExpandSections: boolean;
  setAutoExpandSections: (expand: boolean) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

function getStorageItem(key: string): string | null {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return null;
  }
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setStorageItem(key: string, value: string): void {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return;
  }
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage not available
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<AppTheme>(() => {
    const saved = getStorageItem("lewis-theme");
    if (isAppTheme(saved)) return saved;
    return "light";
  });

  const [fontSize, setFontSizeState] = useState<FontSize>(() => {
    const saved = getStorageItem("lewis-font-size");
    return (saved as FontSize) || "medium";
  });
  
  const [compactMode, setCompactModeState] = useState(() => {
    const saved = getStorageItem("lewis-compact-mode");
    return saved === "true";
  });
  
  const [showCopyConfirmation, setShowCopyConfirmationState] = useState(() => {
    const saved = getStorageItem("lewis-copy-confirmation");
    return saved !== "false";
  });
  
  const [autoExpandSections, setAutoExpandSectionsState] = useState(() => {
    const saved = getStorageItem("lewis-auto-expand");
    return saved !== "false";
  });

  const setAutoExpandSections = useCallback((expand: boolean) => {
    setAutoExpandSectionsState(expand);
    setStorageItem("lewis-auto-expand", String(expand));
  }, []);

  const setTheme = useCallback((nextTheme: AppTheme) => {
    if (nextTheme === theme) return;
    animateThemeSwap();
    applyThemeToDom(nextTheme);
    setThemeState(nextTheme);
    setStorageItem("lewis-theme", nextTheme);
  }, [theme]);

  const setFontSize = useCallback((size: FontSize) => {
    setFontSizeState(size);
    setStorageItem("lewis-font-size", size);
  }, []);

  const setCompactMode = useCallback((compact: boolean) => {
    setCompactModeState(compact);
    setStorageItem("lewis-compact-mode", String(compact));
  }, []);

  const setShowCopyConfirmation = useCallback((show: boolean) => {
    setShowCopyConfirmationState(show);
    setStorageItem("lewis-copy-confirmation", String(show));
  }, []);

  useEffect(() => {
    applyThemeToDom(theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.classList.remove("font-small", "font-medium", "font-large");
    document.documentElement.classList.add(`font-${fontSize}`);
  }, [fontSize]);

  useEffect(() => {
    if (compactMode) {
      document.documentElement.classList.add("compact-mode");
    } else {
      document.documentElement.classList.remove("compact-mode");
    }
  }, [compactMode]);

  const contextValue = useMemo(() => ({
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
  }), [theme, setTheme, fontSize, setFontSize, compactMode, setCompactMode, showCopyConfirmation, setShowCopyConfirmation, autoExpandSections, setAutoExpandSections]);

  return (
    <SettingsContext.Provider value={contextValue}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
}
