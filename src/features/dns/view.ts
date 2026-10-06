import type {Capabilities, ConfigSource, DnsCacheList, DnsLogList, DnsLogRecord, DnsQueryResponse} from '../../api/model';
import {enumLabel} from '../../i18n/enum';
import {localTime, formatLatency} from '../../i18n/format';
import {formatNumber, type Translator as LabelFn} from '../../i18n';
import {csvLine} from '../../ui/ui';
import type {Key} from '../../i18n';
import {dnsTabs} from './nav';
import {sourceIp} from '../../api/selectors';
import {answerAddresses, type QuickRuleSeed} from '../shared/rule';
import {dnsUpstreamNames} from '../../dae/ruleText';
import {unquote} from '../../dae/text';

type Answer = NonNullable<DnsQueryResponse['results'][number]['answers']>[number];
// The add-rule seed for a queried name: the name for a routing or request rule, the answered A and AAAA addresses for
// a response rule, the client that asked, and the upstream that answered.
function nameSeed(name: string, type: string, answers: readonly Answer[], upstream: string | null, src: string | null): QuickRuleSeed {
  return {
    domain: name,
    dip: null,
    sip: (src && sourceIp(src)) ?? null,
    outbound: null,
    matched: null,
    dns: {type, answers: answerAddresses(answers), upstream, query: {name, type}}
  };
}
// The add-rule seed for one answered address: a routing rule by destination, or a response rule by answer.
const addressSeed = (address: string, name: string, type: string): QuickRuleSeed => ({
  domain: null,
  dip: address,
  sip: null,
  outbound: null,
  matched: null,
  dns: {type, answers: [address], upstream: null, query: {name, type}}
});

