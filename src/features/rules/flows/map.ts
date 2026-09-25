import type {FlowSummary, GroupSummary, Node, RoutingRule} from '../../../api/model';
import {readTag, tagId} from '../../shared/taggedId';
import {isBuiltinOutbound} from '../../../dae/vocab';
import {healthMillis, preferredHealth, resolveSelectedLeaf, sourceIp} from '../../../api/selectors';

export type TreeBy = 'rule' | 'client';
export type TreeItem = {id: string; label: string; count: number; unknown?: boolean};
type TreeLeaf = TreeItem & {outbound: string | null; must: boolean; fallback: boolean};
type TreeGroup = {name: string; kind: GroupSummary['policy']['kind']; policy: string};
// A group's selection may be another group; `groups` is the whole chain, the first entry being the outbound itself.
type TreeOutbound = TreeItem & {kind: 'direct' | 'block' | 'group' | 'unknown'; groups: TreeGroup[]; node: string | null};
type TreeNode = TreeItem & {latency?: number; unavailable: boolean};
// A link with no count is one the config implies before any flow used it.
export type TreeLink = {source: string; target: string; count: number};
export type RoutingTree = {by: TreeBy; leaves: TreeLeaf[]; outbounds: TreeOutbound[]; nodes: TreeNode[]; links: TreeLink[]};

const stages = ['client', 'rule', 'outbound', 'node'] as const;
type Stage = (typeof stages)[number];

type NodeNames = ReadonlyMap<string, string>;
export const nodeNames = (nodes: Node[]): NodeNames => new Map(nodes.map(n => [n.id, n.name]));
// Retained flows whose rule ID now has another expression keep a separate historical entry.
const HISTORICAL = '\u0000';
function ruleKey(flow: FlowSummary, rules: ReadonlyMap<string, RoutingRule>): string | undefined {
  if (!flow.rule_id) return undefined;
  const current = rules.get(flow.rule_id);
  return current?.expression === flow.rule_expression ? flow.rule_id : flow.rule_id + HISTORICAL + flow.rule_expression;
}
function stagePart(
  flow: FlowSummary,
  stage: Stage,
  names: NodeNames,
  rules: ReadonlyMap<string, RoutingRule>
): {label: string; unknown: boolean; key?: string} | null {
  switch (stage) {
    case 'client': {
      const client = sourceIp(flow.input?.src ?? undefined);
      return {label: client ?? 'unknown', unknown: !client};
    }
    case 'rule':
      return flow.rule_expression ? {label: flow.rule_expression, unknown: false, key: ruleKey(flow, rules)} : {label: 'unknown', unknown: true};
    case 'outbound':
      return flow.outbound ? {label: flow.outbound, unknown: false} : {label: 'unknown', unknown: true};
    case 'node': {
      if (isBuiltinOutbound(flow.outbound)) return null;
      const leaf = flow.chain.at(-1) ?? null;
      return leaf ? {label: names.get(leaf) ?? leaf, unknown: false, key: leaf} : {label: 'unknown', unknown: true};
    }
  }
}
// Empty identities distinguish missing values from identifiers literally named "unknown".
const stageId = (stage: Stage, part: {label: string; key?: string; unknown?: boolean}) => tagId(stage, part.unknown ? '' : (part.key ?? part.label));
// The column a tile or link end sits in, read from its id.
export const stageOf = (id: string): Stage | undefined => readTag(id, stages)?.kind;

// Identities are keyed by node ID, not name, so matching needs no name catalogue.
const noNames: NodeNames = new Map();
export function flowsThrough(flows: FlowSummary[], id: string, rules: RoutingRule[]): FlowSummary[] {
  const stage = stageOf(id);
  if (!stage) return [];
  const rulesById = new Map(rules.map(rule => [rule.rule_id, rule]));
  return flows.filter(flow => {
    const part = stagePart(flow, stage, noNames, rulesById);
    return part !== null && stageId(stage, part) === id;
  });
}

