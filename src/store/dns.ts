import {useCallback} from 'react';
import {getApi} from '../api/index';
import type {Api} from '../api/api';
import {ApiError} from '../api/error';
import type {Capabilities, DnsCacheList, DnsLogList, DnsLogQuery} from '../api/model';
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
// honk before the short-page fix refuses a page whose answers exceed its response budget with a 503 instead of
// ending the page early, and the refusal repeats however long the client waits. A quarter of the page is asked for
// once instead.
export async function dnsLogPage(api: Api, query: NonNullable<DnsLogQuery>, signal?: AbortSignal): Promise<DnsLogList> {
  try {
    return await api.dnsLog(query, signal);
  } catch (error) {
    const limit = query.limit;
    if (!(error instanceof ApiError && error.status === 503) || limit === undefined || limit < 2 || signal?.aborted) throw error;
    return api.dnsLog({...query, limit: Math.ceil(limit / 4)}, signal);
  }
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
    {key: ['dnsLog', {name, type, src, limit}], fetch: signal => dnsLogPage(api, {name, type: type as never, src, limit}, signal)},
    {enabled}
  );
  return {...resource, limit};
}
function useDnsCache(enabled = true, paused = false) {
  const api = getApi();
  return useResource(
    {
      key: ['dnsCache'],
      // The backend retains a snapshot per listing for its cursors and refuses a ninth within half a minute.
      every: 15000,
      // The cache table shows no answers, so the summary listing, which leaves them out, is enough.
      fetch: signal =>
        walk(
          cursor => api.dnsCache({cursor, limit: 1000, detail: 'summary'}, signal),
          (acc: DnsCacheList | undefined, page) => {
            if (!acc) return {...page, entries: [...page.entries]};
            acc.entries.push(...page.entries);
            return acc;
          }
        )
    },
    {enabled, paused}
  );
}
// The whole cache's usage and coverage, which every page of the listing repeats: one entry is enough to read them.
export function useDnsCacheUsage(enabled = true, paused = false) {
  const api = getApi();
  return useResource({key: ['dnsCache', {usage: true}], every: 60000, fetch: signal => api.dnsCache({limit: 1, detail: 'summary'}, signal)}, {enabled, paused});
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
