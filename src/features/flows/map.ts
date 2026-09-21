import type {FlowSummary, GroupSummary, Node, RoutingRule} from '../../api/model';
import {healthMillis, preferredHealth, sourceIp} from '../../api/selectors';

// The routing tree as the config lays it out, weighted by the flows the backend retained:
// rule → outbound (a policy group, or direct / block) → the node the outbound currently selects.
// Seen by client instead, the leaves are the source addresses the flows came from.
export type TreeBy = 'rule' | 'client';
export type TreeItem = {id: string; label: string; count: number; unknown?: boolean};
export type TreeLeaf = TreeItem & {outbound: string | null; must: boolean; fallback: boolean};
export type TreeGroup = {name: string; kind: GroupSummary['policy']['kind']; policy: string};
// A group's selection may be another group; `groups` is the whole chain, the first entry being the outbound itself.
export type TreeOutbound = TreeItem & {kind: 'direct' | 'block' | 'group' | 'unknown'; groups: TreeGroup[]; node: string | null};
export type TreeNode = TreeItem & {latency?: number; unavailable: boolean};
// A link with no count is one the config implies before any flow used it.
export type TreeLink = {source: string; target: string; count: number};
export type RoutingTree = {by: TreeBy; leaves: TreeLeaf[]; outbounds: TreeOutbound[]; nodes: TreeNode[]; links: TreeLink[]};

const stages = ['client', 'rule', 'outbound', 'node'] as const;
type Stage = (typeof stages)[number];
const terminal = (outbound: string | null) => outbound === 'direct' || outbound === 'block';

export type NodeNames = ReadonlyMap<string, string>;
export const nodeNames = (nodes: Node[]): NodeNames => new Map(nodes.map(n => [n.id, n.name]));
// A rule is identified by the backend's rule id where it gives one, so a flow joins the configured rule it
// matched even when two rules display alike; the expression is only the label. A retained flow from an
// earlier generation whose id now names a different rule keeps its own entry, keyed by id and expression.
function ruleKey(flow: FlowSummary, rules: RoutingRule[]): string | undefined {
  if (!flow.rule_id) return undefined;
  const current = rules.find(rule => rule.rule_id === flow.rule_id);
  return current && current.expression !== flow.rule_expression ? flow.rule_id + '|' + flow.rule_expression : flow.rule_id;
}
function stagePart(flow: FlowSummary, stage: Stage, names: NodeNames, rules: RoutingRule[]): {label: string; unknown: boolean; key?: string} | null {
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
      if (terminal(flow.outbound)) return null;
      const leaf = flow.chain.at(-1) ?? null;
      return leaf ? {label: names.get(leaf) ?? leaf, unknown: false, key: leaf} : {label: 'unknown', unknown: true};
    }
  }
}
const stageId = (stage: Stage, part: {label: string; key?: string}) => stage + ':' + (part.key ?? part.label);

export function flowsThrough(flows: FlowSummary[], id: string, names: NodeNames, rules: RoutingRule[]): FlowSummary[] {
  return flows.filter(flow =>
    stages.some(stage => {
      const part = stagePart(flow, stage, names, rules);
      return part && stageId(stage, part) === id;
    })
  );
}

// What the flow records call a pinned tree id: the rule's expression, the node's name, the outbound as shown,
// the client's address.
export function pinnedLabel(id: string, rules: RoutingRule[], names: NodeNames, label: (name: string | null) => string): string {
  const [stage, key] = [id.slice(0, id.indexOf(':')), id.slice(id.indexOf(':') + 1)];
  if (stage === 'rule') return key.includes('|') ? key.slice(key.indexOf('|') + 1) : (rules.find(rule => rule.rule_id === key)?.expression ?? key);
  if (stage === 'node') return names.get(key) ?? key;
  if (stage === 'client') return key;
  return label(key);
}

export function routingTree(flows: FlowSummary[], groups: GroupSummary[], nodes: Node[], rules: RoutingRule[], by: TreeBy = 'rule'): RoutingTree {
  const names = nodeNames(nodes);
  const byId = new Map(groups.map(group => [group.id, group]));
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
    const id = 'node:' + key;
    let entry = nodeItems.get(id);
    if (!entry) {
      const node = nodes.find(n => n.id === key);
      const health = node && preferredHealth(node);
      nodeItems.set(
        id,
        (entry = {id, label, count: 0, unknown: unknown || undefined, latency: healthMillis(health), unavailable: health?.state === 'unavailable'})
      );
    }
    return entry;
  };
  // An outbound that names a group follows its selection through nested groups to the node it ends at, on one
  // transport throughout: TCP where the group selects one, else UDP.
  const outboundItem = (name: string, unknown = false) => {
    const id = 'outbound:' + name;
    let entry = outboundItems.get(id);
    if (entry) return entry;
    const chain: TreeGroup[] = [];
    let group = groups.find(g => g.name === name);
    const transport = group?.selection.tcp_member_id ? 'tcp_member_id' : 'udp_member_id';
    let leaf: string | null = null;
    while (group && chain.length < 8) {
      chain.push({name: group.name, kind: group.policy.kind, policy: group.policy.native});
      const member = group.selection[transport];
      const next = member ? byId.get(member) : undefined;
      if (!next) {
        leaf = member;
        break;
      }
      group = next;
    }
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
      const entry = leafItem('rule:' + rule.rule_id, rule.expression);
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
      const part = stagePart(flow, stage, names, rules);
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
  // Groups nothing routes to still belong on the tree, after the used ones; a group only reached through
  // another group's selection is drawn inside that outbound instead.
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

// Where a leaf or outbound hangs on the tree: its configured target, else the one its flows mostly went to.
export function parentOf(tree: RoutingTree, item: TreeLeaf | TreeOutbound): string | null {
  const configured = 'groups' in item ? item.node : item.outbound;
  return configured ?? tree.links.filter(link => link.source === item.id).sort((a, b) => b.count - a.count)[0]?.target ?? null;
}

// Rows of the drawn tree: one leaf per row in config order, grouped under their outbound; a parent sits level
// with the middle of its children. Nothing crosses.
export function treeRows(tree: RoutingTree): {rows: number; at: Map<string, number>} {
  const at = new Map<string, number>();
  let row = 0;
  const children = new Map<string, string[]>();
  for (const item of [...tree.leaves, ...tree.outbounds]) {
    const parent = parentOf(tree, item);
    if (parent) children.set(parent, [...(children.get(parent) ?? []), item.id]);
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
  const roots: string[] = [];
  for (const outbound of tree.outbounds) {
    const root = parentOf(tree, outbound) ?? outbound.id;
    if (!roots.includes(root)) roots.push(root);
  }
  for (const node of tree.nodes) if (!roots.includes(node.id)) roots.push(node.id);
  for (const leaf of tree.leaves) if (!parentOf(tree, leaf)) roots.push(leaf.id);
  for (const root of roots) place(root);
  return {rows: row, at};
}