export function pinnedLabel(id: string, rules: RoutingRule[], names: NodeNames, label: (name: string | null) => string): string {
  const stage = id.slice(0, id.indexOf(':'));
  const key = id.slice(id.indexOf(':') + 1);
  if (key === '') return label(null);
  if (stage === 'rule')
    return key.includes(HISTORICAL) ? key.slice(key.indexOf(HISTORICAL) + 1) : (rules.find(rule => rule.rule_id === key)?.expression ?? key);
  if (stage === 'node') return names.get(key) ?? key;
  if (stage === 'client') return key;
  return label(key);
}

export function routingTree(flows: FlowSummary[], groups: GroupSummary[], nodes: Node[], rules: RoutingRule[], by: TreeBy = 'rule'): RoutingTree {
  const names = nodeNames(nodes);
  const byId = new Map(groups.map(group => [group.id, group]));
  const groupsByName = new Map(groups.map(group => [group.name, group]));
  const nodesById = new Map(nodes.map(node => [node.id, node]));
  const rulesById = new Map(rules.map(rule => [rule.rule_id, rule]));
  const leafItems = new Map<string, TreeLeaf>();
  const outboundItems = new Map<string, TreeOutbound>();
  const nodeItems = new Map<string, TreeNode>();
  const links = new Map<string, TreeLink>();
  const link = (source: string, target: string) => {
    const key = source + '>' + target;
    let entry = links.get(key);
    if (!entry) links.set(key, (entry = {source, target, count: 0}));
    return entry;
  };
  // Nodes are identified by the backend's id; the name is only the label.
  const nodeItem = (key: string, label: string, unknown = false) => {
    const id = stageId('node', {key, label, unknown});
    let entry = nodeItems.get(id);
    if (!entry) {
      const node = unknown ? undefined : nodesById.get(key);
      const health = node && preferredHealth(node);
      nodeItems.set(
        id,
        (entry = {id, label, count: 0, unknown: unknown || undefined, latency: healthMillis(health), unavailable: health?.state === 'unavailable'})
      );
    }
    return entry;
  };
  // Follow one transport throughout the selection chain: TCP when selected, otherwise UDP.
  const outboundItem = (name: string, unknown = false) => {
    const id = stageId('outbound', {label: name, unknown});
    let entry = outboundItems.get(id);
    if (entry) return entry;
    const group = unknown ? undefined : groupsByName.get(name);
    const selected = unknown
      ? {groups: [], member: null}
      : resolveSelectedLeaf(name, group?.selection.tcp_member_id ? 'tcp' : 'udp', groupsByName, byId, nodesById);
    const chain: TreeGroup[] = selected.groups.map(group => ({name: group.name, kind: group.policy.kind, policy: group.policy.native}));
    const leaf = selected.member;
    const kind = unknown ? 'unknown' : name === 'direct' || name === 'block' ? name : chain.length ? 'group' : 'unknown';
    entry = {id, label: name, count: 0, unknown: unknown || undefined, kind, groups: chain, node: leaf && nodeItem(leaf, names.get(leaf) ?? leaf).id};
    outboundItems.set(id, entry);
    if (entry.node) link(id, entry.node);
    return entry;
  };
  const leafItem = (id: string, label: string, unknown = false) => {
    let entry = leafItems.get(id);
    if (!entry) leafItems.set(id, (entry = {id, label, count: 0, unknown: unknown || undefined, outbound: null, must: false, fallback: false}));
    return entry;
  };
  // Config first, in evaluation order: every rule, its outbound and the selected node exist before a flow used them.
  if (by === 'rule')
    for (const rule of rules) {
      const entry = leafItem(stageId('rule', {key: rule.rule_id, label: rule.expression}), rule.expression);
      entry.must = rule.must;
      entry.fallback = rule.kind === 'fallback';
      if (rule.outbound) {
        entry.outbound = outboundItem(rule.outbound).id;
        link(entry.id, entry.outbound);
      }
    }
  const path: Stage[] = [by, 'outbound', 'node'];
  for (const flow of flows) {
    let previous: TreeItem | undefined;
    for (const stage of path) {
      const part = stagePart(flow, stage, names, rulesById);
      if (!part) break;
      const current =
        stage === 'outbound'
          ? outboundItem(part.label, part.unknown)
          : stage === 'node'
            ? nodeItem(part.key ?? part.label, part.label, part.unknown)
            : leafItem(stageId(stage, part), part.label, part.unknown);
      current.count++;
      if (previous) link(previous.id, current.id).count++;
      previous = current;
    }
  }
  // Unused groups remain visible unless nested in another outbound's selection.
  for (const group of groups) outboundItem(group.name);
  const referenced = new Set([...leafItems.values()].map(leaf => leaf.outbound));
  const nested = new Set([...outboundItems.values()].flatMap(outbound => outbound.groups.slice(1).map(group => group.name)));
  const outbounds = [...outboundItems.values()].filter(outbound => outbound.count || referenced.has(outbound.id) || !nested.has(outbound.label));
  const kept = new Set(outbounds.map(outbound => outbound.id));
  return {
    by,
    leaves: [...leafItems.values()],
    outbounds,
    nodes: [...nodeItems.values()],
    links: [...links.values()].filter(link => kept.has(link.source) || kept.has(link.target))
  };
}

