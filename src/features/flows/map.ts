import type {FlowSummary, GroupSummary, Node, RoutingRule} from '../../api/model';

// The routing pipeline as the config lays it out, weighted by the flows the backend retained:
// rule → outbound (a policy group, or direct / block) → the node the group currently selects.
export const mapStages = ['rule', 'outbound', 'node'] as const;
export type MapStage = (typeof mapStages)[number];
export type MapNode = {id: string; stage: MapStage; label: string; count: number; unknown?: boolean};
// `configured` marks a link the config implies (a group to its selected node) even before a flow used it.
export type MapLink = {source: string; target: string; count: number; configured?: boolean};
export type FlowMap = {nodes: MapNode[]; links: MapLink[]};

const terminal = (outbound: string | null) => outbound === 'direct' || outbound === 'block';

// Node ids as the config names them; a chain ends in a node id, the map draws node names.
export type NodeNames = ReadonlyMap<string, string>;
export const nodeNames = (nodes: Node[]): NodeNames => new Map(nodes.map(n => [n.id, n.name]));
// A rule is identified by the backend's rule id where it gives one, so a flow joins the configured rule it
// matched even when two rules display alike; the expression is only the label.
function stageLabel(flow: FlowSummary, stage: MapStage, names: NodeNames): {label: string; unknown: boolean; key?: string} | null {
  switch (stage) {
    case 'rule':
      return flow.rule_expression ? {label: flow.rule_expression, unknown: false, key: flow.rule_id ?? undefined} : {label: 'unknown', unknown: true};
    case 'outbound':
      return flow.outbound ? {label: flow.outbound, unknown: false} : {label: 'unknown', unknown: true};
    case 'node': {
      if (terminal(flow.outbound)) return null;
      const leaf = flow.chain.length > 1 ? flow.chain[flow.chain.length - 1] : null;
      return leaf ? {label: names.get(leaf) ?? leaf, unknown: false} : {label: 'unknown', unknown: true};
    }
  }
}

export function flowMap(flows: FlowSummary[], groups: GroupSummary[], nodes: Node[], rules: RoutingRule[] = []): FlowMap {
  const byId = new Map<string, MapNode>();
  const linkById = new Map<string, MapLink>();
  const links: MapLink[] = [];
  const node = (stage: MapStage, label: string, unknown = false, key = label) => {
    const id = stage + ':' + key;
    let entry = byId.get(id);
    if (!entry) byId.set(id, (entry = {id, stage, label, count: 0, unknown: unknown || undefined}));
    return entry;
  };
  const link = (source: string, target: string, configured = false) => {
    const id = source + '>' + target;
    let entry = linkById.get(id);
    if (!entry) {
      linkById.set(id, (entry = {source, target, count: 0, configured: configured || undefined}));
      links.push(entry);
    }
    return entry;
  };
  // Config first: every rule, group and selected node exists even before a flow went through them.
  const names = nodeNames(nodes);
  for (const group of groups) {
    const outbound = node('outbound', group.name);
    const selected = group.selection.tcp_member_id ?? group.selection.udp_member_id;
    if (selected) link(outbound.id, node('node', names.get(selected) ?? selected).id, true);
  }
  for (const rule of rules) if (rule.outbound) link(node('rule', rule.expression, false, rule.rule_id).id, node('outbound', rule.outbound).id, true);
  for (const flow of flows) {
    let previous: MapNode | undefined;
    for (const stage of mapStages) {
      const part = stageLabel(flow, stage, names);
      if (!part) break;
      const current = node(stage, part.label, part.unknown, part.key);
      current.count++;
      if (previous) link(previous.id, current.id).count++;
      previous = current;
    }
  }
  // Groups the config knows but nothing used keep their place at the bottom of the column.
  const order = (a: MapNode, b: MapNode) => b.count - a.count || Number(!!a.unknown) - Number(!!b.unknown) || a.label.localeCompare(b.label);
  return {nodes: [...byId.values()].sort(order), links};
}

// The flows that pass through one node of the map, for filtering the list beneath it.
export function flowsThrough(flows: FlowSummary[], id: string, names: NodeNames): FlowSummary[] {
  const [stage, key] = [id.slice(0, id.indexOf(':')) as MapStage, id.slice(id.indexOf(':') + 1)];
  return flows.filter(flow => {
    const part = stageLabel(flow, stage, names);
    return !!part && (part.key ?? part.label) === key;
  });
}

// The map as lanes, one per outbound: the rules that lead into it on the left, the node it selects on the
// right. Lanes never cross, which is what makes the config readable at a glance.
export type Lane = {
  outbound: MapNode;
  rules: Array<{node: MapNode; count: number}>;
  node: {node: MapNode; count: number; configured: boolean} | null;
};
export function lanes(map: FlowMap): Lane[] {
  const byId = new Map(map.nodes.map(node => [node.id, node]));
  return map.nodes
    .filter(node => node.stage === 'outbound')
    .map(outbound => {
      const rules = new Map<string, number>();
      let node: Lane['node'] = null;
      for (const link of map.links) {
        if (link.target === outbound.id && link.source.startsWith('rule:')) rules.set(link.source, (rules.get(link.source) ?? 0) + link.count);
        if (link.source === outbound.id && link.target.startsWith('node:')) {
          if (!node || link.count > node.count || (link.configured && !node.configured && link.count >= node.count))
            node = {node: byId.get(link.target)!, count: link.count, configured: !!link.configured};
        }
      }
      return {
        outbound,
        rules: [...rules].map(([id, count]) => ({node: byId.get(id)!, count})).sort((a, b) => b.count - a.count),
        node
      };
    });
}
