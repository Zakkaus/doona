import {useEffect, useMemo, useState} from 'react';
import type {ReactNode} from 'react';
import {ToggleButton} from 'react-aria-components';
import {useT} from '../../i18n';
import {millis} from '../../api/u64';
import {outboundLabel} from '../../api/selectors';
import {policyKindLabels} from '../policies/view';
import {Badge, Button, cx, latencyTone, useContentWidth, useMediaQuery} from '../../ui/ui';
import {parentOf, treeRows} from './map';
import type {RoutingTree, TreeLink, TreeNode, TreeOutbound, TreeRule} from './map';

const FEW = 30;
const stackQuery = '(max-width: 799px)';
const PITCH = 40;
const TILE = 32;
const GAP = 56;
// Column shares of the width: rules need the most room, nodes the least.
const shares = [5, 4, 3];
type Stage = 'rule' | 'outbound' | 'node';
const columns: Record<Stage, number> = {rule: 0, outbound: 1, node: 2};

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
  const stacked = useMediaQuery(stackQuery);
  const [showAll, setShowAll] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [ref, width] = useContentWidth<HTMLDivElement>();
  const focus = hovered ?? pinned;
  const active = useMemo(() => (focus ? reach(tree.links, focus) : null), [tree, focus]);
  // A long rule list is cut at the leaves; the outbounds and nodes stay whole.
  const shown = useMemo(() => (showAll || tree.rules.length <= FEW ? tree : {...tree, rules: tree.rules.slice(0, FEW)}), [tree, showAll]);
  const layout = useMemo(() => treeRows(shown), [shown]);
  useEffect(() => {
    if (!pinned) return;
    const clear = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onPin(null);
    };
    document.addEventListener('keydown', clear);
    return () => document.removeEventListener('keydown', clear);
  }, [pinned, onPin]);
  const tile = (id: string, stage: Stage, body: ReactNode, style?: {top: number; left: number; width: number}) => (
    <ToggleButton
      key={id}
      className={cx('rp-tree-tile', !!active && !active.items.has(id) && 'dim')}
      data-id={id}
      data-stage={stage}
      style={style}
      isSelected={pinned === id}
      onChange={() => onPin(pinned === id ? null : id)}
      onHoverStart={() => setHovered(id)}
      onHoverEnd={() => setHovered(null)}
      onFocus={() => setHovered(id)}
      onBlur={() => setHovered(null)}
    >
      {body}
    </ToggleButton>
  );
  const ruleBody = (rule: TreeRule) => (
    <>
      <span className="l">{rule.unknown ? t('flow.mapUnknown') : rule.label}</span>
      {rule.must && <Badge>must</Badge>}
      <span className="c">{rule.count}</span>
    </>
  );
  const outboundBody = (outbound: TreeOutbound) => (
    <>
      <span className="l">
        <b>{outbound.unknown ? t('flow.mapUnknown') : outboundLabel(outbound.label, t)}</b>
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
  const nodeBody = (node: TreeNode) => (
    <>
      <span className="l">
        <b>{node.unknown ? t('flow.mapUnknown') : node.label}</b>
        {node.latency != null ? (
          <span className={cx('s', latencyTone(node.latency))}>{t('ui.latency', {n: millis(node.latency)})}</span>
        ) : (
          node.unavailable && <span className="s err">{t('ui.unavailable')}</span>
        )}
      </span>
      <span className="c">{node.count}</span>
    </>
  );
  const more = tree.rules.length > FEW && (
    <Button small quiet onPress={() => setShowAll(value => !value)}>
      {showAll ? t('flow.treeFewer', {n: FEW}) : t('flow.treeShowAll', {n: tree.rules.length})}
    </Button>
  );
  if (stacked) return <Stacked tree={shown} more={more} tile={tile} ruleBody={ruleBody} outboundBody={outboundBody} nodeBody={nodeBody} />;
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
      <div className="rp-tree-captions">
        {(['rule', 'outbound', 'node'] as const).map(stage => (
          <span className="rp-label" key={stage} style={column(stage)}>
            {t(stage === 'rule' ? 'flow.mapRule' : stage === 'outbound' ? 'flow.mapOutbound' : 'flow.mapNode')}
          </span>
        ))}
      </div>
      <div className="rp-tree-canvas" style={{height}}>
        {width != null && (
          <svg className="rp-tree-links" width={width} height={height} aria-hidden>
            {shown.links.map(link => {
              const from = link.source.startsWith('rule:') ? 'rule' : 'outbound';
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
        {width != null && shown.rules.map(rule => tile(rule.id, 'rule', ruleBody(rule), place(rule.id, 'rule')))}
        {width != null && shown.outbounds.map(outbound => tile(outbound.id, 'outbound', outboundBody(outbound), place(outbound.id, 'outbound')))}
        {width != null && shown.nodes.map(node => tile(node.id, 'node', nodeBody(node), place(node.id, 'node')))}
      </div>
      {more}
    </div>
  );
}

// On a narrow screen the same tree reads top-down: each outbound with the rules that name it above and the
// nodes it led to below.
function Stacked({
  tree,
  more,
  tile,
  ruleBody,
  outboundBody,
  nodeBody
}: {
  tree: RoutingTree;
  more: ReactNode;
  tile: (id: string, stage: Stage, body: ReactNode) => ReactNode;
  ruleBody: (rule: TreeRule) => ReactNode;
  outboundBody: (outbound: TreeOutbound) => ReactNode;
  nodeBody: (node: TreeNode) => ReactNode;
}) {
  const t = useT();
  const branches = tree.outbounds.map(outbound => ({outbound, rules: tree.rules.filter(rule => parentOf(tree, rule) === outbound.id)}));
  const loose = tree.rules.filter(rule => parentOf(tree, rule) === null);
  return (
    <div className="rp-tree stacked">
      {branches.map(({outbound, rules}) => {
        const nodes = tree.nodes.filter(node => tree.links.some(link => link.source === outbound.id && link.target === node.id));
        return (
          <section className="rp-tree-branch" key={outbound.id}>
            {rules.length > 0 && <span className="rp-label">{t('flow.mapRule')}</span>}
            {rules.map(rule => tile(rule.id, 'rule', ruleBody(rule)))}
            <span className="rp-label">{t('flow.mapOutbound')}</span>
            {tile(outbound.id, 'outbound', outboundBody(outbound))}
            {nodes.length > 0 && <span className="rp-label">{t('flow.mapNode')}</span>}
            {nodes.map(node => tile(node.id, 'node', nodeBody(node)))}
          </section>
        );
      })}
      {loose.length > 0 && (
        <section className="rp-tree-branch">
          <span className="rp-label">{t('flow.mapRule')}</span>
          {loose.map(rule => tile(rule.id, 'rule', ruleBody(rule)))}
        </section>
      )}
      {more}
    </div>
  );
}