export type TreeIndex = {outgoing: Map<string, TreeLink[]>; incoming: Map<string, TreeLink[]>; parents: Map<string, string>};
const indexes = new WeakMap<RoutingTree, TreeIndex>();
export function treeIndex(tree: RoutingTree): TreeIndex {
  const cached = indexes.get(tree);
  if (cached) return cached;
  const outgoing = new Map<string, TreeLink[]>();
  const incoming = new Map<string, TreeLink[]>();
  const strongest = new Map<string, TreeLink>();
  for (const link of tree.links) {
    for (const [map, id] of [
      [outgoing, link.source],
      [incoming, link.target]
    ] as const) {
      let links = map.get(id);
      if (!links) map.set(id, (links = []));
      links.push(link);
    }
    if (!strongest.has(link.source) || strongest.get(link.source)!.count < link.count) strongest.set(link.source, link);
  }
  const parents = new Map<string, string>();
  for (const item of [...tree.leaves, ...tree.outbounds]) {
    const parent = ('groups' in item ? item.node : item.outbound) ?? strongest.get(item.id)?.target;
    if (parent) parents.set(item.id, parent);
  }
  const index = {outgoing, incoming, parents};
  indexes.set(tree, index);
  return index;
}

// Parents sit midway between their children, whose rows retain configuration order.
export function treeRows(tree: RoutingTree): {rows: number; at: Map<string, number>} {
  const at = new Map<string, number>();
  let row = 0;
  const children = new Map<string, string[]>();
  const {parents} = treeIndex(tree);
  for (const item of [...tree.leaves, ...tree.outbounds]) {
    const parent = parents.get(item.id);
    if (parent) {
      let under = children.get(parent);
      if (!under) children.set(parent, (under = []));
      under.push(item.id);
    }
  }
  const place = (id: string) => {
    const under = children.get(id) ?? [];
    if (!under.length) {
      at.set(id, row++);
      return;
    }
    for (const child of under) place(child);
    at.set(id, (at.get(under[0])! + at.get(under[under.length - 1])!) / 2);
  };
  // Roots in the order their branches first appear in the config.
  const roots = new Set<string>();
  for (const outbound of tree.outbounds) roots.add(parents.get(outbound.id) ?? outbound.id);
  for (const node of tree.nodes) roots.add(node.id);
  for (const leaf of tree.leaves) if (!parents.has(leaf.id)) roots.add(leaf.id);
  for (const root of roots) place(root);
  return {rows: row, at};
}

export function treeReach(index: TreeIndex, id: string) {
  const items = new Set([id]);
  const edges = new Set<TreeLink>();
  for (const [links, to] of [
    [index.outgoing, 'target'],
    [index.incoming, 'source']
  ] as const) {
    const queue = [id];
    for (const current of queue)
      for (const link of links.get(current) ?? [])
        if (!edges.has(link)) {
          edges.add(link);
          if (!items.has(link[to])) {
            items.add(link[to]);
            queue.push(link[to]);
          }
        }
  }
  return {items, edges};
}
