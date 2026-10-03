import {afterEach, expect, it, vi} from 'vitest';
import {createMockApi} from './index';
import type {ApiEvent, LogRecord} from '../src/api/model';
import {eventKinds} from '../src/api/selectors';

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
  const cursor = events.at(-1)!.id;
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

it('keeps an events cursor when the stream names every kind instead of none', async () => {
  const api = createMockApi();
  const events: ApiEvent[] = [];
  const controller = new AbortController();
  const stream = api.subscribeEvents({signal: controller.signal, onEvent: event => events.push(event)});
  controller.abort();
  await stream;
  const resumed = new AbortController();
  const resumedStream = api.subscribeEvents({kinds: eventKinds, lastEventId: events.at(-1)!.id, signal: resumed.signal, onEvent: vi.fn()});
  resumed.abort();
  await expect(resumedStream).resolves.toBeUndefined();
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

it.each(['succeeded', 'failed'] as const)('bounds finished %s operations without reusing IDs or evicting running jobs', async status => {
  vi.useFakeTimers();
  const {createLifecycle} = await import('./lifecycle');
  const {capabilities} = await import('./fixtures/capabilities');
  const api = createMockApi();
  const {createRecording} = await import('./recording');
  const settings = await api.runtimeSettings();
  const lifecycle = createLifecycle(
    capabilities.resources.logs,
    capabilities.resources.events,
    capabilities.resources.operations,
    await api.runtime(),
    () => settings.log,
    () => '40',
    createRecording(settings)
  );
  const enqueue = () =>
    lifecycle.enqueue('reload', () => {
      if (status === 'failed') throw new Error('reload failed');
      return {active_generation_id: '41', datapath_generation_id: '41'};
    });
  const completed = Array.from({length: 129}, enqueue);
  await vi.advanceTimersByTimeAsync(1000);
  await expect(lifecycle.api.operation(completed[0].operation_id)).rejects.toMatchObject({status: 404});
  await expect(lifecycle.api.operation(completed.at(-1)!.operation_id)).resolves.toMatchObject({status});
  const pending = Array.from({length: 129}, enqueue);
  expect(new Set([...completed, ...pending].map(op => op.operation_id)).size).toBe(258);
  await expect(lifecycle.api.operation(pending[0].operation_id)).resolves.toMatchObject({status: 'running'});
});

it('expires completed operations after their advertised retention', async () => {
  vi.useFakeTimers();
  const api = createMockApi();
  const accepted = await api.startSuspend();
  await vi.advanceTimersByTimeAsync(1000);
  await expect(api.operation(accepted.operation_id)).resolves.toMatchObject({status: 'succeeded'});
  await vi.advanceTimersByTimeAsync(300000);
  await expect(api.operation(accepted.operation_id)).rejects.toMatchObject({status: 404});
});

it("repeats the first stream's opening ready a second later, outside the replay history", async () => {
  vi.useFakeTimers();
  const api = createMockApi();
  const events: ApiEvent[] = [];
  const controller = new AbortController();
  const stream = api.subscribeEvents({kinds: ['runtime.updated'], signal: controller.signal, onEvent: event => events.push(event)});
  const readies = () => events.filter(event => event.event === 'stream.ready');
  const opened = events.length;
  const cursor = events.at(-1)!.id;
  await vi.advanceTimersByTimeAsync(999);
  expect(events).toHaveLength(opened);
  await vi.advanceTimersByTimeAsync(1);
  // The repeat keeps the opening ready's id, so feeds replace that row.
  expect(events[0].event).toBe('stream.ready');
  expect(events.slice(opened)).toEqual([expect.objectContaining({event: 'stream.ready', id: events[0].id})]);
  await vi.advanceTimersByTimeAsync(10000);
  expect(readies()).toHaveLength(2);
  controller.abort();
  await stream;
  const resumed: ApiEvent[] = [];
  const replay = new AbortController();
  const resumedStream = api.subscribeEvents({kinds: ['runtime.updated'], lastEventId: cursor, signal: replay.signal, onEvent: event => resumed.push(event)});
  await vi.advanceTimersByTimeAsync(2000);
  expect(resumed.map(event => event.event)).toEqual(['stream.ready', 'runtime.updated', 'runtime.updated']);
  replay.abort();
  await resumedStream;
});
