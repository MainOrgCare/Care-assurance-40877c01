import { useEffect, useState } from "react";

/**
 * Tracks elapsed time since the component mounted (i.e., session start).
 * Returns a formatted string like "2h 14m" or "45m".
 */
export function useSessionTimer() {
  const [startTime] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState("0m");

  useEffect(() => {
    const update = () => {
      const diffMs = Date.now() - startTime;
      const totalMinutes = Math.floor(diffMs / 60000);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;

      if (hours > 0) {
        setElapsed(`${hours}h ${minutes}m`);
      } else {
        setElapsed(`${Math.max(1, minutes)}m`);
      }
    };

    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [startTime]);

  return elapsed;
}
