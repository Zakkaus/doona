import {expect, it} from 'vitest';
import {createMockApi} from '../../../api/mock';
import type {GroupSummary} from '../../../api/model';
import {flowsThrough, nodeNames, pinnedLabel, routingTree, treeIndex, treeRows} from './map';

it('lays the config out as a tree and weights it with retained flows', async () => {
  const api = createMockApi();
  const [flows, groups, nodes, rules] = await Promise.all([api.flows(), api.groups(), api.nodes({limit: 1000}), api.rules()]);
  const tree = routingTree(flows.flows, groups, nodes.nodes, rules.rules);
  // Rules keep their evaluation order and every configured rule is there, used or not, joined to its outbound.
  expect(tree.leaves.slice(0, rules.rules.length).map(rule => rule.id)).toEqual(rules.rules.map(rule => 'rule:' + rule.rule_id));
  for (const rule of rules.rules) {
    const entry = tree.leaves.find(item => item.id === 'rule:' + rule.rule_id)!;
    expect(entry.label).toBe(rule.expression);
    expect(entry.must).toBe(rule.must);
    expect(tree.links.some(link => link.source === entry.id && link.target === 'outbound:' + rule.outbound)).toBe(true);
  }
  expect(tree.leaves.find(rule => rule.fallback)?.outbound).toBe('outbound:' + rules.fallback.outbound);
  // Every configured group is an outbound with its selected node linked before any flow used it.
  for (const group of groups) {
    const outbound = tree.outbounds.find(item => item.label === group.name)!;
    expect(outbound.kind).toBe('group');
    expect(outbound.groups[0]).toMatchObject({name: group.name, kind: group.policy.kind});
    if (outbound.node) expect(tree.links.some(link => link.source === outbound.id && link.target === outbound.node)).toBe(true);
  }
  // Counts flow along the tree: the rule column adds up to the flow total; terminal outbounds have no node hop.
  expect(tree.leaves.reduce((sum, rule) => sum + rule.count, 0)).toBe(flows.flows.length);
  expect(tree.outbounds.find(outbound => outbound.id === 'outbound:direct')).toMatchObject({kind: 'direct', node: null});
  expect(tree.links.some(link => link.source === 'outbound:direct')).toBe(false);
  const direct = flows.flows.filter(flow => flow.outbound === 'direct');
  expect(flowsThrough(flows.flows, 'outbound:direct', rules.rules)).toHaveLength(direct.length);
  // A flow that names a rule id lands on that entry rather than on a second one with the same text.
  const matched = flows.flows.find(flow => flow.rule_id && flow.rule_expression)!;
  expect(tree.leaves.filter(rule => rule.id === 'rule:' + matched.rule_id)).toHaveLength(1);
  expect(flowsThrough(flows.flows, 'rule:' + matched.rule_id, rules.rules)).toContain(matched);
  const label = (name: string | null) => (name === 'direct' ? 'Direct' : String(name));
  expect(pinnedLabel('rule:' + matched.rule_id, rules.rules, nodeNames(nodes.nodes), label)).toBe(matched.rule_expression);
  expect(pinnedLabel('outbound:direct', rules.rules, nodeNames(nodes.nodes), label)).toBe('Direct');
  expect(pinnedLabel('node:' + nodes.nodes[0].id, rules.rules, nodeNames(nodes.nodes), label)).toBe(nodes.nodes[0].name);
});

it('follows a nested selection to its node and draws the inner group inside the outbound', async () => {
  const api = createMockApi();
  const [groups, nodes, rules] = await Promise.all([api.groups(), api.nodes({limit: 1000}), api.rules()]);
  const inner = groups.find(group => group.name === 'resilient')!;
  const nested: GroupSummary[] = groups.map(group => (group.name === 'proxy' ? {...group, selection: {tcp_member_id: inner.id, udp_member_id: null}} : group));
  const tree = routingTree([], nested, nodes.nodes, rules.rules);
  const proxy = tree.outbounds.find(outbound => outbound.label === 'proxy')!;
  expect(proxy.groups.map(group => group.name)).toEqual(['proxy', 'resilient']);
  expect(proxy.node).toBe('node:' + inner.selection.tcp_member_id);
  // The inner group is only drawn inside proxy unless a rule names it directly.
  const named = rules.rules.some(rule => rule.outbound === 'resilient');
  expect(tree.outbounds.some(outbound => outbound.label === 'resilient')).toBe(named);
});

