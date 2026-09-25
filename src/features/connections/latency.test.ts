import {expect, it} from 'vitest';
import type {HealthObservation, Node} from '../../api/model';
import {pathLatency} from './latency';

const tcp = (latency_ms: number | null, patch: Partial<HealthObservation> = {}) =>
  ({
    transport: 'tcp',
    purpose: 'data',
    ip_version: 'ipv4',
    warmth: 'warm',
    measurement: 'tcp_connect',
    state: latency_ms === null ? 'unavailable' : 'healthy',
    latency_ms,
    ...patch
  }) as HealthObservation;
const node = (id: string, health: HealthObservation[] | undefined) => ({id, name: id.toUpperCase(), health}) as Node;
const row = (id: string, outbound: string | null, chain: string[] | undefined) =>
  ({id, outbound, chain}) as {id: string; outbound: string | null; chain: string[]};

it('plots every node with a latency and marks the ones current connections use', () => {
  const view = pathLatency(
    [
      row('a', 'proxy', ['proxy', 'hk']),
      row('b', 'proxy', ['proxy', 'hk']),
      row('c', 'proxy', ['proxy', 'hk']),
      row('d', 'media', ['media', 'jp']),
      row('e', 'direct', []),
      row('f', 'block', []),
      row('g', 'proxy', ['proxy', 'us']),
      row('h', 'proxy', ['proxy', 'gone'])
    ],
    // The UDP DNS sample is not the data path; the TCP data sample is.
    [
      node('hk', [tcp(20, {transport: 'udp', purpose: 'dns'}), tcp(40)]),
      node('jp', [tcp(90)]),
      node('us', [tcp(null)]),
      node('sg', [tcp(30)]),
      node('idle', [])
    ]
  )!;
  // Fastest first; a node nothing goes through is still plotted, with no connections.
  expect(view.samples).toEqual([
    {node: 'sg', name: 'SG', value: 30, connections: 0},
    {node: 'hk', name: 'HK', value: 40, connections: 3},
    {node: 'jp', name: 'JP', value: 90, connections: 1}
  ]);
  expect(view.chains).toBe(true);
  // A failed node and one never measured have no latency.
  expect(view.missing).toBe(2);
  expect(view.used).toBe(2);
  // Across the nodes, each counted once.
  expect(view.p50).toBe(40);
  expect(view.p90).toBe(90);
  // Across the four connections through a plotted node, each standing at its node's latency.
  expect(view.weightedP50).toBe(40);
  // The connections through the failed node and the missing one are left out of it, and counted.
  expect(view.unplaced).toBe(2);
});

it('weights only its own median by connections', () => {
  const rows = [...Array.from({length: 8}, (_, i) => row('s' + i, 'proxy', ['slow'])), row('f', 'proxy', ['fast']), row('m', 'proxy', ['mid'])];
  const view = pathLatency(rows, [node('slow', [tcp(200)]), node('fast', [tcp(10)]), node('mid', [tcp(50)])])!;
  expect(view.p50).toBe(50);
  expect(view.weightedP50).toBe(200);
});

it('plots every node without highlight when the connections carry no chains', () => {
  // Today's honk without flow recording sends empty chains; an older backend sends none.
  for (const chain of [[], undefined]) {
    const view = pathLatency([row('a', 'proxy', chain), row('b', 'direct', [])], [node('hk', [tcp(40)]), node('jp', [tcp(90)])])!;
    expect(view.chains).toBe(false);
    expect(view.samples.map(s => [s.node, s.connections])).toEqual([
      ['hk', 0],
      ['jp', 0]
    ]);
    expect(view.used).toBe(0);
    expect(view.weightedP50).toBeNull();
    expect(view.p50).toBe(40);
    expect(view.unplaced).toBe(0);
  }
});

it('has no samples while every node has failed, and nothing to say without nodes or health samples', () => {
  const view = pathLatency([row('a', 'proxy', ['hk'])], [node('hk', [tcp(null)])])!;
  expect(view.samples).toEqual([]);
  expect([view.p50, view.p90, view.weightedP50]).toEqual([null, null, null]);
  expect(view.missing).toBe(1);
  expect(pathLatency([row('a', 'proxy', ['hk'])], [])).toBeNull();
  expect(pathLatency([], [node('hk', []), node('jp', undefined)])).toBeNull();
});
