import {useCallback, useEffect, useRef, useSyncExternalStore} from 'react';
import {getApi} from '../api/index';
import type {Capabilities} from '../api/model';
import {ApiError} from '../api/error';
import {normalizeResourceKey} from '../api/inflight';
import {subscribeEvents} from './events';
import {initialState, refetchResource, retainInactive, snapshot, watchResource, type EventFeed, type Resource, type ResourceState} from './resourceCore';

// A resource follows the event stream unless it says otherwise.
type WatchedResource<T> = Omit<Resource<T>, 'events'> & {followEvents?: boolean};
const disabledState: ResourceState<never> = {data: undefined, loading: false, error: null};

// A resource held back only until the capabilities arrive reports loading, not an empty result.
// A paused resource stops fetching but keeps showing what it last had.
export function useResource<T>(
  resource: WatchedResource<T>,
  {enabled = true, pending = false, paused = false}: {enabled?: boolean; pending?: boolean; paused?: boolean} = {}
) {
  const api = getApi();
  const name = normalizeResourceKey(resource.key);
  const current = useRef(resource);
  useEffect(() => {
    current.current = resource;
  });
  const subscribe = useCallback(
    (notify: () => void) => {
      if (!enabled) return () => {};
      if (paused) return retainInactive(api, name);
      const {followEvents = true, ...resource} = current.current;
      const events: EventFeed | undefined = followEvents ? listener => subscribeEvents(api, listener) : undefined;
      return watchResource(api, {...resource, events}, notify, name).dispose;
    },
    [api, name, enabled, paused]
  );
  const getSnapshot = useCallback(() => (enabled ? snapshot<T>(api, name) : pending ? initialState : disabledState), [api, name, enabled, pending]);
  const refetch = useCallback(() => (enabled ? refetchResource(api, name) : undefined), [api, name, enabled]);
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
