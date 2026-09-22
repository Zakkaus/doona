import {expect, it, vi} from 'vitest';
import {createMockApi} from '../../api/mock';
import {queryTypes} from './query';
import {ApiError} from '../../api/error';

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

// Refusals are waited out by the API client for every dns/query request; the batching layer neither retries
// nor swallows them, so a refused later batch surfaces after exactly one attempt per batch.
it('surfaces a refused later batch without repeating completed batches', async () => {
  const api = createMockApi();
  const answer = await api.dnsQuery('example.com', ['A', 'AAAA']);
  const refusal = new ApiError(429, 'rate_limited', 'Wait', null, null, 2);
  const query = vi
    .fn()
    .mockResolvedValueOnce({...answer, results: [answer.results[0]]})
    .mockRejectedValueOnce(refusal);
  await expect(queryTypes(query, 'example.com', ['A', 'AAAA'], 1, new AbortController().signal)).rejects.toBe(refusal);
  expect(query.mock.calls.map(call => call[1])).toEqual([['A'], ['AAAA']]);
});

it('fails permanent refusals immediately', async () => {
  const permanent = vi.fn().mockRejectedValue(new ApiError(400, 'invalid_request', 'Invalid'));
  await expect(queryTypes(permanent, 'example.com', ['A'], 1, new AbortController().signal)).rejects.toMatchObject({status: 400});
  expect(permanent).toHaveBeenCalledTimes(1);
});
