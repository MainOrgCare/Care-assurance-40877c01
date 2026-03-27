import { useEffect } from "react";

const APP_NAME = "CareAssurance";

/**
 * Sets the document title for the current page, restoring the default on unmount.
 *
 * @param title - The page-specific title. If omitted or empty, only the app name is used.
 * @param suffix - Whether to append the app name (default: true).
 *
 * @example
 * usePageTitle("Compliance");        // → "Compliance — CareAssurance"
 * usePageTitle("Dashboard");        // → "Dashboard — CareAssurance"
 * usePageTitle();                   // → "CareAssurance"
 */
export function usePageTitle(title?: string, suffix = true): void {
  useEffect(() => {
    const prev = document.title;
    document.title = title
      ? suffix
        ? `${title} — ${APP_NAME}`
        : title
      : APP_NAME;
    return () => {
      document.title = prev;
    };
  }, [title, suffix]);
}
