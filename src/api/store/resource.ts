import {useCallback, useEffect, useRef, useState, type DependencyList} from 'react';
import {getApi} from '../index';
import type {Api} from '../api';
import type {ApiEvent, Capabilities} from '../model';
import {ApiError} from '../error';
import {inflight, normalizeResourceKey, type RequestLease, type ResourceKey} from '../inflight';
import {shouldRefetch} from '../invalidation';
import {useEvents} from './events';
const refreshers = new WeakMap<Api, Set<() => Promise<void> | undefined>>();

export async function refetchAll() {
  await Promise.allSettled([...(refreshers.get(getApi()) ?? [])].map(refresh => refresh()));
}
type Resource<T> = {
  key: ResourceKey;
  fetch: (signal: AbortSignal) => Promise<T>;
  acceptEvent?: (event: ApiEvent) => boolean;
};

// Reuse each backend's last response while refreshing it in the background to avoid loading-state flashes.
const remembered = new WeakMap<Api, {data: Map<string, unknown>; parameterised: Set<string>}>();
export function recall<T>(api: Api, name: string): T | undefined {
  const store = remembered.get(api);
  if (store?.parameterised.delete(name)) store.parameterised.add(name);
  return store?.data.get(name) as T | undefined;
}
export function remember(api: Api, name: string, data: unknown, parameterised: boolean) {
  let store = remembered.get(api);
  if (!store) remembered.set(api, (store = {data: new Map(), parameterised: new Set()}));
  store.data.set(name, data);
  store.parameterised.delete(name);
  if (parameterised) {
    store.parameterised.add(name);
    if (store.parameterised.size > 32) {
      const oldest = store.parameterised.values().next().value!;
      store.parameterised.delete(oldest);
      store.data.delete(oldest);
    }
  }
}
export function forgetResources() {
  for (const api of [getApi()]) remembered.delete(api);
}

type ResourceState<T> = {data: T | undefined; loading: boolean; error: Error | null};

export function watchResource<T>(
  {api, name, every, parameterised}: {api: Api; name: string; every: number; parameterised: boolean},
  fetch: (signal: AbortSignal) => Promise<T>,
  publish: (state: ResourceState<T>) => void
) {
  let data = recall<T>(api, name);
  let pending: RequestLease<T> | undefined;
  let settled: Promise<void> | undefined;
  let disposed = false;
  let dirty = false;
  let stale = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let deadline = Infinity;
  const clear = () => {
    clearTimeout(timer);
    timer = undefined;
    deadline = Infinity;
  };
  const schedule = (at: number) => {
    if (document.hidden) {
      dirty = true;
      clear();
      return;
    }
    if (at >= deadline) return;
    clear();
    deadline = at;
    timer = setTimeout(
      () => {
        clear();
        if (document.hidden) dirty = true;
        else load();
      },
      Math.max(0, at - Date.now())
    );
  };
  const load = () => {
    if (pending) return settled;
    clear();
    dirty = false;
    stale = false;
    if (data === undefined) publish({data, loading: true, error: null});
    const request = inflight.acquire(api, name, fetch);
    pending = request;
    settled = request.promise
      .then(
        value => {
          data = value;
          remember(api, name, data, parameterised);
          if (!disposed) publish({data, loading: false, error: null});
        },
        reason => {
          if (!disposed) publish({data, loading: false, error: reason instanceof Error ? reason : new Error(String(reason))});
        }
      )
      .finally(() => {
        pending = undefined;
        request.release();
        if (disposed) return;
        clear();
        if (stale) {
          stale = false;
          schedule(Date.now() + 2000);
        } else if (every > 0) schedule(Date.now() + every);
      });
    return settled;
  };
  const invalidate = (reconnected: boolean) => {
    // A request already running may predate the change; one more follows once it settles.
    if (pending) stale = true;
    else if (document.hidden) {
      dirty = true;
      clear();
    } else if (reconnected) load();
    else schedule(Date.now() + 2000);
  };
  const visibility = () => {
    if (document.hidden) {
      dirty ||= timer !== undefined;
      clear();
    } else if (dirty) load();
  };
  let listeners = refreshers.get(api);
  if (!listeners) refreshers.set(api, (listeners = new Set()));
  listeners.add(load);
  document.addEventListener('visibilitychange', visibility);
  load();
  return {
    refetch: load,
    invalidate,
    dispose() {
      disposed = true;
      listeners.delete(load);
      document.removeEventListener('visibilitychange', visibility);
      pending?.release();
      clear();
    }
  };
}

