import {describe, expect, it} from 'vitest';
import type {HealthObservation, Node} from '../api/model';
import {probeKinds} from '../api/selectors';
import {nodeIndex, steadyNodes} from './nodes';
import {poll, steadyBase as base, withLatency} from './testHelpers';

const withHealthTimes = (nodes: Node[], index: number) =>
  nodes.map((node, i) =>
    i === index ? {...node, health: node.health.map((row, r) => ({...row, observed_at: r === 0 ? '2026-10-05T00:01:00.000Z' : row.observed_at}))} : node
  );

const edit = (nodes: Node[], index: number, patch: Partial<Node>) => nodes.map((node, i) => (i === index ? {...node, ...patch} : node));
const editHealth = (nodes: Node[], index: number, patch: Partial<HealthObservation>) =>
  nodes.map((node, i) => (i === index ? {...node, health: node.health.map((row, r) => (r === 0 ? {...row, ...patch} : row))} : node));

// One node whose TCP connect probe has two rows of the same kind, so which of them is the latest decides what shows.
const twinTimes = (first: string, second: string) =>
  base.map((node, i) => {
    if (i !== 0) return node;
    const row = node.health.find(h => h.transport === 'tcp' && h.purpose === 'data' && h.ip_version === 'ipv4')!;
    const others = node.health.filter(h => h !== row);
    return {...node, health: [...others, {...row, latency_ms: 50, observed_at: first}, {...row, latency_ms: 90, observed_at: second}]};
  });
const early = '2026-10-05T00:00:10.000Z';
const middle = '2026-10-05T00:00:20.000Z';
const late = '2026-10-05T00:00:30.000Z';
const twin = twinTimes(early, middle);
// What the tables show for a node: the latency of each probe kind's latest observation.
const shown = (node: Node) => probeKinds(node.health).map(({kind, observation}) => [kind, observation.state, observation.latency_ms, observation.error]);

describe('steadyNodes', () => {
  const measured = base.findIndex(node => node.health.length > 1);
  const changes = [
    {name: 'a poll that moves only the probe times keeps the list', previous: base, next: () => poll(base), moved: []},
    {name: 'one moved reading replaces only that node', previous: base, next: () => withLatency(poll(base), 1, 4321), moved: [1]},
    {name: 'times that change order replace the node', previous: base, next: () => withHealthTimes(base, measured), moved: [measured]},
    {name: 'a renamed node is replaced', previous: base, next: () => edit(poll(base), 2, {name: 'renamed'}), moved: [2]},
    {name: 'a changed state is replaced', previous: base, next: () => editHealth(poll(base), 3, {state: 'unavailable', latency_ms: null}), moved: [3]},
    {name: 'a changed error is replaced', previous: base, next: () => editHealth(poll(base), 4, {error: 'probe_failed'}), moved: [4]},
    {name: 'changed group ids are replaced', previous: base, next: () => edit(poll(base), 1, {group_ids: ['group-x']}), moved: [1]},
    {name: 'a changed protocol is replaced', previous: base, next: () => edit(poll(base), 0, {protocol: 'hysteria2'}), moved: [0]},
    {name: 'a changed provider is replaced', previous: base, next: () => edit(poll(base), 5, {provider_id: 'other-provider'}), moved: [5]},
    {name: 'both rows of one kind moving on together keep the node', previous: twin, next: () => twinTimes(middle, late), moved: []},
    {name: 'the latest row of one kind switching replaces the node', previous: twin, next: () => twinTimes(late, middle), moved: [0]}
  ];
  it.each(changes)('$name', ({previous, next, moved}) => {
    const after = next();
    const result = steadyNodes(previous, after);
    if (!moved.length) expect(result).toBe(previous);
    expect(result.map(node => node.id)).toEqual(after.map(node => node.id));
    result.forEach((node, i) => {
      if (moved.includes(i)) expect(node).toBe(after[i]);
      else expect(node).toBe(previous[i]);
      expect(shown(node)).toEqual(shown(after[i]));
    });
  });
  it('shows the other row as the latest when the latest of one kind switches', () => {
    const [before, after] = [twin[0], steadyNodes(twin, twinTimes(late, middle))[0]];
    expect(shown(before)).not.toEqual(shown(after));
    expect(probeKinds(before.health).find(row => row.kind === 'TCP')?.observation.latency_ms).toBe(90);
    expect(probeKinds(after.health).find(row => row.kind === 'TCP')?.observation.latency_ms).toBe(50);
  });
  const reorders = [
    {name: 'a reordered list keeps every node and follows the new order', after: () => poll(base).reverse(), changed: new Set<string>()},
    {
      name: 'a reordered list still replaces the node that changed',
      after: () => {
        const list = withLatency(poll(base), 2, 999);
        return [list[3], list[2], list[0], list[5], list[1], list[4]];
      },
      changed: new Set([base[2].id])
    }
  ];
  it.each(reorders)('$name', ({after: build, changed}) => {
    const after = build();
    const result = steadyNodes(base, after);
    expect(result).not.toBe(base);
    expect(result.map(node => node.id)).toEqual(after.map(node => node.id));
    result.forEach((node, i) => {
      if (changed.has(node.id)) expect(node).toBe(after[i]);
      else expect(node).toBe(base.find(old => old.id === node.id));
      expect(shown(node)).toEqual(shown(after[i]));
    });
  });
  it('keeps the unchanged nodes when the list grows or shrinks', () => {
    const grown = steadyNodes(base, [...poll(base), {...base[0], id: 'extra'}]);
    expect(grown).not.toBe(base);
    expect(grown.slice(0, base.length)).toEqual(base);
    grown.slice(0, base.length).forEach((node, i) => expect(node).toBe(base[i]));
    const shrunk = steadyNodes(base, poll(base).slice(1));
    shrunk.forEach((node, i) => expect(node).toBe(base[i + 1]));
  });
});

describe('nodeIndex', () => {
  it.each(base.map(node => ({id: node.id, node})))('finds $id', ({id, node}) => expect(nodeIndex(base).get(id)).toBe(node));
  it('builds one index per list and a new one for a new list', () => {
    expect(nodeIndex(base)).toBe(nodeIndex(base));
    expect(nodeIndex(poll(base))).not.toBe(nodeIndex(base));
  });
});