it('takes a one-element chain as the leaf node the flow left through', async () => {
  const api = createMockApi();
  const [flows, groups, nodes] = await Promise.all([api.flows(), api.groups(), api.nodes({limit: 1000})]);
  const routed = flows.flows.find(flow => flow.chain.length > 1)!;
  const leaf = routed.chain[routed.chain.length - 1];
  const single = routingTree([{...routed, chain: [leaf]}], groups, nodes.nodes, []);
  expect(single.links.some(link => link.target === 'node:' + leaf && link.count === 1)).toBe(true);
  expect(single.nodes.find(node => node.id === 'node:' + leaf)?.label).toBe(nodeNames(nodes.nodes).get(leaf));
  expect(single.nodes.some(node => node.unknown)).toBe(false);
});

it('rows the tree with rules as leaves under their outbound and parents level with their children', async () => {
  const api = createMockApi();
  const [flows, groups, nodes, rules] = await Promise.all([api.flows(), api.groups(), api.nodes({limit: 1000}), api.rules()]);
  const tree = routingTree(flows.flows, groups, nodes.nodes, rules.rules);
  const {rows, at} = treeRows(tree);
  // Every item has a row; the leaves take whole rows and never share one.
  const leaves = [...tree.leaves, ...tree.outbounds.filter(outbound => !tree.leaves.some(rule => treeIndex(tree).parents.get(rule.id) === outbound.id))];
  expect(new Set(leaves.map(item => at.get(item.id)))).toHaveProperty('size', leaves.length);
  expect(rows).toBe(leaves.length + tree.nodes.filter(node => !tree.outbounds.some(outbound => treeIndex(tree).parents.get(outbound.id) === node.id)).length);
  for (const outbound of tree.outbounds) {
    const under = tree.leaves.filter(rule => treeIndex(tree).parents.get(rule.id) === outbound.id).map(rule => at.get(rule.id)!);
    if (!under.length) continue;
    expect(at.get(outbound.id)).toBe((Math.min(...under) + Math.max(...under)) / 2);
    // Siblings sit on consecutive rows, so their connectors never cross another branch.
    expect(Math.max(...under) - Math.min(...under)).toBe(under.length - 1);
  }
  for (const node of tree.nodes) {
    const under = tree.outbounds.filter(outbound => treeIndex(tree).parents.get(outbound.id) === node.id).map(outbound => at.get(outbound.id)!);
    if (under.length) expect(at.get(node.id)).toBe((Math.min(...under) + Math.max(...under)) / 2);
  }
});

it('keeps one transport through a nested chain and hides a group only reached through another', async () => {
  const api = createMockApi();
  const [groups, nodes, rules] = await Promise.all([api.groups(), api.nodes({limit: 1000}), api.rules()]);
  const inner = groups.find(group => group.name === 'gaming')!;
  // proxy selects gaming for UDP only; the tree follows UDP into gaming rather than switching to its TCP pick.
  const nested: GroupSummary[] = groups.map(group => (group.name === 'proxy' ? {...group, selection: {tcp_member_id: null, udp_member_id: inner.id}} : group));
  const tree = routingTree([], nested, nodes.nodes, rules.rules);
  const proxy = tree.outbounds.find(outbound => outbound.label === 'proxy')!;
  expect(proxy.groups.map(group => group.name)).toEqual(['proxy', 'gaming']);
  expect(proxy.node).toBe('node:' + inner.selection.udp_member_id);
  expect(tree.outbounds.some(outbound => outbound.label === 'gaming')).toBe(rules.rules.some(rule => rule.outbound === 'gaming'));
});

