import {expect, it} from 'vitest';
import {createMockApi} from '../../api/mock';
import {flowMap, flowsThrough, lanes} from './map';

it('lays the config out as columns and weights them with retained flows', async () => {
  const api = createMockApi();
  const [flows, groups, nodes] = await Promise.all([api.flows(), api.groups(), api.nodes({limit: 1000})]);
  const map = flowMap(flows.flows, groups, nodes.nodes);
  const stages = (stage: string) => map.nodes.filter(node => node.stage === stage);
  expect(map.total).toBe(flows.flows.length);
  // Every configured group is a column entry, used or not; direct and block only appear when a flow took them.
  for (const group of groups) expect(stages('outbound').some(node => node.label === group.name)).toBe(true);
  // A group's selected node is linked from config even with zero flows through it.
  const configured = map.links.filter(link => link.configured);
  expect(configured.length).toBeGreaterThan(0);
  for (const link of configured) expect(link.source.startsWith('outbound:') && link.target.startsWith('node:')).toBe(true);
  // A path keeps its outbound on every hop, so an ingress can fan out in as many colours as it has outbounds.
  const lanOutbounds = new Set(map.links.filter(link => link.source === 'ingress:lan').map(link => link.outbound));
  expect(lanOutbounds.size).toBeGreaterThan(1);
  // Counts flow along the path: the ingress column adds up to the flow total.
  expect(stages('ingress').reduce((sum, node) => sum + node.count, 0)).toBe(flows.flows.length);
  // Terminal outbounds have no node hop.
  const direct = flows.flows.filter(flow => flow.outbound === 'direct');
  expect(flowsThrough(flows.flows, 'outbound:direct')).toHaveLength(direct.length);
  expect(map.links.some(link => link.source === 'outbound:direct')).toBe(false);
  // Sorted busiest first, unknowns after named entries of the same weight.
  const rules = stages('rule');
  for (let i = 1; i < rules.length; i++) expect(rules[i - 1].count).toBeGreaterThanOrEqual(rules[i].count);
});

it('folds the map into one lane per outbound with its rules and selected node', async () => {
  const api = createMockApi();
  const [flows, groups, nodes] = await Promise.all([api.flows(), api.groups(), api.nodes({limit: 1000})]);
  const map = flowMap(flows.flows, groups, nodes.nodes);
  const rows = lanes(map);
  expect(rows.map(lane => lane.outbound.label)).toEqual(map.nodes.filter(node => node.stage === 'outbound').map(node => node.label));
  const proxy = rows.find(lane => lane.outbound.label === 'proxy')!;
  expect(proxy.rules.reduce((sum, rule) => sum + rule.count, 0)).toBe(proxy.outbound.count);
  expect(proxy.node?.node.label).toBe('hk-01');
  // A group nothing used still shows its configured node, marked as configured only.
  const airport = rows.find(lane => lane.outbound.label === 'airport')!;
  expect(airport.rules).toEqual([]);
  expect(airport.node?.configured).toBe(true);
  expect(airport.node?.count).toBe(0);
  // Terminal outbounds have no node.
  expect(rows.find(lane => lane.outbound.label === 'direct')!.node).toBeNull();
});
