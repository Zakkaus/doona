import {useMemo, useState, type ReactNode} from 'react';
import {Button as RButton} from 'react-aria-components';
import {useT, type Translator} from '../../i18n';
import {Legend, usePalette} from '../../ui/Charts';
import {Bar, Button} from '../../ui/ui';
import {graphStages, unknownLabels, type FlowGraphData, type GraphNode} from './graph';

export const graphStageLabels = {
  source: 'flow.graphSource',
  rule: 'flow.graphRule',
  chain: 'flow.graphChain',
  outbound: 'flow.graphOutbound'
} as const;
export const graphLabel = (node: Pick<GraphNode, 'stage' | 'label'>, t: Translator) =>
  node.label === unknownLabels[node.stage] ? t(unknownLabels[node.stage]) : node.label;

type GraphProps = {graph: FlowGraphData; selected: string | null; onSelect: (node: GraphNode) => void};

function StageColumns({graph, selected, onSelect}: GraphProps) {
  const t = useT();
  const p = usePalette();
  const [hovered, setHovered] = useState<string | null>(null);
  const active = hovered ?? selected;
  const columns = useMemo(
    () =>
      graphStages.map(stage => {
        const nodes = graph.nodes.filter(node => node.stage === stage);
        return {stage, nodes, total: nodes.reduce((total, node) => total + node.count, 0)};
      }),
    [graph.nodes]
  );

  // Nodes reachable from the active one, following links in both directions; the rest dims.
  const related = useMemo(() => {
    if (active === null) return null;
    const seen = new Set([active]);
    const queue = [active];
    while (queue.length) {
      const id = queue.pop()!;
      for (const link of graph.links) {
        const next = link.source === id ? link.target : link.target === id ? link.source : null;
        if (next !== null && !seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    return seen;
  }, [active, graph.links]);

  return (
    <>
      <Legend
        series={columns.map(({stage, total}, index) => ({label: t(graphStageLabels[stage]), color: p.cat[index], values: [total]}))}
        fmt={n => t('flow.graphTooltip', {n: n ?? 0})}
      />
      <div className="rp-flow-columns" data-active={active !== null || undefined}>
        {columns.map(({stage, nodes, total}, index) => (
          <div className="rp-flow-stage rp-list" key={stage}>
            <h4 className="rp-label">
              {t(graphStageLabels[stage])}
              <span className="rp-count">{total}</span>
            </h4>
            <div className="rp-list">
              {nodes.map(node => {
                const label = graphLabel(node, t);
                const value = t('flow.graphTooltip', {n: node.count});
                return (
                  <RButton
                    key={node.id}
                    className="rp-flow-row"
                    data-stage={stage}
                    data-stage-index={index}
                    data-node-id={node.id}
                    data-selected={selected === node.id || undefined}
                    data-related={(related?.has(node.id) ?? true) || undefined}
                    data-unknown={node.label === unknownLabels[stage] || undefined}
                    aria-label={`${t(graphStageLabels[stage])}: ${label} · ${value}`}
                    aria-pressed={selected === node.id}
                    onPress={() => onSelect(node)}
                    onHoverChange={isHovered => setHovered(isHovered ? node.id : null)}
                  >
                    <Bar label={label} value={value} pct={(node.count / total) * 100} color={p.cat[index]} />
                  </RButton>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function FlowGraph({graph, selected, onSelect, caption}: GraphProps & {caption: ReactNode}) {
  const t = useT();
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem('doona-flows-graph') !== 'closed';
    } catch {
      return true;
    }
  });
  return (
    <section className="rp-card rp-flow-graph" aria-label={t('flow.graphTitle')}>
      <div className="rp-row">
        <h3 className="rp-h3">{t('flow.graphTitle')}</h3>
        <Button
          quiet
          small
          onPress={() => {
            const next = !open;
            setOpen(next);
            try {
              localStorage.setItem('doona-flows-graph', next ? 'open' : 'closed');
            } catch {}
          }}
        >
          {t(open ? 'flow.graphHide' : 'flow.graphShow')}
        </Button>
      </div>
      {open && (
        <>
          <StageColumns graph={graph} selected={selected} onSelect={onSelect} />
          <p className="rp-note">{t('flow.graphNote')}</p>
        </>
      )}
      {caption}
    </section>
  );
}
