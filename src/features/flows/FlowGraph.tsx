import {useMemo, useState, type ReactNode} from 'react';
import {useChartWidth, type SankeyNodeProps} from 'recharts';
import {translate, useLang, useT, type Translator} from '../../i18n';
import {Sankey, usePalette} from '../../ui/Charts';
import {Button} from '../../ui/ui';
import {graphStages, unknownLabels, type FlowGraphData, type GraphNode} from './graph';

export const graphStageLabels = {
  source: 'flow.graphSource',
  rule: 'flow.graphRule',
  chain: 'flow.graphChain',
  outbound: 'flow.graphOutbound'
} as const;
export const graphLabel = (node: Pick<GraphNode, 'stage' | 'label'>, t: Translator) =>
  node.label === unknownLabels[node.stage] ? t(unknownLabels[node.stage]) : node.label;

const margin = {top: 8, right: 160, bottom: 8, left: 8};

function FlowNode({
  x,
  y,
  width,
  height,
  node,
  name,
  color,
  depth,
  selected,
  onSelect
}: Omit<SankeyNodeProps, 'onSelect'> & {node: GraphNode; name: string; color: string; depth: number; selected: boolean; onSelect: (node: GraphNode) => void}) {
  const t = useT();
  const chartWidth = useChartWidth() ?? 0;
  const last = graphStages.indexOf(node.stage) === depth;
  const labelWidth = last ? margin.right - 8 : (chartWidth - margin.left - margin.right - width) / depth - width - 12;
  const tooltip = `${name} · ${t('flow.graphTooltip', {n: node.count})}`;
  return (
    <g
      className="rp-sankey-node"
      data-stage={node.stage}
      data-node-id={node.id}
      role="button"
      tabIndex={0}
      aria-label={`${t(graphStageLabels[node.stage])}: ${tooltip}`}
      aria-pressed={selected}
      onClick={() => onSelect(node)}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(node);
        }
      }}
    >
      <title>{tooltip}</title>
      <rect x={x} y={y} width={width} height={height} fill={color} />
      {height >= 16 && (
        <foreignObject x={x + width + 8} y={y + height / 2 - 10} width={Math.max(0, labelWidth)} height={20} aria-hidden="true">
          <div className="rp-label rp-sankey-label">{name}</div>
        </foreignObject>
      )}
    </g>
  );
}

export function FlowGraph({
  graph,
  selected,
  onSelect,
  caption
}: {
  graph: FlowGraphData;
  selected: string | null;
  onSelect: (node: GraphNode) => void;
  caption: ReactNode;
}) {
  const t = useT();
  const lang = useLang();
  const p = usePalette();
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem('doona-flows-graph') !== 'closed';
    } catch {
      return true;
    }
  });
  const data = useMemo(() => {
    const indices = new Map(graph.nodes.map((node, index) => [node.id, index]));
    return {
      nodes: graph.nodes.map(node => ({name: graphLabel(node, (key, params) => translate(lang, key, params))})),
      links: graph.links.map(link => ({source: indices.get(link.source)!, target: indices.get(link.target)!, value: link.count}))
    };
  }, [graph, lang]);
  const depth = graph.nodes.some(node => node.stage === 'outbound') ? 3 : 2;
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
          <div className="rp-legend">
            {graphStages.map((stage, index) => (
              <span className="it" key={stage}>
                <i className="sw" style={{background: p.cat[index]}} />
                {t(graphStageLabels[stage])}
              </span>
            ))}
          </div>
          <Sankey
            data={data}
            margin={margin}
            formatTooltip={(label, n) => `${label} · ${t('flow.graphTooltip', {n})}`}
            node={props => (
              <FlowNode
                {...props}
                node={graph.nodes[props.index]}
                name={data.nodes[props.index].name}
                color={p.cat[graphStages.indexOf(graph.nodes[props.index].stage)]}
                depth={depth}
                selected={selected === graph.nodes[props.index].id}
                onSelect={onSelect}
              />
            )}
            link={({sourceX, sourceY, sourceControlX, targetX, targetY, targetControlX, linkWidth, index}) => (
              <path
                d={`M${sourceX},${sourceY}C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
                fill="none"
                stroke={p.cat[graphStages.indexOf(graph.nodes[data.links[index].source].stage)]}
                strokeOpacity={0.16}
                strokeWidth={linkWidth}
              />
            )}
          />
          <p className="rp-note">{t('flow.graphNote')}</p>
        </>
      )}
      {caption}
    </section>
  );
}
