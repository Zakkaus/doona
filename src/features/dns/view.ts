import type {Capabilities, DnsCacheList, DnsLogList, DnsLogRecord, DnsQueryResponse} from '../../api/model';
import {localTime} from '../../i18n/format';
import {formatNumber, type Translator as LabelFn} from '../../i18n';
import {millis} from '../../api/u64';
import {csvLine} from '../../ui/ui';
import type {Key} from '../../i18n';
import {offered} from '../../api/capabilities';

const routeSources: Record<string, Key> = {forced: 'dns.route.forced', 'dns.routing': 'dns.route.rules', default: 'dns.route.default'};
type Result = Pick<DnsQueryResponse['results'][number], 'status' | 'upstream' | 'route' | 'elapsed_ms' | 'answers' | 'cached'>;
export function dnsAnswerView(result: Result, t: LabelFn) {
  return {
    fields: [
      [t('ui.state'), result.status],
      [t('ui.upstream'), result.upstream ?? '—'],
      [t('dns.routeSource'), routeSources[result.route.source] ? t(routeSources[result.route.source]) : result.route.source],
      [t('dns.routeRule'), result.route.rule ?? '—'],
      [t('ui.elapsed'), t('ui.latency', {n: millis(result.elapsed_ms)})]
    ] as Array<[string, string]>,
    answers: (result.answers ?? []).map(answer => t('dns.answer', {name: answer.name, type: answer.type, ttl: answer.ttl, data: answer.data})),
    cacheText: t(result.cached ? 'dns.hit' : 'dns.miss'),
    cacheTone: result.cached ? undefined : ('warn' as const)
  };
}
export function dnsQueryView(
  result: DnsQueryResponse | null,
  resources: Capabilities['resources'] | undefined,
  type: string,
  domain: string,
  busy: boolean,
  t: LabelFn
) {
  const types = resources?.dns_query.record_types ?? [];
  return {
    types,
    choices: [...types.map(id => ({id, label: id})), {id: 'all', label: t('dns.allTypes')}],
    disabled: busy || !resources?.dns_query.available || !(type === 'all' ? types.length > 0 : types.includes(type)) || !domain.trim(),
    unavailable: !!resources && !resources.dns_query.available,
    showCache: !!resources?.dns_cache.available,
    cards: result?.results.map(item => ({id: item.type, title: `${result.domain} ${item.type}`, ...dnsAnswerView(item, t)})) ?? [],
    tabs: dnsTabs(resources).map(tab => ({id: tab.id, label: t(tab.titleKey)}))
  };
}
// What the log says comes first and is the default, then the log itself; a query is an occasional action.
export function dnsTabs(resources: Capabilities['resources'] | undefined): Array<{id: 'stats' | 'log' | 'query' | 'cache'; titleKey: Key}> {
  return [
    ...(offered(resources, 'dns_log', {whileLoading: true}) ? [{id: 'stats' as const, titleKey: 'dns.tab.stats' as const}] : []),
    ...(offered(resources, 'dns_log', {whileLoading: true}) ? [{id: 'log' as const, titleKey: 'dns.log' as const}] : []),
    ...(offered(resources, 'dns_query', {whileLoading: true}) ? [{id: 'query' as const, titleKey: 'dns.query' as const}] : []),
    ...(offered(resources, 'dns_cache', {whileLoading: true}) ? [{id: 'cache' as const, titleKey: 'ui.cache' as const}] : [])
  ];
}
export function dnsCacheView(
  data: DnsCacheList | undefined,
  resources: Capabilities['resources'] | undefined,
  domain: string,
  busy: string | null,
  locale: string,
  t: LabelFn
) {
  const filter = domain.toLowerCase();
  return {
    fields: [[t('dns.entries'), data ? formatNumber(data.total, locale) : '—']] as Array<[string, string]>,
    coverage: data
      ? (['positive', 'negative', 'persistent'] as const)
          .filter(key => !data.coverage[key])
          .map(key => ({
            id: key,
            text: t('ui.valuePair', {
              label: t(
                {positive: 'dns.positive', negative: 'dns.negative', persistent: 'dns.persistent'}[key] as 'dns.positive' | 'dns.negative' | 'dns.persistent'
              ),
              value: t('dns.notCovered')
            })
          }))
      : [],
    filterText: filter ? t('dns.cacheFilter', {domain}) : '',
    confirmationText: data ? t('dns.flushConfirm', {n: data.total}) : t('dns.flushConfirmAll'),
    flushDisabled: !!busy || !resources?.dns_cache.available || !resources.dns_cache.flush,
    empty: t(resources?.dns_cache.available && resources.dns_cache.read ? 'dns.empty' : 'dns.cacheUnavailable'),
    rows: (data?.entries ?? [])
      .filter(entry => !filter || entry.domain.toLowerCase().includes(filter))
      .map(entry => ({
        id: entry.entry_id,
        domain: entry.domain,
        type: entry.type,
        status: entry.status,
        expiresAt: entry.expires_at,
        staleUntil: entry.stale_until,
        deleteLabel: t('dns.deleteEntry', {domain: entry.domain, type: entry.type}),
        pending: busy === entry.entry_id,
        disabled: !!busy || !resources?.dns_cache.available || !resources.dns_cache.delete_entry
      }))
  };
}
// The selected record's detail, apart from the rows, so a click does not reformat every loaded record.
export function dnsLogDetail(data: DnsLogList | undefined, selected: string | null, locale: string, t: LabelFn) {
  const record = data?.records.find(item => item.id === selected);
  if (!record) return null;
  const answer = dnsAnswerView(record, t);
  return {
    id: record.id,
    title: record.question.name,
    answers: answer.answers,
    fields: [
      [t('ui.type'), record.question.type],
      [t('ui.source'), record.src ?? '—'],
      answer.fields[0],
      [t('ui.cache'), answer.cacheText],
      ...answer.fields.slice(1),
      [t('ui.time'), localTime(record.observed_at, locale)]
    ] as Array<[string, string]>
  };
}
export function dnsLogView(data: DnsLogList | undefined, enabled: boolean | undefined, locale: string, t: LabelFn, types: string[] = []) {
  const records = data?.records ?? [];
  return {
    choices: [{id: 'all', label: t('dns.allTypes')}, ...[...new Set([...types, ...records.map(record => record.question.type)])].map(id => ({id, label: id}))],
    total: data ? t('dns.logTotal', {n: data.total}) : '',
    // The loaded count only matters while older records remain on the backend.
    loaded: data?.next_cursor ? t('dns.logLoaded', {n: records.length}) : '',
    empty: t(enabled === undefined ? 'ui.loading' : enabled ? 'dns.logEmpty' : 'dns.logUnavailable'),
    rows: records.map(record => ({
      id: record.id,
      observedAt: record.observed_at,
      name: record.question.name,
      type: record.question.type,
      source: record.src ?? '—',
      resultError: record.status !== 'NOERROR',
      result: record.status !== 'NOERROR' ? record.status : record.answers.map(answer => answer.data).join(', ') || '—',
      cached: record.cached,
      upstream: record.cached ? t('dns.hit') : (record.upstream ?? '—'),
      elapsed: t('ui.latency', {n: millis(record.elapsed_ms)})
    }))
  };
}

export function dnsLogsExport(records: DnsLogRecord[]) {
  return (
    [
      csvLine(['id', 'observed_at', 'src', 'name', 'type', 'status', 'cached', 'upstream', 'route_source', 'route_rule', 'elapsed_ms', 'answers']),
      ...records.map(r =>
        csvLine([
          r.id,
          r.observed_at,
          r.src,
          r.question.name,
          r.question.type,
          r.status,
          r.cached ? 'true' : 'false',
          r.upstream,
          r.route.source,
          r.route.rule,
          r.elapsed_ms,
          r.answers.map(answer => answer.data).join(' ')
        ])
      )
    ].join('\n') + '\n'
  );
}

export function appendDnsLog(data: DnsLogList, page: DnsLogList): DnsLogList {
  const ids = new Set(data.records.map(record => record.id));
  return {...data, records: [...data.records, ...page.records.filter(record => !ids.has(record.id))], next_cursor: page.next_cursor};
}

export function dnsLogWindow(head: DnsLogList | undefined, held: DnsLogList | null) {
  const ids = held && new Set(held.records.map(record => record.id));
  return {data: held ?? head, newerWaiting: !!ids && !!head?.records.some(record => !ids.has(record.id))};
}
