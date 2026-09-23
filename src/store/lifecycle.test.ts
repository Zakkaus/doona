import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import * as apiSelection from '../api/index';
import type {Api} from '../api/api';
import {normalizeResourceKey, type ResourceKey} from '../api/inflight';
import {createMockApi} from '../api/mock';
import {version} from '../api/mock/fixtures';
import type {Version} from '../api/model';
import {refetchAll, watchResource as subscribeResource} from './resource';

vi.mock('./events', () => ({subscribeEvents: () => () => {}}));

function watchResource(
  {api, key, every}: {api: Api; key: ResourceKey; every: number},
  fetch: (signal: AbortSignal) => Promise<Version>,
  publish: (state: {data: Version | undefined; loading: boolean; error: Error | null}) => void
) {
  const resource = subscribeResource(api, {key, every, fetch}, () => publish(resource.getSnapshot()));
  if (resource.getSnapshot().loading) publish(resource.getSnapshot());
  return resource;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return {promise, resolve, reject};
}

const visibility = Object.assign(new EventTarget(), {hidden: false});
const disposers: Array<() => void> = [];
beforeEach(() => {
  vi.useFakeTimers();
  visibility.hidden = false;
  vi.stubGlobal('document', visibility);
});
afterEach(() => {
  disposers.splice(0).forEach(dispose => dispose());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function hide(hidden: boolean) {
  visibility.hidden = hidden;
  visibility.dispatchEvent(new Event('visibilitychange'));
}

function consumer(every = 5000) {
  const api = createMockApi();
  vi.spyOn(apiSelection, 'getApi').mockReturnValue(api);
  const response = deferred<Version>();
  const fetch = vi.spyOn(api, 'version').mockImplementation(() => response.promise);
  const publish = vi.fn();
  const key = {api, key: ['version'] as ResourceKey, every};
  const watcher = watchResource(key, signal => api.version(signal), publish);
  disposers.push(watcher.dispose);
  return {api, key, response, fetch, publish, ...watcher};
}

it('shows loading only until data exists and keeps refresh promises pending through success and failure', async () => {
  const resource = consumer(0);
  expect(resource.publish).toHaveBeenLastCalledWith({data: undefined, loading: true, error: null});
  resource.response.resolve(version);
  await vi.advanceTimersByTimeAsync(0);
  resource.publish.mockClear();
  const next = deferred<Version>();
  resource.fetch.mockImplementation(() => next.promise);
  const done = vi.fn();
  const refresh = resource.refetch()!.then(done);
  await vi.advanceTimersByTimeAsync(5000);
  expect(done).not.toHaveBeenCalled();
  expect(resource.publish).not.toHaveBeenCalled();
  const updated = {...version, engine: {...version.engine, version: 'next'}};
  next.resolve(updated);
  await refresh;
  expect(resource.publish).toHaveBeenLastCalledWith({data: updated, loading: false, error: null});

  const failure = deferred<Version>();
  resource.fetch.mockImplementation(() => failure.promise);
  const allDone = vi.fn();
  const all = refetchAll().then(allDone);
  await vi.advanceTimersByTimeAsync(5000);
  expect(allDone).not.toHaveBeenCalled();
  const single = resource.refetch();
  const error = new Error('Offline');
  failure.reject(error);
  await all;
  await expect(single).resolves.toEqual({key: normalizeResourceKey(['version']), ok: false, error});
  expect(allDone).toHaveBeenCalledExactlyOnceWith([{key: normalizeResourceKey(['version']), ok: false, error}]);
  expect(resource.publish).toHaveBeenLastCalledWith({data: updated, loading: false, error});
  resource.fetch.mockResolvedValue(updated);
  await refetchAll();
  expect(resource.publish).toHaveBeenLastCalledWith({data: updated, loading: false, error: null});
});

it('starts a changed key in loading state and ignores a disposed key’s late response', async () => {
  const resource = consumer();
  await vi.advanceTimersByTimeAsync(0);
  resource.dispose();
  expect(resource.fetch.mock.calls[0][0]!.aborted).toBe(true);
  const next = deferred<Version>();
  const publish = vi.fn();
  const replacement = watchResource({...resource.key, key: ['version', {id: 'new'}]}, () => next.promise, publish);
  disposers.push(replacement.dispose);
  expect(publish).toHaveBeenLastCalledWith({data: undefined, loading: true, error: null});
  resource.publish.mockClear();
  resource.response.resolve(version);
  await vi.advanceTimersByTimeAsync(10000);
  expect(resource.publish).not.toHaveBeenCalled();
  expect(publish).toHaveBeenCalledOnce();
  next.resolve(version);
  await vi.advanceTimersByTimeAsync(0);
  expect(publish).toHaveBeenLastCalledWith({data: version, loading: false, error: null});
});

it('does not carry data across keys or flash loading when remounting a remembered key', async () => {
  const resource = consumer();
  resource.response.resolve(version);
  await vi.advanceTimersByTimeAsync(0);
  resource.dispose();
  const next = deferred<Version>();
  const publish = vi.fn();
  const changed = watchResource({...resource.key, key: ['version', {id: 'new'}]}, () => next.promise, publish);
  disposers.push(changed.dispose);
  expect(publish).toHaveBeenLastCalledWith({data: undefined, loading: true, error: null});
  changed.dispose();
  publish.mockClear();
  const remembered = watchResource(resource.key, () => next.promise, publish);
  disposers.push(remembered.dispose);
  await vi.advanceTimersByTimeAsync(0);
  expect(publish).not.toHaveBeenCalled();
  const before = remembered.getSnapshot();
  next.resolve(structuredClone(version));
  await vi.advanceTimersByTimeAsync(0);
  // An equal response keeps the remembered snapshot rather than publishing a copy.
  expect(publish).not.toHaveBeenCalled();
  expect(remembered.getSnapshot()).toBe(before);
  expect(before).toEqual({data: version, loading: false, error: null});
});

it.each([1000, 4000])('keeps the poll deadline for an event at %i ms, within one interval of the last fetch', async eventAt => {
  const resource = consumer();
  resource.response.resolve(version);
  await vi.advanceTimersByTimeAsync(0);
  resource.publish.mockClear();
  const next = deferred<Version>();
  resource.fetch.mockImplementation(() => next.promise);
  await vi.advanceTimersByTimeAsync(eventAt);
  resource.invalidate(false);
  await vi.advanceTimersByTimeAsync(500);
  resource.invalidate(false);
  const due = 5000;
  await vi.advanceTimersByTimeAsync(due - eventAt - 501);
  expect(resource.fetch).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(resource.fetch).toHaveBeenCalledTimes(2);
  expect(resource.publish).not.toHaveBeenCalled();
  next.resolve(version);
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(4999);
  expect(resource.fetch).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1);
  expect(resource.fetch).toHaveBeenCalledTimes(3);
});

it('answers a burst of events with one fetch per poll interval', async () => {
  const resource = consumer();
  resource.response.resolve(version);
  await vi.advanceTimersByTimeAsync(0);
  for (let at = 0; at < 10000; at += 250) {
    resource.invalidate(false);
    await vi.advanceTimersByTimeAsync(250);
    expect(resource.fetch).toHaveBeenCalledTimes(1 + Math.floor((at + 250) / 5000));
  }
});

it('brings a slow poll forward within five seconds of an event, and no more often during a burst', async () => {
  const resource = consumer(30000);
  resource.response.resolve(version);
  await vi.advanceTimersByTimeAsync(0);
  resource.invalidate(false);
  await vi.advanceTimersByTimeAsync(4999);
  expect(resource.fetch).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(resource.fetch).toHaveBeenCalledTimes(2);
  for (let at = 0; at < 20000; at += 250) {
    resource.invalidate(false);
    await vi.advanceTimersByTimeAsync(250);
  }
  expect(resource.fetch).toHaveBeenCalledTimes(6);
});

it.each(['manual', 'reconnect'] as const)('%s refresh clears an armed invalidation and resets polling', async trigger => {
  const resource = consumer();
  resource.response.resolve(version);
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(1000);
  resource.invalidate(false);
  await vi.advanceTimersByTimeAsync(500);
  if (trigger === 'manual') await refetchAll();
  else resource.invalidate(true);
  await vi.advanceTimersByTimeAsync(0);
  expect(resource.fetch).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(4999);
  expect(resource.fetch).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1);
  expect(resource.fetch).toHaveBeenCalledTimes(3);
});

