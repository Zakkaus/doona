import {stubVisibleDocument} from './testHelpers';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {createMockApi} from '../../mock';
import {ApiError} from '../api/error';
import {normalizeResourceKey} from '../api/inflight';
import {capabilities} from '../../mock/fixtures';
import {eventStatus, historyLost, holdFlowDemand, reopenEvents, subscribeEvents, wantsFlowDemand} from './events';
import {refetchResource, watchResource} from './resourceCore';
import type {ApiEvent, EventOptions} from '../api/model';

const disposers: Array<() => void> = [];
const ready = (id: string): ApiEvent => ({id, event: 'stream.ready', data: {instance_id: 'i', observed_at: ''}});
const pending = () => new Promise<void>(() => {});
function watchConfig(api: ReturnType<typeof createMockApi>, fetch: () => Promise<unknown>) {
  const resource = watchResource(
    api,
    {key: ['config'], every: 0, fetch, events: (listener, onBaseline) => subscribeEvents(api, listener, {onBaseline})},
    () => {}
  );
  disposers.push(resource.dispose);
}

beforeEach(() => {
  vi.useFakeTimers();
  stubVisibleDocument();
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
      {
        key: [name as 'trafficHistory' | 'memoryHistory' | 'connections'],
        every: 5000,
        fetch,
        events: (listener, onBaseline) => subscribeEvents(api, listener, {onBaseline})
      },
      () => {}
    );
    disposers.push(resource.dispose);
    return fetch;
  });
  await vi.advanceTimersByTimeAsync(0);
  options.onEvent(ready('r0'));
  for (let second = 0; second < 15; second++) {
    options.onEvent({id: String(second), event: 'runtime.updated', data: {instance_id: 'first', observed_at: '', href: '/api/v1/runtime'}});
    await vi.advanceTimersByTimeAsync(1000);
  }
  for (const fetch of fetches) expect(fetch).toHaveBeenCalledTimes(4);
});

