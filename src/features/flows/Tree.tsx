import {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import type {ReactNode} from 'react';
import {useT} from '../../i18n';
import {outboundLabel} from '../../api/selectors';
import {policyKindLabels} from '../policies/view';
import {Badge, Button, NodeTile, cx, useMediaQuery} from '../../ui/ui';
import type {RoutingTree, TreeLink, TreeNode, TreeOutbound, TreeRule} from './map';

const FEW = 24;
const stackQuery = '(max-width: 799px)';
type Box = {x: number; y: number; w: number; h: number};

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

// A right-angled connector from the right edge of one box to the left edge of another. Links into the same
// target share a vertical lane in the gap, so they merge into one bus before entering it.
function elbow(a: Box, b: Box, lane: number): string {
  const x1 = a.x + a.w;
  const y1 = a.y + a.h / 2;
  const x2 = b.x;
  const y2 = b.y + b.h / 2;
  const xm = x1 + (x2 - x1) * lane;
  const r = Math.min(8, Math.abs(y2 - y1) / 2, xm - x1, x2 - xm);
  if (r < 1) return `M${x1},${y1} H${x2}`;
  const dy = Math.sign(y2 - y1);
  return `M${x1},${y1} H${xm - r} Q${xm},${y1} ${xm},${y1 + dy * r} V${y2 - dy * r} Q${xm},${y2} ${xm + r},${y2} H${x2}`;
}
const stroke = (count: number) => Math.min(9, 1.5 + Math.log2(1 + count) * 1.25);

export default function Tree({tree, pinned, onPin}: {tree: RoutingTree; pinned: string | null; onPin: (id: string | null) => void}) {
  const t = useT();
  const stacked = useMediaQuery(stackQuery);
  const [showAll, setShowAll] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState<{width: number; height: number; boxes: Map<string, Box>} | null>(null);
  const focus = hovered ?? pinned;
  const active = useMemo(() => (focus ? reach(tree.links, focus) : null), [tree, focus]);
  const rules = showAll || tree.rules.length <= FEW ? tree.rules : tree.rules.slice(0, FEW);
  useEffect(() => {
    if (!pinned) return;
    const clear = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onPin(null);
    };
    document.addEventListener('keydown', clear);
    return () => document.removeEventListener('keydown', clear);
  }, [pinned, onPin]);
  // Connectors follow the tiles' rendered positions, so any layout change re-measures.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el || stacked) {
      setGeometry(null);
      return;
    }
    const measure = () => {
      const base = el.getBoundingClientRect();
      const boxes = new Map<string, Box>();
      for (const item of el.querySelectorAll<HTMLElement>('[data-id]')) {
        const rect = item.getBoundingClientRect();
        boxes.set(item.dataset.id!, {x: rect.left - base.left, y: rect.top - base.top, w: rect.width, h: rect.height});
      }
      setGeometry({width: base.width, height: base.height, boxes});
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [tree, stacked, rules.length]);
  const item = (id: string, stage: 'rule' | 'outbound' | 'node', body: ReactNode) => (
    <div
      key={id}
      className={cx('rp-tree-item', !!active && !active.items.has(id) && 'dim')}
      data-id={id}
      data-stage={stage}
      onPointerEnter={() => setHovered(id)}
      onPointerLeave={() => setHovered(null)}
      onFocus={() => setHovered(id)}
      onBlur={() => setHovered(null)}
    >
      {body}
    </div>
  );
  const count = (n: number) => <span className="rp-tree-count">{n}</span>;
  const toggle = (id: string) => onPin(pinned === id ? null : id);
  const ruleTile = (rule: TreeRule) =>
    item(
      rule.id,
      'rule',
      <NodeTile
        name={rule.unknown ? t('flow.mapUnknown') : rule.label}
        aside={count(rule.count)}
        description={rule.must ? <Badge>must</Badge> : ' '}
        selected={pinned === rule.id}
        onPress={() => toggle(rule.id)}
      />
    );
  const outboundTile = (outbound: TreeOutbound) =>
    item(
      outbound.id,
      'outbound',
      <>
        <NodeTile
          name={outbound.unknown ? t('flow.mapUnknown') : outboundLabel(outbound.label, t)}
          aside={count(outbound.count)}
          description={outbound.groups[0] ? t(policyKindLabels[outbound.groups[0].kind]) + ' · ' + outbound.groups[0].policy : ' '}
          selected={pinned === outbound.id}
          onPress={() => toggle(outbound.id)}
        />
        {outbound.groups.slice(1).map(group => (
          <div className="rp-tree-nested" key={group.name}>
            <NodeTile name={group.name} nested description={t(policyKindLabels[group.kind]) + ' · ' + group.policy} />
          </div>
        ))}
        {outbound.kind === 'group' && !outbound.node && <span className="rp-label">{t('flow.treeNoNode')}</span>}
      </>
    );
  const nodeTile = (node: TreeNode) =>
    item(
      node.id,
      'node',
      <NodeTile
        name={node.unknown ? t('flow.mapUnknown') : node.label}
        tcp={node.latency}
        unavailable={node.unavailable}
        description={t('flow.laneFlows', {n: node.count})}
        selected={pinned === node.id}
        onPress={() => toggle(node.id)}
      />
    );
  const more = tree.rules.length > FEW && (
    <Button small quiet onPress={() => setShowAll(value => !value)}>
      {showAll ? t('flow.treeFewer', {n: FEW}) : t('flow.treeShowAll', {n: tree.rules.length})}
    </Button>
  );
  if (stacked) return <Stacked tree={tree} rules={rules} more={more} ruleTile={ruleTile} outboundTile={outboundTile} nodeTile={nodeTile} />;
  return (
    <div className="rp-tree" ref={root}>
      {geometry && (
        <svg className="rp-tree-links" width={geometry.width} height={geometry.height} aria-hidden>
          {tree.links.map(link => {
            const a = geometry.boxes.get(link.source);
            const b = geometry.boxes.get(link.target);
            if (!a || !b) return null;
            const target = tree.outbounds.find(outbound => outbound.id === link.target);
            const column = target ? tree.outbounds : tree.nodes;
            const lane = (column.findIndex(item => item.id === link.target) + 1) / (column.length + 1);
            return (
              <path
                key={link.source + '>' + link.target}
                d={elbow(a, b, lane)}
                strokeWidth={stroke(link.count)}
                data-kind={target?.kind ?? 'node'}
                data-state={active ? (active.edges.has(link) ? 'active' : 'dim') : undefined}
                strokeDasharray={link.count ? undefined : '4 4'}
              />
            );
          })}
        </svg>
      )}
      <div className="rp-tree-col">
        <span className="rp-label">{t('flow.mapRule')}</span>
        {rules.map(ruleTile)}
        {more}
      </div>
      <div className="rp-tree-col">
        <span className="rp-label">{t('flow.mapOutbound')}</span>
        {tree.outbounds.map(outboundTile)}
      </div>
      <div className="rp-tree-col">
        <span className="rp-label">{t('flow.mapNode')}</span>
        {tree.nodes.map(nodeTile)}
      </div>
    </div>
  );
}