it('follows a fetch that was in flight during invalidations with one more fetch, never overlapping', async () => {
  const resource = consumer(0);
  await vi.advanceTimersByTimeAsync(1000);
  resource.invalidate(false);
  await vi.advanceTimersByTimeAsync(1000);
  resource.invalidate(true);
  await vi.advanceTimersByTimeAsync(10000);
  expect(resource.fetch).toHaveBeenCalledTimes(1);
  // The running request may predate the change; the follow-up comes once, coalesced, after it settles.
  resource.response.resolve(version);
  await vi.advanceTimersByTimeAsync(1999);
  expect(resource.fetch).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(resource.fetch).toHaveBeenCalledTimes(2);
  // A non-polling resource then rests.
  await vi.advanceTimersByTimeAsync(60000);
  expect(resource.fetch).toHaveBeenCalledTimes(2);
});

it('suspends polls and event bursts while hidden and refreshes once when visible', async () => {
  const resource = consumer();
  resource.response.resolve(version);
  await vi.advanceTimersByTimeAsync(0);
  hide(true);
  await vi.advanceTimersByTimeAsync(15000);
  resource.invalidate(false);
  resource.invalidate(true);
  await vi.advanceTimersByTimeAsync(15000);
  expect(resource.fetch).toHaveBeenCalledTimes(1);
  hide(false);
  hide(false);
  await vi.advanceTimersByTimeAsync(0);
  expect(resource.fetch).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(4999);
  expect(resource.fetch).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1);
  expect(resource.fetch).toHaveBeenCalledTimes(3);
});

