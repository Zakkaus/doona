import {startTransition, useEffect, useState} from 'react';

const counts = new WeakMap<object, Map<string, number>>();
const listeners = new WeakMap<object, Set<() => void>>();

export function rememberCount(backend: object, collection: string, count: number) {
  const cached = counts.get(backend) ?? new Map<string, number>();
  if (cached.get(collection) === count) return;
  cached.set(collection, count);
  counts.set(backend, cached);
  listeners.get(backend)?.forEach(notify => notify());
}

/** Summary metadata can arrive before the row details needed to paint content. */
export function useKnownCount(backend: object, collection: string, count?: number) {
  const [known, setKnown] = useState(() => counts.get(backend)?.get(collection));
  useEffect(() => {
    const notify = () => startTransition(() => setKnown(counts.get(backend)?.get(collection)));
    const callbacks = listeners.get(backend) ?? new Set<() => void>();
    callbacks.add(notify);
    listeners.set(backend, callbacks);
    notify();
    return () => {
      callbacks.delete(notify);
    };
  }, [backend, collection]);
  useEffect(() => {
    if (count !== undefined) rememberCount(backend, collection, count);
  }, [backend, collection, count]);
  return count ?? known;
}

export function useExpectedCount(backend: object, collection: string, count?: number) {
  return useKnownCount(backend, collection, count) ?? 3;
}
