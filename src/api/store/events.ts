import {useCallback, useEffect, useRef, useSyncExternalStore} from 'react';
import {getApi} from '../index';
import type {Api} from '../api';
import type {ApiEvent} from '../model';
import {ApiError} from '../error';
import {inflight, normalizeResourceKey} from '../inflight';
type Listener = (event: ApiEvent, reconnected: boolean) => void;
type StreamStatus = {connected: boolean; cursor: string | null; error: Error | null; available: boolean | null};
type Stream = {listeners: Set<Listener>; statuses: Set<() => void>; controller: AbortController; status: StreamStatus; ready?: ApiEvent};
const streams = new Map<Api, Stream>();
const initialStatus: StreamStatus = {connected: false, cursor: null, error: null, available: null};
export function eventStatus(api: Api) {
  return streams.get(api)?.status ?? initialStatus;
}
export function subscribeEvents(api: Api, listener: Listener, notify?: () => void) {
  let stream = streams.get(api);
  if (!stream) {
    stream = {listeners: new Set(), statuses: new Set(), controller: new AbortController(), status: initialStatus};
    streams.set(api, stream);
    const shared = stream;
    const update = (change: Partial<StreamStatus>) => {
      shared.status = {...shared.status, ...change};
      shared.statuses.forEach(fn => fn());
    };
    // The stream waits for the capability probe; a probe that fails is tried again with backoff, so a backend
    // that was down at boot still gets its stream once it answers.
    let pause = 5000;
    let failed = false;
    const boot = () => {
      const request = inflight.acquire(api, normalizeResourceKey(['capabilities']), signal => api.capabilities(signal));
      shared.controller.signal.addEventListener('abort', request.release, {once: true});
      void request.promise
        .then(capabilities => {
          request.release();
          shared.controller.signal.removeEventListener('abort', request.release);
          if (shared.controller.signal.aborted) return;
          update({available: capabilities.resources.events.available, error: null});
          if (!capabilities.resources.events.available) return;
          return api.subscribeEvents({
            signal: shared.controller.signal,
            onConnectionChange: connected => update({connected}),
            onEvent: event => {
              // After a failed boot the first ready event is a recovery: resources that failed meanwhile refetch.
              const reconnected = event.event === 'stream.ready' && (!!shared.ready || failed);
              if (event.event === 'stream.ready') {
                shared.ready = event;
                update({cursor: event.id, error: null});
              }
              shared.listeners.forEach(fn => fn(event, reconnected));
            }
          });
        })
        .catch(reason => {
          request.release();
          shared.controller.signal.removeEventListener('abort', request.release);
          if (shared.controller.signal.aborted) return;
          failed = true;
          const error = reason instanceof Error ? reason : new Error(String(reason));
          update({connected: false, error});
          const wait = Math.max(pause, error instanceof ApiError && error.retryAfter ? error.retryAfter * 1000 : 0);
          const timer = setTimeout(boot, wait);
          pause = Math.min(pause * 2, 30000);
          shared.controller.signal.addEventListener('abort', () => clearTimeout(timer), {once: true});
        });
    };
    boot();
  }
  stream.listeners.add(listener);
  if (notify) stream.statuses.add(notify);
  if (stream.ready) listener(stream.ready, false);
  return () => {
    stream.listeners.delete(listener);
    if (notify) stream.statuses.delete(notify);
    if (!stream.listeners.size) {
      stream.controller.abort();
      streams.delete(api);
    }
  };
}
export function useEvents(onEvent: Listener) {
  const api = getApi();
  const callback = useRef(onEvent);
  useEffect(() => {
    callback.current = onEvent;
  });
  const subscribe = useCallback((notify: () => void) => subscribeEvents(api, (event, reconnected) => callback.current(event, reconnected), notify), [api]);
  const getSnapshot = useCallback(() => eventStatus(api), [api]);
  return useSyncExternalStore(subscribe, getSnapshot);
}
