import {useCallback, useEffect, useRef, useSyncExternalStore} from 'react';
import {getApi} from '../api/index';
import type {Api} from '../api/api';
import type {ApiEvent, Capabilities, EventKind} from '../api/model';
import {refuseCredentials, watchResource} from './resource';
import {shouldRefetch} from '../api/invalidation';
type Listener = (event: ApiEvent, reconnected: boolean) => void;
type StreamStatus = {connected: boolean; cursor: string | null; error: Error | null; available: boolean | null};
type Subscription = {listener: Listener; notify?: () => void};
type Stream = {subscriptions: Set<Subscription>; flows: number; restart: () => void; controller: AbortController; status: StreamStatus; ready?: ApiEvent};
const diagnosticKinds: EventKind[] = ['runtime.updated', 'operation.updated', 'generation.changed', 'flow.updated', 'flow.gap'];
const streams = new Map<Api, Stream>();
const initialStatus: StreamStatus = {connected: false, cursor: null, error: null, available: null};
export function eventStatus(api: Api) {
  return streams.get(api)?.status ?? initialStatus;
}
export function subscribeEvents(api: Api, listener: Listener, notify?: () => void, flows = false) {
  let stream = streams.get(api);
  const created = !stream;
  if (!stream) {
    stream = {subscriptions: new Set(), flows: flows ? 1 : 0, restart: () => {}, controller: new AbortController(), status: initialStatus};
    streams.set(api, stream);
    const shared = stream;
    const update = (change: Partial<StreamStatus>) => {
      if (shared.controller.signal.aborted) return;
      if (Object.entries(change).every(([key, value]) => shared.status[key as keyof StreamStatus] === value)) return;
      shared.status = {...shared.status, ...change};
      shared.subscriptions.forEach(({notify}) => notify?.());
    };
    let failed = false;
    let capabilityError = false;
    let current: Capabilities | undefined;
    let connection: AbortController | undefined;
    const changed = (force = false) => {
      if (shared.controller.signal.aborted) return;
      if (force) {
        failed = true;
        shared.ready = undefined;
        update({connected: false, cursor: null, error: null});
      }
      const state = capabilities.getSnapshot();
      if (state.error) {
        failed = true;
        capabilityError = true;
        update({error: state.error});
      } else if (capabilityError && connection) {
        // A refetch that returns what was already held keeps the same object, so it is cleared here.
        capabilityError = false;
        update({error: null});
      }
      if (!state.data || (!force && state.data === current)) return;
      const unchanged = state.data.resources.events.available === current?.resources.events.available;
      current = state.data;
      if (!force && unchanged && (connection || !current.resources.events.available)) return;
      connection?.abort();
      connection = undefined;
      update({available: current.resources.events.available, connected: false, error: null});
      if (!current.resources.events.available) return;
      const controller = new AbortController();
      connection = controller;
      void api
        .subscribeEvents({
          // Explicit flow kinds request recording; an unfiltered stream receives warnings passively.
          kinds: shared.flows ? diagnosticKinds : undefined,
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
            shared.subscriptions.forEach(({listener}) => {
              if (!controller.signal.aborted) listener(event, reconnected);
            });
          }
        })
        .catch(reason => {
          if (!controller.signal.aborted) {
            connection = undefined;
            refuseCredentials(api, reason);
            update({connected: false, error: reason instanceof Error ? reason : new Error(String(reason))});
          }
        });
    };
    const capabilities = watchResource(
      api,
      {key: ['capabilities'], every: 0, retryErrors: true, followEvents: false, fetch: signal => api.capabilities(signal)},
      changed
    );
    shared.restart = () => changed(true);
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
  const shared = stream;
  const subscription = {listener, notify};
  shared.subscriptions.add(subscription);
  if (!created && flows && ++shared.flows === 1) shared.restart();
  else if (shared.ready) listener(shared.ready, false);
  return () => {
    if (!shared.subscriptions.delete(subscription)) return;
    if (flows) shared.flows--;
    if (!shared.subscriptions.size) {
      shared.controller.abort();
      streams.delete(api);
    } else if (flows && shared.flows === 0) shared.restart();
  };
}
export function useEvents(onEvent: Listener, flows = false) {
  const api = getApi();
  const callback = useRef(onEvent);
  useEffect(() => {
    callback.current = onEvent;
  });
  const subscribe = useCallback(
    (notify: () => void) => subscribeEvents(api, (event, reconnected) => callback.current(event, reconnected), notify, flows),
    [api, flows]
  );
  const getSnapshot = useCallback(() => eventStatus(api), [api]);
  return useSyncExternalStore(subscribe, getSnapshot);
}
