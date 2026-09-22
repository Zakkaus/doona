import {useCallback, useEffect, useRef, useSyncExternalStore} from 'react';
import {getApi} from '../api/index';
import type {Api} from '../api/api';
import type {ApiEvent, Capabilities} from '../api/model';
import {ApiError} from '../api/error';
import {inflight, normalizeResourceKey, type RequestLease, type ResourceKey} from '../api/inflight';
import {shouldRefetch} from '../api/invalidation';
import {subscribeEvents} from './events';

type RefreshOutcome = {key: string} & ({ok: true} | {ok: false; error: Error});
type Resource<T> = {
  key: ResourceKey;
  every?: number;
  fetch: (signal: AbortSignal) => Promise<T>;
  acceptEvent?: (event: ApiEvent) => boolean;
  retryErrors?: boolean;
  // The capabilities resource is what the event stream itself waits on, so it cannot follow events.
  followEvents?: boolean;
};
type Entry = {
  snapshot: ResourceState<unknown>;
  subscribers: Set<() => void>;
  watcher: {refetch: () => Promise<RefreshOutcome>; invalidate: (reconnected: boolean) => void; dispose: () => void};
};
type Store = {active: Map<string, Entry>; inactive: Map<string, ResourceState<unknown>>; parameterised: Set<string>};
const stores = new WeakMap<Api, Store>();
const initialState: ResourceState<never> = {data: undefined, loading: true, error: null};
const disabledState: ResourceState<never> = {data: undefined, loading: false, error: null};

export async function refetchAll(): Promise<RefreshOutcome[]> {
  return Promise.all([...(stores.get(getApi())?.active.values() ?? [])].map(entry => entry.watcher.refetch()));
}

function snapshot<T>(api: Api, name: string): ResourceState<T> {
  const store = stores.get(api);
  return (store?.active.get(name)?.snapshot ?? store?.inactive.get(name) ?? initialState) as ResourceState<T>;
}

export function watchResource<T>(api: Api, resource: Resource<T>, notify: () => void, name = normalizeResourceKey(resource.key)) {
  let store = stores.get(api);
  if (!store) stores.set(api, (store = {active: new Map(), inactive: new Map(), parameterised: new Set()}));
  let entry = store.active.get(name);
  if (!entry) {
    const state = snapshot<T>(api, name);
    store.inactive.delete(name);
    store.parameterised.delete(name);
    const subscribers = new Set<() => void>();
    const shared: Entry = {
      snapshot: state,
      subscribers,
      watcher: createWatcher(api, resource, state.data, next => {
        shared.snapshot = next;
        subscribers.forEach(fn => fn());
      })
    };
    store.active.set(name, (entry = shared));
  }
  entry.subscribers.add(notify);
  const shared = entry;
  let disposed = false;
  return {
    getSnapshot: () => shared.snapshot as ResourceState<T>,
    refetch: shared.watcher.refetch,
    invalidate: shared.watcher.invalidate,
    dispose() {
      if (disposed) return;
      disposed = true;
      shared.subscribers.delete(notify);
      if (shared.subscribers.size) return;
      shared.watcher.dispose();
      store.active.delete(name);
      if (shared.snapshot.data === undefined) return;
      store.inactive.set(name, {...shared.snapshot, error: null});
      if (resource.key.length > 1) {
        store.parameterised.add(name);
        if (store.parameterised.size > 32) {
          const oldest = store.parameterised.values().next().value!;
          store.parameterised.delete(oldest);
          store.inactive.delete(oldest);
        }
      }
    }
  };
}

type ResourceState<T> = {data: T | undefined; loading: boolean; error: Error | null};

