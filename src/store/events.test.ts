import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {createMockApi} from '../api/mock';
import {ApiError} from '../api/error';
import {capabilities} from '../api/mock/fixtures';
import {eventStatus, subscribeEvents} from './events';
import {watchResource} from './resource';

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
  const resource = watchResource(
    api,
    {key: ['capabilities'], every: 0, retryErrors: true, followEvents: false, fetch: signal => api.capabilities(signal)},
    () => {}
  );
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
  const resource = watchResource(
    api,
    {key: ['capabilities'], every: 0, retryErrors: true, followEvents: false, fetch: signal => api.capabilities(signal)},
    () => {}
  );
  disposers.push(resource.dispose);
  await vi.advanceTimersByTimeAsync(0);
  disposers.push(subscribeEvents(api, () => {}));
  expect(api.subscribeEvents).toHaveBeenCalledTimes(1);
  expect(api.capabilities).toHaveBeenCalledTimes(1);
});
