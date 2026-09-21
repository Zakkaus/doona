import type {FlowSummary, GroupSummary, Node, RoutingRule} from '../../api/model';
import {sourceIp} from '../../api/selectors';

// The routing pipeline as the config lays it out, weighted by the flows the backend retained:
// client → rule → outbound (a policy group, or direct / block) → the node the flow used.
export const mapStages = ['client', 'rule', 'outbound', 'node'] as const;
export type MapStage = (typeof mapStages)[number];
export type MapNode = {id: string; stage: MapStage; label: string; count: number; unknown?: boolean; others?: boolean};
// `configured` marks a link the config implies (a group to its selected node) even before a flow used it.
export type MapLink = {source: string; target: string; count: number; configured?: boolean};
export type FlowMap = {nodes: MapNode[]; links: MapLink[]; paths: string[][]};

const terminal = (outbound: string | null) => outbound === 'direct' || outbound === 'block';

export type NodeNames = ReadonlyMap<string, string>;
export const nodeNames = (nodes: Node[]): NodeNames => new Map(nodes.map(n => [n.id, n.name]));
// A rule is identified by the backend's rule id where it gives one, so a flow joins the configured rule it
// matched even when two rules display alike; the expression is only the label.
function stageLabel(flow: FlowSummary, stage: MapStage, names: NodeNames): {label: string; unknown: boolean; key?: string} | null {
  switch (stage) {
    case 'client': {
      const client = sourceIp(flow.input?.src ?? undefined);
      return {label: client ?? 'unknown', unknown: !client};
    }
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

export function flowMap(flows: FlowSummary[], groups: GroupSummary[], nodes: Node[], rules: RoutingRule[] = []): FlowMap {
  const byId = new Map<string, MapNode>();
  const linkById = new Map<string, MapLink>();
  const links: MapLink[] = [];
  const paths = new Map<string, string[]>();
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
    const path: string[] = [];
    for (const stage of mapStages) {
      const part = stageLabel(flow, stage, names);
      if (!part) break;
      const current = node(stage, part.label, part.unknown, part.key);
      current.count++;
      path.push(current.id);
      if (previous) link(previous.id, current.id).count++;
      previous = current;
    }
    paths.set(JSON.stringify(path), path);
  }
  // Groups the config knows but nothing used keep their place at the bottom of the column.
  const order = (a: MapNode, b: MapNode) => b.count - a.count || Number(!!a.unknown) - Number(!!b.unknown) || a.label.localeCompare(b.label);
  return {nodes: [...byId.values()].sort(order), links, paths: [...paths.values()]};
}

export function pinMembers(id: string): string[] {
  if (!id.startsWith('others:')) return [id];
  try {
    const members: unknown = JSON.parse(id.slice(7));
    return Array.isArray(members) && members.every(member => typeof member === 'string') ? members : [];
  } catch {
    return [];
  }
}

export function flowsThrough(flows: FlowSummary[], id: string, names: NodeNames): FlowSummary[] {
  const members = new Set(pinMembers(id));
  return flows.filter(flow =>
    mapStages.some(stage => {
      const part = stageLabel(flow, stage, names);
      return part && members.has(stage + ':' + (part.key ?? part.label));
    })
  );
}

// Only retained traffic belongs in the Sankey; configured, unused links are dropped here.
export function topologyMap(map: FlowMap): FlowMap {
  const nodes: MapNode[] = [];
  const ids = new Map<string, string>();
  for (const stage of mapStages) {
    const column = map.nodes.filter(node => node.stage === stage && node.count > 0);
    const visible = column.length > 12 ? column.slice(0, 11) : column;
    for (const node of visible) {
      nodes.push(node);
      ids.set(node.id, node.id);
    }
    if (column.length > 12) {
      const rest = column.slice(11);
      const id = 'others:' + JSON.stringify(rest.map(node => node.id));
      nodes.push({id, stage, label: '', others: true, count: rest.reduce((sum, node) => sum + node.count, 0)});
      for (const node of rest) ids.set(node.id, id);
    }
  }
  const links = new Map<string, MapLink>();
  for (const link of map.links) {
    if (!link.count) continue;
    const source = ids.get(link.source)!;
    const target = ids.get(link.target)!;
    const key = JSON.stringify([source, target]);
    const existing = links.get(key);
    if (existing) existing.count += link.count;
    else links.set(key, {source, target, count: link.count});
  }
  return {nodes, links: [...links.values()], paths: map.paths.map(path => path.map(id => ids.get(id)!))};
}
