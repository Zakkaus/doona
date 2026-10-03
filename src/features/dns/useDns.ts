import {useCallback, useEffect, useEffectEvent, useMemo, useState} from 'react';
import {useFilter} from 'react-aria-components';
import {getApi} from '../../api';
import {queryTypes, useCapabilities, useConfig, useDnsCacheUsage, useDnsControl, useDnsLog} from '../../store';
import {offered} from '../../api/capabilities';
import {useAction} from '../../store/action';
import type {DnsQueryResponse} from '../../api/model';
import {ipLiteral} from '../../api/selectors';
import {useT, useLang, LOCALE} from '../../i18n';
import {downloadFile, exportName, panelQuery, toast, toastErrorDetail, useDebounced, useLinked, useMediaQuery, useNearViewport, useTabShown} from '../../ui/ui';
import type {PageProps} from '../../shell/routes';
import {appendDnsLog, dnsCacheView, dnsLogDetail, dnsLogsExport, dnsLogView, dnsLogWindow, dnsQueryUpstreams, dnsQueryView} from './view';
import {href, pickTab, within, tabQuery} from '../../shell/route';
import {ApiError, errorText, isSnapshotRefusal} from '../../api/error';
import {wait} from '../../api/wait';
import {cacheCard, cacheCardState} from './cache';
import {dnsPattern, matchKinds, matchListMax, type MatchKind} from './match';
import {useCacheMatches} from './useCacheMatches';
import {sectionSourceHref} from '../shared/link';
import {useQuickRule} from '../shared/useQuickRule';
import type {QuickRuleSeed} from '../shared/rule';

export type DnsRowRule = {
  canAdd: (seed: QuickRuleSeed) => boolean;
  open: (seed: QuickRuleSeed) => void;
  label: (domain: string) => string;
};

