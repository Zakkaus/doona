import {expect, it} from 'vitest';
import type {DnsLogRecord} from '../../api/model';
import {clientAddress, dnsAnalysis, ranked} from './stats';

let n = 0;
const record = (patch: Partial<DnsLogRecord> & {name?: string; type?: string}): DnsLogRecord => {
  const {name = 'example.com.', type = 'A', ...rest} = patch;
  return {
    id: 'r' + ++n,
    observed_at: '2026-09-23T10:00:00Z',
    src: '10.0.0.2:5353',
    question: {name, type},
    status: 'NOERROR',
    cached: false,
    upstream: 'udp://1.1.1.1',
    route: {source: 'default', rule: null},
    elapsed_ms: 10,
    answers: [],
    ...rest
  } as DnsLogRecord;
};

it('counts each record once, a cached negative answer as a cache hit', () => {
  const a = dnsAnalysis([
    record({cached: true, status: 'NXDOMAIN', upstream: null, elapsed_ms: 0}),
    record({status: 'NXDOMAIN'}),
    record({status: 'SERVFAIL'}),
    record({status: 'TIMEOUT', upstream: null, elapsed_ms: 5000}),
    record({})
  ]);
  expect(a.counts).toEqual({cached: 1, answered: 1, nxdomain: 1, failed: 2});
  expect(a.uncached).toBe(4);
  expect(a.failureRate).toBe(0.5);
  expect(a.cacheRate).toBe(0.2);
});

it('measures latency only on uncached lookups that reached an upstream', () => {
  const a = dnsAnalysis([
    record({cached: true, upstream: null, elapsed_ms: 0}),
    record({status: 'TIMEOUT', upstream: null, elapsed_ms: 5000}),
    record({elapsed_ms: 10}),
    record({elapsed_ms: 20, upstream: 'tls://9.9.9.9'}),
    record({elapsed_ms: 30}),
    record({elapsed_ms: 40})
  ]);
  expect(a.samples.map(sample => sample.value)).toEqual([10, 20, 30, 40]);
  expect(a.typical).toBe(20);
  expect(a.slowest).toBe(40);
  expect(a.upstreams.map(row => [row.upstream, row.samples.length, row.median])).toEqual([
    ['udp://1.1.1.1', 3, 30],
    ['tls://9.9.9.9', 1, 20]
  ]);
});

it('has no latency figures and no rates for no records', () => {
  const a = dnsAnalysis([]);
  expect([a.typical, a.slowest, a.failureRate, a.cacheRate]).toEqual([null, null, null, null]);
});

it('ranks domains without their trailing dot, and totals the rest', () => {
  const a = dnsAnalysis([record({name: 'a.org.'}), record({name: 'a.org.'}), record({name: 'b.org.'})]);
  expect(a.domains.top).toEqual([
    {key: 'a.org', count: 2},
    {key: 'b.org', count: 1}
  ]);
  expect(ranked(['x', 'y', 'y', 'z'], 1)).toEqual({top: [{key: 'y', count: 2}], rest: 2});
  expect(ranked(['b', null, 'a'], 3).top.map(item => item.key)).toEqual(['a', 'b', null]);
  const devices = dnsAnalysis([record({src: '10.0.0.2:5353'}), record({src: '[fd00::1]:40000'}), record({src: null})]).devices.top;
  expect(devices.map(item => item.key)).toEqual(['10.0.0.2', '[fd00::1]', null]);
  expect(clientAddress('10.0.0.2:5353')).toBe('10.0.0.2');
});
