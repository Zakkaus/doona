import {expect, it} from 'vitest';
import {capabilities, dnsCache} from '../../../mock/fixtures';
import type {ConfigSource, DnsLogRecord, DnsQueryResponse} from '../../api/model';
import {translate, type Translator} from '../../i18n';
import {appendDnsLog, dnsAnswerView, dnsCacheView, dnsLogDetail, dnsLogsExport, dnsLogView, dnsLogWindow, dnsQueryUpstreams, dnsQueryView} from './view';
const t: Translator = (key, params) => translate('en', key, params);
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
  expect(dnsAnswerView({...record, answers: undefined}, record.question.name, t).answers).toEqual([]);
  expect(log.rows[0]).toMatchObject({source: '—', result: '192.0.2.1', cached: true});
  expect(dnsLogsExport([record])).toContain('192.0.2.1');
});

it('lists the statistics and the two listings before the query', () => {
  expect(dnsQueryView(null, capabilities.resources, 'A', '', false, t).tabs.map(tab => tab.id)).toEqual(['stats', 'log', 'cache', 'query']);
});

const source = (content: string | undefined) => ({id: 'main', content}) as ConfigSource;
it.each([
  ['no sources', undefined, []],
  ['no dns section', [source('routing {\n  fallback: direct\n}\n')], []],
  ['unread text', [source(undefined)], []],
  [
    'quoted keys across files, each once',
    [
      source("dns {\n  upstream {\n    cloudflare: 'tls://1.1.1.1:853'\n    'ali dns': 'udp://223.5.5.5:53'\n  }\n}\n"),
      source("dns {\n  upstream {\n    'cloudflare': 'tls://1.1.1.1:853'\n    \"ali dns\": 'udp://223.5.5.5:53'\n    Cloudflare: 'tls://1.0.0.1:853'\n  }\n}\n")
    ],
    [
      {id: '', label: 'Automatic'},
      {id: 'cloudflare', label: 'cloudflare'},
      {id: 'ali dns', label: 'ali dns'},
      {id: 'Cloudflare', label: 'Cloudflare'}
    ]
  ]
] as const)('offers the configured DNS upstreams for a query: %s', (_, sources, expected) => {
  expect(dnsQueryUpstreams(sources as ConfigSource[] | undefined, t)).toEqual(expected);
});

it('disables unsupported query types and omits explicitly unavailable tabs', () => {
  const resources = {...capabilities.resources, dns_query: {...capabilities.resources.dns_query, record_types: ['A']}, dns_log: {available: false as const}};
  expect(dnsQueryView(null, resources, 'AAAA', 'example.com', false, t).disabled).toBe(true);
  expect(dnsQueryView(null, resources, 'all', 'example.com', false, t).disabled).toBe(false);
  expect(dnsQueryView(null, resources, 'A', ' ', false, t).disabled).toBe(true);
  expect(dnsQueryView(null, resources, 'A', 'example.com', false, t).tabs.map(tab => tab.id)).toEqual(['cache', 'query']);
});

it('names a filter only when one narrows an empty cache listing', () => {
  const empty = (filtered?: boolean) => dnsCacheView(dnsCache, capabilities.resources, null, 'en-US', t, [], filtered).empty;
  expect(empty()).toBe('No cache entries');
  expect(empty(false)).toBe('No cache entries');
  expect(empty(true)).toBe('No matching cache entries');
  const unreadable = {...capabilities.resources, dns_cache: {...capabilities.resources.dns_cache, read: false}};
  expect(dnsCacheView(dnsCache, unreadable, null, 'en-US', t, [], true).empty).toBe('This backend does not provide a cache listing');
});

it('projects matched cache rows without narrowing the flush scope or coverage', () => {
  const view = dnsCacheView(
    dnsCache,
    capabilities.resources,
    'c1',
    'en-US',
    t,
    dnsCache.entries.filter(entry => entry.entry_id === 'c1')
  );
  expect(view.rows.map(row => row.id)).toEqual(['c1']);
  expect(view.rows[0]).toMatchObject({pending: true, disabled: true, staleUntil: null});
  expect(view.rows[0].expiresAt).toBe(dnsCache.entries.find(entry => entry.entry_id === 'c1')!.expires_at);
  expect(view.coverage.map(badge => badge.id)).toEqual(['persistent']);
  expect(view.confirmationText).toBe(t('dns.flushConfirm', {n: dnsCache.total}));
  expect(dnsCacheView(undefined, undefined, null, 'en-US', t).confirmationText).toBe(t('dns.flushConfirmAll'));
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
  expect(dnsAnswerView({...record, route: {source: 'dns.routing', rule: 'r1'}}, record.question.name, t).fields).toContainEqual([
    t('dns.routeSource'),
    t('dns.route.rules')
  ]);
  const entry = dnsCacheView(dnsCache, capabilities.resources, null, 'en-US', t).rows[0];
  expect(entry.deleteLabel).toBe(t('dns.deleteEntry', {domain: entry.domain, type: entry.type}));
  expect(entry.deleteLabel).not.toContain(entry.id);
});

