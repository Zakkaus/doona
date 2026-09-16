import {useLayoutEffect, useMemo, useRef, useState, type ReactNode} from 'react';
import {Button as RButton} from 'react-aria-components';
import {useLang, useT, type Translator} from '../../i18n';
import {Legend, usePalette} from '../../ui/Charts';
import {Bar, Button} from '../../ui/ui';
import {graphStages, unknownLabels, type FlowGraphData, type GraphLink, type GraphNode} from './graph';

export const graphStageLabels = {
  source: 'flow.graphSource',
  rule: 'flow.graphRule',
  chain: 'flow.graphChain',
  outbound: 'flow.graphOutbound'
} as const;
export const graphLabel = (node: Pick<GraphNode, 'stage' | 'label'>, t: Translator) =>
  node.label === unknownLabels[node.stage] ? t(unknownLabels[node.stage]) : node.label;

type GraphProps = {graph: FlowGraphData; selected: string | null; onSelect: (node: GraphNode) => void};
type Ribbon = GraphLink & {d: string; stage: number; width: number};

function StageColumns({graph, selected, onSelect}: GraphProps) {
  const t = useT();
  const lang = useLang();
  const p = usePalette();
  const container = useRef<HTMLDivElement>(null);
  const [ribbons, setRibbons] = useState<Ribbon[]>([]);
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

  useLayoutEffect(() => {
    const el = container.current;
    if (!el) return;
    const rows = el.querySelectorAll<HTMLButtonElement>('[data-node-id]');
    const maxCount = graph.links.reduce((max, link) => Math.max(max, link.count), 1);
    const measure = () => {
      const origin = el.getBoundingClientRect();
      const positions = new Map<string, {rect: DOMRect; stage: number}>();
      for (const row of rows) positions.set(row.dataset.nodeId!, {rect: row.getBoundingClientRect(), stage: Number(row.dataset.stageIndex)});
      setRibbons(
        graph.links.map(link => {
          const source = positions.get(link.source)!;
          const target = positions.get(link.target)!;
          const x1 = source.rect.right - origin.left;
          const x2 = target.rect.left - origin.left;
          const y1 = source.rect.top + source.rect.height / 2 - origin.top;
          const y2 = target.rect.top + target.rect.height / 2 - origin.top;
          const mid = (x1 + x2) / 2;
          return {...link, stage: source.stage, width: Math.max(2, (link.count / maxCount) * 12), d: `M${x1},${y1}C${mid},${y1} ${mid},${y2} ${x2},${y2}`};
        })
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const row of rows) observer.observe(row);
    return () => observer.disconnect();
  }, [graph, lang]);

  return (
    <>
      <Legend
        series={columns.map(({stage, total}, index) => ({label: t(graphStageLabels[stage]), color: p.cat[index], values: [total]}))}
        fmt={n => t('flow.graphTooltip', {n: n ?? 0})}
      />
      <div className="rp-flow-columns" ref={container}>
        <svg className="rp-flow-ribbons" aria-hidden="true">
          {ribbons.map(link => (
            <path
              key={JSON.stringify([link.source, link.target])}
              d={link.d}
              fill="none"
              stroke={`color-mix(in srgb, ${p.cat[link.stage]} ${active === null ? 18 : link.source === active || link.target === active ? 45 : 8}%, transparent)`}
              strokeWidth={link.width}
              strokeLinecap="round"
            />
          ))}
        </svg>
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
