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
  const refetch = useCallback(() => refresh.current(), []);
  useEffect(() => {
    if (!key.enabled) return;
    let pending: RequestLease<T> | undefined;
    let settled: Promise<void> | undefined;
    let disposed = false;
    const load = () => {
      if (pending) return settled;
      const request = inflight.acquire(key.api, key.name, current.current);
      pending = request;
      settled = request.promise.then(
        data => {
          pending = undefined;
          request.release();
          remember(key.api, key.name, data, key.parameterised);
          if (!disposed) setState({data, loading: false, error: null});
        },
        reason => {
          pending = undefined;
          request.release();
          if (!disposed) setState(previous => ({...previous, loading: false, error: reason instanceof Error ? reason : new Error(String(reason))}));
        }
      );
      return settled;
    };
    refresh.current = () => {
      setState(previous => ({...previous, loading: true}));
      return load();
    };
    let listeners = refreshers.get(key.api);
    if (!listeners) refreshers.set(key.api, (listeners = new Set()));
    // Every resource refetches on a manual refresh, the same way it does when the event stream reconnects.
    const invalidate = () => refresh.current();
    listeners.add(invalidate);
    load();
    const timer = key.every > 0 ? setInterval(refresh.current, key.every) : undefined;
    return () => {
      disposed = true;
      listeners.delete(invalidate);
      pending?.release();
      clearInterval(timer);
      refresh.current = () => undefined;
    };
  }, [key]);
  // Coalesce event bursts into one delayed refetch; reconnects still refetch immediately.
  const armed = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (armed.current) clearTimeout(armed.current);
    },
    []
  );
  useEvents((event, reconnected) => {
    if (!shouldRefetch(lane, event, reconnected) || !(resource.acceptEvent?.(event) ?? true)) return;
    if (reconnected) {
      refetch();
      return;
    }
    if (armed.current) return;
    armed.current = setTimeout(() => {
      armed.current = null;
      refetch();
    }, 2000);
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
