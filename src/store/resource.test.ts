import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import type {Api} from '../api/api';
import type {ResourceKey} from '../api/inflight';
import {createMockApi} from '../api/mock';
import * as apiSelection from '../api/index';
import {subscribeEvents} from './events';
import {refetchAll, watchResource} from './resource';
import {ApiError} from '../api/error';

vi.mock('./events', () => ({subscribeEvents: vi.fn(() => vi.fn())}));
const disposers: Array<() => void> = [];
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('document', Object.assign(new EventTarget(), {hidden: false}));
});
afterEach(() => {
  disposers.splice(0).forEach(dispose => dispose());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function remember(api: Api, key: ResourceKey, data: unknown) {
  const resource = watchResource(api, {key, every: 0, fetch: async () => data}, () => {});
  await vi.advanceTimersByTimeAsync(0);
  resource.dispose();
}
function recall(api: Api, key: ResourceKey) {
  const resource = watchResource(api, {key, every: 0, fetch: () => new Promise(() => {})}, () => {});
  const data = resource.getSnapshot().data;
  resource.dispose();
  return data;
}

it('evicts the oldest of 33 parameterised entries without evicting an unparameterised resource', async () => {
  const api = createMockApi();
  await remember(api, ['version'], 'version');
  for (let id = 0; id < 33; id++) await remember(api, ['flow', {id}], id);
  expect(recall(api, ['flow', {id: 0}])).toBeUndefined();
  for (let id = 1; id < 33; id++) expect(recall(api, ['flow', {id}])).toBe(id);
  expect(recall(api, ['version'])).toBe('version');
});

it('drops an inactive snapshot a minute after its last subscriber leaves', async () => {
  const api = createMockApi();
  await remember(api, ['version'], 'version');
  await remember(api, ['flow', {id: 1}], 1);
  await vi.advanceTimersByTimeAsync(30000);
  // A visit in between starts the minute again.
  expect(recall(api, ['version'])).toBe('version');
  await vi.advanceTimersByTimeAsync(30000);
  expect(recall(api, ['flow', {id: 1}])).toBeUndefined();
  expect(recall(api, ['version'])).toBe('version');
  await vi.advanceTimersByTimeAsync(60000);
  expect(recall(api, ['version'])).toBeUndefined();
});

it('refreshes recency on reads and writes without counting an overwrite twice', async () => {
  const api = createMockApi();
  for (let id = 0; id < 32; id++) await remember(api, ['flow', {id}], id);
  expect(recall(api, ['flow', {id: 0}])).toBe(0);
  await remember(api, ['flow', {id: 1}], 'updated');
  expect(recall(api, ['flow', {id: 2}])).toBe(2);
  await remember(api, ['flow', {id: 32}], 32);
  expect(recall(api, ['flow', {id: 3}])).toBeUndefined();
  expect(recall(api, ['flow', {id: 0}])).toBe(0);
  expect(recall(api, ['flow', {id: 1}])).toBe('updated');
  expect(recall(api, ['flow', {id: 2}])).toBe(2);
});

it('keeps each backend’s capacity and responses independent', async () => {
  const first = createMockApi();
  const second = createMockApi();
  for (let id = 0; id < 32; id++) {
    await remember(first, ['flow', {id}], `first:${id}`);
    await remember(second, ['flow', {id}], `second:${id}`);
  }
  await remember(first, ['flow', {id: 32}], 'first:32');
  expect(recall(first, ['flow', {id: 0}])).toBeUndefined();
  for (let id = 0; id < 32; id++) expect(recall(second, ['flow', {id}])).toBe(`second:${id}`);
  expect(recall(second, ['flow', {id: 32}])).toBeUndefined();
});

it('shares staggered mounts, manual refresh and polling until the last subscriber leaves', async () => {
  const api = createMockApi();
  vi.spyOn(apiSelection, 'getApi').mockReturnValue(api);
  const fetch = vi.fn().mockResolvedValue('initial');
  const resource = {key: ['flow', {id: 'one', absent: undefined}] as ResourceKey, every: 5000, fetch};
  const first = watchResource(api, resource, vi.fn());
  disposers.push(first.dispose);
  await vi.advanceTimersByTimeAsync(1000);
  const notify = vi.fn();
  const second = watchResource(api, {...resource, key: ['flow', {id: 'one'}]}, notify);
  disposers.push(second.dispose);
  expect(second.getSnapshot()).toBe(first.getSnapshot());
  expect(second.getSnapshot().data).toBe('initial');
  expect(fetch).toHaveBeenCalledTimes(1);
  fetch.mockResolvedValue('refreshed');
  await first.refetch();
  expect(second.getSnapshot().data).toBe('refreshed');
  expect(notify).toHaveBeenCalledOnce();
  expect(await refetchAll()).toEqual([{key: '["flow",[["id","one"]]]', ok: true}]);
  expect(fetch).toHaveBeenCalledTimes(3);
  first.dispose();
  await vi.advanceTimersByTimeAsync(5000);
  expect(fetch).toHaveBeenCalledTimes(4);
  second.dispose();
  await refetchAll();
  await vi.advanceTimersByTimeAsync(10000);
  expect(fetch).toHaveBeenCalledTimes(4);
});

it('retains active parameterised snapshots outside the inactive LRU and cancels only the last lease', async () => {
  const api = createMockApi();
  let signal: AbortSignal | undefined;
  const fetch = vi.fn(async () => 'active');
  const resource = {key: ['flow', {id: 'active'}] as ResourceKey, every: 0, fetch};
  const first = watchResource(api, resource, () => {});
  const second = watchResource(api, resource, () => {});
  disposers.push(first.dispose, second.dispose);
  await vi.advanceTimersByTimeAsync(0);
  for (let id = 0; id < 33; id++) await remember(api, ['flow', {id}], id);
  expect(second.getSnapshot().data).toBe('active');
  fetch.mockImplementation(() => new Promise(() => {}));
  const pending = watchResource(
    api,
    {
      key: ['version'],
      fetch: next => {
        signal = next;
        return new Promise(() => {});
      }
    },
    () => {}
  );
  disposers.push(pending.dispose);
  const joined = watchResource(api, {key: ['version'], fetch: async () => 'unused'}, () => {});
  disposers.push(joined.dispose);
  await vi.advanceTimersByTimeAsync(0);
  pending.dispose();
  expect(signal?.aborted).toBe(false);
  joined.dispose();
  expect(signal?.aborted).toBe(true);
});

it('keeps refresh outcomes scoped to the selected backend and includes failures without an error renderer', async () => {
  const api = createMockApi();
  const other = createMockApi();
  vi.spyOn(apiSelection, 'getApi').mockReturnValue(api);
  const error = new Error('offline');
  const first = watchResource(
    api,
    {
      key: ['version'],
      every: 0,
      fetch: async () => {
        throw error;
      }
    },
    () => {}
  );
  const second = watchResource(api, {key: ['runtime'], every: 0, fetch: async () => 'ok'}, () => {});
  const foreign = vi.fn().mockResolvedValue('other');
  const third = watchResource(other, {key: ['version'], every: 0, fetch: foreign}, () => {});
  disposers.push(first.dispose, second.dispose, third.dispose);
  await vi.advanceTimersByTimeAsync(0);
  expect(await refetchAll()).toEqual([
    {key: '["version",[]]', ok: false, error},
    {key: '["runtime",[]]', ok: true}
  ]);
  expect(foreign).toHaveBeenCalledOnce();
});

it('coalesces one event subscription for consumers sharing a resource', async () => {
  const api = createMockApi();
  vi.mocked(subscribeEvents).mockClear();
  const fetch = vi.fn().mockResolvedValue('value');
  const descriptor = {key: ['runtime'] as ResourceKey, every: 0, fetch};
  const first = watchResource(api, descriptor, () => {});
  const second = watchResource(api, descriptor, () => {});
  disposers.push(first.dispose, second.dispose);
  await vi.advanceTimersByTimeAsync(0);
  const listener = vi.mocked(subscribeEvents).mock.calls[0][1];
  listener({id: 'event', event: 'runtime.updated', data: {instance_id: 'engine', href: '/api/v1/runtime', observed_at: ''}}, false);
  await vi.advanceTimersByTimeAsync(2000);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(second.getSnapshot()).toBe(first.getSnapshot());
  expect(subscribeEvents).toHaveBeenCalledOnce();
});

it('waits out a 503 for the backend’s Retry-After before it surfaces, and keeps polling after', async () => {
  const api = createMockApi();
  let calls = 0;
  const fetch = async () => {
    calls++;
    if (calls <= 2) throw new ApiError(503, 'temporarily_unavailable', 'DNS observation is temporarily unavailable', null, null, 3);
    if (calls === 4) throw new ApiError(500, 'internal', 'broken');
    return 'entries';
  };
  const resource = watchResource(api, {key: ['dnsCache'], every: 15000, fetch}, () => {});
  disposers.push(resource.dispose);
  await vi.advanceTimersByTimeAsync(0);
  // The refusal is not shown; the retry comes after three seconds, not fifteen.
  expect(resource.getSnapshot().error).toBeNull();
  await vi.advanceTimersByTimeAsync(2999);
  expect(calls).toBe(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(calls).toBe(2);
  await vi.advanceTimersByTimeAsync(3000);
  expect(calls).toBe(3);
  expect(resource.getSnapshot()).toMatchObject({data: 'entries', error: null});
  // A plain failure shows at once, and the poll goes on at its own pace.
  await vi.advanceTimersByTimeAsync(15000);
  expect(calls).toBe(4);
  expect(resource.getSnapshot().error?.message).toBe('broken');
  await vi.advanceTimersByTimeAsync(15000);
  expect(calls).toBe(5);
  expect(resource.getSnapshot()).toMatchObject({data: 'entries', error: null});
});

it('shows a 503 that persists past three retries', async () => {
  const api = createMockApi();
  let calls = 0;
  const fetch = async () => {
    calls++;
    throw new ApiError(503, 'temporarily_unavailable', 'not now', null, null, 1);
  };
  const resource = watchResource(api, {key: ['dnsCache'], every: 15000, fetch}, () => {});
  disposers.push(resource.dispose);
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(3000);
  expect(calls).toBe(4);
  expect(resource.getSnapshot().error?.message).toBe('not now');
});

it('preserves the fourth refusal floor after exposing the error, including queued and manual refresh', async () => {
  let reject!: (error: Error) => void;
  const fetch = vi
    .fn()
    .mockRejectedValueOnce(new ApiError(429, 'rate_limited', 'wait', null, null, 30))
    .mockRejectedValueOnce(new ApiError(429, 'rate_limited', 'wait', null, null, 30))
    .mockRejectedValueOnce(new ApiError(429, 'rate_limited', 'wait', null, null, 30))
    .mockImplementationOnce(
      () =>
        new Promise((_, no) => {
          reject = no;
        })
    )
    .mockResolvedValue('ready');
  const resource = watchResource(createMockApi(), {key: ['runtime'], every: 5000, fetch}, () => {});
  disposers.push(resource.dispose);
  await vi.advanceTimersByTimeAsync(90000);
  const queued = resource.refetch();
  reject(new ApiError(429, 'rate_limited', 'wait', null, null, 30));
  await vi.advanceTimersByTimeAsync(0);
  expect(resource.getSnapshot().error).toMatchObject({status: 429});
  resource.invalidate(true);
  const manual = resource.refetch();
  await vi.advanceTimersByTimeAsync(29999);
  expect(fetch).toHaveBeenCalledTimes(4);
  await vi.advanceTimersByTimeAsync(1);
  await expect(queued).resolves.toMatchObject({ok: true});
  await expect(manual).resolves.toMatchObject({ok: true});
  expect(fetch).toHaveBeenCalledTimes(5);
});

it('answers a refresh asked during the hold with the outcome of the retry', async () => {
  const api = createMockApi();
  let calls = 0;
  const fetch = async () => {
    calls++;
    if (calls === 1) throw new ApiError(503, 'temporarily_unavailable', 'not now', null, null, 2);
    return 'entries';
  };
  const resource = watchResource(api, {key: ['dnsCache'], every: 0, fetch}, () => {});
  disposers.push(resource.dispose);
  await vi.advanceTimersByTimeAsync(0);
  const asked = resource.refetch();
  await vi.advanceTimersByTimeAsync(1999);
  expect(calls).toBe(1);
  await vi.advanceTimersByTimeAsync(1);
  await expect(asked).resolves.toMatchObject({ok: true});
  expect(calls).toBe(2);
  expect(resource.getSnapshot()).toMatchObject({data: 'entries', error: null});
});

it('honours a hold across polls, refreshes and invalidations', async () => {
  const fetch = vi
    .fn()
    .mockRejectedValueOnce(new ApiError(503, 'temporarily_unavailable', 'wait', null, null, 3))
    .mockResolvedValue('ready');
  const resource = watchResource(createMockApi(), {key: ['runtime'], every: 100, fetch}, () => {});
  disposers.push(resource.dispose);
  await vi.advanceTimersByTimeAsync(0);
  const complete = vi.fn();
  const refresh = resource.refetch().then(complete);
  resource.invalidate(false);
  resource.invalidate(true);
  await vi.advanceTimersByTimeAsync(2999);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(complete).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  await refresh;
  expect(complete).toHaveBeenCalledWith({key: '["runtime",[]]', ok: true});
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('defers an initial automatic load and a held retry while hidden, resuming each once', async () => {
  Object.assign(document, {hidden: true});
  const fetch = vi
    .fn()
    .mockRejectedValueOnce(new ApiError(503, 'temporarily_unavailable', 'wait', null, null, 2))
    .mockResolvedValue('ready');
  const resource = watchResource(createMockApi(), {key: ['runtime'], every: 0, fetch}, () => {});
  disposers.push(resource.dispose);
  await vi.advanceTimersByTimeAsync(5000);
  expect(fetch).not.toHaveBeenCalled();
  Object.assign(document, {hidden: false});
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(0);
  const refresh = resource.refetch();
  Object.assign(document, {hidden: true});
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(5000);
  expect(fetch).toHaveBeenCalledTimes(1);
  Object.assign(document, {hidden: false});
  document.dispatchEvent(new Event('visibilitychange'));
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(0);
  await expect(refresh).resolves.toMatchObject({ok: true});
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('cancels the hold and settles a waiting refresh on disposal', async () => {
  const fetch = vi.fn().mockRejectedValue(new ApiError(503, 'temporarily_unavailable', 'wait', null, null, 2));
  const resource = watchResource(createMockApi(), {key: ['runtime'], fetch}, () => {});
  await vi.advanceTimersByTimeAsync(0);
  const refresh = resource.refetch();
  resource.dispose();
  await expect(refresh).resolves.toMatchObject({ok: false, error: {name: 'AbortError'}});
  expect(vi.getTimerCount()).toBe(0);
  await vi.advanceTimersByTimeAsync(5000);
  expect(fetch).toHaveBeenCalledTimes(1);
});
