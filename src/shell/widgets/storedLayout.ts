import {useSyncExternalStore} from 'react';
export function storedLayout<Layout extends {version: number}>(
  key: string,
  parse: (value: unknown) => Layout,
  defaults: () => Layout,
  migrate?: (layout: Layout, absent: boolean, persist: (layout: Layout) => boolean) => Layout
) {
  let cached: Layout | undefined;
  let lastStored: string | null | undefined;
  const listeners = new Set<() => void>();
  function read(): Layout {
    if (!cached) {
      try {
        lastStored = localStorage.getItem(key);
        cached = parse(JSON.parse(lastStored ?? 'null'));
        if (migrate) cached = migrate(cached, lastStored === null, persist);
      } catch {
        cached = defaults();
      }
    }
    return cached;
  }
  function save(update: Layout | ((previous: Layout) => Layout)) {
    let previous = read();
    if (typeof update === 'function') {
      try {
        const stored = localStorage.getItem(key);
        if (lastStored !== undefined && stored !== lastStored) previous = parse(JSON.parse(stored ?? 'null'));
        lastStored = stored;
      } catch {
        /* Keep the session layout when storage is blocked. */
      }
    }
    const layout = typeof update === 'function' ? update(previous) : update;
    cached = layout;
    persist(layout);
    listeners.forEach(notify => notify());
  }
  function persist(layout: Layout) {
    try {
      const serialized = JSON.stringify(layout);
      localStorage.setItem(key, serialized);
      lastStored = serialized;
      return true;
    } catch {
      return false;
    }
  }
  function subscribe(notify: () => void) {
    listeners.add(notify);
    const sync = (event: StorageEvent) => {
      if (event.key !== key && event.key !== null) return;
      cached = undefined;
      notify();
    };
    addEventListener('storage', sync);
    return () => {
      listeners.delete(notify);
      removeEventListener('storage', sync);
    };
  }
  return {read, save, useLayout: () => useSyncExternalStore(subscribe, read)};
}
