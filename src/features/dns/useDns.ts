import {useCallback, useMemo, useState} from 'react';
import {getApi} from '../../api';
import {useCapabilities, useDnsCacheUsage, useDnsControl, useDnsLog} from '../../store';
import {offered} from '../../api/capabilities';
import {useAction} from '../../store/action';
import type {DnsLogList, DnsQueryResponse} from '../../api/model';
import {ipLiteral} from '../../api/selectors';
import {useT, useLang, LOCALE} from '../../i18n';
import {downloadFile, exportName, panelQuery, toast, useDebounced, useLinked, useMediaQuery} from '../../ui/ui';
import type {PageProps} from '../../shell/routes';
import {appendDnsLog, dnsCacheView, dnsLogDetail, dnsLogsExport, dnsLogView, dnsLogWindow, dnsQueryView} from './view';
import {pickTab, within, tabQuery} from '../../shell/route';
import {queryTypes} from './query';
import {ApiError, errorText} from '../../api/error';
import {cacheCard} from './cache';

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
  // A link that filters the log by domain opens the log, not the statistics.
  const fallback = params.has('domain') && view.tabs.some(item => item.id === 'log') ? 'log' : (view.tabs[0]?.id ?? 'query');
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
    queryError: error,
    submit: () => void submit(),
    setTab: (tab: string) => go('dns', tabQuery(query, tab, resources && !params.has('domain') ? fallback : null)),
    tab: pickTab(
      query,
      view.tabs.map(item => item.id),
      fallback
    ),
    filterDomain: params.get('domain') ?? '',
    // undefined while capabilities are still loading: the tab must not claim the backend lacks a log yet.
    logEnabled: resources?.dns_log.available,
    viewCache: () => go('dns', within(query, {tab: 'cache', domain: result?.domain ?? ''})),
    clearCacheFilter: () => go('dns', within(query, {tab: 'cache', domain: null}))
  };
}

export function useDnsCacheTab(domain: string) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const dns = useDnsControl();
  const view = useMemo(
    () => dnsCacheView(dns.cache.data, dns.capabilities.data?.resources, domain, dns.busy, locale, t),
    [dns.cache.data, dns.capabilities.data, domain, dns.busy, locale, t]
  );
  const {remove: removeEntry} = dns;
  // Stable, so the cache table's columns, which call it, stay the same across polls.
  const remove = useCallback(
    (id: string) =>
      void removeEntry(id).then(
        result => result && toast('positive', t('dns.deleted', {n: result.deleted})),
        error => toast('negative', t('dns.deleteFailed', {error: errorText(error, t)}))
      ),
    [removeEntry, t]
  );
  const flush = async () => {
    try {
      const result = await dns.flush();
      if (result) toast('positive', t('dns.flushed', {matched: result.matched, deleted: result.deleted}));
    } catch (error) {
      return t('dns.flushFailed', {error: errorText(error, t)});
    }
  };
  return {
    ...view,
    // Delete failures arrive as toasts, flush failures in its dialog, and the shell reports the capabilities.
    error: dns.cache.error,
    retry: dns.cache.refetch,
    loading: (dns.cache.loading || dns.capabilities.loading) && !dns.cache.data,
    flushPending: dns.busy === 'flush',
    remove,
    flush,
    // The abandoned flush may still land, so the table is read again rather than left showing flushed entries.
    abortFlush: () => {
      dns.cancel();
      dns.cache.refetch();
    }
  };
}

// The statistics tab: the latest page of the log, unfiltered, the same records the log tab opens with, and the cache.
export function useDnsStatsTab(enabled: boolean | undefined) {
  const log = useDnsLog({}, enabled === true);
  const resources = useCapabilities().data?.resources;
  return {log, cacheListed: offered(resources, 'dns_cache', {whileLoading: false}) && resources?.dns_cache.read === true};
}

// The cache card reads usage once a minute while it is near the viewport; off screen or in a hidden tab it keeps its
// last reading. A 503 means the backend has no cache to list right now, which the card shows as unavailable.
export function useDnsCacheCard(listed: boolean) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const [near, setNear] = useState(false);
  const ref = useCallback((element: HTMLElement | null) => {
    if (!element) return;
    const observer = new IntersectionObserver(entries => setNear(entries.at(-1)!.isIntersecting), {rootMargin: '400px'});
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  // Paused only once it has a reading to keep showing; before that it loads wherever it is.
  const [loaded, setLoaded] = useState(false);
  const usage = useDnsCacheUsage(listed, !near && loaded);
  if (usage.data && !loaded) setLoaded(true);
  const card = useMemo(() => cacheCard(usage.data, locale, t), [usage.data, locale, t]);
  const refused = usage.error instanceof ApiError && usage.error.status === 503;
  return {
    ref,
    card,
    state: !listed || (refused && !usage.data) ? ('unavailable' as const) : card ? ('ready' as const) : usage.error ? ('error' as const) : ('loading' as const),
    error: usage.error,
    retry: usage.refetch
  };
}

export function useDnsLogTab(enabled: boolean | undefined, initialName: string) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const [name, setName] = useState(initialName);
  useLinked(initialName, setName);
  const [type, setType] = useState('all');
  const [src, setSrc] = useState('');
  const api = getApi();
  const capabilities = useCapabilities();
  const filter = {name: useDebounced(name, 300), type, src: ipLiteral(useDebounced(src, 300))};
  const key = JSON.stringify(filter);
  const log = useDnsLog(filter, enabled === true);
  const [held, setHeld] = useState<DnsLogList | null>(null);
  const [refreshing, setRefreshing] = useState(false);
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
  const refresh = () => {
    paging.cancel();
    setHeld(null);
    const done = log.refetch();
    if (!done) return;
    setRefreshing(true);
    void done.finally(() => setRefreshing(false));
  };
  const [selected, setSelected] = useState<string | null>(null);
  const wide = useMediaQuery(panelQuery);
  const types = capabilities.data?.resources.dns_query.record_types;
  const view = useMemo(() => dnsLogView(data, enabled, locale, t, types), [data, enabled, locale, t, types]);
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
    refreshing,
    refresh,
    // A failed page of older records retries that page; refreshing would drop the pages already loaded.
    retry: paging.error ? loadOlder : refresh,
    export: () => downloadFile(exportName('dns-log', 'csv'), dnsLogsExport(data?.records ?? []), 'text/csv;charset=utf-8')
  };
}
