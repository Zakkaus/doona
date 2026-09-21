import {afterEach, expect, it, vi} from 'vitest';
import {createMockApi} from '../../api/mock';
import {queryTypes} from './query';
import {ApiError} from '../../api/error';

afterEach(() => vi.useRealTimers());

it('queries every requested type within the advertised bound and preserves all results', async () => {
  const api = createMockApi();
  const types = ['A', 'AAAA', 'MX', 'TXT', 'HTTPS'];
  const batches: string[][] = [];
  const result = await queryTypes(
    async (domain, batch, signal) => {
      expect(batch.length).toBeLessThanOrEqual(2);
      batches.push(batch);
      return api.dnsQuery(domain, batch, signal);
    },
    'example.com',
    types,
    2,
    new AbortController().signal
  );
  expect(batches).toEqual([['A', 'AAAA'], ['MX', 'TXT'], ['HTTPS']]);
  expect(result.results.map(item => item.type)).toEqual(types);
});

it('does not issue another batch or return partial success after cancellation', async () => {
  const api = createMockApi();
  const controller = new AbortController();
  const requested: string[] = [];
  await expect(
    queryTypes(
      async (domain, types) => {
        requested.push(...types);
        const result = await api.dnsQuery(domain, types);
        controller.abort();
        return result;
      },
      'example.com',
      ['A', 'AAAA'],
      1,
      controller.signal
    )
  ).rejects.toMatchObject({name: 'AbortError'});
  expect(requested).toEqual(['A']);
});

it('waits out a refused later batch without losing or repeating completed batches', async () => {
  const api = createMockApi();
  const answer = await api.dnsQuery('example.com', ['A', 'AAAA']);
  vi.useFakeTimers();
  const query = vi
    .fn()
    .mockResolvedValueOnce({...answer, results: [answer.results[0]]})
    .mockRejectedValueOnce(new ApiError(429, 'rate_limited', 'Wait', null, null, 2))
    .mockResolvedValueOnce({...answer, results: [answer.results[1]]});
  const pending = queryTypes(query, 'example.com', ['A', 'AAAA'], 1, new AbortController().signal);
  await vi.advanceTimersByTimeAsync(1999);
  expect(query).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1);
  expect((await pending).results.map(result => result.type)).toEqual(['A', 'AAAA']);
  expect(query.mock.calls.map(call => call[1])).toEqual([['A'], ['AAAA'], ['AAAA']]);
});

it('cancels the refusal wait without issuing another request', async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  const query = vi.fn().mockRejectedValue(new ApiError(503, 'temporarily_unavailable', 'Wait', null, null, 1));
  const pending = queryTypes(query, 'example.com', ['A'], 1, controller.signal);
  const rejected = expect(pending).rejects.toMatchObject({name: 'AbortError'});
  await vi.advanceTimersByTimeAsync(0);
  controller.abort();
  await rejected;
  await vi.advanceTimersByTimeAsync(2000);
  expect(query).toHaveBeenCalledTimes(1);
});

it('bounds transient retries and fails permanent refusals immediately', async () => {
  vi.useFakeTimers();
  const error = new ApiError(503, 'temporarily_unavailable', 'Wait', null, null, 1);
  const query = vi.fn().mockRejectedValue(error);
  const rejected = expect(queryTypes(query, 'example.com', ['A'], 1, new AbortController().signal)).rejects.toBe(error);
  await vi.advanceTimersByTimeAsync(3000);
  await rejected;
  expect(query).toHaveBeenCalledTimes(4);
  const permanent = vi.fn().mockRejectedValue(new ApiError(400, 'invalid_request', 'Invalid'));
  await expect(queryTypes(permanent, 'example.com', ['A'], 1, new AbortController().signal)).rejects.toMatchObject({status: 400});
  expect(permanent).toHaveBeenCalledTimes(1);
});
