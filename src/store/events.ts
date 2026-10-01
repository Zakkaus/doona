import {useCallback, useContext, useEffect, useRef, useSyncExternalStore} from 'react';
import {ResourcePreview} from './preview';
import {getApi} from '../api/index';
import type {Api} from '../api/api';
import type {ApiEvent, Capabilities} from '../api/model';
import {refuseCredentials, watchResource} from './resourceCore';
import {shouldRefetch, type Reconnected} from '../api/invalidation';
import {poll} from './cadence';
import {eventKinds} from '../api/selectors';
type Listener = (event: ApiEvent, reconnected: Reconnected) => void;
type StreamStatus = {connected: boolean; cursor: string | null; error: Error | null; available: boolean | null};
type Stream = {
  listeners: Set<Listener>;
  statuses: Set<() => void>;
  controller: AbortController;
  status: StreamStatus;
  ready?: ApiEvent;
  recent: ApiEvent[];
  // Resources read their baseline after the first `stream.ready`, or at once when no stream is coming.
  baseline: boolean;
  waiters: Set<() => void>;
  // Pages that need the backend to record flows; the stream then names its kinds, which is what asks for them.
  demand: number;
  reopen?: () => void;
  retune?: () => void;
};
const streams = new Map<Api, Stream>();
// The events a page's feed keeps, and so the recent events the stream replays to a feed opened late.
export const EVENT_FEED_LIMIT = 200;
// `stream.ready` events that restarted the stream after its cursor expired: what the backend sent before is lost.
const lostBefore = new WeakSet<ApiEvent>();
export const historyLost = (event: ApiEvent) => lostBefore.has(event);
// A stream that stays silent this long, such as one a proxy buffers, stops holding back the baselines, and the
// resources that follow events alone poll until it is ready.
const READY_WAIT = 5000;
// What flow demand adds to the filter, so what a ready after that change reads again.
const FLOW_KINDS = ['flow.updated', 'flow.gap'] as const;
const initialStatus: StreamStatus = {connected: false, cursor: null, error: null, available: null};
export function eventStatus(api: Api) {
  return streams.get(api)?.status ?? initialStatus;
}
type Options = {notify?: () => void; replayRecent?: boolean; onBaseline?: () => void};
export function subscribeEvents(api: Api, listener: Listener, {notify, replayRecent = false, onBaseline}: Options = {}) {
  let stream = streams.get(api);
  if (!stream) {
    stream = {
      listeners: new Set(),
      statuses: new Set(),
      controller: new AbortController(),
      status: initialStatus,
      recent: [],
      baseline: false,
      waiters: new Set(),
      demand: 0
    };
    streams.set(api, stream);
    const shared = stream;
    const update = (change: Partial<StreamStatus>) => {
      if (Object.entries(change).every(([key, value]) => shared.status[key as keyof StreamStatus] === value)) return;
      shared.status = {...shared.status, ...change};
      shared.statuses.forEach(fn => fn());
    };
    const openBaseline = () => {
      if (shared.baseline) return;
      shared.baseline = true;
      clearTimeout(silent);
      shared.waiters.forEach(fn => fn());
    };
    let nudging: ReturnType<typeof setInterval> | undefined;
    const silent = setTimeout(() => {
      openBaseline();
      nudging = setInterval(() => shared.waiters.forEach(fn => fn()), poll.inventory);
    }, READY_WAIT);
    let expired = false;
    let capabilityError = false;
    let current: Capabilities | undefined;
    let connection: AbortController | undefined;
    let tuned = false;
    // A retune resumes from `lastEventId`, so only what its filter change may have held back is read again.
    const open = (lastEventId?: string) => {
      connection?.abort();
      const controller = new AbortController();
      connection = controller;
      tuned = shared.demand > 0;
      let retuned = lastEventId !== undefined;
      void api
        .subscribeEvents({
          kinds: tuned ? (current!.resources.events.kinds ?? eventKinds) : undefined,
          lastEventId,
          heartbeatSeconds: current!.resources.events.heartbeat_seconds,
          signal: controller.signal,
          onConnectionChange: connected => {
            if (!controller.signal.aborted) update({connected});
          },
          onCursorExpired: () => {
            if (!controller.signal.aborted) expired = true;
          },
          onEvent: event => {
            if (controller.signal.aborted) return;
            let reconnected: Reconnected = false;
            if (event.event === 'stream.ready') {
              // Any other ready after the baselines were read may follow a gap, so they are read again.
              if (shared.baseline) reconnected = retuned && !expired ? FLOW_KINDS : true;
              retuned = false;
              clearInterval(nudging);
              // A resume right after that ready repeats its id and replaces it in the feeds, so it keeps the mark.
              if (expired || (shared.ready && historyLost(shared.ready) && shared.ready.id === event.id)) lostBefore.add(event);
              expired = false;
              shared.ready = event;
              update({cursor: event.id, error: null});
              openBaseline();
            }
            shared.recent.push(event);
            if (shared.recent.length > EVENT_FEED_LIMIT) shared.recent.shift();
            if (shouldRefetch('capabilities', event, reconnected)) capabilities.invalidate(reconnected !== false);
            shared.listeners.forEach(fn => fn(event, reconnected));
          }
        })
        .catch(reason => {
          if (!controller.signal.aborted) {
            connection = undefined;
            capabilityError = false;
            refuseCredentials(api, reason);
            update({connected: false, error: reason instanceof Error ? reason : new Error(String(reason))});
            openBaseline();
          }
        });
    };
    const changed = () => {
      const state = capabilities.getSnapshot();
      if (state.error) {
        capabilityError = true;
        update({error: state.error});
        openBaseline();
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
      connection = undefined;
      update({available: current.resources.events.available, connected: false, error: null});
      if (!current.resources.events.available) openBaseline();
      else open();
    };
    const capabilities = watchResource(api, {key: ['capabilities'], every: 0, retryErrors: true, fetch: signal => api.capabilities(signal)}, changed);
    changed();
    // A refused stream stays closed; an unchanged capabilities read notifies nobody, so a retry reopens it here.
    shared.reopen = () => {
      if (connection || capabilities.getSnapshot().error) return;
      current = undefined;
      changed();
    };
    // Coalesced to a microtask, so a demand handed from one page to the next in one commit does not reconnect.
    shared.retune = () =>
      queueMicrotask(() => {
        if (connection && !shared.controller.signal.aborted && tuned !== shared.demand > 0) open(shared.recent.at(-1)?.id);
      });
    shared.controller.signal.addEventListener(
      'abort',
      () => {
        clearTimeout(silent);
        clearInterval(nudging);
        capabilities.dispose();
        connection?.abort();
      },
      {once: true}
    );
  }
  stream.listeners.add(listener);
  if (notify) stream.statuses.add(notify);
  if (onBaseline) {
    stream.waiters.add(onBaseline);
    if (stream.baseline) onBaseline();
  }
  if (replayRecent) stream.recent.forEach(event => listener(event, false));
  else if (stream.ready) listener(stream.ready, false);
  return () => {
    stream.listeners.delete(listener);
    if (notify) stream.statuses.delete(notify);
    if (onBaseline) stream.waiters.delete(onBaseline);
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
  const preview = useContext(ResourcePreview);
  const api = getApi();
  const callback = useRef(onEvent);
  useEffect(() => {
    callback.current = onEvent;
  });
  const subscribe = useCallback(
    (notify: () => void) => (preview ? () => {} : subscribeEvents(api, (event, reconnected) => callback.current(event, reconnected), {notify, replayRecent})),
    [api, replayRecent, preview]
  );
  const getSnapshot = useCallback(() => eventStatus(api), [api]);
  return useSyncExternalStore(subscribe, getSnapshot);
}
// A backend in `auto` mode records flows only while a stream names flow kinds; a stream without `kinds` does not
// count. The shared stream names all it may send while a page holds the demand, so no second stream is needed.
export function holdFlowDemand(api: Api) {
  const release = subscribeEvents(api, () => {});
  const stream = streams.get(api)!;
  if (!stream.demand++) stream.retune?.();
  let held = true;
  return () => {
    if (!held) return;
    held = false;
    if (!--stream.demand) stream.retune?.();
    release();
  };
}
// Held only where the backend offers flows and an events stream that may carry a flow event; a backend that does not
// list its kinds is asked anyway.
export const wantsFlowDemand = (resources: Capabilities['resources'] | undefined) =>
  resources?.flows.available === true &&
  resources.events.available &&
  (resources.events.kinds?.some(kind => (FLOW_KINDS as readonly string[]).includes(kind)) ?? true);
export function useFlowDemand(resources: Capabilities['resources'] | undefined) {
  const api = getApi();
  const enabled = wantsFlowDemand(resources);
  useEffect(() => (enabled ? holdFlowDemand(api) : undefined), [api, enabled]);
}
