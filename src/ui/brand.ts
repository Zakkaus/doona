import {useSyncExternalStore} from 'react';

// Icons for groups and nodes by name, the way Clash Meta dashboards do it: the configuration's icon, or a
// mapping the user keeps in this browser (an http(s) URL or a data URI). Nothing is guessed from names.
export type IconOverride = {name: string; icon: string};
const key = 'doona-icon-overrides';
const listeners = new Set<() => void>();
let cache: IconOverride[] | null = null;
function read(): IconOverride[] {
  if (cache) return cache;
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    cache = Array.isArray(parsed)
      ? parsed.filter((item): item is IconOverride => !!item && typeof item.name === 'string' && typeof item.icon === 'string')
      : [];
  } catch {
    cache = [];
  }
  return cache;
}
export function setIconOverrides(list: IconOverride[]) {
  cache = list;
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // Storage may be unavailable; the list then lasts for the session only.
  }
  for (const listener of listeners) listener();
}
export function useIconOverrides(): IconOverride[] {
  return useSyncExternalStore(
    listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    read,
    () => []
  );
}
// An icon value the page may load: http(s) or an inline image; anything else is refused.
export function iconSource(value: string): string | null {
  return /^(https?:\/\/|data:image\/)/.test(value) ? value : null;
}
// The icon for a named group or node: the user's mapping wins over what the configuration names.
export function iconForName(name: string, configured: string | null | undefined, overrides: IconOverride[]): string | null {
  return overrides.find(item => item.name === name)?.icon ?? configured ?? null;
}
