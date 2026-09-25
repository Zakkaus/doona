// The resource cache and its watchers. The event stream watches the capabilities through here, so this module
// takes its event feed as a parameter rather than importing the stream.
import {useCallback, useSyncExternalStore} from 'react';
import {getApi} from '../api/index';
import type {Api} from '../api/api';
import type {ApiEvent} from '../api/model';
import {ApiError} from '../api/error';
import {inflight, normalizeResourceKey, type RequestLease, type ResourceKey} from '../api/inflight';
import {shouldRefetch} from '../api/invalidation';
import {replaceEqualDeep} from './share';

export type RefreshOutcome = {key: string} & ({ok: true} | {ok: false; error: Error});
// Subscribes to the events that bring a fetch forward; returns the unsubscribe.
export type EventFeed = (listener: (event: ApiEvent, reconnected: boolean) => void) => () => void;
export type Resource<T> = {
  key: ResourceKey;
  every?: number;
  fetch: (signal: AbortSignal) => Promise<T>;
  acceptEvent?: (event: ApiEvent) => boolean;
  retryErrors?: boolean;
  // The capabilities resource is what the event stream itself waits on, so it follows no events.
  events?: EventFeed;
};
type Entry = {
  snapshot: ResourceState<unknown>;
  subscribers: Set<() => void>;
  watcher: {refetch: () => Promise<RefreshOutcome>; invalidate: (reconnected: boolean) => void; dispose: () => void};
};
type Store = {
  active: Map<string, Entry>;
  inactive: Map<string, ResourceState<unknown>>;
  expiry: Map<string, ReturnType<typeof setTimeout>>;
  parameterised: Set<string>;
  // Paused consumers per name; their inactive snapshot does not expire.
  retained: Map<string, number>;
};
const stores = new WeakMap<Api, Store>();
export const initialState: ResourceState<never> = {data: undefined, loading: true, error: null};
// A page left and soon revisited shows what it had at once; after this long nobody is coming back, and a large list
// is not worth holding.
const keepInactive = 60000;
const eventGap = 5000;

export const refetchResource = (api: Api, name: string) => stores.get(api)?.active.get(name)?.watcher.refetch();

export async function refetchAll(): Promise<RefreshOutcome[]> {
  return Promise.all([...(stores.get(getApi())?.active.values() ?? [])].map(entry => entry.watcher.refetch()));
}

export function snapshot<T>(api: Api, name: string): ResourceState<T> {
  const store = stores.get(api);
  return (store?.active.get(name)?.snapshot ?? store?.inactive.get(name) ?? initialState) as ResourceState<T>;
}

function ensureStore(api: Api) {
  let store = stores.get(api);
  if (!store) stores.set(api, (store = {active: new Map(), inactive: new Map(), expiry: new Map(), parameterised: new Set(), retained: new Map()}));
  return store;
}

function expire(store: Store, name: string) {
  if (!store.inactive.has(name) || store.retained.has(name)) return;
  clearTimeout(store.expiry.get(name));
  store.expiry.set(
    name,
    setTimeout(() => forget(store, name), keepInactive)
  );
}

// Holds a snapshot for a paused consumer, which shows it without subscribing; the minute starts again on release.
export function retainInactive(api: Api, name: string) {
  const store = ensureStore(api);
  store.retained.set(name, (store.retained.get(name) ?? 0) + 1);
  clearTimeout(store.expiry.get(name));
  store.expiry.delete(name);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const count = store.retained.get(name)! - 1;
    if (count) store.retained.set(name, count);
    else {
      store.retained.delete(name);
      expire(store, name);
    }
  };
}

function forget(store: Store, name: string) {
  clearTimeout(store.expiry.get(name));
  store.expiry.delete(name);
  store.inactive.delete(name);
  store.parameterised.delete(name);
}

// A 401 on any read means the backend no longer accepts this tab's credentials, such as a session it revoked
// before its expiry; the shell asks for them again. Signing in reloads the page, which forgets the refusal.
const refusals = new WeakMap<Api, ApiError>();
const refusalListeners = new Set<() => void>();
export function refuseCredentials(api: Api, error: unknown) {
  if (!(error instanceof ApiError) || error.status !== 401 || refusals.has(api)) return;
  refusals.set(api, error);
  refusalListeners.forEach(notify => notify());
}
export const credentialRefusal = (api: Api): ApiError | null => refusals.get(api) ?? null;
export function useCredentialRefusal(): ApiError | null {
  const api = getApi();
  const subscribe = useCallback((notify: () => void) => {
    refusalListeners.add(notify);
    return () => void refusalListeners.delete(notify);
  }, []);
  return useSyncExternalStore(subscribe, () => credentialRefusal(api));
}

export function watchResource<T>(api: Api, resource: Resource<T>, notify: () => void, name = normalizeResourceKey(resource.key)) {
  const store = ensureStore(api);
  let entry = store.active.get(name);
  if (!entry) {
    const state = snapshot<T>(api, name);
    forget(store, name);
    const subscribers = new Set<() => void>();
    const shared: Entry = {
      snapshot: state,
      subscribers,
      watcher: createWatcher(api, resource, state.data, next => {
        // An unchanged poll keeps the snapshot, so subscribers do not re-render.
        const {data, loading, error} = shared.snapshot;
        if (next.data === data && next.loading === loading && next.error === error) return;
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
      expire(store, name);
      if (resource.key.length > 1) {
        store.parameterised.add(name);
        const oldest = store.parameterised.size > 32 && [...store.parameterised].find(key => !store.retained.has(key));
        if (oldest) forget(store, oldest);
      }
    }
  };
}

export type ResourceState<T> = {data: T | undefined; loading: boolean; error: Error | null};

function createWatcher<T>(
  api: Api,
  {key, fetch, every = 5000, acceptEvent, retryErrors = false, events}: Resource<T>,
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
  let startedAt = -Infinity;
  let refused = 0;
  let failure: Error | null = null;
  let recoveryDelay = 5000;
  const clear = () => {
    clearTimeout(timer);
    timer = undefined;
    deadline = Infinity;
  };
  // An event brings a fetch forward, at most once per five seconds (or per interval, if shorter): a burst of flow
  // events costs a few requests, and a configuration change still shows within seconds on a 30-second poll.
  const eventDue = () => Math.max(Date.now() + 2000, startedAt + Math.min(every, eventGap));
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
    if (stale) schedule(eventDue());
    else if (every > 0) schedule(Date.now() + every);
  };
  const attempt = () => {
    phase = 'fetching';
    startedAt = Date.now();
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
        data = replaceEqualDeep(data, value);
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
        refuseCredentials(api, error);
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
    else schedule(eventDue());
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
  const unsubscribe = events
    ? events((event, reconnected) => {
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