// On a narrow screen the same tree reads top-down: each outbound with the rules that name it above and the
// node it ends at below.
function Stacked({
  tree,
  rules,
  more,
  ruleTile,
  outboundTile,
  nodeTile
}: {
  tree: RoutingTree;
  rules: TreeRule[];
  more: ReactNode;
  ruleTile: (rule: TreeRule) => ReactNode;
  outboundTile: (outbound: TreeOutbound) => ReactNode;
  nodeTile: (node: TreeNode) => ReactNode;
}) {
  const t = useT();
  // A rule whose config names no outbound sits under the one its flows went to.
  const target = (rule: TreeRule) => rule.outbound ?? tree.links.filter(link => link.source === rule.id).sort((a, b) => b.count - a.count)[0]?.target ?? null;
  const branches = tree.outbounds.map(outbound => ({outbound, rules: rules.filter(rule => target(rule) === outbound.id)}));
  const loose = rules.filter(rule => target(rule) === null);
  return (
    <div className="rp-tree stacked">
      {branches.map(({outbound, rules}) => {
        const node = tree.nodes.find(node => node.id === outbound.node);
        return (
          <section className="rp-tree-branch" key={outbound.id}>
            {rules.length > 0 && <span className="rp-label">{t('flow.mapRule')}</span>}
            {rules.map(ruleTile)}
            <span className="rp-label">{t('flow.mapOutbound')}</span>
            {outboundTile(outbound)}
            {node && (
              <>
                <span className="rp-label">{t('flow.mapNode')}</span>
                {nodeTile(node)}
              </>
            )}
          </section>
        );
      })}
      {loose.length > 0 && (
        <section className="rp-tree-branch">
          <span className="rp-label">{t('flow.mapRule')}</span>
          {loose.map(ruleTile)}
        </section>
      )}
      {more}
    </div>
  );
}
