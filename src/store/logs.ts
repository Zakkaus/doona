import {useEffect, useMemo, useRef, useSyncExternalStore} from 'react';
import {getApi} from '../api/index';
import type {ApiEvent, LogLevel, LogRecord} from '../api/model';
import {useEvents} from './events';
import {useCapabilities} from './runtime';
import {createFeed} from './feed';

export const EVENT_FEED_LIMIT = 200;
// Runtime heartbeats arrive every second and would evict every other kind from one bounded ring, so they get a
// ring of their own; the page merges both by time.
const silent = () => () => {};
const none = {records: [] as ApiEvent[]};
// `withRuntime` false leaves the heartbeat ring unsubscribed: the default view hides heartbeats, so a beat every
// second must not re-render and re-sort the page.
export function useEventFeed(withRuntime = true) {
  const feeds = useMemo(
    () => ({
      changes: createFeed<ApiEvent, Record<string, never>>(EVENT_FEED_LIMIT, {}, 'replace'),
      runtime: createFeed<ApiEvent, Record<string, never>>(EVENT_FEED_LIMIT, {}, 'replace')
    }),
    []
  );
  const changes = useSyncExternalStore(feeds.changes.subscribe, feeds.changes.getSnapshot);
  const runtime = useSyncExternalStore(withRuntime ? feeds.runtime.subscribe : silent, withRuntime ? feeds.runtime.getSnapshot : () => none);
  const status = useEvents(event => (event.event === 'runtime.updated' ? feeds.runtime : feeds.changes).append(event));
  const events = useMemo(
    () =>
      runtime.records.length
        ? [...changes.records, ...runtime.records].sort((a, b) => Date.parse(b.data.observed_at) - Date.parse(a.data.observed_at))
        : changes.records,
    [changes.records, runtime.records]
  );
  return {...status, events};
}

export function useLogFeed({level, target, paused, limit = 1000}: {level?: LogLevel; target?: string; paused: boolean; limit?: number}) {
  const api = getApi();
  const capabilities = useCapabilities();
  const available = capabilities.data?.resources.logs.available;
  // A terminal stream error stays until the person asks again; retry reopens the stream and keeps the records.
  const reopen = useRef<() => void>(() => {});
  const stream = useMemo(() => {
    const feed = createFeed<LogRecord & {id: string}, {connected: boolean; error: Error | null}>(limit, {connected: false, error: null}, 'ignore');
    return {
      getSnapshot: feed.getSnapshot,
      clear: feed.clear,
      hold: feed.hold,
      subscribe(notify: () => void) {
        const stopPublishing = feed.subscribe(notify);
        let controller = new AbortController();
        const open = () => {
          controller = new AbortController();
          const {signal} = controller;
          feed.update({error: null});
          if (available)
            void api
              .subscribeLogs({
                level,
                target: target || undefined,
                signal,
                onConnectionChange: connected => {
                  if (!signal.aborted) feed.update({connected});
                },
                onRecord: record => {
                  if (!signal.aborted) feed.append(record);
                }
              })
              .catch((reason: unknown) => {
                if (!signal.aborted) feed.update({error: reason instanceof Error ? reason : new Error(String(reason))});
              });
        };
        open();
        reopen.current = () => {
          controller.abort();
          open();
        };
        return () => {
          controller.abort();
          reopen.current = () => {};
          stopPublishing();
        };
      }
    };
  }, [api, available, level, target, limit]);
  // Pausing freezes the shown list; records collected meanwhile appear on resume.
  useEffect(() => stream.hold(paused), [stream, paused]);
  return {...useSyncExternalStore(stream.subscribe, stream.getSnapshot), available, clear: stream.clear, retry: () => reopen.current()};
}
