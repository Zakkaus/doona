import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {createMockApi} from '../api/mock';
import {ApiError} from '../api/error';
import {normalizeResourceKey} from '../api/inflight';
import {capabilities} from '../api/mock/fixtures';
import {eventStatus, historyLost, reopenEvents, subscribeEvents} from './events';
import {refetchResource, watchResource} from './resourceCore';
import type {ApiEvent, EventOptions} from '../api/model';

const disposers: Array<() => void> = [];
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('document', Object.assign(new EventTarget(), {hidden: false}));
});
afterEach(() => {
  disposers.splice(0).forEach(dispose => dispose());
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('shares visibility-aware capability recovery even when events are unavailable', async () => {
  Object.assign(document, {hidden: true});
  const api = createMockApi();
  const recovered = structuredClone(capabilities);
  recovered.resources.events.available = false;
  api.capabilities = vi
    .fn()
    .mockRejectedValueOnce(new ApiError(503, '', 'offline'))
    .mockResolvedValue(recovered);
  api.subscribeEvents = vi.fn();
  const resource = watchResource(api, {key: ['capabilities'], every: 0, retryErrors: true, fetch: signal => api.capabilities(signal)}, () => {});
  disposers.push(
    resource.dispose,
    subscribeEvents(api, () => {})
  );
  await vi.advanceTimersByTimeAsync(10000);
  expect(api.capabilities).not.toHaveBeenCalled();
  Object.assign(document, {hidden: false});
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(0);
  expect(resource.getSnapshot().error).toMatchObject({status: 503});
  Object.assign(document, {hidden: true});
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(1000);
  Object.assign(document, {hidden: false});
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(3999);
  expect(api.capabilities).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(resource.getSnapshot()).toMatchObject({data: recovered, error: null});
  expect(eventStatus(api)).toMatchObject({available: false, error: null});
  expect(api.subscribeEvents).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(60000);
  expect(api.capabilities).toHaveBeenCalledTimes(2);
});

it.each(['capabilities', 'stream'] as const)('keeps a terminal %s refusal until explicit refresh', async endpoint => {
  const api = createMockApi();
  api.capabilities = vi.fn().mockResolvedValue(capabilities);
  api.subscribeEvents = vi.fn().mockRejectedValue(new ApiError(403, 'permission_denied', 'forbidden'));
  if (endpoint === 'capabilities') vi.mocked(api.capabilities).mockRejectedValue(new ApiError(401, 'unauthorized', 'unauthorized'));
  disposers.push(subscribeEvents(api, () => {}));
  await vi.advanceTimersByTimeAsync(60000);
  expect(api.capabilities).toHaveBeenCalledTimes(1);
  expect(api.subscribeEvents).toHaveBeenCalledTimes(endpoint === 'stream' ? 1 : 0);
  expect(eventStatus(api).error).toMatchObject({status: endpoint === 'stream' ? 403 : 401});
});

it('starts from capabilities already loaded by a mounted consumer without another probe', async () => {
  const api = createMockApi();
  api.capabilities = vi.fn().mockResolvedValue(capabilities);
  api.subscribeEvents = vi.fn().mockResolvedValue(undefined);
  const resource = watchResource(api, {key: ['capabilities'], every: 0, retryErrors: true, fetch: signal => api.capabilities(signal)}, () => {});
  disposers.push(resource.dispose);
  await vi.advanceTimersByTimeAsync(0);
  disposers.push(subscribeEvents(api, () => {}));
  expect(api.subscribeEvents).toHaveBeenCalledTimes(1);
  expect(api.capabilities).toHaveBeenCalledTimes(1);
});

it('refreshes capabilities on generation and reconnect without replacing a healthy stream', async () => {
  const api = createMockApi();
  let options!: EventOptions;
  api.subscribeEvents = vi.fn(async value => {
    options = value;
    value.onConnectionChange?.(true);
    value.onEvent({id: 'ready', event: 'stream.ready', data: {instance_id: 'first', observed_at: ''}});
  });
  api.capabilities = vi.fn(async () => structuredClone(capabilities));
  const resource = watchResource(api, {key: ['capabilities'], every: 0, fetch: signal => api.capabilities(signal)}, () => {});
  disposers.push(
    resource.dispose,
    subscribeEvents(api, () => {})
  );
  await vi.advanceTimersByTimeAsync(0);
  await resource.refetch();
  expect(api.subscribeEvents).toHaveBeenCalledTimes(1);
  expect(options.heartbeatSeconds).toBe(capabilities.resources.events.heartbeat_seconds);
  expect(eventStatus(api).connected).toBe(true);
  const changed = structuredClone(capabilities);
  changed.resources.probes.limits!.max_members_per_job = 3;
  vi.mocked(api.capabilities).mockResolvedValue(changed);
  options.onEvent({
    id: 'generation',
    event: 'generation.changed',
    data: {instance_id: 'first', observed_at: '', generation_id: 'new', previous_generation_id: 'old'}
  });
  await vi.advanceTimersByTimeAsync(2000);
  expect(resource.getSnapshot().data?.resources.probes.limits?.max_members_per_job).toBe(3);
  expect(api.subscribeEvents).toHaveBeenCalledTimes(1);
  const replaced = structuredClone(changed);
  replaced.resources.geodata.can_update = false;
  vi.mocked(api.capabilities).mockResolvedValue(replaced);
  options.onEvent({id: 'reconnected', event: 'stream.ready', data: {instance_id: 'second', observed_at: ''}});
  await vi.advanceTimersByTimeAsync(0);
  expect(resource.getSnapshot().data?.resources.geodata.can_update).toBe(false);
  expect(api.subscribeEvents).toHaveBeenCalledTimes(1);
  const unavailable = structuredClone(replaced);
  unavailable.resources.events.available = false;
  vi.mocked(api.capabilities).mockResolvedValue(unavailable);
  await resource.refetch();
  expect(options.signal?.aborted).toBe(true);
  expect(eventStatus(api)).toMatchObject({available: false, connected: false});
});

it('leaves history and connection polling on their own cadence under runtime heartbeats', async () => {
  const api = createMockApi();
  let options!: EventOptions;
  api.subscribeEvents = async value => {
    options = value;
  };
  const fetches = ['trafficHistory', 'memoryHistory', 'connections'].map(name => {
    const fetch = vi.fn(async () => name);
    const resource = watchResource(
      api,
      {key: [name as 'trafficHistory' | 'memoryHistory' | 'connections'], every: 5000, fetch, events: listener => subscribeEvents(api, listener)},
      () => {}
    );
    disposers.push(resource.dispose);
    return fetch;
  });
  await vi.advanceTimersByTimeAsync(0);
  for (let second = 0; second < 15; second++) {
    options.onEvent({id: String(second), event: 'runtime.updated', data: {instance_id: 'first', observed_at: '', href: '/api/v1/runtime'}});
    await vi.advanceTimersByTimeAsync(1000);
  }
  for (const fetch of fetches) expect(fetch).toHaveBeenCalledTimes(4);
});

it('clears a capabilities error once a refetch succeeds while the stream stays up', async () => {
  const api = createMockApi();
  api.capabilities = vi
    .fn()
    .mockResolvedValueOnce(structuredClone(capabilities))
    .mockRejectedValueOnce(new ApiError(500, 'internal', 'boom'))
    .mockResolvedValue(structuredClone(capabilities));
  let emit: EventOptions['onEvent'] = () => {};
  api.subscribeEvents = vi.fn(async ({onEvent, onConnectionChange, signal}: EventOptions) => {
    emit = onEvent;
    onConnectionChange?.(true);
    onEvent({id: 'c1', event: 'stream.ready', data: {instance_id: 'i', observed_at: '2026-09-23T00:00:00Z'}} as never);
    await new Promise(resolve => signal?.addEventListener('abort', resolve));
  });
  disposers.push(subscribeEvents(api, () => {}));
  await vi.advanceTimersByTimeAsync(10);
  const data = {instance_id: 'i', observed_at: '2026-09-23T00:00:01Z', previous_generation_id: 'g1', generation_id: 'g2'};
  emit({id: 'c2', event: 'generation.changed', data} as never);
  await vi.advanceTimersByTimeAsync(3000);
  expect(eventStatus(api).error).toMatchObject({status: 500});
  await vi.advanceTimersByTimeAsync(60000);
  expect(api.subscribeEvents).toHaveBeenCalledTimes(1);
  expect(eventStatus(api)).toMatchObject({connected: true, error: null});
});

it('marks the ready event that follows an expired cursor as lost history, also for late subscribers', async () => {
  const api = createMockApi();
  let options!: EventOptions;
  api.subscribeEvents = vi.fn(async (value: EventOptions) => {
    options = value;
    await new Promise(resolve => value.signal?.addEventListener('abort', resolve));
  });
  const received: ApiEvent[] = [];
  disposers.push(subscribeEvents(api, event => received.push(event)));
  await vi.advanceTimersByTimeAsync(0);
  const data = {instance_id: 'i', observed_at: '2026-09-23T00:00:00Z'};
  options.onEvent({id: 'r1', event: 'stream.ready', data});
  options.onCursorExpired?.();
  options.onEvent({id: 'r2', event: 'stream.ready', data});
  // Resuming right after it repeats its id and replaces it in the feeds, so the mark carries over.
  options.onEvent({id: 'r2', event: 'stream.ready', data});
  options.onEvent({id: 'r3', event: 'stream.ready', data});
  expect(received.map(historyLost)).toEqual([false, true, true, false]);
  const late: ApiEvent[] = [];
  disposers.push(subscribeEvents(api, event => late.push(event), undefined, true));
  expect(late.map(historyLost)).toEqual([false, true, true, false]);
});

it('clears a recovered capabilities error when events are unavailable', async () => {
  const api = createMockApi();
  const unavailable = structuredClone(capabilities);
  unavailable.resources.events.available = false;
  api.capabilities = vi
    .fn()
    .mockResolvedValueOnce(unavailable)
    .mockRejectedValueOnce(new ApiError(500, 'internal', 'boom'))
    .mockResolvedValue(structuredClone(unavailable));
  api.subscribeEvents = vi.fn();
  disposers.push(subscribeEvents(api, () => {}));
  await vi.advanceTimersByTimeAsync(0);
  void refetchResource(api, normalizeResourceKey(['capabilities']));
  await vi.advanceTimersByTimeAsync(0);
  expect(eventStatus(api).error).toMatchObject({status: 500});
  await vi.advanceTimersByTimeAsync(5000);
  expect(api.capabilities).toHaveBeenCalledTimes(3);
  expect(eventStatus(api)).toMatchObject({available: false, error: null});
});

it('reopens a refused stream on retry after the capabilities are read again', async () => {
  const api = createMockApi();
  api.capabilities = vi.fn().mockResolvedValue(capabilities);
  api.subscribeEvents = vi
    .fn()
    .mockRejectedValueOnce(new ApiError(403, 'permission_denied', 'forbidden'))
    .mockImplementation(({signal}: EventOptions) => new Promise(resolve => signal?.addEventListener('abort', resolve)));
  disposers.push(subscribeEvents(api, () => {}));
  await vi.advanceTimersByTimeAsync(0);
  expect(eventStatus(api).error).toMatchObject({status: 403});
  await refetchResource(api, normalizeResourceKey(['capabilities']));
  expect(api.subscribeEvents).toHaveBeenCalledTimes(1);
  reopenEvents(api);
  await vi.advanceTimersByTimeAsync(0);
  expect(api.subscribeEvents).toHaveBeenCalledTimes(2);
  expect(eventStatus(api).error).toBeNull();
});

it('keeps a stream refusal that follows a capabilities error once the capabilities recover', async () => {
  const api = createMockApi();
  api.capabilities = vi
    .fn()
    .mockResolvedValueOnce(structuredClone(capabilities))
    .mockRejectedValueOnce(new ApiError(500, 'internal', 'boom'))
    .mockResolvedValue(structuredClone(capabilities));
  let refuse: (reason: Error) => void = () => {};
  api.subscribeEvents = vi.fn(() => new Promise<void>((_, reject) => (refuse = reject)));
  disposers.push(subscribeEvents(api, () => {}));
  await vi.advanceTimersByTimeAsync(0);
  void refetchResource(api, normalizeResourceKey(['capabilities']));
  await vi.advanceTimersByTimeAsync(0);
  expect(eventStatus(api).error).toMatchObject({status: 500});
  refuse(new ApiError(403, 'permission_denied', 'forbidden'));
  await vi.advanceTimersByTimeAsync(5000);
  expect(api.capabilities).toHaveBeenCalledTimes(3);
  expect(eventStatus(api).error).toMatchObject({status: 403});
});
