import {useMemo, useState} from 'react';
import {getApi} from '../../api';
import {useCapabilities, useDnsControl, useDnsLog as useDnsLogResource} from '../../store';
import {useAction} from '../../store/action';
import type {DnsLogList, DnsQueryResponse} from '../../api/model';
import {useT, useLang, LOCALE} from '../../i18n';
import {downloadFile, errorText, exportName, panelQuery, toast, useDebounced, useLinked, useMediaQuery} from '../../ui/ui';
import type {PageProps} from '../types';
import {appendDnsLog, dnsCacheView, dnsLogsExport, dnsLogView, dnsQueryView} from './view';
import {within} from '../../shell/route';
import {pageSize} from '../../store/resource';
import {queryTypes} from './query';

export function useDns({go, query}: PageProps) {
  const t = useT();
  const api = getApi();
  const capabilities = useCapabilities();
  const params = useMemo(() => new URLSearchParams(query), [query]);
  const [domain, setDomain] = useState(params.get('domain') ?? '');
  const [type, setType] = useState(params.get('type') ?? 'A');
  useLinked(params.get('domain'), value => setDomain(value ?? ''));
  useLinked(params.get('type'), value => setType(value ?? 'A'));
  const [result, setResult] = useState<DnsQueryResponse | null>(null);
  const {busy, error, run} = useAction<'query'>({rethrow: true});
  const resources = capabilities.data?.resources;
  const view = useMemo(() => dnsQueryView(result, resources, type, domain, !!busy, t), [result, resources, type, domain, busy, t]);
  const setTab = (tab: string, extra?: Record<string, string>) => {
    go('dns', within(query, {tab, ...extra}));
  };
  const submit = async () => {
    try {
      await run('query', async signal => {
        const value = await queryTypes(
          api.dnsQuery,
          domain.trim(),
          type === 'all' ? view.types : [type],
          resources?.dns_query.limits?.max_types_per_request ?? 1,
          signal
        );
        if (!signal.aborted) setResult(value);
        return value;
      });
    } catch (error) {
      toast('negative', t('dns.queryFailed', {error: errorText(error)}));
    }
  };
  return {
    ...view,
    domain,
    setDomain,
    type,
    setType,
    pending: busy === 'query',
    error: error ?? capabilities.error,
    submit: () => void submit(),
    setTab,
    tab: view.tabs.some(item => item.id === params.get('tab')) ? params.get('tab')! : (view.tabs[0]?.id ?? 'query'),
    filterDomain: params.get('domain') ?? '',
    // undefined while capabilities are still loading: the tab must not claim the backend lacks a log yet.
    logEnabled: resources?.dns_log.available,
    viewCache: () => setTab('cache', {domain: result?.domain ?? ''}),
    clearCacheFilter: () => go('dns', within(query, {tab: 'cache', domain: null}))
  };
}

export function useDnsCache(domain: string) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const dns = useDnsControl();
  const view = useMemo(
    () => dnsCacheView(dns.cache.data, dns.capabilities.data?.resources, domain, dns.busy, locale, t),
    [dns.cache.data, dns.capabilities.data, domain, dns.busy, locale, t]
  );
  const remove = async (id: string) => {
    try {
      const result = await dns.remove(id);
      if (result) toast('positive', t('dns.deleted', {n: result.deleted}));
    } catch (error) {
      toast('negative', t('dns.deleteFailed', {error: errorText(error)}));
    }
  };
  const flush = async () => {
    try {
      const result = await dns.flush();
      if (result) toast('positive', t('dns.flushed', {matched: result.matched, deleted: result.deleted}));
    } catch (error) {
      toast('negative', t('dns.flushFailed', {error: errorText(error)}));
    }
  };
  return {
    ...view,
    error: dns.error ?? dns.cache.error ?? dns.capabilities.error,
    loading: (dns.cache.loading || dns.capabilities.loading) && !dns.cache.data,
    flushPending: dns.busy === 'flush',
    remove: (id: string) => void remove(id),
    flush: () => void flush()
  };
}

export function useDnsLog(enabled: boolean | undefined, initialName: string) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const [name, setName] = useState(initialName);
  useLinked(initialName, setName);
  const [type, setType] = useState('all');
  const [src, setSrc] = useState('');
  const api = getApi();
  const capabilities = useCapabilities();
  const filter = {name: useDebounced(name, 300), type, src: useDebounced(src, 300)};
  const key = JSON.stringify(filter);
  const log = useDnsLogResource(filter, enabled === true);
  // Older pages stay appended behind whatever the poll delivers next, so new resolutions keep arriving.
  const [older, setOlder] = useState<DnsLogList[]>([]);
  const paging = useAction<'older'>({scope: key});
  useLinked(key, () => {
    setOlder([]);
    paging.cancel();
  });
  const data = useMemo(() => (log.data ? older.reduce(appendDnsLog, log.data) : undefined), [log.data, older]);
  const loadOlder = () =>
    void paging.run('older', async signal => {
      if (!data?.next_cursor) return;
      const limit = pageSize(capabilities.data, capabilities.data?.resources.dns_log.max_page_size);
      const page = await api.dnsLog(
        {
          name: filter.name.trim() || undefined,
          type: type === 'all' ? undefined : type,
          src: filter.src.trim() || undefined,
          cursor: data.next_cursor,
          limit: limit === undefined ? undefined : Math.min(200, limit)
        },
        signal
      );
      if (!signal.aborted) setOlder(pages => [...pages, page]);
    });
  const [selected, setSelected] = useState<string | null>(null);
  const wide = useMediaQuery(panelQuery);
  const types = capabilities.data?.resources.dns_query.record_types;
  const view = useMemo(() => dnsLogView(data, selected, enabled, locale, t, types), [data, selected, enabled, locale, t, types]);
  return {
    ...view,
    name,
    setName,
    type,
    setType,
    src,
    setSrc,
    selected: view.detail ? selected : null,
    setSelected,
    wide,
    error: paging.error ?? log.error,
    loading: log.loading && !data,
    hasOlder: !!data?.next_cursor,
    loadingOlder: !!paging.busy,
    loadOlder,
    refresh: () => {
      paging.cancel();
      setOlder([]);
      log.refetch();
    },
    export: () => downloadFile(exportName('dns-log', 'csv'), dnsLogsExport(data?.records ?? []), 'text/csv;charset=utf-8')
  };
}