function createWatcher<T>(
  api: Api,
  {key, fetch, every = 5000, acceptEvent, retryErrors = false, followEvents = true}: Resource<T>,
  data: T | undefined,
  publish: (state: ResourceState<T>) => void
) {
  const name = normalizeResourceKey(key);
  let phase: 'idle' | 'fetching' | 'backoff' = 'idle';
  let request: RequestLease<T> | undefined;
  let settled: Promise<RefreshOutcome> | undefined;
  let resolve: ((outcome: RefreshOutcome) => void) | undefined;
  let followup: Promise<RefreshOutcome> | undefined;
  let disposed = false;
  let dirty = false;
  let stale = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let deadline = Infinity;
  let retryAt = 0;
  let refused = 0;
  let failure: Error | null = null;
  let recoveryDelay = 5000;
  const clear = () => {
    clearTimeout(timer);
    timer = undefined;
    deadline = Infinity;
  };
  const schedule = (at: number) => {
    at = Math.max(at, retryAt);
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
        else if (phase === 'backoff') attempt();
        else load();
      },
      Math.max(0, at - Date.now())
    );
  };
  const finish = (outcome: RefreshOutcome) => {
    phase = 'idle';
    const complete = resolve;
    resolve = undefined;
    complete?.(outcome);
    if (disposed) return;
    if (stale) schedule(Date.now() + 2000);
    else if (every > 0) schedule(Date.now() + every);
  };
  const attempt = () => {
    phase = 'fetching';
    dirty = false;
    stale = false;
    const lease = inflight.acquire(api, name, fetch);
    request = lease;
    void lease.promise.then(
      value => {
        lease.release();
        if (disposed) return;
        request = undefined;
        retryAt = 0;
        recoveryDelay = 5000;
        data = value;
        failure = null;
        publish({data, loading: false, error: null});
        finish({key: name, ok: true});
      },
      reason => {
        lease.release();
        if (disposed) return;
        request = undefined;
        const error = reason instanceof Error ? reason : new Error(String(reason));
        if (error instanceof ApiError && error.transient) {
          retryAt = Date.now() + error.retryAfter! * 1000;
          if (++refused <= 3) {
            phase = 'backoff';
            schedule(retryAt);
            return;
          }
        }
        failure = error;
        publish({data, loading: false, error});
        finish({key: name, ok: false, error});
        if (retryErrors && !(error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 429)) {
          retryAt = Math.max(retryAt, Date.now() + recoveryDelay);
          schedule(retryAt);
          recoveryDelay = Math.min(recoveryDelay * 2, 30000);
        }
      }
    );
  };
  const load = (): Promise<RefreshOutcome> => {
    if (disposed) return Promise.resolve({key: name, ok: false, error: new DOMException('Resource unsubscribed', 'AbortError')});
    if (phase !== 'idle') return settled!;
    clear();
    // A retry after a failure keeps the error in place, so the banner does not flicker out and back.
    if (settled && data === undefined && Date.now() >= retryAt) publish({data, loading: true, error: failure});
    refused = 0;
    settled = new Promise<RefreshOutcome>(complete => {
      resolve = complete;
    });
    if (Date.now() < retryAt) {
      phase = 'backoff';
      schedule(retryAt);
    } else attempt();
    return settled;
  };
  const refetch = () => {
    if (phase === 'idle') return load();
    if (phase === 'backoff') return settled!;
    if (!followup) {
      followup = settled!.then(() => {
        followup = undefined;
        return load();
      });
    }
    return followup;
  };
  const invalidate = (reconnected: boolean) => {
    // A request already running may predate the change; one more follows once it settles.
    if (phase === 'fetching') stale = true;
    else if (phase === 'backoff') return;
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
    } else if (dirty) {
      if (phase === 'backoff') schedule(retryAt);
      else load();
    }
  };
  const unsubscribe = followEvents
    ? subscribeEvents(api, (event, reconnected) => {
        if (shouldRefetch(key[0], event, reconnected) && (acceptEvent?.(event) ?? true)) invalidate(reconnected);
      })
    : () => {};
  document.addEventListener('visibilitychange', visibility);
  if (document.hidden) dirty = true;
  else load();
  return {
    refetch,
    invalidate,
    dispose() {
      disposed = true;
      unsubscribe();
      document.removeEventListener('visibilitychange', visibility);
      request?.release();
      finish({key: name, ok: false, error: new DOMException('Resource unsubscribed', 'AbortError')});
      clear();
    }
  };
}

// A resource held back only until the capabilities arrive reports loading, not an empty result.
export function useResource<T>(resource: Resource<T>, {enabled = true, pending = false}: {enabled?: boolean; pending?: boolean} = {}) {
  const api = getApi();
  const name = normalizeResourceKey(resource.key);
  const current = useRef(resource);
  useEffect(() => {
    current.current = resource;
  });
  const subscribe = useCallback(
    (notify: () => void) => {
      if (!enabled) return () => {};
      return watchResource(api, current.current, notify, name).dispose;
    },
    [api, name, enabled]
  );
  const getSnapshot = useCallback(() => (enabled ? snapshot<T>(api, name) : pending ? initialState : disabledState), [api, name, enabled, pending]);
  const refetch = useCallback(() => (enabled ? stores.get(api)?.active.get(name)?.watcher.refetch() : undefined), [api, name, enabled]);
  return {...useSyncExternalStore(subscribe, getSnapshot), refetch};
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