// The KVM lab saw one Activity tab read the capabilities every 2.5 s, once per runtime heartbeat. Over 100 s of
// heartbeats the first read is the only one; a generation change and a reconnect each add exactly one.
it('reads the capabilities once under runtime heartbeats and again only on generation change or reconnect', async () => {
  const api = createMockApi();
  let options!: EventOptions;
  api.subscribeEvents = async value => {
    options = value;
  };
  api.capabilities = vi.fn(async () => structuredClone(capabilities));
  const consumer = watchResource(api, {key: ['capabilities'], every: 0, retryErrors: true, fetch: signal => api.capabilities(signal)}, () => {});
  disposers.push(
    consumer.dispose,
    subscribeEvents(api, () => {})
  );
  await vi.advanceTimersByTimeAsync(0);
  options.onEvent(ready('r0'));
  const data = {instance_id: 'first', observed_at: ''};
  for (let tick = 0; tick < 40; tick++) {
    options.onEvent({id: `t${tick}`, event: 'runtime.updated', data: {...data, href: '/api/v1/runtime'}});
    await vi.advanceTimersByTimeAsync(2500);
  }
  expect(api.capabilities).toHaveBeenCalledTimes(1);
  options.onEvent({id: 'g', event: 'generation.changed', data: {...data, generation_id: 'new', previous_generation_id: 'old'}});
  await vi.advanceTimersByTimeAsync(5000);
  expect(api.capabilities).toHaveBeenCalledTimes(2);
  options.onEvent(ready('r1'));
  await vi.advanceTimersByTimeAsync(5000);
  expect(api.capabilities).toHaveBeenCalledTimes(3);
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
  disposers.push(subscribeEvents(api, event => late.push(event), {replayRecent: true}));
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

it('reads a baseline after the first stream.ready and applies the events that arrive during it afterwards', async () => {
  const api = createMockApi();
  const opened: EventOptions[] = [];
  api.subscribeEvents = vi.fn((value: EventOptions) => (opened.push(value), pending()));
  let settle: (value: string) => void = () => {};
  const fetch = vi.fn(() => new Promise<string>(resolve => (settle = resolve)));
  watchConfig(api, fetch);
  await vi.advanceTimersByTimeAsync(0);
  expect(api.subscribeEvents).toHaveBeenCalledOnce();
  expect(fetch).not.toHaveBeenCalled();
  opened[0].onEvent(ready('r1'));
  await vi.advanceTimersByTimeAsync(0);
  expect(fetch).toHaveBeenCalledOnce();
  opened[0].onEvent({id: 'g1', event: 'generation.changed', data: {instance_id: 'i', observed_at: '', previous_generation_id: 'a', generation_id: 'b'}});
  settle('first');
  await vi.advanceTimersByTimeAsync(2000);
  expect(fetch).toHaveBeenCalledTimes(2);
  settle('second');
  await vi.advanceTimersByTimeAsync(60000);
  expect(fetch).toHaveBeenCalledTimes(2);
  // A later ready may follow a gap, so it reads once more.
  opened[0].onEvent(ready('r2'));
  settle('third');
  await vi.advanceTimersByTimeAsync(10000);
  expect(fetch).toHaveBeenCalledTimes(3);
});

it('reads at once where the backend offers no stream', async () => {
  const api = createMockApi();
  const unavailable = structuredClone(capabilities);
  unavailable.resources.events.available = false;
  api.capabilities = vi.fn().mockResolvedValue(unavailable);
  const fetch = vi.fn(async () => 'config');
  watchConfig(api, fetch);
  await vi.advanceTimersByTimeAsync(0);
  expect(fetch).toHaveBeenCalledOnce();
});

it('polls event-only resources while the stream stays silent, and stops once it is ready', async () => {
  const api = createMockApi();
  const opened: EventOptions[] = [];
  api.subscribeEvents = vi.fn((value: EventOptions) => (opened.push(value), pending()));
  let value = 'first';
  const fetch = vi.fn(async () => value);
  const resource = watchResource(
    api,
    {key: ['config'], every: 0, fetch, events: (listener, onBaseline) => subscribeEvents(api, listener, {onBaseline})},
    () => {}
  );
  disposers.push(resource.dispose);
  await vi.advanceTimersByTimeAsync(4999);
  expect(fetch).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(resource.getSnapshot().data).toBe('first');
  value = 'changed';
  await vi.advanceTimersByTimeAsync(30000);
  expect(resource.getSnapshot().data).toBe('changed');
  // The ready that arrives late reads once more; the stream then carries the changes.
  opened[0].onEvent(ready('r1'));
  await vi.advanceTimersByTimeAsync(0);
  expect(fetch).toHaveBeenCalledTimes(3);
  await vi.advanceTimersByTimeAsync(120000);
  expect(fetch).toHaveBeenCalledTimes(3);
});

it('carries flow demand on the shared stream and reads again what the filter change may have held back', async () => {
  const api = createMockApi();
  const opened: EventOptions[] = [];
  api.subscribeEvents = vi.fn((value: EventOptions) => (opened.push(value), pending()));
  const config = vi.fn(async () => 'config');
  const flows = vi.fn(async () => 'flows');
  watchConfig(api, config);
  const flowList = watchResource(
    api,
    {key: ['flows'], every: 0, fetch: flows, events: (listener, onBaseline) => subscribeEvents(api, listener, {onBaseline})},
    () => {}
  );
  disposers.push(flowList.dispose);
  await vi.advanceTimersByTimeAsync(0);
  opened[0].onEvent(ready('r1'));
  await vi.advanceTimersByTimeAsync(0);
  const first = holdFlowDemand(api);
  const second = holdFlowDemand(api);
  await vi.advanceTimersByTimeAsync(0);
  expect(api.subscribeEvents).toHaveBeenCalledTimes(2);
  expect(opened[0].signal?.aborted).toBe(true);
  expect(opened[1]).toMatchObject({kinds: capabilities.resources.events.kinds, lastEventId: 'r1'});
  opened[1].onEvent(ready('r1'));
  await vi.advanceTimersByTimeAsync(10000);
  expect(config).toHaveBeenCalledOnce();
  expect(flows).toHaveBeenCalledTimes(2);
  first();
  await vi.advanceTimersByTimeAsync(0);
  expect(api.subscribeEvents).toHaveBeenCalledTimes(2);
  second();
  // A page that hands the demand to the next one in the same commit does not reconnect.
  holdFlowDemand(api)();
  await vi.advanceTimersByTimeAsync(0);
  expect(api.subscribeEvents).toHaveBeenCalledTimes(3);
  expect(opened[2]).toMatchObject({kinds: undefined, lastEventId: 'r1'});
});

it('reports a refused flow-demand stream like any other refusal', async () => {
  const api = createMockApi();
  api.subscribeEvents = vi.fn(({kinds}: EventOptions) => (kinds ? Promise.reject(new ApiError(429, 'rate_limited', 'too many streams')) : pending()));
  disposers.push(holdFlowDemand(api));
  await vi.advanceTimersByTimeAsync(0);
  expect(api.subscribeEvents).toHaveBeenCalledOnce();
  expect(eventStatus(api).error).toMatchObject({status: 429});
});

it('asks for flows only where the backend offers them and may send a flow event', () => {
  const resources = structuredClone(capabilities.resources);
  expect(wantsFlowDemand(resources)).toBe(true);
  expect(wantsFlowDemand(undefined)).toBe(false);
  expect(wantsFlowDemand({...resources, events: {...resources.events, kinds: undefined}})).toBe(true);
  expect(wantsFlowDemand({...resources, events: {...resources.events, kinds: ['stream.ready', 'flow.updated']}})).toBe(true);
  expect(wantsFlowDemand({...resources, events: {...resources.events, kinds: ['stream.ready']}})).toBe(false);
  expect(wantsFlowDemand({...resources, events: {...resources.events, available: false}})).toBe(false);
  expect(wantsFlowDemand({...resources, flows: {...resources.flows, available: false}})).toBe(false);
});
