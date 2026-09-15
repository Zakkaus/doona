import type {FlowSummary} from '../../api/model';

export const graphStages = ['source', 'rule', 'chain', 'outbound'] as const;
export type GraphStage = (typeof graphStages)[number];
export type GraphNode = {id: string; stage: GraphStage; label: string; count: number};
export type GraphLink = {source: string; target: string; count: number};
export type FlowGraphData = {nodes: GraphNode[]; links: GraphLink[]};
export const unknownLabels = {
  source: 'flow.unknownSource',
  rule: 'flow.unknownRule',
  chain: 'flow.unknownChain',
  outbound: 'flow.unknownOutbound'
} as const;

export function flowNodeLabel(flow: FlowSummary, stage: GraphStage): string | null {
  const terminal = flow.outbound === 'direct' || flow.outbound === 'block';
  switch (stage) {
    case 'source': {
      const src = flow.input?.src;
      if (!src) return unknownLabels.source;
      // Match clientRows; its bracket-preserving host extraction is not exported.
      return src.startsWith('[') ? src.slice(0, src.indexOf(']') + 1) : src.split(':').length > 2 ? '[' + src + ']' : src.split(':')[0];
    }
    case 'rule':
      return flow.rule_expression ?? unknownLabels.rule;
    case 'chain':
      return terminal ? flow.outbound : flow.chain_source === 'unknown' || !flow.chain.length ? unknownLabels.chain : flow.chain.join(' → ');
    case 'outbound':
      return terminal ? null : (flow.outbound ?? unknownLabels.outbound);
  }
}

export function flowGraph(flows: FlowSummary[]): FlowGraphData {
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, Map<string, GraphLink>>();
  const links: GraphLink[] = [];
  for (const flow of flows) {
    let previous: string | undefined;
    for (const stage of graphStages) {
      const label = flowNodeLabel(flow, stage);
      if (label === null) break;
      const id = `${stage}:${label}`;
      const node = nodes.get(id);
      if (node) node.count++;
      else nodes.set(id, {id, stage, label, count: 1});
      if (previous !== undefined) {
        let targets = edges.get(previous);
        if (!targets) edges.set(previous, (targets = new Map()));
        const link = targets.get(id);
        if (link) link.count++;
        else {
          const next = {source: previous, target: id, count: 1};
          targets.set(id, next);
          links.push(next);
        }
      }
      previous = id;
    }
  }
  return {nodes: [...nodes.values()], links};
}