export function useResource<T>(
  resource: Resource<T>,
  {every = 5000, deps = [], enabled = true}: {every?: number; deps?: DependencyList; enabled?: boolean} = {}
) {
  const api = getApi();
  const name = normalizeResourceKey(resource.key);
  const lane = resource.key[0];
  const parameterised = resource.key.length > 1;
  const [key, setKey] = useState(() => ({api, name, every, enabled, deps, parameterised}));
  const start = (api: Api, name: string, enabled: boolean) => {
    const data = enabled ? recall<T>(api, name) : undefined;
    return {data, loading: enabled && data === undefined, error: null as Error | null};
  };
  const [state, setState] = useState<{data: T | undefined; loading: boolean; error: Error | null}>(() => start(api, name, enabled));
  // Match React's dependency comparison without serializing API object identities.
  if (
    key.api !== api ||
    key.name !== name ||
    key.parameterised !== parameterised ||
    !Object.is(key.every, every) ||
    key.enabled !== enabled ||
    key.deps.length !== deps.length ||
    deps.some((dep, i) => !Object.is(dep, key.deps[i]))
  ) {
    setKey({api, name, every, enabled, deps, parameterised});
    setState(start(api, name, enabled));
  }
  const current = useRef(resource.fetch);
  useEffect(() => {
    current.current = resource.fetch;
  });
  const refresh = useRef<() => Promise<void> | undefined>(() => undefined);
  const invalidate = useRef<(reconnected: boolean) => void>(() => {});
  const refetch = useCallback(() => refresh.current(), []);
  useEffect(() => {
    if (!key.enabled) return;
    const watcher = watchResource(key, signal => current.current(signal), setState);
    refresh.current = watcher.refetch;
    invalidate.current = watcher.invalidate;
    return () => {
      watcher.dispose();
      refresh.current = () => undefined;
      invalidate.current = () => {};
    };
  }, [key]);
  useEvents((event, reconnected) => {
    if (!shouldRefetch(lane, event, reconnected) || !(resource.acceptEvent?.(event) ?? true)) return;
    invalidate.current(reconnected);
  });
  return {...state, refetch};
}
// Walks a cursor-paged list to its end. A cursor the backend no longer honours (400 for an unknown or expired
// cursor, 410 for a gone snapshot) restarts the walk once from the head, which is what the contract asks for.
export async function walk<P extends {next_cursor: string | null}, T>(
  page: (cursor: string | undefined) => Promise<P>,
  take: (acc: T | undefined, p: P) => T
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      let acc: T | undefined;
      let cursor: string | undefined;
      do {
        const result = await page(cursor);
        acc = take(acc, result);
        cursor = result.next_cursor ?? undefined;
      } while (cursor);
      return acc!;
    } catch (error) {
      if (attempt === 0 && error instanceof ApiError && (error.status === 410 || (error.status === 400 && error.code === 'invalid_request'))) continue;
      throw error;
    }
  }
}
// The page size a resource advertises, capped at the wire ceiling; undefined until the capabilities are known,
// which leaves the backend's own default in force rather than guessing above its ceiling.
export const pageSize = (capabilities: Capabilities | undefined, max: number | undefined) => (capabilities ? Math.min(1000, max ?? 1000) : undefined);
