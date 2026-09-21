import {useEffect, useMemo, useState} from 'react';
import {ToggleButton} from 'react-aria-components';
import {useT} from '../../i18n';
import {Badge, Button, cx, useContentWidth} from '../../ui/ui';
import {treeRows} from './map';
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
  const tiles = useMemo(() => tileViews(shown, t), [shown, t]);
  const tile = (view: TileView, style: {top: number; left: number; width: number}) => (
    <ToggleButton
      key={view.id}
      aria-label={view.label}
      className={cx('rp-tree-tile', !!active && !active.items.has(view.id) && 'dim')}
      data-id={view.id}
      data-stage={view.stage}
      style={style}
      isSelected={pinned === view.id}
      onChange={() => onPin(pinned === view.id ? null : view.id)}
      onHoverStart={() => setHovered(view.id)}
      onHoverEnd={() => setHovered(null)}
      onFocus={() => setHovered(view.id)}
      onBlur={() => setHovered(null)}
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
  const more = tree.leaves.length > FEW && (
    <Button small quiet onPress={() => setShowAll(value => !value)}>
      {showAll ? t('flow.treeFewer', {n: FEW}) : t('flow.treeShowAll', {n: tree.leaves.length})}
    </Button>
  );
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
        {width != null && tiles.map(view => tile(view, place(view.id, view.stage)))}
      </div>
      {more}
    </div>
  );
}
