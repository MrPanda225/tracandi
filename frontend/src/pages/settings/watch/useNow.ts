import { useEffect, useState } from 'react';

const MINUTE_MS = 60_000;

/** The current time, read again every minute: what depends on the hour of the day (a slot still to come) stays true. */
export function useNow(everyMs = MINUTE_MS): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), everyMs);
    return () => window.clearInterval(timer);
  }, [everyMs]);

  return now;
}
