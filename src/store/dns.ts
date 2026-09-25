import {useCallback} from 'react';
import {getApi} from '../api/index';
import type {Api} from '../api/api';
import {ApiError} from '../api/error';
import type {Capabilities, DnsCacheList} from '../api/model';
import {wait} from '../api/wait';
import {pageSize, useResource, walk} from './resource';
import {useAction} from './action';
import {useCapabilities} from './runtime';
import {offered} from '../api/capabilities';
// honk's own default page: enough records for the statistics and the log's first screen, and a size one response
// carries even when the answers are long.
const DNS_LOG_PAGE = 100;
export function dnsLogLimit(capabilities: Capabilities | undefined) {
  const advertised = pageSize(capabilities, capabilities?.resources.dns_log.max_page_size);
  return advertised === undefined ? undefined : Math.min(DNS_LOG_PAGE, advertised);
}
// honk before the short-page fix refuses a DNS page whose answers exceed its response budget with a 503 instead of
// ending the page early, and the refusal repeats however long the client waits. After the wait it asks for, the page
// is asked for once more at a quarter of the size. Resolves to the page and the limit that produced it.
export async function smallerOnRefusal<Q extends {limit?: number}, P>(
  fetch: (query: Q) => Promise<P>,
  query: Q,
  signal?: AbortSignal
): Promise<{page: P; limit: number | undefined}> {
  try {
    return {page: await fetch(query), limit: query.limit};
  } catch (error) {
    const {limit} = query;
    const refused = error instanceof ApiError && error.status === 503 && error.code === 'temporarily_unavailable' && error.retryAfter !== null;
    if (!refused || limit === undefined || limit < 2) throw error;
    await wait(error.retryAfter!, signal);
    const smaller = Math.ceil(limit / 4);
    return {page: await fetch({...query, limit: smaller}), limit: smaller};
  }
}
// The whole cache, summaries only; once a page is refused the rest of the walk keeps the smaller size.
export function dnsCacheListing(api: Api, signal?: AbortSignal) {
  let limit = 1000;
  return walk(
    async cursor => {
      const result = await smallerOnRefusal(query => api.dnsCache(query, signal), {cursor, limit, detail: 'summary' as const}, signal);
      limit = result.limit!;
      return result.page;
    },
    (acc: DnsCacheList | undefined, page) => {
      if (!acc) return {...page, entries: [...page.entries]};
      acc.entries.push(...page.entries);
      return acc;
    }
  );
}
export function useDnsFlush() {
  const api = getApi();
  const {busy, run, cancel} = useAction<'flush'>({rethrow: true});
  return {busy: busy !== null, cancel, flush: useCallback(() => run('flush', signal => api.flushDnsCache(signal)), [api, run])};
}
export function useDnsLog(query: {name?: string; type?: string; src?: string}, enabled = true) {
  const api = getApi();
  const name = query.name?.trim() || undefined;
  const type = query.type && query.type !== 'all' ? query.type : undefined;
  const src = query.src?.trim() || undefined;
  const capabilities = useCapabilities().data;
  const limit = dnsLogLimit(capabilities);
  const resource = useResource(
    {
      key: ['dnsLog', {name, type, src, limit}],
      // The page keeps the limit it was served at, so what reads it compares against what was actually asked for.
      fetch: async signal => {
        const result = await smallerOnRefusal(query => api.dnsLog(query, signal), {name, type: type as never, src, limit}, signal);
        return {...result.page, limit: result.limit};
      }
    },
    {enabled}
  );
  return {...resource, limit: resource.data ? resource.data.limit : limit};
}
const USAGE_EVERY = 60000;
// Every page of the listing repeats the whole cache's usage. The backend keeps a snapshot for each listing read, so
// the usage card reuses a walk from the last minute rather than asking for a second snapshot.
const walks = new WeakMap<Api, {at: number; list: DnsCacheList}>();
export async function walkCache(api: Api, signal: AbortSignal) {
  const list = await dnsCacheListing(api, signal);
  walks.set(api, {at: Date.now(), list: {...list, entries: []}});
  return list;
}
// Otherwise one entry is enough to read the usage and coverage.
export function readCacheUsage(api: Api, signal: AbortSignal): Promise<DnsCacheList> {
  const recent = walks.get(api);
  if (recent && Date.now() - recent.at < USAGE_EVERY) return Promise.resolve(recent.list);
  return api.dnsCache({limit: 1, detail: 'summary'}, signal);
}
function useDnsCache(enabled = true, paused = false) {
  const api = getApi();
  return useResource(
    {
      key: ['dnsCache'],
      // The backend retains a snapshot per listing for its cursors and refuses a ninth within half a minute.
      every: 15000,
      // The cache table shows no answers, so the summary listing, which leaves them out, is enough.
      fetch: signal => walkCache(api, signal)
    },
    {enabled, paused}
  );
}
export function useDnsCacheUsage(enabled = true, paused = false) {
  const api = getApi();
  return useResource({key: ['dnsCache', {usage: true}], every: USAGE_EVERY, fetch: signal => readCacheUsage(api, signal)}, {enabled, paused});
}
// Paused, the listing keeps what it last read and walks the cache again only once it is resumed.
export function useDnsControl(paused = false) {
  const api = getApi();
  const capabilities = useCapabilities();
  const resources = capabilities.data?.resources;
  const cache = useDnsCache(offered(resources, 'dns_cache', {whileLoading: false}) && !!resources?.dns_cache.read, paused);
  const {refetch} = cache;
  const {busy, error, run, cancel} = useAction<string>({rethrow: true});
  return {
    capabilities,
    cache,
    busy,
    error,
    cancel,
    remove: useCallback(
      (id: string) =>
        run(id, async signal => {
          const value = await api.deleteDnsEntry(id, signal);
          refetch();
          return value;
        }),
      [api, run, refetch]
    ),
    flush: useCallback(
      () =>
        run('flush', async signal => {
          const value = await api.flushDnsCache(signal);
          refetch();
          return value;
        }),
      [api, run, refetch]
    )
  };
}
