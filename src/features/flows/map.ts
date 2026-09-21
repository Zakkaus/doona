import type {FlowSummary, GroupSummary, Node, RoutingRule} from '../../api/model';
import {healthMillis, preferredHealth} from '../../api/selectors';

// The routing tree as the config lays it out, weighted by the flows the backend retained:
// rule → outbound (a policy group, or direct / block) → the node the outbound currently selects.
export type TreeItem = {id: string; label: string; count: number; unknown?: boolean};
export type TreeRule = TreeItem & {outbound: string | null; must: boolean; fallback: boolean};
export type TreeGroup = {name: string; kind: GroupSummary['policy']['kind']; policy: string};
// A group's selection may be another group; `groups` is the whole chain, the first entry being the outbound itself.
export type TreeOutbound = TreeItem & {kind: 'direct' | 'block' | 'group' | 'unknown'; groups: TreeGroup[]; node: string | null};
export type TreeNode = TreeItem & {latency?: number; unavailable: boolean};
// A link with no count is one the config implies before any flow used it.
export type TreeLink = {source: string; target: string; count: number};
export type RoutingTree = {rules: TreeRule[]; outbounds: TreeOutbound[]; nodes: TreeNode[]; links: TreeLink[]};

const stages = ['rule', 'outbound', 'node'] as const;
type Stage = (typeof stages)[number];
const terminal = (outbound: string | null) => outbound === 'direct' || outbound === 'block';

export type NodeNames = ReadonlyMap<string, string>;
export const nodeNames = (nodes: Node[]): NodeNames => new Map(nodes.map(n => [n.id, n.name]));
// A rule is identified by the backend's rule id where it gives one, so a flow joins the configured rule it
// matched even when two rules display alike; the expression is only the label.
function stagePart(flow: FlowSummary, stage: Stage, names: NodeNames): {label: string; unknown: boolean; key?: string} | null {
  switch (stage) {
    case 'rule':
      return flow.rule_expression ? {label: flow.rule_expression, unknown: false, key: flow.rule_id ?? undefined} : {label: 'unknown', unknown: true};
    case 'outbound':
      return flow.outbound ? {label: flow.outbound, unknown: false} : {label: 'unknown', unknown: true};
    case 'node': {
      if (terminal(flow.outbound)) return null;
      const leaf = flow.chain.at(-1) ?? null;
      return leaf ? {label: names.get(leaf) ?? leaf, unknown: false} : {label: 'unknown', unknown: true};
    }
  }
}
const stageId = (stage: Stage, part: {label: string; key?: string}) => stage + ':' + (part.key ?? part.label);

export function flowsThrough(flows: FlowSummary[], id: string, names: NodeNames): FlowSummary[] {
  return flows.filter(flow =>
    stages.some(stage => {
      const part = stagePart(flow, stage, names);
      return part && stageId(stage, part) === id;
    })
  );
}

// The label the flow records show for a pinned tree id.
export function pinnedLabel(id: string, rules: RoutingRule[]): string {
  const [stage, key] = [id.slice(0, id.indexOf(':')), id.slice(id.indexOf(':') + 1)];
  return (stage === 'rule' && rules.find(rule => rule.rule_id === key)?.expression) || key;
}

