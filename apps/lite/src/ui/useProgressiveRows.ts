import {startTransition, useEffect, useState} from 'react';

export function useAfterPaint(ready: boolean) {
  const [painted, setPainted] = useState(false);
  useEffect(() => {
    if (!ready || painted) return;
    let timer = 0;
    const frame = requestAnimationFrame(() => {
      timer = window.setTimeout(() => startTransition(() => setPainted(true)), 0);
    });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [ready, painted]);
  return ready && painted;
}

export function useProgressiveRows<T>(rows: T[], initial = 30, step = Infinity) {
  const painted = useAfterPaint(rows.length > 0);
  const [count, setCount] = useState(initial);
  useEffect(() => {
    if (step === Infinity || count >= rows.length) return;
    let timer = 0;
    const frame = requestAnimationFrame(() => {
      timer = window.setTimeout(() => startTransition(() => setCount(value => Math.min(rows.length, value + step))), 0);
    });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [count, rows.length, step]);
  return step === Infinity ? (painted ? rows : rows.slice(0, initial)) : rows.slice(0, count);
}