it('reports missing cache coverage and omits warnings when all coverage is present', () => {
  const missing = {...dnsCache, coverage: {positive: false, negative: false, persistent: false}};
  expect(dnsCacheView(missing, capabilities.resources, null, 'en', t).coverage.map(badge => badge.id)).toEqual(['positive', 'negative', 'persistent']);
  const complete = {...dnsCache, coverage: {positive: true, negative: true, persistent: true}};
  expect(dnsCacheView(complete, capabilities.resources, null, 'en', t).coverage).toEqual([]);
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

  const cache = dnsCacheView(dnsCache, resources, null, 'en-US', t);
  expect([cache.flushReason, cache.deleteReason]).toEqual([null, null]);
  const readOnly = {...resources, dns_cache: {...resources.dns_cache, flush: false, delete_entry: false}};
  const limited = dnsCacheView(dnsCache, readOnly, null, 'en-US', t);
  expect(limited.flushReason).toBe('This backend does not support clearing the cache');
  expect(limited.deleteReason).toBe('This backend does not support deleting cache entries');
  // No row, no Delete to explain; a change in flight shows as pending.
  expect(dnsCacheView(dnsCache, readOnly, null, 'en-US', t, []).deleteReason).toBeNull();
  expect(dnsCacheView(dnsCache, readOnly, 'flush', 'en-US', t).flushReason).toBeNull();
});

it('seeds a new rule from the typed answer records, the client address and the upstream that answered', () => {
  const answers = [
    {name: 'example.com.', type: 'CNAME', class: 'IN', ttl: 60, data: 'edge.example.net.'},
    {name: 'edge.example.net.', type: 'A', class: 'IN', ttl: 60, data: '192.0.2.1'},
    {name: 'edge.example.net.', type: 'AAAA', class: 'IN', ttl: 60, data: '2001:db8::1'}
  ];
  const logged = {...record, src: '[2001:db8::12]:40001', cached: false, upstream: 'tls://1.1.1.1', answers};
  expect(dnsLogView({observed_at: '', total: 1, next_cursor: null, records: [logged]}, true, t).rows[0].seed).toEqual({
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
  const entry = dnsCacheView(dnsCache, capabilities.resources, null, 'en', t).rows[0];
  expect(entry.seed).toMatchObject({domain: entry.domain, dns: {type: entry.type, answers: []}});
});

it.each([
  {available: true, delete_name: true, delete_entry: false, by: {name: true, entry: false}},
  {available: true, delete_name: false, delete_entry: true, by: {name: false, entry: true}},
  {available: true, delete_name: undefined, delete_entry: undefined, by: {name: false, entry: false}},
  {available: false, delete_name: true, delete_entry: true, by: {name: false, entry: false}}
])('gates pattern deletion on the cache capabilities %j', ({available, delete_name, delete_entry, by}) => {
  const resources = {...capabilities.resources, dns_cache: {...capabilities.resources.dns_cache, available, delete_name, delete_entry}};
  expect(dnsCacheView(dnsCache, resources, null, 'en', t).deleteBy).toEqual(by);
});

it('leads each answer with its data, links public addresses and names the owner only down a chain', () => {
  const answers = [
    ['A', '192.0.2.1', 'EXAMPLE.com'],
    ['A', '10.0.0.1', 'example.com.'],
    ['CNAME', '8.8.8.8', 'example.com.'],
    ['AAAA', '2001:0DB8:0:0::1', 'edge.example.net.']
  ].map(([type, data, name]) => ({...record.answers[0], type, data, name, ttl: 60}));
  const item = {...record, question: {...record.question, name: 'example.com.'}, answers};
  const result: DnsQueryResponse = {
    domain: 'example.com',
    cache_mode: 'normal',
    query_time: record.observed_at,
    results: [{...item, type: 'A', cache_entry_id: null}]
  };
  const data = {observed_at: record.observed_at, total: 1, next_cursor: null, records: [item]};
  const ttl = t('dns.ttl', {ttl: 60});
  const expected = [
    {data: '192.0.2.1', name: null, type: 'A', ttl, lookup: '192.0.2.1'},
    {data: '10.0.0.1', name: null, type: 'A', ttl, lookup: null},
    {data: '8.8.8.8', name: null, type: 'CNAME', ttl, lookup: null},
    {data: '2001:0DB8:0:0::1', name: 'edge.example.net.', type: 'AAAA', ttl, lookup: '2001:db8::1'}
  ];
  expect(dnsQueryView(result, capabilities.resources, 'A', 'example.com', false, t).cards[0].answers).toEqual(expected);
  expect(dnsLogDetail(data, record.id, 'en-US', t)?.answers).toEqual(expected);
});
