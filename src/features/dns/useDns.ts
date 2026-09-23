import {useMemo, useState} from 'react';
import {getApi} from '../../api';
import {useCapabilities, useDnsControl, useDnsLog as useDnsLogResource, useNow} from '../../store';
import {useAction} from '../../store/action';
import type {DnsLogList, DnsQueryResponse} from '../../api/model';
import {ipLiteral} from '../../api/selectors';
import {useT, useLang, LOCALE} from '../../i18n';
import {downloadFile, exportName, panelQuery, toast, useDebounced, useLinked, useMediaQuery} from '../../ui/ui';
import type {PageProps} from '../types';
import {appendDnsLog, dnsCacheView, dnsLogDetail, dnsLogsExport, dnsLogView, dnsLogWindow, dnsQueryView} from './view';
import {pickTab, within} from '../../shell/route';
import {queryTypes} from './query';
import {errorText} from '../../api/error';

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
    } catch {
      // The failure stays on the page as its banner until the next query; a toast would say it twice.
    }
  };
  return {
    ...view,
    domain,
    setDomain,
    type,
    setType,
    pending: busy === 'query',
    error: capabilities.error,
    queryError: error,
    submit: () => void submit(),
    setTab,
    // A link that filters the log by domain opens the log, not the statistics.
    tab: pickTab(
      query,
      view.tabs.map(item => item.id),
      params.has('domain') && view.tabs.some(item => item.id === 'log') ? 'log' : (view.tabs[0]?.id ?? 'query')
    ),
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
  const now = useNow();
  const dns = useDnsControl();
  const view = useMemo(
    () => dnsCacheView(dns.cache.data, dns.capabilities.data?.resources, domain, dns.busy, locale, t, now),
    [dns.cache.data, dns.capabilities.data, domain, dns.busy, locale, t, now]
  );
  const remove = async (id: string) => {
    try {
      const result = await dns.remove(id);
      if (result) toast('positive', t('dns.deleted', {n: result.deleted}));
    } catch (error) {
      toast('negative', t('dns.deleteFailed', {error: errorText(error, t)}));
    }
  };
  const flush = async () => {
    try {
      const result = await dns.flush();
      if (result) toast('positive', t('dns.flushed', {matched: result.matched, deleted: result.deleted}));
    } catch (error) {
      toast('negative', t('dns.flushFailed', {error: errorText(error, t)}));
    }
  };
  return {
    ...view,
    // Delete and flush failures arrive as toasts, and the page above already reports the capabilities.
    error: dns.cache.error,
    loading: (dns.cache.loading || dns.capabilities.loading) && !dns.cache.data,
    flushPending: dns.busy === 'flush',
    remove: (id: string) => void remove(id),
    flush: () => void flush()
  };
}

export function useDnsLog(enabled: boolean | undefined, initialName: string) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const now = useNow();
  const [name, setName] = useState(initialName);
  useLinked(initialName, setName);
  const [type, setType] = useState('all');
  const [src, setSrc] = useState('');
  const api = getApi();
  const capabilities = useCapabilities();
  const filter = {name: useDebounced(name, 300), type, src: ipLiteral(useDebounced(src, 300))};
  const key = JSON.stringify(filter);
  const log = useDnsLogResource(filter, enabled === true);
  const [held, setHeld] = useState<DnsLogList | null>(null);
  const paging = useAction<'older'>({scope: key});
  // A new filter drops the held pages; useAction's scope aborts the paging for that filter after the commit.
  useLinked(key, () => setHeld(null));
  const {data, newerWaiting} = useMemo(() => dnsLogWindow(log.data, held), [log.data, held]);
  const loadOlder = () =>
    void paging.run('older', async signal => {
      if (!data?.next_cursor) return;
      setHeld(data);
      const page = await api.dnsLog(
        {
          name: filter.name.trim() || undefined,
          type: type === 'all' ? undefined : type,
          src: filter.src,
          cursor: data.next_cursor,
          limit: log.limit
        },
        signal
      );
      if (!signal.aborted) setHeld(appendDnsLog(data, page));
    });
  const [selected, setSelected] = useState<string | null>(null);
  const wide = useMediaQuery(panelQuery);
  const types = capabilities.data?.resources.dns_query.record_types;
  const view = useMemo(() => dnsLogView(data, enabled, locale, t, types, now), [data, enabled, locale, t, types, now]);
  const detail = useMemo(() => dnsLogDetail(data, selected, locale, t), [data, selected, locale, t]);
  return {
    ...view,
    detail,
    detailTitle: detail?.title ?? '',
    name,
    newerWaiting,
    setName,
    type,
    setType,
    src,
    setSrc,
    selected: detail ? selected : null,
    setSelected,
    wide,
    error: paging.error ?? log.error,
    loading: log.loading && !data,
    hasOlder: !!data?.next_cursor,
    loadingOlder: !!paging.busy,
    loadOlder,
    refresh: () => {
      paging.cancel();
      setHeld(null);
      log.refetch();
    },
    export: () => downloadFile(exportName('dns-log', 'csv'), dnsLogsExport(data?.records ?? []), 'text/csv;charset=utf-8')
  };
}
