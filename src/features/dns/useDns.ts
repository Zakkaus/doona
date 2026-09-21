import {useMemo, useState} from 'react';
import {getApi} from '../../api';
import {useCapabilities, useDnsControl, useDnsLog as useDnsLogResource} from '../../api/store';
import {useAction} from '../../api/store/action';
import type {DnsQueryResponse} from '../../api/model';
import {useT, useLang, LOCALE} from '../../i18n';
import {downloadFile, errorText, exportName, panelQuery, toast, useDebounced, useLinked, useMediaQuery} from '../../ui/ui';
import type {PageProps} from '../types';
import {dnsCacheView, dnsLogView, dnsQueryView} from './view';

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
    const next = new URLSearchParams({tab, ...extra});
    go('dns', next.toString());
  };
  const submit = async () => {
    try {
      await run('query', async signal => {
        const value = await api.dnsQuery(domain.trim(), type === 'all' ? view.types : [type], signal);
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
    logEnabled: resources?.dns_log.available === true,
    viewCache: () => setTab('cache', {domain: result?.domain ?? ''}),
    clearCacheFilter: () => setTab('cache')
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

export function useDnsLog(enabled: boolean, initialName: string) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const [name, setName] = useState(initialName);
  useLinked(initialName, setName);
  const [type, setType] = useState('all');
  const [src, setSrc] = useState('');
  const log = useDnsLogResource({name: useDebounced(name, 300), type, src: useDebounced(src, 300)}, enabled);
  const [selected, setSelected] = useState<string | null>(null);
  const wide = useMediaQuery(panelQuery);
  const view = useMemo(() => dnsLogView(log.data, selected, enabled, locale, t), [log.data, selected, enabled, locale, t]);
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
    error: log.error,
    loading: log.loading && !log.data,
    export: () => downloadFile(exportName('dns-log', 'csv'), view.exportContent, 'text/csv;charset=utf-8')
  };
}
