import {afterEach, expect, it, vi} from 'vitest';
import {createMockApi} from './index';
import type {ApiEvent, LogRecord} from '../model';

afterEach(() => vi.useRealTimers());

it('rejects unknown cursors before opening either stream', async () => {
  const api = createMockApi();
  const connected = vi.fn();
  const controller = new AbortController();
  const events = api.subscribeEvents({lastEventId: 'unknown', signal: controller.signal, onEvent: vi.fn(), onConnectionChange: connected});
  const logs = api.subscribeLogs({lastEventId: 'unknown', signal: controller.signal, onRecord: vi.fn(), onConnectionChange: connected});
  controller.abort();
  await expect(events).rejects.toMatchObject({status: 409, code: 'event_cursor_expired'});
  await expect(logs).rejects.toMatchObject({status: 409, code: 'event_cursor_expired'});
  expect(connected).not.toHaveBeenCalled();
});

it('binds event cursors to the producing instance and filters and expires evicted history', async () => {
  vi.useFakeTimers();
  const api = createMockApi();
  const events: ApiEvent[] = [];
  const controller = new AbortController();
  const stream = api.subscribeEvents({kinds: ['runtime.updated'], signal: controller.signal, onEvent: event => events.push(event)});
  const cursor = events[0].id;
  await vi.advanceTimersByTimeAsync(5000);
  controller.abort();
  await stream;
  const resumed: ApiEvent[] = [];
  const replay = new AbortController();
  const resumedStream = api.subscribeEvents({kinds: ['runtime.updated'], lastEventId: cursor, signal: replay.signal, onEvent: event => resumed.push(event)});
  expect(resumed.map(event => event.event)).toEqual(['stream.ready', 'runtime.updated']);
  replay.abort();
  await resumedStream;
  await expect(api.subscribeEvents({kinds: ['generation.changed'], lastEventId: cursor, onEvent: vi.fn()})).rejects.toMatchObject({
    code: 'event_cursor_expired'
  });
  await expect(createMockApi().subscribeEvents({kinds: ['runtime.updated'], lastEventId: cursor, onEvent: vi.fn()})).rejects.toMatchObject({
    code: 'event_cursor_expired'
  });
  await vi.advanceTimersByTimeAsync(301000);
  await expect(api.subscribeEvents({kinds: ['runtime.updated'], lastEventId: cursor, onEvent: vi.fn()})).rejects.toMatchObject({code: 'event_cursor_expired'});
});

it('binds log cursors to filters and the retained buffer', async () => {
  const api = createMockApi();
  const records: Array<LogRecord & {id: string}> = [];
  const controller = new AbortController();
  const stream = api.subscribeLogs({level: 'info', signal: controller.signal, onRecord: record => records.push(record)});
  controller.abort();
  await stream;
  const cursor = records[0].id;
  await expect(api.subscribeLogs({level: 'error', lastEventId: cursor, onRecord: vi.fn()})).rejects.toMatchObject({code: 'event_cursor_expired'});
  await expect(api.subscribeLogs({level: 'info', target: 'honk::dns', lastEventId: cursor, onRecord: vi.fn()})).rejects.toMatchObject({
    code: 'event_cursor_expired'
  });
  await api.patchRuntimeSettings({log: {buffered_records: 64}});
  for (let i = 0; i < 65; i++) await api.patchRuntimeSettings({log: {level: 'info'}});
  await expect(api.subscribeLogs({level: 'info', lastEventId: cursor, onRecord: vi.fn()})).rejects.toMatchObject({code: 'event_cursor_expired'});
});
