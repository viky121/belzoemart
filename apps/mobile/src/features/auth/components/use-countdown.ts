import { useCallback, useEffect, useState } from 'react';

/** A seconds counter that ticks down once a second after `start(n)`; returns [secondsLeft, start]. */
export function useCountdown(): [number, (seconds: number) => void] {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  const start = useCallback((seconds: number) => setLeft(seconds), []);
  return [left, start];
}
