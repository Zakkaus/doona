import {expect, it} from 'vitest';
import {capabilities, dnsCache} from '../../api/mock/fixtures';
import type {DnsLogRecord, DnsQueryResponse} from '../../api/model';
import {translate, type Translator} from '../../i18n';
import {dnsAnswerView, dnsCacheView, dnsLogView, dnsQueryView} from './view';
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
  const log = dnsLogView({observed_at: record.observed_at, total: 1, next_cursor: null, records: [record]}, record.id, true, 'en-US', t);
  expect(query.cards[0].answers).toEqual(log.detail?.answers);
  expect(query.cards[0].fields).toContainEqual([t('ui.upstream'), '—']);
  expect(query.cards[0].fields).toContainEqual([t('ui.elapsed'), t('ui.latency', {n: '0'})]);
  expect(dnsAnswerView({...record, answers: undefined}, t).answers).toEqual([]);
  expect(log.rows[0]).toMatchObject({source: '—', result: '192.0.2.1', cached: true});
  expect(log.exportContent).toContain('192.0.2.1');
});

it('disables unsupported query types and omits explicitly unavailable tabs', () => {
  const resources = {...capabilities.resources, dns_query: {...capabilities.resources.dns_query, record_types: ['A']}, dns_log: {available: false as const}};
  expect(dnsQueryView(null, resources, 'AAAA', 'example.com', false, t).disabled).toBe(true);
  expect(dnsQueryView(null, resources, 'all', 'example.com', false, t).disabled).toBe(false);
  expect(dnsQueryView(null, resources, 'A', ' ', false, t).disabled).toBe(true);
  expect(dnsQueryView(null, resources, 'A', 'example.com', false, t).tabs.map(tab => tab.id)).toEqual(['query', 'cache']);
});

it('filters cache rows case-insensitively without narrowing the flush scope or coverage', () => {
  const view = dnsCacheView(dnsCache, capabilities.resources, 'TELEGRAM', 'c1', 'en-US', t);
  expect(view.rows.map(row => row.id)).toEqual(['c1']);
  expect(view.rows[0]).toMatchObject({pending: true, disabled: true, staleTooltip: undefined});
  expect(view.coverage.map(badge => badge.id)).toEqual(['persistent']);
  expect(view.confirmationText).toBe(t('dns.flushConfirm', {n: dnsCache.total}));
  expect(dnsCacheView(undefined, undefined, '', null, 'en-US', t).confirmationText).toBe(t('dns.flushConfirmAll'));
});

it('shows DNS failures instead of answer text and clears missing log selections', () => {
  const log = dnsLogView(
    {observed_at: record.observed_at, total: 1, next_cursor: null, records: [{...record, status: 'NXDOMAIN', cached: false}]},
    'missing',
    true,
    'en-US',
    t
  );
  expect(log.rows[0]).toMatchObject({resultError: true, result: 'NXDOMAIN', upstream: '—'});
  expect(log.detail).toBeNull();
});
