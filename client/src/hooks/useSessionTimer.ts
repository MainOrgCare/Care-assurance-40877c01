import { useEffect, useState } from "react";

/**
 * Tracks elapsed time since the component mounted (i.e., session start).
 * Returns a formatted string like "2h 14m", "45m", or "<1m" for the first minute.
 */
export function useSessionTimer() {
  const [startTime] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState("<1m");

  useEffect(() => {
    const update = () => {
      const diffMs = Date.now() - startTime;
      const totalMinutes = Math.floor(diffMs / 60000);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;

      if (hours > 0) {
        setElapsed(`${hours}h ${minutes}m`);
      } else if (minutes > 0) {
        setElapsed(`${minutes}m`);
      } else {
        setElapsed("<1m");
      }
    };

    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [startTime]);

  return elapsed;
}
