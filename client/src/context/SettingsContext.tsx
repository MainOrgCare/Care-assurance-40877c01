import { createContext, useContext, useState, useEffect, ReactNode, useRef, useCallback } from "react";

export type Theme = "dark" | "midnight" | "ocean" | "light" | "auto";
export type FontSize = "small" | "medium" | "large";

interface ThemeSchedule {
  enabled: boolean;
  lightStart: number; // minutes from midnight
  darkStart: number;  // minutes from midnight
}

interface SettingsContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  actualTheme: Exclude<Theme, "auto">;
  fontSize: FontSize;
  setFontSize: (size: FontSize) => void;
  compactMode: boolean;
  setCompactMode: (compact: boolean) => void;
  showCopyConfirmation: boolean;
  setShowCopyConfirmation: (show: boolean) => void;
  autoExpandSections: boolean;
  setAutoExpandSections: (expand: boolean) => void;
  isThemeTransitioning: boolean;
  themeSchedule: ThemeSchedule;
  setThemeSchedule: (schedule: ThemeSchedule) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

const DEFAULT_THEME_SCHEDULE: ThemeSchedule = { enabled: false, lightStart: 420, darkStart: 1140 }; // 07:00 and 19:00

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseTimeToMinutes(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1439) {
    return Math.floor(value);
  }
  if (typeof value !== "string" || value.length === 0) return null;

  const trimmed = String(value).replace(/^\s+|\s+$/g, '');
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(trimmed);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

function coerceThemeSchedule(value: unknown): ThemeSchedule {
  if (!isRecord(value)) return DEFAULT_THEME_SCHEDULE;

  const enabled = typeof value.enabled === "boolean" ? value.enabled : false;
  const lightStart = parseTimeToMinutes(value.lightStart);
  const darkStart = parseTimeToMinutes(value.darkStart);

  if (lightStart === null || darkStart === null) {
    return DEFAULT_THEME_SCHEDULE;
  }

  return { enabled, lightStart, darkStart };
}

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

function safeJsonParse(value: string | null): unknown {
  if (!value || typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [isThemeTransitioning, setIsThemeTransitioning] = useState(false);
  const [actualTheme, setActualTheme] = useState<Exclude<Theme, "auto">>("dark");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = getStorageItem("lewis-theme");
    return (saved as Theme) || "dark";
  });
  
  const [themeSchedule, setThemeScheduleState] = useState<ThemeSchedule>(() => {
    const saved = getStorageItem("lewis-theme-schedule");
    const parsed = safeJsonParse(saved);
    return coerceThemeSchedule(parsed);
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
  
  const resolveAutoTheme = useCallback((): Exclude<Theme, "auto"> => {
    if (themeSchedule.enabled) {
      const currentTime = new Date().getHours() * 60 + new Date().getMinutes();
      return currentTime >= themeSchedule.lightStart && currentTime < themeSchedule.darkStart ? "light" : "dark";
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? "dark" : "light";
  }, [themeSchedule]);

  const setThemeSchedule = (schedule: ThemeSchedule) => {
    setThemeScheduleState(schedule);
    setStorageItem("lewis-theme-schedule", JSON.stringify(schedule));
    if (theme === "auto") setActualTheme(resolveAutoTheme());
  };

  const setAutoExpandSections = (expand: boolean) => {
    setAutoExpandSectionsState(expand);
    setStorageItem("lewis-auto-expand", String(expand));
  };

  const setTheme = useCallback((newTheme: Theme) => {
    if (newTheme === theme) return;
    
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    
    setIsThemeTransitioning(true);
    document.documentElement.classList.add('theme-transitioning');
    
    timeoutRef.current = setTimeout(() => {
      setThemeState(newTheme);
      setStorageItem("lewis-theme", newTheme);
      
      timeoutRef.current = setTimeout(() => {
        document.documentElement.classList.remove('theme-transitioning');
        setIsThemeTransitioning(false);
      }, 300);
    }, 50);
  }, [theme]);

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

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (scheduleTimeoutRef.current) clearTimeout(scheduleTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (theme === "auto") {
      setActualTheme(resolveAutoTheme());
      
      if (themeSchedule.enabled) {
        const scheduleNextChange = () => {
          const now = new Date();
          const currentMinutes = now.getHours() * 60 + now.getMinutes();
          const { lightStart, darkStart } = themeSchedule;
          
          let nextChange = lightStart > currentMinutes ? lightStart : darkStart > currentMinutes ? darkStart : lightStart + 1440;
          const msUntilChange = (nextChange - currentMinutes) * 60000;
          
          return setTimeout(() => {
            setActualTheme(resolveAutoTheme());
            scheduleNextChange();
          }, msUntilChange);
        };
        
        const timeout = scheduleNextChange();
        return () => clearTimeout(timeout);
      }
    } else {
      setActualTheme(theme as Exclude<Theme, "auto">);
    }
  }, [theme, themeSchedule, resolveAutoTheme]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (theme === "auto" && !themeSchedule.enabled) {
        setActualTheme(resolveAutoTheme());
      }
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme, themeSchedule, resolveAutoTheme]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", actualTheme);
    document.documentElement.classList.remove("theme-dark", "theme-light", "theme-midnight", "theme-ocean");
    document.documentElement.classList.add(`theme-${actualTheme}`);
    
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    const colors = { dark: '#181E28', midnight: '#0F0D14', ocean: '#111A1F', light: '#F5F7FA' };
    if (metaThemeColor) metaThemeColor.setAttribute('content', colors[actualTheme]);
  }, [actualTheme]);

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
      actualTheme,
      fontSize,
      setFontSize,
      compactMode,
      setCompactMode,
      showCopyConfirmation,
      setShowCopyConfirmation,
      autoExpandSections,
      setAutoExpandSections,
      isThemeTransitioning,
      themeSchedule,
      setThemeSchedule,
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
