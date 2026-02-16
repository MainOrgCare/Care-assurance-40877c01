// Dark Mode Theme Implementation for Care Assurance
// This setup provides complete dark mode support across the entire app

import React, { useEffect, useState } from 'react';

// ============================================================================
// DARK MODE CONTEXT & HOOK
// ============================================================================

export const THEME_STORAGE_KEY = 'ca-theme-preference';
export const THEME_ATTRIBUTE = 'data-theme-dark';

export enum Theme {
  LIGHT = 'light',
  DARK = 'dark',
  AUTO = 'auto', // Follow system preference
}

/**
 * Get the effective theme (resolving 'auto' to actual theme)
 */
export function getEffectiveTheme(preference: Theme): Theme {
  if (preference !== Theme.AUTO) return preference;

  if (typeof window === 'undefined') return Theme.LIGHT;

  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? Theme.DARK
    : Theme.LIGHT;
}

/**
 * Apply theme to document
 */
export function applyTheme(theme: Theme) {
  const effective = getEffectiveTheme(theme);

  if (effective === Theme.DARK) {
    document.documentElement.setAttribute(THEME_ATTRIBUTE, '');
  } else {
    document.documentElement.removeAttribute(THEME_ATTRIBUTE);
  }

  // Store preference
  localStorage.setItem(THEME_STORAGE_KEY, theme);

  // Dispatch event for other components to listen
  window.dispatchEvent(new CustomEvent('theme-changed', { detail: { theme, effective } }));
}

/**
 * Get saved theme preference from localStorage
 */
export function getSavedTheme(): Theme {
  if (typeof window === 'undefined') return Theme.AUTO;

  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === Theme.DARK || saved === Theme.LIGHT) return saved;
  return Theme.AUTO;
}

/**
 * Hook to manage dark mode
 */
export function useDarkMode() {
  const [theme, setTheme] = useState<Theme>(Theme.AUTO);
  const [isDark, setIsDark] = useState(false);

  // Initialize theme on mount
  useEffect(() => {
    const saved = getSavedTheme();
    setTheme(saved);
    applyTheme(saved);

    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      const effective = getEffectiveTheme(saved);
      setIsDark(effective === Theme.DARK);
      applyTheme(saved);
    };

    mediaQuery.addEventListener('change', handleChange);
    handleChange(); // Set initial state

    // Listen for manual theme changes from other tabs
    const handleThemeChange = (e: CustomEvent) => {
      setTheme(e.detail.theme);
      setIsDark(e.detail.effective === Theme.DARK);
    };

    window.addEventListener('theme-changed', handleThemeChange as EventListener);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
      window.removeEventListener('theme-changed', handleThemeChange as EventListener);
    };
  }, []);

  const toggleDarkMode = () => {
    const newTheme = theme === Theme.DARK ? Theme.LIGHT : Theme.DARK;
    setTheme(newTheme);
    applyTheme(newTheme);
  };

  const setThemePreference = (newTheme: Theme) => {
    setTheme(newTheme);
    applyTheme(newTheme);
  };

  return {
    theme,
    isDark,
    toggleDarkMode,
    setTheme: setThemePreference,
  };
}

// ============================================================================
// THEME PROVIDER COMPONENT
// ============================================================================

interface ThemeContextType {
  theme: Theme;
  isDark: boolean;
  toggleDarkMode: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = React.createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const darkMode = useDarkMode();

  return (
    <ThemeContext.Provider value={darkMode}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  const context = React.useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}

// ============================================================================
// DARK MODE TOGGLE COMPONENT
// ============================================================================

export function DarkModeToggle() {
  const { theme, toggleDarkMode } = useTheme();

  return (
    <button
      onClick={toggleDarkMode}
      className="dark-mode-toggle"
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      {theme === 'dark' ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="5"></circle>
          <line x1="12" y1="1" x2="12" y2="3"></line>
          <line x1="12" y1="21" x2="12" y2="23"></line>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
          <line x1="1" y1="12" x2="3" y2="12"></line>
          <line x1="21" y1="12" x2="23" y2="12"></line>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
        </svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
        </svg>
      )}
    </button>
  );
}

// ============================================================================
// TAILWIND CSS DARK MODE COLORS
// Add these to your tailwind.config.js
// ============================================================================

const darkModeConfig = `
// tailwind.config.js
module.exports = {
  darkMode: ['selector', '[data-theme-dark]'],
  theme: {
    extend: {
      colors: {
        // Light mode colors (default)
        background: 'hsl(210 15% 97%)',
        foreground: 'hsl(222 47% 11%)',
        primary: 'hsl(215 50% 35%)',
        'primary-foreground': 'hsl(0 0% 100%)',
        secondary: 'hsl(215 12% 55%)',
        muted: 'hsl(210 15% 95%)',
        'muted-foreground': 'hsl(215 15% 42%)',
        border: 'hsl(214 25% 89%)',
        card: 'hsl(0 0% 100%)',
        success: 'hsl(142 60% 36%)',
        warning: 'hsl(38 92% 50%)',
        error: 'hsl(0 72% 51%)',

        // Dark mode variants
        'dark-background': 'hsl(222 47% 11%)',
        'dark-foreground': 'hsl(210 40% 98%)',
        'dark-primary': 'hsl(215 50% 65%)',
        'dark-primary-foreground': 'hsl(222 47% 11%)',
        'dark-secondary': 'hsl(215 14% 65%)',
        'dark-muted': 'hsl(222 50% 20%)',
        'dark-muted-foreground': 'hsl(220 13% 62%)',
        'dark-border': 'hsl(222 50% 25%)',
        'dark-card': 'hsl(222 50% 15%)',
      },
    },
  },
};

// Apply dark mode colors to elements
// Example in component:
interface DarkProps {
  [key: string]: string;
}

const darkColors: DarkProps = {
  background: 'dark:bg-dark-background',
  foreground: 'dark:text-dark-foreground',
  card: 'dark:bg-dark-card',
  border: 'dark:border-dark-border',
  primary: 'dark:bg-dark-primary',
  muted: 'dark:bg-dark-muted',
};
`;