export function routingTree(flows: FlowSummary[], groups: GroupSummary[], nodes: Node[], rules: RoutingRule[]): RoutingTree {
  const names = nodeNames(nodes);
  const byId = new Map(groups.map(group => [group.id, group]));
  const ruleItems = new Map<string, TreeRule>();
  const outboundItems = new Map<string, TreeOutbound>();
  const nodeItems = new Map<string, TreeNode>();
  const links = new Map<string, TreeLink>();
  const link = (source: string, target: string) => {
    const key = source + '>' + target;
    let entry = links.get(key);
    if (!entry) links.set(key, (entry = {source, target, count: 0}));
    return entry;
  };
  const nodeItem = (label: string, unknown = false) => {
    const id = 'node:' + label;
    let entry = nodeItems.get(id);
    if (!entry) {
      const node = nodes.find(n => n.name === label);
      const health = node && preferredHealth(node);
      nodeItems.set(
        id,
        (entry = {id, label, count: 0, unknown: unknown || undefined, latency: healthMillis(health), unavailable: health?.state === 'unavailable'})
      );
    }
    return entry;
  };
  // An outbound that names a group follows its selection through nested groups to the node it ends at.
  const outboundItem = (name: string, unknown = false) => {
    const id = 'outbound:' + name;
    let entry = outboundItems.get(id);
    if (entry) return entry;
    const chain: TreeGroup[] = [];
    let group = groups.find(g => g.name === name);
    let leaf: string | null = null;
    while (group && chain.length < 8) {
      chain.push({name: group.name, kind: group.policy.kind, policy: group.policy.native});
      const member = group.selection.tcp_member_id ?? group.selection.udp_member_id;
      const next = member ? byId.get(member) : undefined;
      if (!next) {
        leaf = member ? (names.get(member) ?? member) : null;
        break;
      }
      group = next;
    }
    const kind = unknown ? 'unknown' : name === 'direct' || name === 'block' ? name : chain.length ? 'group' : 'unknown';
    entry = {id, label: name, count: 0, unknown: unknown || undefined, kind, groups: chain, node: leaf && nodeItem(leaf).id};
    outboundItems.set(id, entry);
    if (entry.node) link(id, entry.node);
    return entry;
  };
  const ruleItem = (id: string, label: string, unknown = false) => {
    let entry = ruleItems.get(id);
    if (!entry) ruleItems.set(id, (entry = {id, label, count: 0, unknown: unknown || undefined, outbound: null, must: false, fallback: false}));
    return entry;
  };
  // Config first, in evaluation order: every rule, its outbound and the selected node exist before a flow used them.
  for (const rule of rules) {
    const entry = ruleItem('rule:' + rule.rule_id, rule.expression);
    entry.must = rule.must;
    entry.fallback = rule.kind === 'fallback';
    if (rule.outbound) {
      entry.outbound = outboundItem(rule.outbound).id;
      link(entry.id, entry.outbound);
    }
  }
  for (const flow of flows) {
    let previous: TreeItem | undefined;
    for (const stage of stages) {
      const part = stagePart(flow, stage, names);
      if (!part) break;
      const current =
        stage === 'rule'
          ? ruleItem(stageId(stage, part), part.label, part.unknown)
          : stage === 'outbound'
            ? outboundItem(part.label, part.unknown)
            : nodeItem(part.label, part.unknown);
      current.count++;
      if (previous) link(previous.id, current.id).count++;
      previous = current;
    }
  }
  // Groups nothing routes to still belong on the tree, after the used ones; a group only reached through
  // another group's selection is drawn inside that outbound instead.
  const nested = new Set([...outboundItems.values()].flatMap(outbound => outbound.groups.slice(1).map(group => group.name)));
  for (const group of groups) if (!nested.has(group.name)) outboundItem(group.name);
  return {
    rules: [...ruleItems.values()],
    outbounds: [...outboundItems.values()],
    nodes: [...nodeItems.values()],
    links: [...links.values()]
  };
}

// Where a rule or outbound hangs on the tree: its configured target, else the one its flows mostly went to.
export function parentOf(tree: RoutingTree, item: TreeRule | TreeOutbound): string | null {
  const configured = 'groups' in item ? item.node : item.outbound;
  return configured ?? tree.links.filter(link => link.source === item.id).sort((a, b) => b.count - a.count)[0]?.target ?? null;
}

// Rows of the drawn tree: rules are the leaves, one per row in config order, grouped under their outbound;
// a parent sits level with the middle of its children. Nothing crosses.
export function treeRows(tree: RoutingTree): {rows: number; at: Map<string, number>} {
  const at = new Map<string, number>();
  let row = 0;
  const children = new Map<string, string[]>();
  for (const item of [...tree.rules, ...tree.outbounds]) {
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
  for (const rule of tree.rules) if (!parentOf(tree, rule)) roots.push(rule.id);
  for (const root of roots) place(root);
  return {rows: row, at};
}
