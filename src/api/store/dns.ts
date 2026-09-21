import {useState} from 'react';
import {getApi} from '../index';
import type {DnsCacheList, DnsQueryResponse} from '../model';
import {pageSize, useResource, walk} from './resource';
import {useAction} from './action';
import {useCapabilities} from './runtime';
export function useDnsFlush() {
  const api = getApi();
  const {busy, run} = useAction<'flush'>({rethrow: true});
  return {busy: busy !== null, flush: () => run('flush', signal => api.flushDnsCache(signal))};
}
export function useDnsLog(query: {name?: string; type?: string; src?: string}, enabled = true) {
  const api = getApi();
  const name = query.name?.trim() || undefined;
  const type = query.type && query.type !== 'all' ? query.type : undefined;
  const src = query.src?.trim() || undefined;
  const capabilities = useCapabilities().data;
  const advertised = pageSize(capabilities, capabilities?.resources.dns_log.max_page_size);
  const limit = advertised === undefined ? undefined : Math.min(200, advertised);
  return useResource(
    {key: ['dnsLog', {name, type, src}], fetch: signal => api.dnsLog({name, type: type as never, src, limit}, signal)},
    {deps: [api, name, type, src, limit], enabled}
  );
}
function useDnsCache(enabled = true) {
  const api = getApi();
  return useResource(
    {
      key: ['dnsCache'],
      fetch: signal =>
        walk(
          cursor => api.dnsCache({cursor, limit: 1000, detail: 'full'}, signal),
          (acc: DnsCacheList | undefined, page) => (acc ? {...acc, entries: [...acc.entries, ...page.entries]} : page)
        )
    },
    {deps: [api], enabled}
  );
}
export function useDnsControl() {
  const api = getApi();
  const capabilities = useCapabilities();
  const resources = capabilities.data?.resources;
  const cache = useDnsCache(!!resources?.dns_cache.available && !!resources.dns_cache.read);
  const [result, setResult] = useState<DnsQueryResponse | null>(null);
  const {busy, error, run} = useAction<string>({rethrow: true});
  return {
    capabilities,
    cache,
    result,
    busy,
    error,
    query: (domain: string, types: string[]) =>
      run('query', async signal => {
        const value = await api.dnsQuery(domain, types, signal);
        if (!signal.aborted) setResult(value);
        return value;
      }),
    remove: (id: string) =>
      run(id, async signal => {
        const value = await api.deleteDnsEntry(id, signal);
        cache.refetch();
        return value;
      }),
    flush: () =>
      run('flush', async signal => {
        const value = await api.flushDnsCache(signal);
        cache.refetch();
        return value;
      })
  };
}
