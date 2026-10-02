import {expect, it} from 'vitest';
import {capabilities, dnsCache} from '../../api/mock/fixtures';
import type {DnsLogRecord, DnsQueryResponse} from '../../api/model';
import {translate, type Translator} from '../../i18n';
import {appendDnsLog, dnsAnswerView, dnsCacheView, dnsLogDetail, dnsLogsExport, dnsLogView, dnsLogWindow, dnsQueryView} from './view';
const t: Translator = (key, params) => translate('en', key, params);
const contains = (value: string, query: string) => value.toLowerCase().includes(query.toLowerCase());
const record: DnsLogRecord = {
  id: 'dns-1',
  observed_at: '2026-01-01T00:00:00Z',
  src: null,
  question: {name: 'example.com.', type: 'A'},
  status: 'NOERROR',
  cached: true,
  upstream: null,
  route: {source: 'default', rule: null},
  elapsed_ms: 0,
  answers: [{name: 'example.com.', type: 'A', class: 'IN', ttl: 60, data: '192.0.2.1'}]
};

it('uses the same nullable field and answer projection for queries and log details', () => {
  const result: DnsQueryResponse = {
    domain: 'example.com',
    cache_mode: 'normal',
    query_time: record.observed_at,
    results: [{...record, type: 'A', cache_entry_id: null}]
  };
  const query = dnsQueryView(result, capabilities.resources, 'A', 'example.com', false, t);
  const data = {observed_at: record.observed_at, total: 1, next_cursor: null, records: [record]};
  const log = dnsLogView(data, true, t);
  expect(query.cards[0].answers).toEqual(dnsLogDetail(data, record.id, 'en-US', t)?.answers);
  expect(query.cards[0].fields).toContainEqual([t('ui.upstream'), '—']);
  expect(query.cards[0].fields).toContainEqual([t('ui.elapsed'), t('ui.latency', {n: '0'})]);
  expect(dnsAnswerView({...record, answers: undefined}, t).answers).toEqual([]);
  expect(log.rows[0]).toMatchObject({source: '—', result: '192.0.2.1', cached: true});
  expect(dnsLogsExport([record])).toContain('192.0.2.1');
});

it('lists the statistics and the two listings before the query', () => {
  expect(dnsQueryView(null, capabilities.resources, 'A', '', false, t).tabs.map(tab => tab.id)).toEqual(['stats', 'log', 'cache', 'query']);
});

it('disables unsupported query types and omits explicitly unavailable tabs', () => {
  const resources = {...capabilities.resources, dns_query: {...capabilities.resources.dns_query, record_types: ['A']}, dns_log: {available: false as const}};
  expect(dnsQueryView(null, resources, 'AAAA', 'example.com', false, t).disabled).toBe(true);
  expect(dnsQueryView(null, resources, 'all', 'example.com', false, t).disabled).toBe(false);
  expect(dnsQueryView(null, resources, 'A', ' ', false, t).disabled).toBe(true);
  expect(dnsQueryView(null, resources, 'A', 'example.com', false, t).tabs.map(tab => tab.id)).toEqual(['cache', 'query']);
});

it('filters cache rows case-insensitively without narrowing the flush scope or coverage', () => {
  const view = dnsCacheView(dnsCache, capabilities.resources, 'TELEGRAM', 'c1', 'en-US', t, contains);
  expect(view.rows.map(row => row.id)).toEqual(['c1']);
  expect(view.rows[0]).toMatchObject({pending: true, disabled: true, staleUntil: null});
  expect(view.rows[0].expiresAt).toBe(dnsCache.entries.find(entry => entry.entry_id === 'c1')!.expires_at);
  expect(view.coverage.map(badge => badge.id)).toEqual(['persistent']);
  expect(view.confirmationText).toBe(t('dns.flushConfirm', {n: dnsCache.total}));
  expect(dnsCacheView(undefined, undefined, '', null, 'en-US', t, contains).confirmationText).toBe(t('dns.flushConfirmAll'));
});

it('shows DNS failures instead of answer text and clears missing log selections', () => {
  const data = {observed_at: record.observed_at, total: 1, next_cursor: null, records: [{...record, status: 'NXDOMAIN', cached: false}]};
  const log = dnsLogView(data, true, t);
  expect(log.rows[0]).toMatchObject({resultError: true, result: 'NXDOMAIN', upstream: '—'});
  expect(dnsLogDetail(data, 'missing', 'en-US', t)).toBeNull();
});

