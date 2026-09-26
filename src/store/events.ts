import {useCallback, useEffect, useRef, useSyncExternalStore} from 'react';
import {getApi} from '../api/index';
import type {Api} from '../api/api';
import type {ApiEvent, Capabilities} from '../api/model';
import {refuseCredentials, watchResource} from './resourceCore';
import {shouldRefetch} from '../api/invalidation';
type Listener = (event: ApiEvent, reconnected: boolean) => void;
type StreamStatus = {connected: boolean; cursor: string | null; error: Error | null; available: boolean | null};
type Stream = {
  listeners: Set<Listener>;
  statuses: Set<() => void>;
  controller: AbortController;
  status: StreamStatus;
  ready?: ApiEvent;
  recent: ApiEvent[];
  reopen?: () => void;
};
const streams = new Map<Api, Stream>();
// The events a page's feed keeps, and so the recent events the stream replays to a feed opened late.
export const EVENT_FEED_LIMIT = 200;
// `stream.ready` events that restarted the stream after its cursor expired: what the backend sent before is lost.
const lostBefore = new WeakSet<ApiEvent>();
export const historyLost = (event: ApiEvent) => lostBefore.has(event);
const initialStatus: StreamStatus = {connected: false, cursor: null, error: null, available: null};
export function eventStatus(api: Api) {
  return streams.get(api)?.status ?? initialStatus;
}
export function subscribeEvents(api: Api, listener: Listener, notify?: () => void, replayRecent = false) {
  let stream = streams.get(api);
  if (!stream) {
    stream = {listeners: new Set(), statuses: new Set(), controller: new AbortController(), status: initialStatus, recent: []};
    streams.set(api, stream);
    const shared = stream;
    const update = (change: Partial<StreamStatus>) => {
      if (Object.entries(change).every(([key, value]) => shared.status[key as keyof StreamStatus] === value)) return;
      shared.status = {...shared.status, ...change};
      shared.statuses.forEach(fn => fn());
    };
    let failed = false;
    let expired = false;
    let capabilityError = false;
    let current: Capabilities | undefined;
    let connection: AbortController | undefined;
    const changed = () => {
      const state = capabilities.getSnapshot();
      if (state.error) {
        failed = true;
        capabilityError = true;
        update({error: state.error});
      } else if (capabilityError) {
        // A refetch that returns what was already held keeps the same object, so it is cleared here.
        capabilityError = false;
        update({error: null});
      }
      if (!state.data || state.data === current) return;
      const unchanged = state.data.resources.events.available === current?.resources.events.available;
      current = state.data;
      if (unchanged && (connection || !current.resources.events.available)) return;
      connection?.abort();
      update({available: current.resources.events.available, connected: false, error: null});
      if (!current.resources.events.available) return;
      const controller = new AbortController();
      connection = controller;
      void api
        .subscribeEvents({
          heartbeatSeconds: current.resources.events.heartbeat_seconds,
          signal: controller.signal,
          onConnectionChange: connected => {
            if (!controller.signal.aborted) update({connected});
          },
          onCursorExpired: () => {
            if (!controller.signal.aborted) expired = true;
          },
          onEvent: event => {
            if (controller.signal.aborted) return;
            const reconnected = event.event === 'stream.ready' && (!!shared.ready || failed);
            if (event.event === 'stream.ready') {
              // A resume right after that ready repeats its id and replaces it in the feeds, so it keeps the mark.
              if (expired || (shared.ready && historyLost(shared.ready) && shared.ready.id === event.id)) lostBefore.add(event);
              expired = false;
              shared.ready = event;
              failed = false;
              update({cursor: event.id, error: null});
            }
            shared.recent.push(event);
            if (shared.recent.length > EVENT_FEED_LIMIT) shared.recent.shift();
            if (shouldRefetch('capabilities', event, reconnected)) capabilities.invalidate(reconnected);
            shared.listeners.forEach(fn => fn(event, reconnected));
          }
        })
        .catch(reason => {
          if (!controller.signal.aborted) {
            connection = undefined;
            capabilityError = false;
            refuseCredentials(api, reason);
            update({connected: false, error: reason instanceof Error ? reason : new Error(String(reason))});
          }
        });
    };
    const capabilities = watchResource(api, {key: ['capabilities'], every: 0, retryErrors: true, fetch: signal => api.capabilities(signal)}, changed);
    changed();
    // A refused stream stays closed; an unchanged capabilities read notifies nobody, so a retry reopens it here.
    shared.reopen = () => {
      if (connection || capabilities.getSnapshot().error) return;
      current = undefined;
      changed();
    };
    shared.controller.signal.addEventListener(
      'abort',
      () => {
        capabilities.dispose();
        connection?.abort();
      },
      {once: true}
    );
  }
  stream.listeners.add(listener);
  if (notify) stream.statuses.add(notify);
  if (replayRecent) stream.recent.forEach(event => listener(event, false));
  else if (stream.ready) listener(stream.ready, false);
  return () => {
    stream.listeners.delete(listener);
    if (notify) stream.statuses.delete(notify);
    if (!stream.listeners.size) {
      stream.controller.abort();
      streams.delete(api);
    }
  };
}
// Reopens a stream the backend refused, once the capabilities have been read again.
export function reopenEvents(api: Api) {
  streams.get(api)?.reopen?.();
}
export function useEvents(onEvent: Listener, replayRecent = false) {
  const api = getApi();
  const callback = useRef(onEvent);
  useEffect(() => {
    callback.current = onEvent;
  });
  const subscribe = useCallback(
    (notify: () => void) => subscribeEvents(api, (event, reconnected) => callback.current(event, reconnected), notify, replayRecent),
    [api, replayRecent]
  );
  const getSnapshot = useCallback(() => eventStatus(api), [api]);
  return useSyncExternalStore(subscribe, getSnapshot);
}
