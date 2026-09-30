import {afterEach, expect, it, vi} from 'vitest';
import {ApiError} from '../api/error';
import {capabilities} from '../api/mock/fixtures';
import type {Api} from '../api/api';
import type {DnsCacheList, DnsCacheQuery} from '../api/model';
import {createMockApi} from '../api/mock';
import {deleteCacheEntry, dnsCacheListing, dnsLogLimit, flushCache, readCacheUsage, smallerOnRefusal, walkCache, queryTypes} from './dns';

afterEach(() => void vi.useRealTimers());
const budget = (retryAfter: number | null = 1) =>
  new ApiError(503, 'snapshot_unavailable', 'DNS log response exceeds the projection budget', 'r1', null, retryAfter);

it('asks for the backend default page, not the advertised maximum', () => {
  const withPage = (max_page_size: number) => ({
    ...capabilities,
    resources: {...capabilities.resources, dns_log: {...capabilities.resources.dns_log, max_page_size}}
  });
  expect(dnsLogLimit(withPage(500))).toBe(100);
  expect(dnsLogLimit(withPage(40))).toBe(40);
  expect(dnsLogLimit(undefined)).toBeUndefined();
});

it('waits out Retry-After, then asks once for a quarter of the page and reports the limit that answered', async () => {
  vi.useFakeTimers();
  const fetch = vi.fn(async (query: {limit?: number; cursor?: string}) => {
    if (query.limit === 100) throw budget(2);
    return 'page';
  });
  const result = smallerOnRefusal(fetch, {limit: 100, cursor: 'c'});
  await vi.advanceTimersByTimeAsync(1900);
  expect(fetch).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(100);
  await expect(result).resolves.toEqual({page: 'page', limit: 25});
  expect(fetch.mock.calls.map(([query]) => query)).toEqual([
    {limit: 100, cursor: 'c'},
    {limit: 25, cursor: 'c'}
  ]);
  await expect(smallerOnRefusal(async () => 'whole', {limit: 100})).resolves.toEqual({page: 'whole', limit: 100});
});

it('passes on anything but a timed refusal, a second refusal and a page of one', async () => {
  for (const error of [
    new ApiError(500, 'internal', 'boom'),
    budget(null),
    new ApiError(429, 'rate_limited', 'slow down', null, null, 1),
    new ApiError(503, 'temporarily_unavailable', 'other', null, null, 1)
  ]) {
    const fetch = vi.fn(async () => {
      throw error;
    });
    await expect(smallerOnRefusal(fetch, {limit: 100})).rejects.toBe(error);
    expect(fetch).toHaveBeenCalledTimes(1);
  }
  vi.useFakeTimers();
  const refusing = vi.fn(async () => {
    throw budget();
  });
  const twice = expect(smallerOnRefusal(refusing, {limit: 100})).rejects.toMatchObject({status: 503});
  await vi.advanceTimersByTimeAsync(1000);
  await twice;
  expect(refusing).toHaveBeenCalledTimes(2);
  const single = vi.fn(async () => {
    throw budget();
  });
  await expect(smallerOnRefusal(single, {limit: 1})).rejects.toMatchObject({status: 503});
  expect(single).toHaveBeenCalledTimes(1);
});

it('walks the cache at one page size and starts over without a cursor once a snapshot does not fit', async () => {
  vi.useFakeTimers();
  const entry = (id: string) => ({entry_id: id}) as DnsCacheList['entries'][number];
  const page = (ids: string[], next_cursor: string | null) =>
    ({
      observed_at: '2026-09-25T10:00:00Z',
      coverage: {positive: true, negative: true, persistent: false},
      total: 3,
      next_cursor,
      entries: ids.map(entry)
    }) as DnsCacheList;
  const pages: Record<string, DnsCacheList> = {start: page(['a'], 'p2'), p2: page(['b', 'c'], null)};
  let refusals = 1;
  const dnsCache = vi.fn(async (query?: DnsCacheQuery) => {
    if (!query?.cursor && refusals-- > 0) throw new ApiError(503, 'snapshot_unavailable', 'A coherent snapshot is unavailable', 'r1', null, 2);
    return pages[query?.cursor ?? 'start'];
  });
  const listing = dnsCacheListing({dnsCache} as unknown as Api);
  await vi.advanceTimersByTimeAsync(1000);
  expect(dnsCache).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1000);
  expect((await listing).entries.map(item => item.entry_id)).toEqual(['a', 'b', 'c']);
  expect(dnsCache.mock.calls.map(([query]) => [query?.cursor, query?.limit])).toEqual([
    [undefined, 1000],
    [undefined, 1000],
    ['p2', 1000]
  ]);
  // A second refusal in a row is the caller's to show.
  refusals = 2;
  const twice = expect(dnsCacheListing({dnsCache} as unknown as Api)).rejects.toMatchObject({code: 'snapshot_unavailable'});
  await vi.advanceTimersByTimeAsync(2000);
  await twice;
});