it('offers observed and advertised record types without inventing log vocabulary', () => {
  const data = {observed_at: record.observed_at, total: 5, next_cursor: 'older', records: [{...record, question: {name: 'example.com.', type: 'CNAME'}}]};
  const view = dnsLogView(data, true, t, ['A']);
  expect(view.choices.map(choice => choice.id)).toEqual(['all', 'A', 'CNAME']);
  expect(view.loaded).toContain('1 loaded');
  expect(dnsLogView({...data, next_cursor: null}, true, t, ['A']).loaded).toBe('');
  expect(view.total).toContain('5 records');
  expect(dnsLogView(undefined, true, t).choices.map(choice => choice.id)).toEqual(['all']);
});

it('appends older pages without duplicating overlapping records or changing the snapshot total', () => {
  const first = {observed_at: record.observed_at, total: 5, next_cursor: 'older', records: [record]};
  const merged = appendDnsLog(first, {...first, total: 6, next_cursor: null, records: [record, {...record, id: 'dns-2'}]});
  expect(merged.records.map(row => row.id)).toEqual(['dns-1', 'dns-2']);
  expect(merged.total).toBe(5);
  expect(merged.next_cursor).toBeNull();
  expect(dnsLogsExport(merged.records).trim().split('\n')).toHaveLength(3);
});

it('holds the loaded window when a poll advances the head after the final older page', () => {
  const page = (ids: string[], next_cursor: string | null) => ({
    observed_at: record.observed_at,
    total: 5,
    next_cursor,
    records: ids.map(id => ({...record, id}))
  });
  const held = appendDnsLog(page(['d4', 'd3'], 'd3'), page(['d2', 'd1'], null));
  const head = page(['d5', 'd4'], 'd4');
  const window = dnsLogWindow(head, held);
  expect(window.data?.records.map(row => row.id)).toEqual(['d4', 'd3', 'd2', 'd1']);
  expect(window.data?.next_cursor).toBeNull();
  expect(window.newerWaiting).toBe(true);
  expect(dnsLogWindow(page(['d4', 'd3'], 'd3'), held).newerWaiting).toBe(false);
  expect(dnsLogWindow(head, null)).toEqual({data: head, newerWaiting: false});
});

it('names the route source and the cache entry a delete button removes', () => {
  expect(dnsAnswerView({...record, route: {source: 'dns.routing', rule: 'r1'}}, t).fields).toContainEqual([t('dns.routeSource'), t('dns.route.rules')]);
  const entry = dnsCacheView(dnsCache, capabilities.resources, '', null, 'en-US', t, contains).rows[0];
  expect(entry.deleteLabel).toBe(t('dns.deleteEntry', {domain: entry.domain, type: entry.type}));
  expect(entry.deleteLabel).not.toContain(entry.id);
});

it('says the persistent cache is memory only rather than not covered, and explains the kept log records', () => {
  const view = dnsCacheView(dnsCache, capabilities.resources, '', null, 'en-US', t, contains);
  expect(view.coverage.find(badge => badge.id === 'persistent')?.text).toBe(t('ui.valuePair', {label: t('dns.persistent'), value: t('dns.chart.memoryOnly')}));
  const log = dnsLogView({observed_at: '2026-01-01T00:00:00Z', records: [], total: 3, next_cursor: null}, true, t);
  expect(log.totalHelp).toEqual({title: t('dns.logTotal', {n: 3}), text: t('dns.logTotalHelp')});
  expect(dnsLogView(undefined, true, t).totalHelp).toBeNull();
});

