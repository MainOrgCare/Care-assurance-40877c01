import * as React from "react"

const MOBILE_BREAKPOINT = 768

/**
 * Returns `true` when the viewport is narrower than 768px.
 *
 * Initialises synchronously from `window.matchMedia` so the very first
 * render already reflects the correct state — eliminating the flash of
 * desktop layout on mobile devices.
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`).matches;
  })

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches)
    }
    mql.addEventListener("change", onChange)
    // Sync once in case state drifted
    setIsMobile(mql.matches)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return isMobile
}
