import {useCallback, useEffect, useRef, useState} from 'react';
import {getApi} from '../index';
import type {ApiEvent, LogLevel, LogRecord} from '../model';
import {useEvents} from './events';
import {useCapabilities} from './runtime';
// How many events the feed keeps; the page's caption quotes the same number.
export const EVENT_FEED_LIMIT = 200;
export function useEventFeed() {
  const api = getApi();
  const [events, setEvents] = useState<ApiEvent[]>([]);
  const [previousApi, setPreviousApi] = useState(api);
  if (previousApi !== api) {
    setPreviousApi(api);
    setEvents([]);
  }
  const status = useEvents(event => setEvents(previous => [event, ...previous.filter(item => item.id !== event.id)].slice(0, EVENT_FEED_LIMIT)));
  return {...status, events};
}
// The engine's log stream, newest first, bounded; filters restart the stream from the ring. Paused keeps the
// stream open but stops appending, so the list can be read.
export function useLogFeed({level, target, paused, limit = 1000}: {level?: LogLevel; target?: string; paused: boolean; limit?: number}) {
  const api = getApi();
  const capabilities = useCapabilities();
  const available = capabilities.data?.resources.logs.available;
  const [records, setRecords] = useState<Array<LogRecord & {id: string}>>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  // A filter change starts a new stream; the list is emptied during render, not inside the effect.
  const [filterKey, setFilterKey] = useState({api, level, target});
  if (filterKey.api !== api || filterKey.level !== level || filterKey.target !== target) {
    setFilterKey({api, level, target});
    setRecords([]);
    setError(null);
  }
  const hold = useRef(paused);
  useEffect(() => {
    hold.current = paused;
  }, [paused]);
  useEffect(() => {
    if (!available) return;
    const controller = new AbortController();
    api
      .subscribeLogs({
        level,
        target: target || undefined,
        signal: controller.signal,
        onConnectionChange: setConnected,
        onRecord: record => {
          if (hold.current) return;
          // A resumed stream may replay the record the cursor pointed at; the id keeps it single.
          setRecords(previous => (previous.some(item => item.id === record.id) ? previous : [record, ...previous].slice(0, limit)));
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason : new Error(String(reason)));
      });
    return () => controller.abort();
  }, [api, available, level, target, limit]);
  return {records, connected, error, available, clear: useCallback(() => setRecords([]), [])};
}