it('says why Query, Clear all cache and Delete are disabled when the backend does not support them', () => {
  const {resources} = capabilities;
  expect(dnsQueryView(null, resources, 'A', 'example.com', false, t).reason).toBeNull();
  // An empty domain speaks for itself, and nothing is said before the capabilities arrive or while a query runs.
  expect(dnsQueryView(null, resources, 'A', '', false, t).reason).toBeNull();
  expect(dnsQueryView(null, undefined, 'A', 'example.com', false, t).reason).toBeNull();
  const off = {...resources, dns_query: {...resources.dns_query, available: false}};
  expect(dnsQueryView(null, off, 'A', 'example.com', false, t).reason).toBe('This backend cannot run DNS queries right now');
  expect(dnsQueryView(null, off, 'A', 'example.com', true, t).reason).toBeNull();
  const aOnly = {...resources, dns_query: {...resources.dns_query, record_types: ['A']}};
  expect(dnsQueryView(null, aOnly, 'AAAA', 'example.com', false, t).reason).toBe('This backend cannot query this record type');
  const none = {...resources, dns_query: {...resources.dns_query, record_types: []}};
  expect(dnsQueryView(null, none, 'all', 'example.com', false, t).reason).toBe('This backend offers no record types to query');

  const cache = dnsCacheView(dnsCache, resources, '', null, 'en-US', t, contains);
  expect([cache.flushReason, cache.deleteReason]).toEqual([null, null]);
  const readOnly = {...resources, dns_cache: {...resources.dns_cache, flush: false, delete_entry: false}};
  const limited = dnsCacheView(dnsCache, readOnly, '', null, 'en-US', t, contains);
  expect(limited.flushReason).toBe('This backend does not support clearing the cache');
  expect(limited.deleteReason).toBe('This backend does not support deleting cache entries');
  // No row, no Delete to explain; a change in flight shows as pending.
  expect(dnsCacheView(dnsCache, readOnly, 'nothing-matches', null, 'en-US', t, contains).deleteReason).toBeNull();
  expect(dnsCacheView(dnsCache, readOnly, '', 'flush', 'en-US', t, contains).flushReason).toBeNull();
});

it('seeds a new rule from the typed answer records, the client address and the upstream that answered', () => {
  const answers = [
    {name: 'example.com.', type: 'CNAME', class: 'IN', ttl: 60, data: 'edge.example.net.'},
    {name: 'edge.example.net.', type: 'A', class: 'IN', ttl: 60, data: '192.0.2.1'},
    {name: 'edge.example.net.', type: 'AAAA', class: 'IN', ttl: 60, data: '2001:db8::1'}
  ];
  const logged = {...record, src: '[2001:db8::12]:40001', cached: false, upstream: 'tls://1.1.1.1', answers};
  expect(dnsLogDetail({observed_at: '', total: 1, next_cursor: null, records: [logged]}, 'dns-1', 'en', t)!.seed).toEqual({
    domain: 'example.com.',
    dip: null,
    sip: '2001:db8::12',
    outbound: null,
    matched: null,
    dns: {type: 'A', answers: ['192.0.2.1', '2001:db8::1'], upstream: 'tls://1.1.1.1', query: {name: 'example.com.', type: 'A'}}
  });
  const result = {...record, type: 'A', cache_entry_id: null, answers};
  const query: DnsQueryResponse = {domain: 'example.com', cache_mode: 'normal', query_time: '2026-01-01T00:00:00Z', results: [result]};
  const card = dnsQueryView(query, capabilities.resources, 'A', 'example.com', false, t).cards[0];
  expect(card.seed.dns?.answers).toEqual(['192.0.2.1', '2001:db8::1']);
  // The CNAME carries a name, not an address, so only the A and AAAA answers start a rule of their own.
  expect(card.answerSeeds.map(answer => answer?.address ?? null)).toEqual([null, '192.0.2.1', '2001:db8::1']);
  expect(card.answerSeeds[2]!.seed).toMatchObject({domain: null, dip: '2001:db8::1', dns: {answers: ['2001:db8::1'], query: {name: 'example.com', type: 'A'}}});
  const entry = dnsCacheView(dnsCache, capabilities.resources, '', null, 'en', t, contains).rows[0];
  expect(entry.seed).toMatchObject({domain: entry.domain, dns: {type: entry.type, answers: []}});
});

it.each([
  {available: true, delete_name: true, delete_entry: false, by: {name: true, entry: false}},
  {available: true, delete_name: false, delete_entry: true, by: {name: false, entry: true}},
  {available: true, delete_name: undefined, delete_entry: undefined, by: {name: false, entry: false}},
  {available: false, delete_name: true, delete_entry: true, by: {name: false, entry: false}}
])('gates pattern deletion on the cache capabilities %j', ({available, delete_name, delete_entry, by}) => {
  const resources = {...capabilities.resources, dns_cache: {...capabilities.resources.dns_cache, available, delete_name, delete_entry}};
  expect(dnsCacheView(dnsCache, resources, '', null, 'en', t, contains).deleteBy).toEqual(by);
});
