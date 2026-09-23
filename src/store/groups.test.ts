import {afterEach, expect, it, vi} from 'vitest';
import {createMockApi} from '../api/mock';
import {ApiError} from '../api/error';
import {tcpProbe} from './action';
import {probeGroup} from './groups';

afterEach(() => vi.useRealTimers());

it.each([256, 6])('probes every direct member within member and result budgets (%i results)', async maxResults => {
  vi.useFakeTimers();
  const api = createMockApi();
  const caps = await api.capabilities();
  caps.resources.probes.limits!.max_results_per_job = maxResults;
  const group = await api.group('skylink');
  const start = api.startProbe;
  api.startProbe = vi.fn(async (request, signal) => {
    expect(Array.isArray(request.members)).toBe(true);
    expect(request.members.length).toBeLessThanOrEqual(Math.min(64, Math.floor(maxResults / 2)));
    return start(request, signal);
  });
  const result = probeGroup(api, caps, group, new AbortController().signal);
  await vi.runAllTimersAsync();
  const completed = await result;
  expect(new Set(completed.results.map(row => row.member_id))).toEqual(new Set(group.members.map(member => member.id)));
  expect(completed.results).toHaveLength(group.members.length * 2);
  expect(completed.selection_before).toEqual(completed.selection_after);
});

it('rejects oversized direct jobs in mock admission', async () => {
  const api = createMockApi();
  const caps = await api.capabilities();
  const request = tcpProbe(caps, {type: 'group', group_id: 'skylink'})!;
  await expect(api.startProbe(request)).rejects.toMatchObject({status: 413, code: 'request_too_large'});
});

it('retains completed batches and fails the action when a later job is refused', async () => {
  vi.useFakeTimers();
  const api = createMockApi();
  const caps = await api.capabilities();
  const group = await api.group('skylink');
  const start = api.startProbe;
  api.startProbe = vi
    .fn()
    .mockImplementationOnce(start)
    .mockRejectedValue(new ApiError(503, 'unavailable', 'offline'));
  const outcome = probeGroup(api, caps, group, new AbortController().signal).catch(error => error);
  await vi.runAllTimersAsync();
  const error = await outcome;
  expect(error).toBeInstanceOf(Error);
  expect(new Set(error.partialResult.results.map((row: {member_id: string}) => row.member_id))).toEqual(
    new Set(group.members.slice(0, 64).map(member => member.id))
  );
  expect(error).toMatchObject({key: 'ui.operationFailed', detail: null, completed: 64, total: group.members.length, cause: {message: 'offline'}});
  expect(api.startProbe).toHaveBeenCalledTimes(2);
});

it('does not submit the next batch after cancellation', async () => {
  vi.useFakeTimers();
  const api = createMockApi();
  const caps = await api.capabilities();
  const group = await api.group('skylink');
  const controller = new AbortController();
  api.startProbe = vi.fn(api.startProbe);
  const result = probeGroup(api, caps, group, controller.signal).catch(error => error);
  controller.abort();
  await vi.runAllTimersAsync();
  expect(await result).toMatchObject({name: 'AbortError'});
  expect(api.startProbe).toHaveBeenCalledTimes(1);
});
