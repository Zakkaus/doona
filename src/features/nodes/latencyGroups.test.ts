import {expect, it} from 'vitest';
import type {HealthObservation, Node} from '../../api/model';
import {latencyAverages, latencyGroups, latencyMax} from './latencyGroups';

const observation = (patch: Partial<HealthObservation>): HealthObservation =>
  ({
    transport: 'tcp',
    purpose: 'data',
    ip_version: 'ipv4',
    warmth: 'warm',
    measurement: 'http_round_trip',
    sample_source: 'probe',
    state: 'healthy',
    latency_ms: 50,
    moving_avg_ms: 60,
    avg10_ms: 70,
    observed_at: '2026-09-23T00:00:00Z',
    error: null,
    ...patch
  }) as HealthObservation;
const node = (id: string, group_ids: string[], health: HealthObservation[], protocol = 'vless'): Node =>
  ({id, name: id, protocol, subscription_tag: null, provider_id: null, group_ids, health}) as unknown as Node;

it('reads the preferred observation and keeps a latest value outside both averages', () => {
  const nodes = [node('a', ['g1'], [observation({transport: 'udp', latency_ms: 1}), observation({latency_ms: 200, moving_avg_ms: 40, avg10_ms: 45})])];
  const [group] = latencyGroups(nodes, [{id: 'g1', name: 'proxy'} as never], 'group');
  expect(group.label).toBe('proxy');
  expect(group.rows).toEqual([{id: 'a', name: 'a', latest: 200, moving: 40, avg10: 45}]);
});

it('lists failed and unmeasured nodes apart, and a node in two groups under each', () => {
  const nodes = [
    node('fast', ['g1', 'g2'], [observation({latency_ms: 20})]),
    node('slow', ['g1'], [observation({latency_ms: 90})]),
    node('down', ['g1'], [observation({state: 'unavailable', latency_ms: null})]),
    node('new', [], [])
  ];
  const groups = latencyGroups(nodes, [{id: 'g1', name: 'b'} as never, {id: 'g2', name: 'a'} as never], 'group');
  expect(groups.map(group => group.label)).toEqual(['a', 'b', null]);
  expect(groups[1].rows.map(row => row.id)).toEqual(['fast', 'slow']);
  expect(groups[1].missing).toEqual([{id: 'down', name: 'down', state: 'unavailable'}]);
  expect(groups[2].missing).toEqual([{id: 'new', name: 'new', state: 'unmeasured'}]);
});

it('groups by protocol and rounds the axis end up', () => {
  const nodes = [node('x', [], [observation({latency_ms: 130})], 'trojan'), node('y', [], [observation({latency_ms: 20})], 'vless')];
  expect(latencyGroups(nodes, [], 'protocol').map(group => group.label)).toEqual(['trojan', 'vless']);
  expect(latencyMax(latencyGroups(nodes, [], 'protocol'))).toBe(200);
});

it('keeps the axis clear of a lone outlier', () => {
  const nodes = [...Array(10)].map((_, i) => node('n' + i, [], [observation({latency_ms: 30 + i, moving_avg_ms: 30 + i, avg10_ms: 30 + i})], 'vless'));
  nodes.push(node('far', [], [observation({latency_ms: 2000, moving_avg_ms: 1900, avg10_ms: 1800})], 'vless'));
  expect(latencyMax(latencyGroups(nodes, [], 'protocol'))).toBe(60);
});

it('names only the averages some node reports', () => {
  const none = latencyGroups([node('a', [], [observation({moving_avg_ms: null, avg10_ms: null})])], [], 'protocol');
  expect(latencyAverages(none)).toEqual({moving: false, avg10: false});
  const some = latencyGroups(
    [node('a', [], [observation({moving_avg_ms: null, avg10_ms: null})]), node('b', [], [observation({moving_avg_ms: 40, avg10_ms: null})])],
    [],
    'protocol'
  );
  expect(latencyAverages(some)).toEqual({moving: true, avg10: false});
});
