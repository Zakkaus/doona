import {expect, it} from 'vitest';
import type {ApiEvent, GroupSummary} from './model';
import {eventSummary, resolveSelectedLeaf, routineGap, shortId} from './selectors';
import {formatNumber, LOCALE, readLang, translate} from '../i18n';
import {createMockApi} from './mock';
import {probeSummary} from '../features/policies/view';

const gap = (reason: string, resource_id: string | null): ApiEvent =>
  ({
    id: 'x',
    event: 'flow.gap',
    data: {instance_id: 'i', observed_at: '2026-09-19T00:00:00Z', resource_id, reason, dropped_records: '1'}
  }) as ApiEvent;

it('treats recorder capacity gaps as Activity housekeeping, but keeps recording changes and unknown conditions', () => {
  expect(routineGap(gap('evicted', null))).toBe(true);
  expect(routineGap(gap('sampled', null))).toBe(true);
  expect(routineGap(gap('buffer_overflow', null))).toBe(true);
  expect(routineGap(gap('buffer_overflow', 'flow-1'))).toBe(true);
  expect(routineGap(gap('recording_changed', null))).toBe(false);
  expect(routineGap(gap('unknown', null))).toBe(false);
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

it('resolves deep group chains and stops at an actual cycle', async () => {
  const api = createMockApi();
  const node = (await api.nodes()).nodes[0];
  const template = (await api.groups())[0];
  const groups: GroupSummary[] = Array.from({length: 12}, (_, index) => ({
    ...template,
    id: `g${index}`,
    name: `g${index}`,
    selection: {tcp_member_id: index === 11 ? node.id : `g${index + 1}`, udp_member_id: null}
  }));
  const byId = new Map(groups.map(group => [group.id, group]));
  const nodes = new Map([[node.id, node]]);
  expect(resolveSelectedLeaf('g0', 'tcp', byId, byId, nodes)).toEqual({groups, member: node.id, node});
  groups[11].selection.tcp_member_id = 'g0';
  expect(resolveSelectedLeaf('g0', 'tcp', byId, byId, nodes)).toEqual({groups, member: null, node: null});
});

it('groups dropped counts in gap summaries without rounding a large UInt64', () => {
  const dropped = (dropped_records: string | null) => {
    const event = gap('buffer_overflow', null) as Extract<ApiEvent, {event: 'flow.gap'}>;
    return eventSummary({...event, data: {...event.data, dropped_records}} as ApiEvent);
  };
  expect(translate('en', 'event.gap', dropped('12345').params)).toContain('12,345');
  expect(dropped('18446744073709551615').params?.n).toBe(formatNumber(18446744073709551615n, LOCALE[readLang()]));
  expect(dropped(null).params?.n).toBe('—');
});
