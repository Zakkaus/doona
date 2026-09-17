import type {FlowSummary, GroupSummary, Node} from '../../api/model';

// The routing pipeline as the config lays it out, weighted by the flows the backend retained:
// rule → outbound (a policy group, or direct / block) → the node the group currently selects.
export const mapStages = ['rule', 'outbound', 'node'] as const;
export type MapStage = (typeof mapStages)[number];
export type MapNode = {id: string; stage: MapStage; label: string; count: number; unknown?: boolean};
// `configured` marks a link the config implies (a group to its selected node) even before a flow used it.
export type MapLink = {source: string; target: string; count: number; configured?: boolean};
export type FlowMap = {nodes: MapNode[]; links: MapLink[]};

const terminal = (outbound: string | null) => outbound === 'direct' || outbound === 'block';

function stageLabel(flow: FlowSummary, stage: MapStage): {label: string; unknown: boolean} | null {
  switch (stage) {
    case 'rule':
      return flow.rule_expression ? {label: flow.rule_expression, unknown: false} : {label: 'unknown', unknown: true};
    case 'outbound':
      return flow.outbound ? {label: flow.outbound, unknown: false} : {label: 'unknown', unknown: true};
    case 'node': {
      if (terminal(flow.outbound)) return null;
      const leaf = flow.chain.length > 1 ? flow.chain[flow.chain.length - 1] : null;
      return leaf ? {label: leaf, unknown: false} : {label: 'unknown', unknown: true};
    }
  }
}

export function flowMap(flows: FlowSummary[], groups: GroupSummary[], nodes: Node[]): FlowMap {
  const byId = new Map<string, MapNode>();
  const linkById = new Map<string, MapLink>();
  const links: MapLink[] = [];
  const node = (stage: MapStage, label: string, unknown = false) => {
    const id = stage + ':' + label;
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
  // Config first: every group and its selected node exist even before a flow went through them.
  const names = new Map(nodes.map(n => [n.id, n.name]));
  for (const group of groups) {
    const outbound = node('outbound', group.name);
    const selected = group.selection.tcp_member_id ?? group.selection.udp_member_id;
    if (selected) link(outbound.id, node('node', names.get(selected) ?? selected).id, true);
  }
  for (const flow of flows) {
    let previous: MapNode | undefined;
    for (const stage of mapStages) {
      const part = stageLabel(flow, stage);
      if (!part) break;
      const current = node(stage, part.label, part.unknown);
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
export function flowsThrough(flows: FlowSummary[], id: string): FlowSummary[] {
  const [stage, label] = [id.slice(0, id.indexOf(':')) as MapStage, id.slice(id.indexOf(':') + 1)];
  return flows.filter(flow => {
    const part = stageLabel(flow, stage);
    return !!part && part.label === label;
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
