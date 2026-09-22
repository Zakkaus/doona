import {useCallback, useEffect, useRef, useSyncExternalStore} from 'react';
import {getApi} from '../api/index';
import type {Api} from '../api/api';
import type {ApiEvent, Capabilities} from '../api/model';
import {watchResource} from './resource';
import {shouldRefetch} from '../api/invalidation';
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
      if (Object.entries(change).every(([key, value]) => shared.status[key as keyof StreamStatus] === value)) return;
      shared.status = {...shared.status, ...change};
      shared.statuses.forEach(fn => fn());
    };
    let failed = false;
    let current: Capabilities | undefined;
    let connection: AbortController | undefined;
    const changed = () => {
      const state = capabilities.getSnapshot();
      if (state.error) {
        failed = true;
        update({error: state.error});
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
          signal: controller.signal,
          onConnectionChange: connected => {
            if (!controller.signal.aborted) update({connected});
          },
          onEvent: event => {
            if (controller.signal.aborted) return;
            const reconnected = event.event === 'stream.ready' && (!!shared.ready || failed);
            if (event.event === 'stream.ready') {
              shared.ready = event;
              failed = false;
              update({cursor: event.id, error: null});
            }
            if (shouldRefetch('capabilities', event, reconnected)) capabilities.invalidate(reconnected);
            shared.listeners.forEach(fn => fn(event, reconnected));
          }
        })
        .catch(reason => {
          if (!controller.signal.aborted) {
            connection = undefined;
            update({connected: false, error: reason instanceof Error ? reason : new Error(String(reason))});
          }
        });
    };
    const capabilities = watchResource(
      api,
      {key: ['capabilities'], every: 0, retryErrors: true, followEvents: false, fetch: signal => api.capabilities(signal)},
      changed
    );
    changed();
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