it('reads cache usage from a listing walked within the last minute instead of asking again', async () => {
  vi.useFakeTimers();
  const api = createMockApi();
  const listing = vi.spyOn(api, 'dnsCache');
  const signal = new AbortController().signal;
  const cold = await readCacheUsage(api, signal);
  expect(listing).toHaveBeenLastCalledWith({limit: 1, detail: 'summary'}, signal);
  const walked = await walkCache(api, signal);
  const calls = listing.mock.calls.length;
  const usage = await readCacheUsage(api, signal);
  expect(listing).toHaveBeenCalledTimes(calls);
  expect(usage).toMatchObject({usage: walked.usage, coverage: walked.coverage, total: walked.total, entries: []});
  expect(usage.usage).toEqual(cold.usage);
  vi.advanceTimersByTime(60000);
  await readCacheUsage(api, signal);
  expect(listing).toHaveBeenCalledTimes(calls + 1);
  expect(listing).toHaveBeenLastCalledWith({limit: 1, detail: 'summary'}, signal);
});

it('reads cache usage afresh after a flush or a deletion instead of reusing the earlier walk', async () => {
  const api = createMockApi();
  const listing = vi.spyOn(api, 'dnsCache');
  const signal = new AbortController().signal;
  const walked = await walkCache(api, signal);
  await deleteCacheEntry(api, walked.entries[0].entry_id, signal);
  let calls = listing.mock.calls.length;
  expect((await readCacheUsage(api, signal)).total).toBe(walked.total - 1);
  expect(listing).toHaveBeenCalledTimes(calls + 1);
  await walkCache(api, signal);
  await flushCache(api, signal);
  calls = listing.mock.calls.length;
  expect((await readCacheUsage(api, signal)).total).toBe(0);
  expect(listing).toHaveBeenCalledTimes(calls + 1);
});

it('does not keep a walk that started before a flush', async () => {
  const api = createMockApi();
  const signal = new AbortController().signal;
  const listed = api.dnsCache.bind(api);
  let release: () => void = () => {};
  const held = new Promise<void>(resolve => (release = resolve));
  const listing = vi.spyOn(api, 'dnsCache').mockImplementationOnce(async (query, signal) => {
    const page = await listed(query, signal);
    await held;
    return page;
  });
  const walk = walkCache(api, signal);
  await flushCache(api, signal);
  release();
  await walk;
  const calls = listing.mock.calls.length;
  expect((await readCacheUsage(api, signal)).total).toBe(0);
  expect(listing).toHaveBeenCalledTimes(calls + 1);
  expect(listing).toHaveBeenLastCalledWith({limit: 1, detail: 'summary'}, signal);
});

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

it('preserves bypass cache mode and cancellation signal across every record type batch', async () => {
  const api = createMockApi();
  const query = vi.fn(api.dnsQuery);
  const signal = new AbortController().signal;
  const result = await queryTypes(query, 'example.com', ['A', 'AAAA', 'TXT'], 1, signal, 'bypass');
  expect(query.mock.calls).toEqual([
    ['example.com', ['A'], signal, 'bypass'],
    ['example.com', ['AAAA'], signal, 'bypass'],
    ['example.com', ['TXT'], signal, 'bypass']
  ]);
  expect(result.cache_mode).toBe('bypass');
});