it('refreshes a hidden non-polling resource only when invalidated, and permits manual refresh while hidden', async () => {
  const resource = consumer(0);
  resource.response.resolve(version);
  await vi.advanceTimersByTimeAsync(0);
  hide(true);
  hide(false);
  await vi.advanceTimersByTimeAsync(10000);
  expect(resource.fetch).toHaveBeenCalledTimes(1);
  resource.invalidate(false);
  hide(true);
  await vi.advanceTimersByTimeAsync(10000);
  expect(resource.fetch).toHaveBeenCalledTimes(1);
  hide(false);
  await vi.advanceTimersByTimeAsync(0);
  expect(resource.fetch).toHaveBeenCalledTimes(2);
  hide(true);
  resource.invalidate(false);
  await refetchAll();
  expect(resource.fetch).toHaveBeenCalledTimes(3);
  hide(false);
  await vi.advanceTimersByTimeAsync(10000);
  expect(resource.fetch).toHaveBeenCalledTimes(3);
});

it('does not resume disposed consumers on visibility changes, timers or global refresh', async () => {
  const resource = consumer();
  resource.response.resolve(version);
  await vi.advanceTimersByTimeAsync(0);
  resource.invalidate(false);
  hide(true);
  resource.dispose();
  hide(false);
  await refetchAll();
  await vi.advanceTimersByTimeAsync(10000);
  expect(resource.fetch).toHaveBeenCalledTimes(1);
});

it.each(['success', 'failure'] as const)('explicit refresh during initial %s waits for one follow-up response', async outcome => {
  const resource = consumer(0);
  await vi.advanceTimersByTimeAsync(0);
  const next = deferred<Version>();
  resource.fetch.mockImplementation(() => next.promise);
  const done = vi.fn();
  const refresh = resource.refetch()!.then(done);
  const joined = resource.refetch();
  if (outcome === 'success') resource.response.resolve(version);
  else resource.response.reject(new Error('Offline'));
  await vi.advanceTimersByTimeAsync(0);
  expect(resource.fetch).toHaveBeenCalledTimes(2);
  expect(done).not.toHaveBeenCalled();
  const updated = {...version, engine: {...version.engine, version: 'after-write'}};
  next.resolve(updated);
  await Promise.all([refresh, joined]);
  expect(done).toHaveBeenCalledOnce();
  expect(resource.publish).toHaveBeenLastCalledWith({data: updated, loading: false, error: null});
  await vi.advanceTimersByTimeAsync(60000);
  expect(resource.fetch).toHaveBeenCalledTimes(2);
});

it('disposal cancels a queued explicit refresh', async () => {
  const resource = consumer(0);
  await vi.advanceTimersByTimeAsync(0);
  const refresh = resource.refetch();
  resource.dispose();
  resource.response.resolve(version);
  await refresh;
  expect(resource.fetch).toHaveBeenCalledTimes(1);
});

it('keeps the snapshot across equal polls and publishes a change or a recovery', async () => {
  const api = createMockApi();
  vi.spyOn(apiSelection, 'getApi').mockReturnValue(api);
  const replies: Array<() => Promise<Version>> = [
    () => Promise.resolve(structuredClone(version)),
    () => Promise.resolve(structuredClone(version)),
    () => Promise.reject(new Error('down')),
    () => Promise.resolve(structuredClone(version)),
    () => Promise.resolve({...structuredClone(version), engine: {...version.engine, version: '0.9.4'}})
  ];
  const publish = vi.fn();
  const watcher = watchResource({api, key: ['version', {id: 'share'}], every: 5000}, () => replies.shift()!(), publish);
  disposers.push(watcher.dispose);
  await vi.advanceTimersByTimeAsync(0);
  const first = watcher.getSnapshot();
  publish.mockClear();
  await vi.advanceTimersByTimeAsync(5000);
  expect(publish).not.toHaveBeenCalled();
  expect(watcher.getSnapshot()).toBe(first);
  await vi.advanceTimersByTimeAsync(5000);
  expect(watcher.getSnapshot()).toMatchObject({data: first.data, error: {message: 'down'}});
  await vi.advanceTimersByTimeAsync(5000);
  expect(watcher.getSnapshot()).toEqual({data: first.data, loading: false, error: null});
  expect(watcher.getSnapshot().data).toBe(first.data);
  await vi.advanceTimersByTimeAsync(5000);
  const changed = watcher.getSnapshot().data!;
  expect(changed.engine.version).toBe('0.9.4');
  expect(changed.api).toBe(first.data!.api);
  expect(publish).toHaveBeenCalledTimes(3);
});
