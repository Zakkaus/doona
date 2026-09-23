import {useCallback} from 'react';
import {getApi} from '../api/index';
import type {Capabilities, DnsCacheList} from '../api/model';
import {pageSize, useResource, walk} from './resource';
import {useAction} from './action';
import {useCapabilities} from './runtime';
import {offered} from '../api/capabilities';
function dnsLogLimit(capabilities: Capabilities | undefined) {
  const advertised = pageSize(capabilities, capabilities?.resources.dns_log.max_page_size);
  return advertised === undefined ? undefined : Math.min(200, advertised);
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
    {key: ['dnsLog', {name, type, src, limit}], fetch: signal => api.dnsLog({name, type: type as never, src, limit}, signal)},
    {enabled}
  );
  return {...resource, limit};
}
function useDnsCache(enabled = true) {
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
    {enabled}
  );
}
export function useDnsControl() {
  const api = getApi();
  const capabilities = useCapabilities();
  const resources = capabilities.data?.resources;
  const cache = useDnsCache(offered(resources, 'dns_cache', {whileLoading: false}) && !!resources?.dns_cache.read);
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
