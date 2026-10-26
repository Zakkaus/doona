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

// Mount the closed overlay first, then perform native modal layout after paint.
export function usePaintedOpen(open: boolean, cancel?: () => void) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!open) {
      setShown(false);
      return;
    }
    let timer = 0;
    const frame = requestAnimationFrame(() => {
      timer = window.setTimeout(() => startTransition(() => setShown(true)), 0);
    });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [open]);
  useEffect(() => {
    if (!open || shown || !cancel) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      cancel();
    };
    document.addEventListener('keydown', dismiss, true);
    return () => document.removeEventListener('keydown', dismiss, true);
  }, [open, shown, cancel]);
  return open && shown;
}
