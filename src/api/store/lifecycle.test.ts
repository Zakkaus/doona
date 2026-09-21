import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import * as apiSelection from '../index';
import {normalizeResourceKey} from '../inflight';
import {createMockApi} from '../mock';
import {version} from '../mock/fixtures';
import type {Version} from '../model';
import {refetchAll, watchResource} from './resource';

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
  const key = {api, name: normalizeResourceKey(['version']), every, parameterised: false};
  const watcher = watchResource(key, signal => api.version(signal), publish);
  disposers.push(watcher.dispose);
  return {api, key, response, fetch, publish, ...watcher};
}

it('shows loading only until data exists and keeps refresh promises pending through success and failure', async () => {
  const resource = consumer(0);
  expect(resource.publish).toHaveBeenLastCalledWith({data: undefined, loading: true, error: null});
  resource.response.resolve(version);
  await resource.refetch();
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
  await expect(single).resolves.toBeUndefined();
  expect(allDone).toHaveBeenCalledOnce();
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
  const replacement = watchResource({...resource.key, name: normalizeResourceKey(['version', {id: 'new'}]), parameterised: true}, () => next.promise, publish);
  disposers.push(replacement.dispose);
  expect(publish).toHaveBeenLastCalledWith({data: undefined, loading: true, error: null});
  resource.publish.mockClear();
  resource.response.resolve(version);
  await vi.advanceTimersByTimeAsync(10000);
  expect(resource.publish).not.toHaveBeenCalled();
  expect(publish).toHaveBeenCalledOnce();
  next.resolve(version);
  await replacement.refetch();
  expect(publish).toHaveBeenLastCalledWith({data: version, loading: false, error: null});
});

it('does not carry data across keys or flash loading when remounting a remembered key', async () => {
  const resource = consumer();
  resource.response.resolve(version);
  await resource.refetch();
  resource.dispose();
  const next = deferred<Version>();
  const publish = vi.fn();
  const changed = watchResource({...resource.key, name: normalizeResourceKey(['version', {id: 'new'}]), parameterised: true}, () => next.promise, publish);
  disposers.push(changed.dispose);
  expect(publish).toHaveBeenLastCalledWith({data: undefined, loading: true, error: null});
  changed.dispose();
  publish.mockClear();
  const remembered = watchResource(resource.key, () => next.promise, publish);
  disposers.push(remembered.dispose);
  await vi.advanceTimersByTimeAsync(0);
  expect(publish).not.toHaveBeenCalled();
  next.resolve(version);
  await remembered.refetch();
  expect(publish).toHaveBeenLastCalledWith({data: version, loading: false, error: null});
});

it.each([1000, 4000])('uses the earlier poll or invalidation deadline after an event at %i ms', async eventAt => {
  const resource = consumer();
  resource.response.resolve(version);
  await resource.refetch();
  resource.publish.mockClear();
  const next = deferred<Version>();
  resource.fetch.mockImplementation(() => next.promise);
  await vi.advanceTimersByTimeAsync(eventAt);
  resource.invalidate(false);
  await vi.advanceTimersByTimeAsync(500);
  resource.invalidate(false);
  const due = Math.min(5000, eventAt + 2000);
  await vi.advanceTimersByTimeAsync(due - eventAt - 501);
  expect(resource.fetch).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(resource.fetch).toHaveBeenCalledTimes(2);
  expect(resource.publish).not.toHaveBeenCalled();
  next.resolve(version);
  await resource.refetch();
  await vi.advanceTimersByTimeAsync(4999);
  expect(resource.fetch).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1);
  expect(resource.fetch).toHaveBeenCalledTimes(3);
});

it.each(['manual', 'reconnect'] as const)('%s refresh clears an armed invalidation and resets polling', async trigger => {
  const resource = consumer();
  resource.response.resolve(version);
  await resource.refetch();
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

it('lets an in-flight fetch satisfy invalidations without overlapping or catch-up requests', async () => {
  const resource = consumer();
  await vi.advanceTimersByTimeAsync(1000);
  resource.invalidate(false);
  await vi.advanceTimersByTimeAsync(1000);
  resource.invalidate(true);
  await vi.advanceTimersByTimeAsync(10000);
  expect(resource.fetch).toHaveBeenCalledTimes(1);
  resource.response.resolve(version);
  await resource.refetch();
  await vi.advanceTimersByTimeAsync(4999);
  expect(resource.fetch).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(resource.fetch).toHaveBeenCalledTimes(2);
});

it('suspends polls and event bursts while hidden and refreshes once when visible', async () => {
  const resource = consumer();
  resource.response.resolve(version);
  await resource.refetch();
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
  await resource.refetch();
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
  await resource.refetch();
  resource.invalidate(false);
  hide(true);
  resource.dispose();
  hide(false);
  await refetchAll();
  await vi.advanceTimersByTimeAsync(10000);
  expect(resource.fetch).toHaveBeenCalledTimes(1);
});
