import {useEffect, useMemo, useRef, useSyncExternalStore} from 'react';
import {getApi} from '../index';
import type {ApiEvent, LogLevel, LogRecord} from '../model';
import {eventStatus, subscribeEvents} from './events';
import {useCapabilities} from './runtime';
import {createFeed} from './feed';

export const EVENT_FEED_LIMIT = 200;
export function useEventFeed() {
  const api = getApi();
  const stream = useMemo(() => {
    const feed = createFeed<ApiEvent, typeof status>(EVENT_FEED_LIMIT, status, 'replace');
    return {
      getSnapshot: feed.getSnapshot,
      subscribe(notify: () => void) {
        const stopPublishing = feed.subscribe(notify);
        const stopStream = subscribeEvents(api, feed.append, () => feed.update(eventStatus(api)));
        feed.update(eventStatus(api));
        return () => {
          stopStream();
          stopPublishing();
        };
      }
    };
  }, [api]);
  const {records: events, ...state} = useSyncExternalStore(stream.subscribe, stream.getSnapshot);
  return {...state, events};
}
const status = {connected: false, cursor: null as string | null, error: null as Error | null, available: null as boolean | null};

export function useLogFeed({level, target, paused, limit = 1000}: {level?: LogLevel; target?: string; paused: boolean; limit?: number}) {
  const api = getApi();
  const capabilities = useCapabilities();
  const available = capabilities.data?.resources.logs.available;
  const hold = useRef(paused);
  useEffect(() => {
    hold.current = paused;
  }, [paused]);
  const stream = useMemo(() => {
    const feed = createFeed<LogRecord & {id: string}, {connected: boolean; error: Error | null}>(limit, {connected: false, error: null}, 'ignore');
    return {
      getSnapshot: feed.getSnapshot,
      clear: feed.clear,
      subscribe(notify: () => void) {
        const stopPublishing = feed.subscribe(notify);
        const controller = new AbortController();
        if (available)
          void api
            .subscribeLogs({
              level,
              target: target || undefined,
              signal: controller.signal,
              onConnectionChange: connected => {
                if (!controller.signal.aborted) feed.update({connected});
              },
              onRecord: record => {
                if (!controller.signal.aborted && !hold.current) feed.append(record);
              }
            })
            .catch((reason: unknown) => {
              if (!controller.signal.aborted) feed.update({error: reason instanceof Error ? reason : new Error(String(reason))});
            });
        return () => {
          controller.abort();
          stopPublishing();
        };
      }
    };
  }, [api, available, level, target, limit]);
  return {...useSyncExternalStore(stream.subscribe, stream.getSnapshot), available, clear: stream.clear};
}
