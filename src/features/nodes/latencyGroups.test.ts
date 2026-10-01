import {expect, it} from 'vitest';
import type {HealthObservation, Node} from '../../api/model';
import {isSlowerThanUsual, latencyAverages, latencyGroups, latencyMax, usualRange, type LatencyRow} from './latencyGroups';

const locale = 'en-US';

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
  const [group] = latencyGroups(nodes, [{id: 'g1', name: 'proxy'} as never], 'group', locale);
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
  const groups = latencyGroups(nodes, [{id: 'g1', name: 'b'} as never, {id: 'g2', name: 'a'} as never], 'group', locale);
  expect(groups.map(group => group.label)).toEqual(['a', 'b', null]);
  expect(groups[1].rows.map(row => row.id)).toEqual(['fast', 'slow']);
  expect(groups[1].missing).toEqual([{id: 'down', name: 'down', state: 'unavailable'}]);
  expect(groups[2].missing).toEqual([{id: 'new', name: 'new', state: 'unmeasured'}]);
});

it('groups by protocol and rounds the axis end up', () => {
  const nodes = [node('x', [], [observation({latency_ms: 130})], 'trojan'), node('y', [], [observation({latency_ms: 20})], 'vless')];
  expect(latencyGroups(nodes, [], 'protocol', locale).map(group => group.label)).toEqual(['trojan', 'vless']);
  expect(latencyMax(latencyGroups(nodes, [], 'protocol', locale))).toBe(200);
});

// honk reports both averages as fractional milliseconds on a healthy row and null on an unavailable one.
it.each([
  {name: 'both averages', patch: {latency_ms: 48.2, moving_avg_ms: 47.5, avg10_ms: 51.25}, row: {latest: 48.2, moving: 47.5, avg10: 51.25}},
  {name: 'no averages', patch: {latency_ms: 48, moving_avg_ms: null, avg10_ms: null}, row: {latest: 48, moving: null, avg10: null}},
  {name: 'an unavailable row', patch: {state: 'unavailable' as const, latency_ms: null, moving_avg_ms: null, avg10_ms: null}, row: null}
])('reads $name from honk', ({patch, row}) => {
  const [group] = latencyGroups([node('a', [], [observation(patch)])], [], 'protocol', locale);
  expect(group.rows).toEqual(row ? [{id: 'a', name: 'a', ...row}] : []);
  expect(group.missing).toEqual(row ? [] : [{id: 'a', name: 'a', state: 'unavailable'}]);
});

// Only the latest values are drawn, so the averages leave the axis end alone.
it.each([
  {
    name: 'latest values alone',
    rows: [
      [130, null, null],
      [20, null, null]
    ],
    max: 200
  },
  {name: 'averages past the latest', rows: [[40, 70, 90]], max: 60},
  {name: 'a fractional latest value', rows: [[12.5, 13.5, 14.25]], max: 20}
])('ends the axis for $name', ({rows, max}) => {
  const nodes = rows.map(([latency_ms, moving_avg_ms, avg10_ms], i) => node('n' + i, [], [observation({latency_ms, moving_avg_ms, avg10_ms})]));
  expect(latencyMax(latencyGroups(nodes, [], 'protocol', locale))).toBe(max);
});

it('keeps the axis clear of a lone outlier', () => {
  const nodes = [...Array(10)].map((_, i) => node('n' + i, [], [observation({latency_ms: 30 + i, moving_avg_ms: 30 + i, avg10_ms: 30 + i})], 'vless'));
  nodes.push(node('far', [], [observation({latency_ms: 2000, moving_avg_ms: 1900, avg10_ms: 1800})], 'vless'));
  expect(latencyMax(latencyGroups(nodes, [], 'protocol', locale))).toBe(60);
});

it('names only the averages some node reports', () => {
  const none = latencyGroups([node('a', [], [observation({moving_avg_ms: null, avg10_ms: null})])], [], 'protocol', locale);
  expect(latencyAverages(none)).toEqual({moving: false, avg10: false});
  const some = latencyGroups(
    [node('a', [], [observation({moving_avg_ms: null, avg10_ms: null})]), node('b', [], [observation({moving_avg_ms: 40, avg10_ms: null})])],
    [],
    'protocol',
    locale
  );
  expect(latencyAverages(some)).toEqual({moving: true, avg10: false});
});

// The dot turns to the warning colour only well past the higher average, by ratio and by milliseconds.
it.each([
  {name: 'inside the band', latest: 50, moving: 40, avg10: 60, range: [40, 60], slower: false},
  {name: 'below the band', latest: 20, moving: 40, avg10: 60, range: [40, 60], slower: false},
  {name: 'at the ratio edge', latest: 130, moving: 100, avg10: 90, range: [90, 100], slower: false},
  {name: 'just past the ratio edge', latest: 130.1, moving: 100, avg10: 90, range: [90, 100], slower: true},
  {name: 'at the millisecond edge', latest: 60, moving: 40, avg10: 30, range: [30, 40], slower: true},
  {name: 'short of the millisecond edge', latest: 59.9, moving: 40, avg10: 30, range: [30, 40], slower: false},
  {name: 'past the ratio on a fast node', latest: 29, moving: 10, avg10: 9, range: [9, 10], slower: false},
  {name: 'one average', latest: 71, moving: null, avg10: 50, range: [50, 50], slower: true},
  {name: 'no averages', latest: 900, moving: null, avg10: null, range: null, slower: false}
])('reads a latest latency $name', ({latest, moving, avg10, range, slower}) => {
  const row: LatencyRow = {id: 'a', name: 'a', latest, moving, avg10};
  expect(usualRange(row)).toEqual(range);
  expect(isSlowerThanUsual(row)).toBe(slower);
});