const routeSources: Record<string, Key> = {forced: 'dns.route.forced', 'dns.routing': 'dns.route.rules', default: 'dns.route.default'};
type Result = Pick<DnsQueryResponse['results'][number], 'status' | 'upstream' | 'route' | 'elapsed_ms' | 'answers' | 'cached'>;
export function dnsAnswerView(result: Result, t: LabelFn) {
  return {
    fields: [
      [t('ui.state'), result.status],
      [t('ui.upstream'), result.upstream ?? '—'],
      [t('dns.routeSource'), enumLabel(routeSources, result.route.source, t)],
      [t('dns.routeRule'), result.route.rule ?? '—'],
      [t('ui.elapsed'), formatLatency(result.elapsed_ms, t)]
    ] as Array<[string, string]>,
    answers: (result.answers ?? []).map(answer => t('dns.answer', {name: answer.name, type: answer.type, ttl: answer.ttl, data: answer.data})),
    cacheText: t(result.cached ? 'dns.hit' : 'dns.miss'),
    cacheTone: result.cached ? undefined : ('warn' as const)
  };
}
// Automatic leaves the pick to dns.routing; forced queries name an upstream without its configuration quotes.
export function dnsQueryUpstreams(sources: ConfigSource[] | undefined, t: LabelFn) {
  const names = [...new Set((sources ?? []).flatMap(source => (source.content ? dnsUpstreamNames(source.content).map(unquote) : [])))];
  return names.length ? [{id: '', label: t('dns.upstreamAuto')}, ...names.map(id => ({id, label: id}))] : [];
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
  const typeOffered = type === 'all' ? types.length > 0 : types.includes(type);
  return {
    types,
    choices: [...types.map(id => ({id, label: id})), {id: 'all', label: t('dns.allTypes')}],
    disabled: busy || !resources?.dns_query.available || !typeOffered || !domain.trim(),
    // Why Query is disabled, when the backend is the reason; an empty domain speaks for itself.
    reason:
      !resources || busy
        ? null
        : !resources.dns_query.available
          ? t('dns.queryUnavailable')
          : typeOffered
            ? null
            : t(type === 'all' ? 'dns.noTypes' : 'dns.typeUnsupported'),
    showCache: !!resources?.dns_cache.available,
    cards:
      result?.results.map(item => ({
        id: item.type,
        title: `${result.domain} ${item.type}`,
        ...dnsAnswerView(item, t),
        seed: nameSeed(result.domain, item.type, item.answers ?? [], item.upstream, null),
        // Each A or AAAA answer, in the order shown, starts a rule of its own; other records carry no address.
        answerSeeds: (item.answers ?? []).map(answer =>
          answerAddresses([answer]).length ? {address: answer.data, seed: addressSeed(answer.data, result.domain, item.type)} : null
        )
      })) ?? [],
    tabs: dnsTabs(resources).map(tab => ({id: tab.id, label: t(tab.titleKey)}))
  };
}
export function dnsCacheView(
  data: DnsCacheList | undefined,
  resources: Capabilities['resources'] | undefined,
  busy: string | null,
  locale: string,
  t: LabelFn,
  entries = data?.entries ?? []
) {
  const cache = resources?.dns_cache;
  return {
    readable: !!cache?.available && cache.read === true,
    fields: [[t('dns.entries'), data ? formatNumber(data.total, locale) : '—']] as Array<[string, string]>,
    coverage: data
      ? (['positive', 'negative', 'persistent'] as const)
          .filter(key => !data.coverage[key])
          .map(key => ({
            id: key,
            text:
              key === 'persistent'
                ? t('dns.memoryOnly')
                : t('ui.valuePair', {label: t(key === 'positive' ? 'dns.positive' : 'dns.negative'), value: t('dns.notCovered')})
          }))
      : [],
    // What the pattern deletion can use: one request for an exact name, or the entries one by one.
    deleteBy: {name: !!cache?.available && cache.delete_name === true, entry: !!cache?.available && cache.delete_entry === true},
    confirmationText: data ? t('dns.flushConfirm', {n: data.total}) : t('dns.flushConfirmAll'),
    flushDisabled: !!busy || !resources?.dns_cache.available || !resources.dns_cache.flush,
    // Why Clear all cache and the rows' Delete are disabled, when the backend does not support them.
    flushReason: cache && !busy && (!cache.available || !cache.flush) ? t('dns.flushUnsupported') : null,
    deleteReason: cache && !busy && entries.length > 0 && (!cache.available || !cache.delete_entry) ? t('dns.deleteUnsupported') : null,
    empty: t(resources?.dns_cache.available && resources.dns_cache.read ? 'dns.empty' : 'dns.cacheUnavailable'),
    rows: entries.map(entry => ({
      id: entry.entry_id,
      domain: entry.domain,
      type: entry.type,
      status: entry.status,
      expiresAt: entry.expires_at,
      staleUntil: entry.stale_until,
      deleteLabel: t('dns.deleteEntry', {domain: entry.domain, type: entry.type}),
      seed: nameSeed(entry.domain, entry.type, [], null, null),
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
      [t('ui.device'), record.src ?? '—'],
      answer.fields[0],
      [t('ui.cache'), answer.cacheText],
      ...answer.fields.slice(1),
      [t('ui.time'), localTime(record.observed_at, locale)]
    ] as Array<[string, string]>
  };
}
export function dnsLogView(data: DnsLogList | undefined, enabled: boolean | undefined, t: LabelFn, types: string[] = []) {
  const records = data?.records ?? [];
  return {
    choices: [{id: 'all', label: t('dns.allTypes')}, ...[...new Set([...types, ...records.map(record => record.question.type)])].map(id => ({id, label: id}))],
    total: data ? t('dns.logTotal', {n: data.total}) : '',
    totalHelp: data ? {title: t('dns.logTotal', {n: data.total}), text: t('dns.logTotalHelp')} : null,
    // The loaded count only matters while older records remain on the backend.
    loaded: data?.next_cursor ? t('dns.logLoaded', {n: records.length}) : '',
    empty: t(enabled === undefined ? 'ui.loading' : enabled ? 'dns.logEmpty' : 'dns.logUnavailable'),
    rows: records.map(record => ({
      id: record.id,
      observedAt: record.observed_at,
      name: record.question.name,
      type: record.question.type,
      seed: nameSeed(record.question.name, record.question.type, record.answers, record.upstream, record.src),
      source: record.src ?? '—',
      resultError: record.status !== 'NOERROR',
      result: record.status !== 'NOERROR' ? record.status : record.answers.map(answer => answer.data).join(', ') || '—',
      cached: record.cached,
      upstream: record.cached ? t('dns.hit') : (record.upstream ?? '—'),
      elapsed: formatLatency(record.elapsed_ms, t)
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

export function appendDnsLog<T extends DnsLogList>(data: T, page: DnsLogList): T {
  const ids = new Set(data.records.map(record => record.id));
  return {...data, records: [...data.records, ...page.records.filter(record => !ids.has(record.id))], next_cursor: page.next_cursor};
}

export function dnsLogWindow<T extends DnsLogList>(head: T | undefined, held: T | null) {
  const ids = held && new Set(held.records.map(record => record.id));
  return {data: held ?? head, newerWaiting: !!ids && !!head?.records.some(record => !ids.has(record.id))};
}