export function useDns({go, query}: PageProps) {
  const t = useT();
  const api = getApi();
  const capabilities = useCapabilities();
  const params = useMemo(() => new URLSearchParams(query), [query]);
  const [domain, setDomain] = useState(params.get('domain') ?? '');
  const [type, setType] = useState(params.get('type') ?? 'A');
  const [bypassCache, setBypassCache] = useState(false);
  useLinked(params.get('domain'), value => setDomain(value ?? ''));
  useLinked(params.get('type'), value => setType(value ?? 'A'));
  const [result, setResult] = useState<DnsQueryResponse | null>(null);
  const {busy, error, run} = useAction<'query'>({rethrow: true});
  const resources = capabilities.data?.resources;
  const view = useMemo(() => dnsQueryView(result, resources, type, domain, !!busy, t), [result, resources, type, domain, busy, t]);
  // The statistics open the page, but a link that filters the log by domain or device opens the log. Without a log the
  // query opens it: the cache is a listing to browse, not a starting point.
  const ids = view.tabs.map(item => item.id);
  const linked = params.has('domain') || params.has('device');
  const fallback = ids.includes('log') ? (linked ? 'log' : 'stats') : ids.includes('query') ? 'query' : (ids[0] ?? 'query');
  const tab = pickTab(query, ids, fallback);
  // The upstreams a query can be sent to are the ones the configuration defines, read once the query tab opens.
  const configReadable = offered(resources, 'config', {whileLoading: false});
  const config = useConfig(tab === 'query' && configReadable && offered(resources, 'dns_query', {whileLoading: false}));
  const upstreams = useMemo(() => (configReadable ? dnsQueryUpstreams(config.data?.sources, t) : []), [configReadable, config.data, t]);
  const [picked, setUpstream] = useState('');
  // Automatic when the picked name is no longer defined.
  const upstream = upstreams.some(item => item.id === picked) ? picked : '';
  if (config.data && picked && !upstream) setUpstream('');
  const submit = async (asked = {domain, type}) => {
    try {
      await run('query', async signal => {
        const value = await queryTypes(
          api.dnsQuery,
          asked.domain.trim(),
          asked.type === 'all' ? view.types : [asked.type],
          resources?.dns_query.limits?.max_types_per_request ?? 1,
          signal,
          bypassCache ? 'bypass' : 'normal',
          upstream || undefined
        );
        if (!signal.aborted) setResult(value);
        return value;
      });
    } catch {
      // The failure stays on the page as its banner until the next query; a toast would say it twice.
    }
  };
  // The add-rule dialog of the log, the query results and the cache. Once a DNS rule is written, Query again, offered
  // while the backend answers queries, opens the query tab with the name the rule was added from and `run` in the
  // address; the DNS page on screen then, which may not be this one, runs it.
  const queryable = offered(resources, 'dns_query', {whileLoading: false}) && view.types.length > 0;
  const rule = useQuickRule(go, {
    queryAgain: queryable
      ? asked => {
          const type = view.types.includes(asked.type) ? asked.type : 'all';
          go('dns', within('', {tab: 'query', domain: asked.name.replace(/\.$/, ''), type, run: '1'}));
        }
      : undefined
  });
  // The query a link asks to run, once, dropping `run` from the address so a reload or Back does not repeat it.
  const runLinked = params.has('run') && resources ? query : null;
  const runLink = useEffectEvent((linked: string) => {
    const asked = new URLSearchParams(linked);
    go('dns', within(linked, {run: null}), {replace: true});
    void submit({domain: asked.get('domain') ?? '', type: asked.get('type') ?? 'A'});
  });
  useEffect(() => {
    if (runLinked !== null) runLink(runLinked);
  }, [runLinked]);
  return {
    ...view,
    rule: {
      ...rule,
      label: (domain: string) => t(offered(resources, 'dns_rules', {whileLoading: false}) ? 'dns.addRequestRuleFor' : 'dns.addRoutingRuleFor', {domain})
    },
    domain,
    setDomain,
    type,
    setType,
    bypassCache,
    setBypassCache,
    upstreams,
    upstream,
    setUpstream,
    pending: busy === 'query',
    queryError: error,
    submit: () => void submit(),
    setTab: (tab: string) => go('dns', tabQuery(query, tab, resources && !linked ? fallback : null)),
    tab,
    filterDomain: params.get('domain') ?? '',
    filterDevice: params.get('device') ?? '',
    cacheHref: ids.includes('cache') ? href('dns', {tab: 'cache'}) : null,
    // A statistics ranking row opens the log filtered to that domain or device.
    logHref: (by: 'domain' | 'device', value: string) => href('dns', {tab: 'log', [by]: value}),
    // The log's toolbar leads to the lists that decide its answers and to the settings that record it.
    logLinks: [
      ...(offered(resources, 'dns_rules', {whileLoading: false}) ? [{id: 'rules', label: t('rule.dnsTitle'), onAction: () => go('rules', 'tab=dns')}] : []),
      ...(resources?.runtime_settings.available ? [{id: 'recording', label: t('ui.recordingSettings'), onAction: () => go('settings', 'card=runtime')}] : [])
    ],
    // undefined while capabilities are still loading: the tab must not claim the backend lacks a log yet.
    logEnabled: resources?.dns_log.available,
    viewCache: () => go('dns', within(query, {tab: 'cache', domain: result?.domain ?? ''})),
    clearCacheFilter: () => go('dns', within(query, {tab: 'cache', domain: null}))
  };
}