it('keeps a retained flow from an earlier generation apart from the rule that now holds its id', async () => {
  const api = createMockApi();
  const [flows, groups, nodes, rules] = await Promise.all([api.flows(), api.groups(), api.nodes({limit: 1000}), api.rules()]);
  const matched = flows.flows.find(flow => flow.rule_id && flow.rule_expression && rules.rules.some(rule => rule.rule_id === flow.rule_id))!;
  const stale = {...matched, id: 'stale', rule_expression: 'domain(suffix: old.example)'};
  const tree = routingTree([...flows.flows, stale], groups, nodes.nodes, rules.rules);
  const historical = tree.leaves.find(leaf => leaf.id === `rule:${matched.rule_id}\u0000domain(suffix: old.example)`)!;
  expect(historical).toMatchObject({label: 'domain(suffix: old.example)', count: 1, outbound: null});
  expect(tree.leaves.find(leaf => leaf.id === 'rule:' + matched.rule_id)?.label).toBe(matched.rule_expression);
  const names = nodeNames(nodes.nodes);
  expect(flowsThrough([...flows.flows, stale], historical.id, rules.rules)).toEqual([stale]);
  expect(pinnedLabel(historical.id, rules.rules, names, String)).toBe('domain(suffix: old.example)');
});

it('seen by device, the leaves are client addresses joined to outbounds by flows alone', async () => {
  const api = createMockApi();
  const [flows, groups, nodes, rules] = await Promise.all([api.flows(), api.groups(), api.nodes({limit: 1000}), api.rules()]);
  const tree = routingTree(flows.flows, groups, nodes.nodes, rules.rules, 'client');
  expect(tree.by).toBe('client');
  expect(tree.leaves.every(leaf => leaf.id.startsWith('client:') && leaf.outbound === null && !leaf.must)).toBe(true);
  expect(tree.leaves.reduce((sum, leaf) => sum + leaf.count, 0)).toBe(flows.flows.length);
  const device = tree.leaves.find(leaf => leaf.label === '10.0.0.12')!;
  expect(tree.links.some(link => link.source === device.id && link.target.startsWith('outbound:') && link.count > 0)).toBe(true);
  expect(flowsThrough(flows.flows, device.id, rules.rules)).toHaveLength(device.count);
  // Groups and their selected nodes still come from the config.
  expect(tree.outbounds.some(outbound => outbound.label === 'skylink' && outbound.count === 0)).toBe(true);
  const {rows, at} = treeRows(tree);
  expect(rows).toBeGreaterThanOrEqual(tree.leaves.length);
  for (const leaf of tree.leaves) expect(at.has(leaf.id)).toBe(true);
});

it('keeps missing stages distinct from backend values literally named unknown', async () => {
  const api = createMockApi();
  const base = (await api.flows()).flows[0];
  const missing = {...base, id: 'missing', outbound: null, chain: [], rule_id: null, rule_expression: null};
  const known = {...base, id: 'known', outbound: 'unknown', chain: ['unknown'], rule_id: null, rule_expression: 'unknown'};
  const flows = [missing, known];
  const tree = routingTree(flows, [], [], []);
  const names = new Map([['unknown', 'Known node']]);
  for (const entries of [tree.leaves, tree.outbounds, tree.nodes]) {
    const absent = entries.find(item => item.unknown)!;
    const present = entries.find(item => !item.unknown)!;
    expect(absent.id).not.toBe(present.id);
    expect(absent.count).toBe(1);
    expect(present.count).toBe(1);
    expect(flowsThrough(flows, absent.id, [])).toEqual([missing]);
    expect(flowsThrough(flows, present.id, [])).toEqual([known]);
    expect(pinnedLabel(absent.id, [], names, name => name ?? 'Missing')).toBe('Missing');
  }
  expect(pinnedLabel(tree.nodes.find(item => !item.unknown)!.id, [], names, String)).toBe('Known node');
});
