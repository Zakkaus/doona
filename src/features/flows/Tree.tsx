import {useEffect, useMemo, useState} from 'react';
import type {ReactNode} from 'react';
import {ToggleButton} from 'react-aria-components';
import {useT} from '../../i18n';
import {millis} from '../../api/u64';
import {outboundLabel} from '../../api/selectors';
import {policyKindLabels} from '../policies/view';
import {Badge, Button, cx, latencyTone, useContentWidth} from '../../ui/ui';
import {treeRows} from './map';
import type {RoutingTree, TreeBy, TreeItem, TreeLink, TreeNode, TreeOutbound, TreeLeaf} from './map';

const FEW = 30;
// Below this the diagram keeps its shape and pans sideways instead of squeezing the columns.
const MIN_WIDTH = 720;
const PITCH = 40;
const TILE = 32;
const GAP = 56;
// Column shares of the width: rules need the most room, nodes the least.
const shares = [5, 4, 3];
type Stage = 'rule' | 'client' | 'outbound' | 'node';
const columns: Record<Stage, number> = {rule: 0, client: 0, outbound: 1, node: 2};
const captions: Record<TreeBy, 'flow.mapRule' | 'flow.stageClient'> = {rule: 'flow.mapRule', client: 'flow.stageClient'};

// Everything a tree item leads to and everything that leads to it.
function reach(links: TreeLink[], id: string) {
  const items = new Set([id]);
  const edges = new Set<TreeLink>();
  for (const [from, to] of [
    ['source', 'target'],
    ['target', 'source']
  ] as const) {
    const queue = [id];
    for (const current of queue)
      for (const link of links)
        if (link[from] === current && !edges.has(link)) {
          edges.add(link);
          if (!items.has(link[to])) {
            items.add(link[to]);
            queue.push(link[to]);
          }
        }
  }
  return {items, edges};
}

const stroke = (count: number) => Math.min(8, 1.5 + Math.log2(1 + count) * 1.25);

