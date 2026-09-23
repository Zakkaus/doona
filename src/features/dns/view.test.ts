import {expect, it} from 'vitest';
import {capabilities, dnsCache} from '../../api/mock/fixtures';
import type {DnsLogRecord, DnsQueryResponse} from '../../api/model';
import {translate, type Translator} from '../../i18n';
import {appendDnsLog, dnsAnswerView, dnsCacheView, dnsLogDetail, dnsLogsExport, dnsLogView, dnsLogWindow, dnsQueryView} from './view';
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
  const log = dnsLogView(data, true, 'en-US', t);
  expect(query.cards[0].answers).toEqual(dnsLogDetail(data, record.id, 'en-US', t)?.answers);
  expect(query.cards[0].fields).toContainEqual([t('ui.upstream'), '—']);
  expect(query.cards[0].fields).toContainEqual([t('ui.elapsed'), t('ui.latency', {n: '0'})]);
  expect(dnsAnswerView({...record, answers: undefined}, t).answers).toEqual([]);
  expect(log.rows[0]).toMatchObject({source: '—', result: '192.0.2.1', cached: true});
  expect(dnsLogsExport([record])).toContain('192.0.2.1');
});

it('disables unsupported query types and omits explicitly unavailable tabs', () => {
  const resources = {...capabilities.resources, dns_query: {...capabilities.resources.dns_query, record_types: ['A']}, dns_log: {available: false as const}};
  expect(dnsQueryView(null, resources, 'AAAA', 'example.com', false, t).disabled).toBe(true);
  expect(dnsQueryView(null, resources, 'all', 'example.com', false, t).disabled).toBe(false);
  expect(dnsQueryView(null, resources, 'A', ' ', false, t).disabled).toBe(true);
  expect(dnsQueryView(null, resources, 'A', 'example.com', false, t).tabs.map(tab => tab.id)).toEqual(['query', 'cache']);
});

it('shows the filtered snapshot count without narrowing the global flush scope or coverage', () => {
  const filtered = {...dnsCache, entries: [dnsCache.entries[0]], total: 1};
  const view = dnsCacheView(filtered, capabilities.resources, 'TELEGRAM', 'c1', 'en-US', t);
  expect(view.rows.map(row => row.id)).toEqual(['c1']);
  expect(view.rows[0]).toMatchObject({pending: true, disabled: true, staleUntil: null});
  expect(view.rows[0].expiresAt).toBe(dnsCache.entries.find(entry => entry.entry_id === 'c1')!.expires_at);
  expect(view.coverage.map(badge => badge.id)).toEqual(['persistent']);
  expect(view.fields).toContainEqual([t('dns.entries'), '1']);
  expect(view.confirmationText).toBe(t('dns.flushConfirmAll'));
  expect(dnsCacheView(dnsCache, capabilities.resources, '', null, 'en-US', t).confirmationText).toBe(t('dns.flushConfirm', {n: dnsCache.total}));
  expect(dnsCacheView(undefined, undefined, '', null, 'en-US', t).confirmationText).toBe(t('dns.flushConfirmAll'));
});

it('shows DNS failures instead of answer text and clears missing log selections', () => {
  const data = {observed_at: record.observed_at, total: 1, next_cursor: null, records: [{...record, status: 'NXDOMAIN', cached: false}]};
  const log = dnsLogView(data, true, 'en-US', t);
  expect(log.rows[0]).toMatchObject({resultError: true, result: 'NXDOMAIN', upstream: '—'});
  expect(dnsLogDetail(data, 'missing', 'en-US', t)).toBeNull();
});

it('offers observed and advertised record types without inventing log vocabulary', () => {
  const data = {observed_at: record.observed_at, total: 5, next_cursor: 'older', records: [{...record, question: {name: 'example.com.', type: 'CNAME'}}]};
  const view = dnsLogView(data, true, 'en-US', t, ['A']);
  expect(view.choices.map(choice => choice.id)).toEqual(['all', 'A', 'CNAME']);
  expect(view.loaded).toContain('1 loaded');
  expect(dnsLogView({...data, next_cursor: null}, true, 'en-US', t, ['A']).loaded).toBe('');
  expect(view.total).toContain('5 records');
  expect(dnsLogView(undefined, true, 'en-US', t).choices.map(choice => choice.id)).toEqual(['all']);
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
  const entry = dnsCacheView(dnsCache, capabilities.resources, '', null, 'en-US', t).rows[0];
  expect(entry.deleteLabel).toBe(t('dns.deleteEntry', {domain: entry.domain, type: entry.type}));
  expect(entry.deleteLabel).not.toContain(entry.id);
});
