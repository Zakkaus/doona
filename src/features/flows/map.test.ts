import {expect, it} from 'vitest';
import {createMockApi} from '../../api/mock';
import type {FlowSummary} from '../../api/model';
import {flowMap, flowsThrough, nodeNames, topologyMap} from './map';

it('lays the config out as columns and weights them with retained flows', async () => {
  const api = createMockApi();
  const [flows, groups, nodes] = await Promise.all([api.flows(), api.groups(), api.nodes({limit: 1000})]);
  const map = flowMap(flows.flows, groups, nodes.nodes);
  const stages = (stage: string) => map.nodes.filter(node => node.stage === stage);
  // Every configured group is a column entry, used or not; direct and block only appear when a flow took them.
  for (const group of groups) expect(stages('outbound').some(node => node.label === group.name)).toBe(true);
  // A group's selected node is linked from config even with zero flows through it.
  const configured = map.links.filter(link => link.configured);
  expect(configured.length).toBeGreaterThan(0);
  for (const link of configured) expect(link.source.startsWith('outbound:') && link.target.startsWith('node:')).toBe(true);
  // Counts flow along the path: the rule column adds up to the flow total.
  expect(stages('rule').reduce((sum, node) => sum + node.count, 0)).toBe(flows.flows.length);
  // Terminal outbounds have no node hop.
  const direct = flows.flows.filter(flow => flow.outbound === 'direct');
  expect(flowsThrough(flows.flows, 'outbound:direct', nodeNames(nodes.nodes))).toHaveLength(direct.length);
  expect(map.links.some(link => link.source === 'outbound:direct')).toBe(false);
  // Sorted busiest first, unknowns after named entries of the same weight.
  const rules = stages('rule');
  for (let i = 1; i < rules.length; i++) expect(rules[i - 1].count).toBeGreaterThanOrEqual(rules[i].count);
});

it('draws configured rules into the map before any flow used them, joined to flows by rule id', async () => {
  const api = createMockApi();
  const [flows, groups, nodes, rules] = await Promise.all([api.flows(), api.groups(), api.nodes({limit: 1000}), api.rules()]);
  const configured = rules.rules.filter(rule => rule.outbound);
  const map = flowMap([], groups, nodes.nodes, rules.rules);
  // Every configured rule is a column entry with a configured link into its outbound.
  for (const rule of configured) {
    const entry = map.nodes.find(node => node.id === 'rule:' + rule.rule_id);
    expect(entry?.label).toBe(rule.expression);
    expect(entry?.count).toBe(0);
    expect(map.links.some(link => link.source === 'rule:' + rule.rule_id && link.target === 'outbound:' + rule.outbound && link.configured)).toBe(true);
  }
  // A flow that names a rule id lands on that entry rather than on a second one with the same text.
  const matched = flows.flows.find(flow => flow.rule_id && flow.rule_expression);
  if (matched) {
    const withFlows = flowMap(flows.flows, groups, nodes.nodes, rules.rules);
    const entries = withFlows.nodes.filter(node => node.id === 'rule:' + matched.rule_id);
    expect(entries).toHaveLength(1);
    expect(entries[0].count).toBeGreaterThan(0);
    expect(flowsThrough(flows.flows, 'rule:' + matched.rule_id, nodeNames(nodes.nodes))).toContain(matched);
  }
});

it('takes a one-element chain as the leaf node the flow left through', async () => {
  const api = createMockApi();
  const [flows, groups, nodes] = await Promise.all([api.flows(), api.groups(), api.nodes({limit: 1000})]);
  const routed = flows.flows.find(flow => flow.chain.length > 1)!;
  const leaf = routed.chain[routed.chain.length - 1];
  const map = flowMap([{...routed, chain: [leaf]}], groups, nodes.nodes);
  // Configured selections add their own node entries; the flow itself must be counted at its leaf, not at unknown.
  const names = nodeNames(nodes.nodes);
  expect(map.links.some(link => link.target === 'node:' + names.get(leaf) && link.count === 1)).toBe(true);
  expect(map.nodes.some(node => node.stage === 'node' && node.unknown)).toBe(false);
});

it('joins client sockets by IP, including IPv6 and missing input', async () => {
  const api = createMockApi();
  const {flows} = await api.flows();
  const seed = flows.find(flow => flow.input)!;
  const records: FlowSummary[] = ['10.0.0.12:4000', '10.0.0.12:5000', '[2001:db8::12]:5000'].map(src => ({...seed, input: {...seed.input!, src}}));
  records.push({...seed, input: undefined});
  const map = flowMap(records, [], []);
  expect(map.nodes.filter(node => node.stage === 'client').map(node => [node.label, node.count])).toEqual([
    ['10.0.0.12', 2],
    ['2001:db8::12', 1],
    ['unknown', 1]
  ]);
  expect(flowsThrough(records, 'client:10.0.0.12', new Map())).toEqual(records.slice(0, 2));
  expect(map.links.filter(link => link.source === 'client:10.0.0.12').reduce((sum, link) => sum + link.count, 0)).toBe(2);
});

it('caps each topology column without losing counts, paths, or aggregate pin membership', async () => {
  const api = createMockApi();
  const {flows} = await api.flows();
  const seed = flows.find(flow => flow.input)!;
  const records = Array.from({length: 14}, (_, i) => ({
    ...seed,
    input: {...seed.input!, src: `10.0.0.${i + 1}:4000`},
    rule_id: `r${i}`,
    rule_expression: `rule ${i}`,
    outbound: `group ${i}`,
    chain: [`node ${i}`]
  }));
  records.push(records[0]);
  const map = topologyMap(flowMap(records, [], []));
  for (const stage of ['client', 'rule', 'outbound', 'node']) {
    const column = map.nodes.filter(node => node.stage === stage);
    expect(column).toHaveLength(12);
    expect(column.reduce((sum, node) => sum + node.count, 0)).toBe(15);
    const others = column.find(node => node.others)!;
    expect(others.count).toBe(3);
    expect(flowsThrough(records, others.id, new Map())).toHaveLength(3);
    if (stage !== 'node') expect(map.links.filter(link => column.some(node => node.id === link.source)).reduce((sum, link) => sum + link.count, 0)).toBe(15);
  }
  expect(map.paths.every(path => path.length === 4 && path.every(id => map.nodes.some(node => node.id === id)))).toBe(true);
  expect(topologyMap(flowMap(records.slice(0, 12), [], [])).nodes.some(node => node.others)).toBe(false);
});