export default function Tree({tree, pinned, onPin}: {tree: RoutingTree; pinned: string | null; onPin: (id: string | null) => void}) {
  const t = useT();
  const [showAll, setShowAll] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [ref, measured] = useContentWidth<HTMLDivElement>();
  const width = measured == null ? null : Math.max(measured, MIN_WIDTH);
  const focus = hovered ?? pinned;
  const active = useMemo(() => (focus ? reach(tree.links, focus) : null), [tree, focus]);
  // A long leaf list is cut; the outbounds and nodes stay whole.
  const shown = useMemo(() => (showAll || tree.leaves.length <= FEW ? tree : {...tree, leaves: tree.leaves.slice(0, FEW)}), [tree, showAll]);
  const layout = useMemo(() => treeRows(shown), [shown]);
  useEffect(() => {
    if (!pinned) return;
    const clear = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onPin(null);
    };
    document.addEventListener('keydown', clear);
    return () => document.removeEventListener('keydown', clear);
  }, [pinned, onPin]);
  const tile = (item: TreeItem, stage: Stage, name: string, body: ReactNode, style?: {top: number; left: number; width: number}) => (
    <ToggleButton
      key={item.id}
      aria-label={describe(item, name)}
      className={cx('rp-tree-tile', !!active && !active.items.has(item.id) && 'dim')}
      data-id={item.id}
      data-stage={stage}
      style={style}
      isSelected={pinned === item.id}
      onChange={() => onPin(pinned === item.id ? null : item.id)}
      onHoverStart={() => setHovered(item.id)}
      onHoverEnd={() => setHovered(null)}
      onFocus={() => setHovered(item.id)}
      onBlur={() => setHovered(null)}
    >
      {body}
    </ToggleButton>
  );
  const leafName = (leaf: TreeLeaf) => (leaf.unknown ? t('flow.mapUnknown') : leaf.label);
  const leafBody = (leaf: TreeLeaf) => (
    <>
      <span className="l">{leafName(leaf)}</span>
      {leaf.must && <Badge>must</Badge>}
      <span className="c">{leaf.count}</span>
    </>
  );
  const outboundName = (outbound: TreeOutbound) => (outbound.unknown ? t('flow.mapUnknown') : outboundLabel(outbound.label, t));
  const outboundBody = (outbound: TreeOutbound) => (
    <>
      <span className="l">
        <b>{outboundName(outbound)}</b>
        {outbound.groups.slice(1).map(group => (
          <span className="s" key={group.name}>
            › {group.name}
          </span>
        ))}
        {outbound.groups.length > 0 && <span className="s">{t(policyKindLabels[outbound.groups[outbound.groups.length - 1].kind])}</span>}
        {outbound.kind === 'group' && !outbound.node && <span className="s">{t('flow.treeNoNode')}</span>}
      </span>
      <span className="c">{outbound.count}</span>
    </>
  );
  const nodeName = (node: TreeNode) => (node.unknown ? t('flow.mapUnknown') : node.label);
  const nodeBody = (node: TreeNode) => (
    <>
      <span className="l">
        <b>{nodeName(node)}</b>
        {node.latency != null ? (
          <span className={cx('s', latencyTone(node.latency))}>{t('ui.latency', {n: millis(node.latency)})}</span>
        ) : (
          node.unavailable && <span className="s err">{t('ui.unavailable')}</span>
        )}
      </span>
      <span className="c">{node.count}</span>
    </>
  );
  const more = tree.leaves.length > FEW && (
    <Button small quiet onPress={() => setShowAll(value => !value)}>
      {showAll ? t('flow.treeFewer', {n: FEW}) : t('flow.treeShowAll', {n: tree.leaves.length})}
    </Button>
  );
  // What a screen reader gets for a tile: the name, the flow count and where the branch leads.
  const describe = (item: TreeItem, name: string) => {
    const next = tree.links.filter(link => link.source === item.id).map(link => link.target);
    const to = [...shown.outbounds.filter(o => next.includes(o.id)).map(outboundName), ...shown.nodes.filter(n => next.includes(n.id)).map(nodeName)];
    return [name, t('flow.treeFlows', {n: item.count}), ...(to.length ? ['→ ' + to.join(', ')] : [])].join(' · ');
  };
  const leafTile = (leaf: TreeLeaf, style?: {top: number; left: number; width: number}) => tile(leaf, tree.by, leafName(leaf), leafBody(leaf), style);
  const outboundTile = (outbound: TreeOutbound, style?: {top: number; left: number; width: number}) =>
    tile(outbound, 'outbound', outboundName(outbound), outboundBody(outbound), style);
  const nodeTile = (node: TreeNode, style?: {top: number; left: number; width: number}) => tile(node, 'node', nodeName(node), nodeBody(node), style);
  // Column geometry from the measured width; rows from the layout. The connectors use the same numbers.
  const unit = width == null ? 0 : (width - 2 * GAP) / shares.reduce((sum, share) => sum + share);
  const column = (stage: Stage) => {
    const index = columns[stage];
    const left = shares.slice(0, index).reduce((sum, share) => sum + share * unit + GAP, 0);
    return {left, width: shares[index] * unit};
  };
  const top = (id: string) => layout.at.get(id)! * PITCH;
  const place = (id: string, stage: Stage) => ({top: top(id), ...column(stage)});
  const height = layout.rows * PITCH - (PITCH - TILE);
  return (
    <div className="rp-tree" ref={ref}>
      <div className="rp-tree-captions" style={{width: width ?? undefined}}>
        {(['rule', 'outbound', 'node'] as const).map(stage => (
          <span className="rp-label" key={stage} style={column(stage)}>
            {t(stage === 'rule' ? captions[tree.by] : stage === 'outbound' ? 'flow.mapOutbound' : 'flow.mapNode')}
          </span>
        ))}
      </div>
      <div className="rp-tree-canvas" style={{height, width: width ?? undefined}}>
        {width != null && (
          <svg className="rp-tree-links" width={width} height={height} aria-hidden>
            {shown.links.map(link => {
              const from = link.source.startsWith('outbound:') ? 'outbound' : 'rule';
              const target = from === 'rule' ? shown.outbounds.find(outbound => outbound.id === link.target) : undefined;
              if (!layout.at.has(link.source) || !layout.at.has(link.target)) return null;
              const a = column(from);
              const b = column(from === 'rule' ? 'outbound' : 'node');
              const x1 = a.left + a.width;
              const y1 = top(link.source) + TILE / 2;
              const x2 = b.left;
              const y2 = top(link.target) + TILE / 2;
              const xm = (x1 + x2) / 2;
              return (
                <path
                  key={link.source + '>' + link.target}
                  d={`M${x1},${y1} C${xm},${y1} ${xm},${y2} ${x2},${y2}`}
                  strokeWidth={stroke(link.count)}
                  data-kind={target?.kind ?? (from === 'rule' ? 'group' : 'node')}
                  data-state={active ? (active.edges.has(link) ? 'active' : 'dim') : undefined}
                  strokeDasharray={link.count ? undefined : '4 4'}
                />
              );
            })}
          </svg>
        )}
        {width != null && shown.leaves.map(leaf => leafTile(leaf, place(leaf.id, 'rule')))}
        {width != null && shown.outbounds.map(outbound => outboundTile(outbound, place(outbound.id, 'outbound')))}
        {width != null && shown.nodes.map(node => nodeTile(node, place(node.id, 'node')))}
      </div>
      {more}
    </div>
  );
}
