import { useEffect, useMemo, useState } from 'react';
export function useNow(intervalMs = 30000) {
  const [timestamp, setTimestamp] = useState(() => Date.now());
  useEffect(() => {
    const update = () => setTimestamp(Date.now());
    const timer = window.setInterval(update, intervalMs);
    window.addEventListener('focus', update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', update);
    };
  }, [intervalMs]);
  return useMemo(() => new Date(timestamp), [timestamp]);
}