export function useDnsCacheTab(domain: string) {
  const t = useT();
  const locale = LOCALE[useLang()];
  // A kept tab stays mounted while hidden; the full listing is walked only while its tab is on screen.
  const dns = useDnsControl(!useTabShown());
  const {contains} = useFilter({sensitivity: 'base'});
  const view = useMemo(
    () => dnsCacheView(dns.cache.data, dns.capabilities.data?.resources, domain, dns.busy, locale, t, contains),
    [dns.cache.data, dns.capabilities.data, domain, dns.busy, locale, t, contains]
  );
  const [matchKind, setMatchKind] = useState<MatchKind>('suffix');
  const [matchText, setMatchText] = useState(domain);
  const [matchType, setMatchType] = useState('all');
  useLinked(domain, setMatchText);
  const types = [...new Set([...(dns.capabilities.data?.resources.dns_query.record_types ?? []), ...(dns.cache.data?.entries ?? []).map(entry => entry.type)])];
  const pattern = useMemo(() => ({kind: matchKind, text: matchText}), [matchKind, matchText]);
  // The cache is matched once typing pauses; regex execution stays off the rendering thread.
  const settled = useDebounced(pattern, 250);
  const settling = settled !== pattern;
  const entries = dns.cache.data?.entries;
  // Every listed entry the pattern and type pick, whatever the table's own filter shows.
  // An exact name goes in one request; anything else deletes the listed entries one by one.
  const byName = matchKind === 'full' && !!matchText.trim() && view.deleteBy.name;
  const {matches: matched, error: matchError, pending: matching} = useCacheMatches(entries, settled, matchType);
  const {remove: removeEntry} = dns;
  // Stable, so the cache table's columns, which call it, stay the same across polls.
  const remove = useCallback(
    (id: string) =>
      void removeEntry(id).then(
        result => result && toast('positive', t('dns.deleted', {n: result.deleted})),
        error => toast('negative', t('dns.deleteFailed'), toastErrorDetail(error, t))
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
    matchKind,
    matchText,
    matchType,
    setMatchType,
    setMatchKind,
    // `*.` in front of a name picks the suffix kind and drops the shorthand.
    setMatchText: (text: string) => {
      const next = dnsPattern(matchKind, text);
      setMatchKind(next.kind);
      setMatchText(next.text);
    },
    matchKinds: matchKinds.map(kind => ({id: kind.id, label: t(kind.label)})),
    matchTypes: [{id: 'all', label: t('dns.allTypes')}, ...types.map(id => ({id, label: id}))],
    matchError: matchError ? t(matchError) : undefined,
    // Without per-entry deletion, only an exact name can go.
    matchReason: !view.deleteBy.entry && view.deleteBy.name && !byName && !dns.busy ? t('dns.matchNameOnly') : null,
    matchPending: dns.busy === 'delete-match',
    // An empty pattern deletes a whole record type, so it needs one.
    matchDisabled:
      !!dns.busy ||
      settling ||
      matching ||
      !!matchError ||
      (!byName && !matched.length) ||
      (!matchText.trim() && matchType === 'all') ||
      !(view.deleteBy.entry || byName),
    matchConfirmation: byName
      ? t('dns.deleteNameConfirm', {name: matchText.trim(), type: matchType === 'all' ? t('dns.allTypes') : matchType})
      : t('dns.deleteMatchingConfirm', {n: matched.length}),
    // The entries the count above is of, as far as the confirmation lists them.
    matchListed: matched.slice(0, matchListMax),
    matchMore: matched.length > matchListMax ? t('dns.matchMore', {n: matched.length - matchListMax}) : null,
    removeMatching: async () => {
      try {
        if (byName) {
          const result = await dns.removeName({name: matchText.trim(), type: matchType === 'all' ? undefined : [matchType]});
          if (result) toast('positive', t('dns.deleted', {n: result.deleted}));
          return;
        }
        const result = await dns.removeMany(matched.map(entry => entry.entry_id));
        if (!result) return;
        if (!result.failed) toast('positive', t('dns.deleted', {n: result.deleted}));
        else if (!result.deleted) toast('negative', t('dns.deleteAllFailed', {n: result.failed}));
        else toast('negative', t('dns.deletePartial', {deleted: result.deleted, n: result.failed}));
      } catch (error) {
        return t('dns.deleteMatchingFailed', {error: errorText(error, t)});
      }
    },
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
  // A kept tab stays mounted while hidden; its log is read only while the tab is on screen.
  const log = useDnsLog({}, enabled === true, !useTabShown());
  const resources = useCapabilities().data?.resources;
  // The upstreams the statistics chart, and the rules that pick them, are written in the configuration's `dns` section.
  const configReadable = offered(resources, 'config', {whileLoading: false});
  const config = useConfig(enabled === true && configReadable);
  // Shown once the sources are read, so the link never opens the file before the section's line is known.
  const sources = config.data?.sources;
  const configHref = useMemo(() => (configReadable && sources ? sectionSourceHref(sources, 'dns') : null), [configReadable, sources]);
  return {
    log,
    cacheListed: offered(resources, 'dns_cache', {whileLoading: false}) && resources?.dns_cache.read === true,
    configHref
  };
}

// The cache card reads usage once a minute while it is near the viewport; off screen or in a hidden tab it keeps its
// last reading.
export function useDnsCacheCard(listed: boolean) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const [ref, near] = useNearViewport();
  // Paused only once it has a reading to keep showing; before that it loads wherever it is.
  const [loaded, setLoaded] = useState(false);
  const usage = useDnsCacheUsage(listed, !near && loaded);
  if (usage.data && !loaded) setLoaded(true);
  const card = useMemo(() => cacheCard(usage.data, locale, t), [usage.data, locale, t]);
  return {
    ref,
    card,
    state: cacheCardState(listed, !!card, usage.error),
    error: usage.error,
    retry: usage.refetch
  };
}

export function useDnsLogTab(enabled: boolean | undefined, initialName: string, initialSrc: string) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const [name, setName] = useState(initialName);
  useLinked(initialName, setName);
  const [type, setType] = useState('all');
  const [src, setSrc] = useState(initialSrc);
  useLinked(initialSrc, setSrc);
  const api = getApi();
  const capabilities = useCapabilities();
  const typedSrc = useDebounced(src);
  const parsedSrc = ipLiteral(typedSrc);
  // A mistyped address keeps the last valid device filter and says so, rather than listing every device.
  const srcInvalid = typedSrc.trim() !== '' && !parsedSrc;
  const [validSrc, setValidSrc] = useState(parsedSrc);
  if (!srcInvalid && parsedSrc !== validSrc) setValidSrc(parsedSrc);
  const filter = {name: useDebounced(name), type, src: srcInvalid ? validSrc : parsedSrc};
  const key = JSON.stringify(filter);
  const log = useDnsLog(filter, enabled === true, !useTabShown());
  const [held, setHeld] = useState<NonNullable<typeof log.data> | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const paging = useAction<'older'>({scope: key});
  // A new filter drops the held pages; useAction's scope aborts the paging for that filter after the commit.
  useLinked(key, () => setHeld(null));
  const {data, newerWaiting} = useMemo(() => dnsLogWindow(log.data, held), [log.data, held]);
  const loadOlder = () =>
    void paging.run('older', async signal => {
      if (!data?.next_cursor) return;
      setHeld(data);
      let page;
      try {
        // A cursor is bound to the filters and the page size it was issued with, so an older page is always asked for at
        // the limit of the page that issued it, even after the head has fallen back to a smaller one.
        page = await api.dnsLog(
          {
            name: filter.name.trim() || undefined,
            type: type === 'all' ? undefined : type,
            src: filter.src,
            cursor: data.next_cursor,
            limit: data.limit
          },
          signal
        );
      } catch (error) {
        // A 410 snapshot_expired is the backend no longer holding the cursor's snapshot, and a 400 invalid_request is
        // the cursor refused for filters that changed since; asking again would fail the same way, so the log starts
        // over from the newest page. A 503 snapshot_unavailable does the same once the wait it asks for has passed.
        if (!(error instanceof ApiError) || signal.aborted) throw error;
        const unavailable = isSnapshotRefusal(error);
        const expired = (error.status === 410 && error.code === 'snapshot_expired') || (error.status === 400 && error.code === 'invalid_request');
        if (!expired && !unavailable) throw error;
        if (unavailable) await wait(error.retryAfter, signal);
        setHeld(null);
        void log.refetch();
        toast('info', t('dns.olderExpired'));
        return;
      }
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
  const view = useMemo(() => dnsLogView(data, enabled, t, types), [data, enabled, t, types]);
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
    srcError: srcInvalid ? t('ui.invalidIp') : undefined,
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
