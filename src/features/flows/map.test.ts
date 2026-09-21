import {expect, it} from 'vitest';
import {createMockApi} from '../../api/mock';
import type {GroupSummary} from '../../api/model';
import {flowsThrough, nodeNames, pinnedLabel, routingTree} from './map';

it('lays the config out as a tree and weights it with retained flows', async () => {
  const api = createMockApi();
  const [flows, groups, nodes, rules] = await Promise.all([api.flows(), api.groups(), api.nodes({limit: 1000}), api.rules()]);
  const tree = routingTree(flows.flows, groups, nodes.nodes, rules.rules);
  // Rules keep their evaluation order and every configured rule is there, used or not, joined to its outbound.
  expect(tree.rules.slice(0, rules.rules.length).map(rule => rule.id)).toEqual(rules.rules.map(rule => 'rule:' + rule.rule_id));
  for (const rule of rules.rules) {
    const entry = tree.rules.find(item => item.id === 'rule:' + rule.rule_id)!;
    expect(entry.label).toBe(rule.expression);
    expect(entry.must).toBe(rule.must);
    expect(tree.links.some(link => link.source === entry.id && link.target === 'outbound:' + rule.outbound)).toBe(true);
  }
  expect(tree.rules.find(rule => rule.fallback)?.outbound).toBe('outbound:' + rules.fallback.outbound);
  // Every configured group is an outbound with its selected node linked before any flow used it.
  for (const group of groups) {
    const outbound = tree.outbounds.find(item => item.label === group.name)!;
    expect(outbound.kind).toBe('group');
    expect(outbound.groups[0]).toMatchObject({name: group.name, kind: group.policy.kind});
    if (outbound.node) expect(tree.links.some(link => link.source === outbound.id && link.target === outbound.node)).toBe(true);
  }
  // Counts flow along the tree: the rule column adds up to the flow total; terminal outbounds have no node hop.
  expect(tree.rules.reduce((sum, rule) => sum + rule.count, 0)).toBe(flows.flows.length);
  expect(tree.outbounds.find(outbound => outbound.id === 'outbound:direct')).toMatchObject({kind: 'direct', node: null});
  expect(tree.links.some(link => link.source === 'outbound:direct')).toBe(false);
  const direct = flows.flows.filter(flow => flow.outbound === 'direct');
  expect(flowsThrough(flows.flows, 'outbound:direct', nodeNames(nodes.nodes))).toHaveLength(direct.length);
  // A flow that names a rule id lands on that entry rather than on a second one with the same text.
  const matched = flows.flows.find(flow => flow.rule_id && flow.rule_expression)!;
  expect(tree.rules.filter(rule => rule.id === 'rule:' + matched.rule_id)).toHaveLength(1);
  expect(flowsThrough(flows.flows, 'rule:' + matched.rule_id, nodeNames(nodes.nodes))).toContain(matched);
  expect(pinnedLabel('rule:' + matched.rule_id, rules.rules)).toBe(matched.rule_expression);
  expect(pinnedLabel('outbound:direct', rules.rules)).toBe('direct');
});

it('follows a nested selection to its node and draws the inner group inside the outbound', async () => {
  const api = createMockApi();
  const [groups, nodes, rules] = await Promise.all([api.groups(), api.nodes({limit: 1000}), api.rules()]);
  const inner = groups.find(group => group.name === 'resilient')!;
  const nested: GroupSummary[] = groups.map(group => (group.name === 'proxy' ? {...group, selection: {tcp_member_id: inner.id, udp_member_id: null}} : group));
  const tree = routingTree([], nested, nodes.nodes, rules.rules);
  const proxy = tree.outbounds.find(outbound => outbound.label === 'proxy')!;
  expect(proxy.groups.map(group => group.name)).toEqual(['proxy', 'resilient']);
  expect(proxy.node).toBe('node:' + nodeNames(nodes.nodes).get(inner.selection.tcp_member_id!));
  // The inner group is only drawn inside proxy unless a rule names it directly.
  const named = rules.rules.some(rule => rule.outbound === 'resilient');
  expect(tree.outbounds.some(outbound => outbound.label === 'resilient')).toBe(named);
});

it('takes a one-element chain as the leaf node the flow left through', async () => {
  const api = createMockApi();
  const [flows, groups, nodes] = await Promise.all([api.flows(), api.groups(), api.nodes({limit: 1000})]);
  const routed = flows.flows.find(flow => flow.chain.length > 1)!;
  const leaf = routed.chain[routed.chain.length - 1];
  const names = nodeNames(nodes.nodes);
  const single = routingTree([{...routed, chain: [leaf]}], groups, nodes.nodes, []);
  expect(single.links.some(link => link.target === 'node:' + names.get(leaf) && link.count === 1)).toBe(true);
  expect(single.nodes.some(node => node.unknown)).toBe(false);
});
