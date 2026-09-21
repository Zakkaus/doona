import {useCallback, useEffect, useRef, useSyncExternalStore} from 'react';
import {getApi} from '../index';
import type {Api} from '../api';
import type {ApiEvent} from '../model';
import {inflight, normalizeResourceKey} from '../inflight';
type Listener = (event: ApiEvent, reconnected: boolean) => void;
type StreamStatus = {connected: boolean; cursor: string | null; error: Error | null; available: boolean | null};
type Stream = {listeners: Set<Listener>; statuses: Set<() => void>; controller: AbortController; status: StreamStatus; ready?: ApiEvent};
const streams = new Map<Api, Stream>();
const initialStatus: StreamStatus = {connected: false, cursor: null, error: null, available: null};
export function useEvents(onEvent: Listener) {
  const api = getApi();
  const callback = useRef(onEvent);
  useEffect(() => {
    callback.current = onEvent;
  });
  const subscribe = useCallback(
    (notify: () => void) => {
      const listener: Listener = (event, reconnected) => callback.current(event, reconnected);
      let stream = streams.get(api);
      if (!stream) {
        stream = {listeners: new Set(), statuses: new Set(), controller: new AbortController(), status: initialStatus};
        streams.set(api, stream);
        const shared = stream;
        const update = (change: Partial<StreamStatus>) => {
          shared.status = {...shared.status, ...change};
          shared.statuses.forEach(fn => fn());
        };
        const request = inflight.acquire(api, normalizeResourceKey(['capabilities']), signal => api.capabilities(signal));
        shared.controller.signal.addEventListener('abort', request.release, {once: true});
        void request.promise
          .then(capabilities => {
            request.release();
            shared.controller.signal.removeEventListener('abort', request.release);
            if (shared.controller.signal.aborted) return;
            update({available: capabilities.resources.events.available});
            if (!capabilities.resources.events.available) return;
            return api.subscribeEvents({
              signal: shared.controller.signal,
              onConnectionChange: connected => update({connected}),
              onEvent: event => {
                const reconnected = event.event === 'stream.ready' && !!shared.ready;
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
            if (!shared.controller.signal.aborted) update({connected: false, error: reason instanceof Error ? reason : new Error(String(reason))});
          });
      }
      stream.listeners.add(listener);
      stream.statuses.add(notify);
      if (stream.ready) listener(stream.ready, false);
      return () => {
        stream.listeners.delete(listener);
        stream.statuses.delete(notify);
        if (!stream.listeners.size) {
          stream.controller.abort();
          streams.delete(api);
        }
      };
    },
    [api]
  );
  const getSnapshot = useCallback(() => streams.get(api)?.status ?? initialStatus, [api]);
  return useSyncExternalStore(subscribe, getSnapshot);
}