// ============================================================================
// GLOBAL CSS FOR DARK MODE
// Add to your main CSS file
// ============================================================================

const darkModeCss = `
/* Dark Mode Global Styles */
:root {
  /* Light mode (default) */
  --color-background: hsl(210, 15%, 97%);
  --color-foreground: hsl(222, 47%, 11%);
  --color-primary: hsl(215, 50%, 35%);
  --color-primary-foreground: hsl(0, 0%, 100%);
  --color-secondary: hsl(215, 12%, 55%);
  --color-muted: hsl(210, 15%, 95%);
  --color-muted-foreground: hsl(215, 15%, 42%);
  --color-border: hsl(214, 25%, 89%);
  --color-card: hsl(0, 0%, 100%);
  --color-success: hsl(142, 60%, 36%);
  --color-success-light: hsl(142, 60%, 96%);
  --color-warning: hsl(38, 92%, 50%);
  --color-error: hsl(0, 72%, 51%);
  --color-error-light: hsl(0, 86%, 97%);

  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.04);
  --shadow-md: 0 2px 4px -1px rgba(0, 0, 0, 0.06), 0 1px 2px -1px rgba(0, 0, 0, 0.04);
  --shadow-lg: 0 6px 12px -3px rgba(0, 0, 0, 0.08), 0 2px 4px -2px rgba(0, 0, 0, 0.04);
}

/* Dark mode (when data-theme-dark is present) */
html[data-theme-dark] {
  --color-background: hsl(222, 47%, 11%);
  --color-foreground: hsl(210, 40%, 98%);
  --color-primary: hsl(215, 50%, 65%);
  --color-primary-foreground: hsl(222, 47%, 11%);
  --color-secondary: hsl(215, 14%, 65%);
  --color-muted: hsl(222, 50%, 20%);
  --color-muted-foreground: hsl(220, 13%, 62%);
  --color-border: hsl(222, 50%, 25%);
  --color-card: hsl(222, 50%, 15%);
  --color-success: hsl(142, 60%, 56%);
  --color-success-light: hsl(142, 60%, 15%);
  --color-warning: hsl(38, 92%, 60%);
  --color-error: hsl(0, 72%, 61%);
  --color-error-light: hsl(0, 72%, 15%);

  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.3);
  --shadow-md: 0 2px 4px -1px rgba(0, 0, 0, 0.4), 0 1px 2px -1px rgba(0, 0, 0, 0.3);
  --shadow-lg: 0 6px 12px -3px rgba(0, 0, 0, 0.5), 0 2px 4px -2px rgba(0, 0, 0, 0.4);

  color-scheme: dark;
}

/* Base element transitions for smooth theme changes */
html,
body,
* {
  transition: background-color 200ms ease, color 200ms ease, border-color 200ms ease;
}

/* High contrast mode support */
@media (prefers-contrast: more) {
  :root {
    --color-primary: hsl(215, 80%, 20%);
    --color-error: hsl(0, 100%, 40%);
  }

  html[data-theme-dark] {
    --color-primary: hsl(215, 80%, 70%);
    --color-error: hsl(0, 100%, 60%);
  }
}

/* Reduced motion support */
@media (prefers-reduced-motion: reduce) {
  html,
  body,
  * {
    transition-duration: 0 !important;
  }
}
`;

// ============================================================================
// USAGE IN APP
// ============================================================================

const usageExample = `
// 1. Wrap your app with ThemeProvider
import { ThemeProvider, DarkModeToggle } from '@/components/theme/DarkMode';

export function App() {
  return (
    <ThemeProvider>
      <Header />
      <Routes />
      <Footer />
    </ThemeProvider>
  );
}

// 2. Use DarkModeToggle in header
function Header() {
  return (
    <header>
      <h1>Care Assurance</h1>
      <DarkModeToggle />
    </header>
  );
}

// 3. Use useTheme hook in components
function UserSettings() {
  const { theme, isDark, setTheme } = useTheme();

  return (
    <div>
      <p>Current theme: {theme}</p>
      <button onClick={() => setTheme('dark')}>Dark</button>
      <button onClick={() => setTheme('light')}>Light</button>
      <button onClick={() => setTheme('auto')}>Auto</button>
    </div>
  );
}

// 4. Tailwind automatically handles dark:* classes
// Example component:
<div className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white">
  Your content looks great in both light and dark mode
</div>
`;
