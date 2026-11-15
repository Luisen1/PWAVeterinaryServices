import { useEffect, useMemo, useState } from 'react';
export function useNow() {
  const [timestamp, setTimestamp] = useState(() => Date.now());
  useEffect(() => {
    const update = () => setTimestamp(Date.now());
    const timer = window.setInterval(update, 30000);
    window.addEventListener('focus', update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', update);
    };
  }, []);
  return useMemo(() => new Date(timestamp), [timestamp]);
}
