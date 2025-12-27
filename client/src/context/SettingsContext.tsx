import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type Theme = "dark" | "midnight" | "ocean";
export type FontSize = "small" | "medium" | "large";

interface SettingsContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
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
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = getStorageItem("lewis-theme");
    return (saved as Theme) || "dark";
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

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    setStorageItem("lewis-theme", newTheme);
  };

  const setFontSize = (size: FontSize) => {
    setFontSizeState(size);
    setStorageItem("lewis-font-size", size);
  };

  const setCompactMode = (compact: boolean) => {
    setCompactModeState(compact);
    setStorageItem("lewis-compact-mode", String(compact));
  };

  const setShowCopyConfirmation = (show: boolean) => {
    setShowCopyConfirmationState(show);
    setStorageItem("lewis-copy-confirmation", String(show));
  };

  const setAutoExpandSections = (expand: boolean) => {
    setAutoExpandSectionsState(expand);
    setStorageItem("lewis-auto-expand", String(expand));
  };

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.classList.remove("theme-dark", "theme-light", "theme-midnight", "theme-ocean");
    document.documentElement.classList.add(`theme-${theme}`);
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

  return (
    <SettingsContext.Provider value={{
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
    }}>
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
