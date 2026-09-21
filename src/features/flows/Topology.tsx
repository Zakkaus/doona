import {useEffect, useId, useMemo, useState} from 'react';
import {ResponsiveContainer, Sankey} from 'recharts';
import type {NodeProps, LinkProps} from 'recharts/types/chart/Sankey';
import {useT} from '../../i18n';
import {outboundLabel} from '../../api/selectors';
import {usePalette} from '../../ui/Charts';
import {mapStages, pinMembers, topologyMap} from './map';
import type {FlowMap, MapNode, MapStage} from './map';

const captions = ['flow.stageClient', 'flow.mapRule', 'flow.mapOutbound', 'flow.mapNode'] as const;
const columns: Record<MapStage, number> = {client: 0, rule: 1, outbound: 2, node: 3};
const margin = {top: 16, right: 16, bottom: 16, left: 16};

export default function Topology({map, pinned, onPin}: {map: FlowMap; pinned: string | null; onPin: (id: string | null) => void}) {
  const t = useT();
  const palette = usePalette();
  const clipId = useId();
  const graph = useMemo(() => topologyMap(map), [map]);
  const [width, setWidth] = useState(0);
  const [hovered, setHovered] = useState<string[] | null>(null);
  const data = useMemo(() => {
    const indices = new Map(graph.nodes.map((node, index) => [node.id, index]));
    return {nodes: graph.nodes, links: graph.links.map(link => ({source: indices.get(link.source)!, target: indices.get(link.target)!, value: link.count}))};
  }, [graph]);
  const active = useMemo(() => {
    const members = new Set(pinned ? pinMembers(pinned) : []);
    const selected = graph.nodes.filter(node => pinMembers(node.id).some(id => members.has(id))).map(node => node.id);
    if (!hovered && !pinned) return null;
    const edges = new Set<string>();
    for (const path of graph.paths) {
      if (hovered ? !hovered.every(id => path.includes(id)) : !selected.some(id => path.includes(id))) continue;
      for (let i = 1; i < path.length; i++) edges.add(JSON.stringify([path[i - 1], path[i]]));
    }
    return edges;
  }, [graph, hovered, pinned]);
  useEffect(() => {
    if (!pinned) return;
    const clear = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onPin(null);
    };
    document.addEventListener('keydown', clear);
    return () => document.removeEventListener('keydown', clear);
  }, [pinned, onPin]);
  const height = Math.min(640, Math.max(320, 28 * Math.max(...mapStages.map(stage => graph.nodes.filter(node => node.stage === stage).length))));
  const step = Math.max(0, width - margin.left - margin.right - 8) / 3;
  const color = (node: MapNode) =>
    node.stage === 'outbound' && node.label === 'block'
      ? palette.love
      : node.stage === 'outbound' && node.label === 'direct'
        ? palette.foam
        : palette.cat[columns[node.stage]];
  const renderNode = ({index, y, height: nodeHeight}: NodeProps) => {
    const node = graph.nodes[index];
    const last = node.stage === 'node';
    const x = margin.left + columns[node.stage] * step;
    const label = node.others ? t('flow.others') : node.unknown ? t('flow.mapUnknown') : node.stage === 'outbound' ? outboundLabel(node.label, t) : node.label;
    const text = Array.from(label);
    const shown = text.length > 24 ? text.slice(0, 23).join('') + '…' : label;
    const labelWidth = Math.max(0, (node.stage === 'outbound' || last ? step / 2 : step) - 18);
    const toggle = () => onPin(pinned === node.id ? null : node.id);
    return (
      <g
        className="rp-topology-node"
        data-stage={node.stage}
        tabIndex={0}
        role="button"
        aria-label={`${label} · ${t('flow.laneFlows', {n: node.count})}`}
        aria-pressed={pinned === node.id}
        onClick={toggle}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggle();
          }
        }}
        onMouseEnter={() => setHovered([node.id])}
        onMouseLeave={() => setHovered(null)}
        onFocus={() => setHovered([node.id])}
        onBlur={() => setHovered(null)}
      >
        <title>{label}</title>
        <rect className="rp-topology-bar" x={x} y={y} width={8} height={nodeHeight} rx={3} fill={color(node)} />
        <defs>
          <clipPath id={`${clipId}-${index}`}>
            <rect x={last ? x - labelWidth - 8 : x + 16} y={y + nodeHeight / 2 - 10} width={labelWidth} height={20} />
          </clipPath>
        </defs>
        <text x={last ? x - 8 : x + 16} y={y + nodeHeight / 2} dy="0.35em" textAnchor={last ? 'end' : 'start'} clipPath={`url(#${clipId}-${index})`}>
          {shown}
          <tspan className="rp-topology-count" dx={6}>
            {node.count}
          </tspan>
        </text>
      </g>
    );
  };
  const renderLink = ({index, sourceY, targetY, linkWidth}: LinkProps) => {
    const link = graph.links[index];
    const source = graph.nodes[data.links[index].source];
    const target = graph.nodes[data.links[index].target];
    const x1 = margin.left + columns[source.stage] * step + 8;
    const x2 = margin.left + columns[target.stage] * step;
    const mid = (x1 + x2) / 2;
    const half = linkWidth / 2;
    return (
      <path
        className="rp-topology-link"
        d={`M${x1},${sourceY - half} C${mid},${sourceY - half} ${mid},${targetY - half} ${x2},${targetY - half} L${x2},${targetY + half} C${mid},${targetY + half} ${mid},${sourceY + half} ${x1},${sourceY + half} Z`}
        fill={palette.cat[columns[source.stage]]}
        opacity={active ? (active.has(JSON.stringify([link.source, link.target])) ? 0.5 : 0.06) : 0.16}
        onMouseEnter={() => setHovered([link.source, link.target])}
        onMouseLeave={() => setHovered(null)}
      />
    );
  };
  return (
    <>
      <div className="rp-topology-captions">
        {captions.map(key => (
          <span className="rp-label" key={key}>
            {t(key)}
          </span>
        ))}
      </div>
      <div className="rp-topology-chart" style={{height}}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0} onResize={setWidth} debounce={120}>
          <Sankey
            data={data}
            nodeWidth={8}
            nodePadding={10}
            margin={margin}
            align="left"
            sort={false}
            node={renderNode}
            link={renderLink}
            accessibilityLayer={false}
            role="group"
          />
        </ResponsiveContainer>
      </div>
    </>
  );
}
