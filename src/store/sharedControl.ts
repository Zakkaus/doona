import {useCallback, useSyncExternalStore} from 'react';
import type {Api} from '../api/api';
import {getApi} from '../api';

type Cell<T> = {value: T; listeners: Set<() => void>; set: (value: T | ((previous: T) => T)) => void};
const backends = new WeakMap<Api, Map<string, Cell<unknown>>>();

// Control state survives a host closing, but never crosses backend identity.
export function sharedControl<T>(api: Api, key: string, initial: T): Cell<T> {
  let cells = backends.get(api);
  if (!cells) backends.set(api, (cells = new Map()));
  let cell = cells.get(key) as Cell<T> | undefined;
  if (!cell) {
    const next: Cell<T> = {
      value: initial,
      listeners: new Set(),
      set(value) {
        next.value = typeof value === 'function' ? (value as (previous: T) => T)(next.value) : value;
        next.listeners.forEach(notify => notify());
      }
    };
    cell = next;
    cells.set(key, next as Cell<unknown>);
  }
  return cell;
}

export function useSharedControl<T>(key: string, initial: T) {
  const cell = sharedControl(getApi(), key, initial);
  const subscribe = useCallback(
    (notify: () => void) => {
      cell.listeners.add(notify);
      return () => void cell.listeners.delete(notify);
    },
    [cell]
  );
  return [useSyncExternalStore(subscribe, () => cell.value), cell.set] as const;
}
