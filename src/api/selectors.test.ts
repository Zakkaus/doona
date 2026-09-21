import {expect, it} from 'vitest';
import type {ApiEvent} from './model';
import {probeSummary, routineGap, shortId} from './selectors';

const gap = (reason: string, resource_id: string | null): ApiEvent =>
  ({
    id: 'x',
    event: 'flow.gap',
    data: {instance_id: 'i', observed_at: '2026-09-19T00:00:00Z', resource_id, reason, dropped_records: '1'}
  }) as ApiEvent;

it('treats the ring making room as housekeeping and a record losing its history as a gap', () => {
  expect(routineGap(gap('evicted', null))).toBe(true);
  expect(routineGap(gap('sampled', null))).toBe(true);
  expect(routineGap(gap('buffer_overflow', null))).toBe(false);
  expect(routineGap(gap('buffer_overflow', 'flow-1'))).toBe(false);
  expect(routineGap(gap('recording_changed', null))).toBe(false);
  expect(routineGap({id: 'y', event: 'stream.ready', data: {instance_id: 'i', observed_at: ''}} as ApiEvent)).toBe(false);
});

it('shortens a UUID to its first block and leaves other ids alone', () => {
  expect(shortId('e5af7786-442b-4f06-8ba5-ffa47f7dec70')).toBe('e5af7786');
  expect(shortId('gen-41')).toBe('gen-41');
  expect(shortId('—')).toBe('—');
});

it('counts each probed member once, by the row that says most', () => {
  const row = (member_id: string, ip_version: 'ipv4' | 'ipv6', state: 'healthy' | 'unavailable' | 'unknown') => ({
    member_id,
    ip_version,
    state,
    kind: 'tcp_connect',
    transport: 'tcp',
    purpose: 'data',
    warmth: 'cold',
    latency_ms: state === 'healthy' ? 0.2 : null,
    error: state === 'healthy' ? null : {code: state === 'unknown' ? 'address_unavailable' : 'probe_failed', message: ''},
    health_updated: true,
    observed_at: '2026-09-20T04:12:36.546Z',
    resolved_leaf_node_id: member_id
  });
  const summary = probeSummary({
    target: {type: 'group', group_id: 'g'},
    selection_changed: {tcp: false, udp: false},
    selection_before: {tcp: null, udp: null},
    selection_after: {tcp: null, udp: null},
    // Every member also gets an ipv6 row with no address; it must not hide the ipv4 answer.
    results: [
      row('a', 'ipv4', 'healthy'),
      row('a', 'ipv6', 'unknown'),
      row('b', 'ipv6', 'unknown'),
      row('b', 'ipv4', 'unavailable'),
      row('c', 'ipv4', 'unknown')
    ]
  } as unknown as Parameters<typeof probeSummary>[0]);
  expect(summary).toEqual({key: 'policy.probeUnchanged', params: {healthy: 1, unavailable: 1, unknown: 1}});
});
