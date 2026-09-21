import {memo, useCallback, useEffect, useMemo, useState} from 'react';
import {ToggleButton} from 'react-aria-components';
import {useT} from '../../i18n';
import {Badge, Button, cx, useContentWidth} from '../../ui/ui';
import {treeIndex, treeRows, type TreeIndex} from './map';
import type {RoutingTree, TreeBy, TreeLink} from './map';
import {tileViews, type TileView} from './view';

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
function reach(index: TreeIndex, id: string) {
  const items = new Set([id]);
  const edges = new Set<TreeLink>();
  for (const [links, to] of [
    [index.outgoing, 'target'],
    [index.incoming, 'source']
  ] as const) {
    const queue = [id];
    for (const current of queue)
      for (const link of links.get(current) ?? [])
        if (!edges.has(link)) {
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

type Placement = {top: number; left: number; width: number};
function columnAt(width: number, stage: Stage) {
  const unit = (width - 2 * GAP) / shares.reduce((sum, share) => sum + share);
  const index = columns[stage];
  return {left: shares.slice(0, index).reduce((sum, share) => sum + share * unit + GAP, 0), width: shares[index] * unit};
}
// A tile re-renders only when its own highlight or selection changes, not on every hover elsewhere.
const TreeTile = memo(function TreeTile({
  view,
  style,
  dim,
  selected,
  pin,
  hover
}: {
  view: TileView;
  style: Placement;
  dim: boolean;
  selected: boolean;
  pin: (id: string) => void;
  hover: (id: string | null) => void;
}) {
  return (
    <ToggleButton
      aria-label={view.label}
      className={cx('rp-tree-tile', dim && 'dim')}
      data-id={view.id}
      data-stage={view.stage}
      style={style}
      isSelected={selected}
      onChange={() => pin(view.id)}
      onHoverStart={() => hover(view.id)}
      onHoverEnd={() => hover(null)}
      onFocus={() => hover(view.id)}
      onBlur={() => hover(null)}
    >
      <span className="l">
        {view.stage === 'rule' || view.stage === 'client' ? view.name : <b>{view.name}</b>}
        {view.notes.map((note, i) => (
          <span className={cx('s', note.tone)} key={i}>
            {note.text}
          </span>
        ))}
      </span>
      {view.badge && <Badge>{view.badge}</Badge>}
      <span className="c">{view.count}</span>
    </ToggleButton>
  );
});

export default function Tree({tree, pinned, onPin}: {tree: RoutingTree; pinned: string | null; onPin: (id: string | null) => void}) {
  const t = useT();
  const [showAll, setShowAll] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [ref, measured] = useContentWidth<HTMLDivElement>();
  const width = measured == null ? null : Math.max(measured, MIN_WIDTH);
  const focus = hovered ?? pinned;
  const index = useMemo(() => treeIndex(tree), [tree]);
  const active = useMemo(() => (focus ? reach(index, focus) : null), [index, focus]);
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
  const tiles = useMemo(() => tileViews(shown, t), [shown, t]);
  const pin = useCallback((id: string) => onPin(pinned === id ? null : id), [pinned, onPin]);
  const tile = (view: TileView, style: Placement) => (
    <TreeTile key={view.id} view={view} style={style} dim={!!active && !active.items.has(view.id)} selected={pinned === view.id} pin={pin} hover={setHovered} />
  );
  const more = tree.leaves.length > FEW && (
    <Button small quiet onPress={() => setShowAll(value => !value)}>
      {showAll ? t('flow.treeFewer', {n: FEW}) : t('flow.treeShowAll', {n: tree.leaves.length})}
    </Button>
  );
  const column = (stage: Stage) => columnAt(width ?? 0, stage);
  const placed = useMemo(
    () => tiles.map(view => ({view, style: {top: layout.at.get(view.id)! * PITCH, ...columnAt(width ?? 0, view.stage)}})),
    [tiles, layout, width]
  );
  const height = layout.rows * PITCH - (PITCH - TILE);
  const outbounds = useMemo(() => new Map(shown.outbounds.map(outbound => [outbound.id, outbound])), [shown]);
  const geometry = useMemo(() => {
    const unit = width == null ? 0 : (width - 2 * GAP) / 12;
    const left = [0, 5 * unit + GAP, 9 * unit + 2 * GAP];
    return shown.links.flatMap(link => {
      if (!layout.at.has(link.source) || !layout.at.has(link.target)) return [];
      const from = link.source.startsWith('outbound:') ? 1 : 0;
      const x1 = left[from] + shares[from] * unit;
      const x2 = left[from + 1];
      const y1 = layout.at.get(link.source)! * PITCH + TILE / 2;
      const y2 = layout.at.get(link.target)! * PITCH + TILE / 2;
      const xm = (x1 + x2) / 2;
      return [
        {
          link,
          id: link.source + '>' + link.target,
          path: `M${x1},${y1} C${xm},${y1} ${xm},${y2} ${x2},${y2}`,
          width: stroke(link.count),
          dash: link.count ? undefined : '4 4',
          kind: from === 0 ? (outbounds.get(link.target)?.kind ?? 'group') : 'node'
        }
      ];
    });
  }, [shown, layout, width, outbounds]);
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
            {geometry.map(edge => (
              <path
                key={edge.id}
                d={edge.path}
                strokeWidth={edge.width}
                data-kind={edge.kind}
                data-state={active ? (active.edges.has(edge.link) ? 'active' : 'dim') : undefined}
                strokeDasharray={edge.dash}
              />
            ))}
          </svg>
        )}
        {width != null && placed.map(({view, style}) => tile(view, style))}
      </div>
      {more}
    </div>
  );
}
