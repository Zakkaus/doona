import {useLayoutEffect, useMemo, useRef, useState} from 'react';
import {useT, formatNumber, useLang, LOCALE} from '../../i18n';
import type {Key} from '../../i18n/messages';
import {Bar} from '../../ui/ui';
import {usePalette} from '../../ui/Charts';
import {mapStages, type FlowMap as FlowMapData, type MapLink, type MapNode, type MapStage} from './map';

const stageLabels: Record<MapStage, Key> = {ingress: 'flow.mapIngress', rule: 'flow.mapRule', outbound: 'flow.mapOutbound', node: 'flow.mapNode'};
const perColumn = 8;
type Box = {x: number; y: number; w: number; h: number};

// Everything on the paths through one node, both directions, so a pin dims the rest of the map.
function connected(links: MapLink[], id: string) {
  const nodes = new Set([id]);
  const edges = new Set<MapLink>();
  const walk = (from: string, forward: boolean) => {
    for (const link of links) {
      const [a, b] = forward ? [link.source, link.target] : [link.target, link.source];
      if (a === from && !edges.has(link)) {
        edges.add(link);
        nodes.add(b);
        walk(b, forward);
      }
    }
  };
  walk(id, true);
  walk(id, false);
  return {nodes, edges};
}

// Links leave and enter a row through their own slot along its height, in order of where they go,
// so a fan of paths reads as separate lines instead of one knot at the centre.
function ports(links: MapLink[], boxes: Record<string, Box>) {
  const out = new Map<MapLink, number>();
  const into = new Map<MapLink, number>();
  const slot = (side: 'source' | 'target', store: Map<MapLink, number>) => {
    const byNode = new Map<string, MapLink[]>();
    for (const link of links) {
      const list = byNode.get(link[side]) ?? [];
      list.push(link);
      byNode.set(link[side], list);
    }
    for (const [id, list] of byNode) {
      const box = boxes[id];
      if (!box) continue;
      const other = side === 'source' ? 'target' : 'source';
      const sorted = [...list].sort((a, b) => (boxes[a[other]]?.y ?? 0) - (boxes[b[other]]?.y ?? 0));
      const weight = (link: MapLink) => Math.max(link.count, 1);
      const total = sorted.reduce((sum, link) => sum + weight(link), 0);
      const top = box.y + box.h * 0.1;
      const span = box.h * 0.8;
      let used = 0;
      for (const link of sorted) {
        store.set(link, top + ((used + weight(link) / 2) / total) * span);
        used += weight(link);
      }
    }
  };
  slot('source', out);
  slot('target', into);
  return {out, into};
}

// The config as four ranked columns with thin coloured connectors; a colour is one outbound the whole way.
// Nothing moves on hover: a click pins a path and the rest fades, a second click releases it.
export function FlowMap({map, pinned, onPin}: {map: FlowMapData; pinned: string | null; onPin: (id: string | null) => void}) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const palette = usePalette();
  const container = useRef<HTMLDivElement>(null);
  const [boxes, setBoxes] = useState<Record<string, Box>>({});
  const columns = useMemo(
    () =>
      mapStages.map(stage => {
        const nodes = map.nodes.filter(node => node.stage === stage);
        return {
          stage,
          shown: nodes.slice(0, perColumn),
          hidden: nodes.length - Math.min(nodes.length, perColumn),
          max: Math.max(1, ...nodes.map(node => node.count))
        };
      }),
    [map]
  );
  const shown = useMemo(() => new Set(columns.flatMap(column => column.shown.map(node => node.id))), [columns]);
  const links = useMemo(() => map.links.filter(link => shown.has(link.source) && shown.has(link.target)), [map, shown]);
  // Outbounds take colours in column order, block keeps the alert colour as on the home page.
  const colour = useMemo(() => {
    const names = map.nodes.filter(node => node.stage === 'outbound').map(node => node.label);
    return (outbound: string | null) =>
      outbound === null ? palette.muted : outbound === 'block' ? palette.love : palette.cat[Math.max(0, names.indexOf(outbound)) % palette.cat.length];
  }, [map, palette]);
  // A row wears the colour of the outbound most of its flows took.
  const rowColour = useMemo(() => {
    const totals = new Map<string, Map<string | null, number>>();
    for (const link of map.links) {
      for (const id of [link.source, link.target]) {
        const per = totals.get(id) ?? new Map<string | null, number>();
        per.set(link.outbound, (per.get(link.outbound) ?? 0) + link.count);
        totals.set(id, per);
      }
    }
    return (node: MapNode) => {
      if (node.stage === 'outbound') return colour(node.label);
      const per = totals.get(node.id);
      if (!per) return palette.muted;
      return colour([...per.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null);
    };
  }, [map, colour, palette]);
  const focus = useMemo(() => (pinned ? connected(map.links, pinned) : null), [map, pinned]);
  const heaviest = Math.max(1, ...links.map(link => link.count));
  const slots = useMemo(() => ports(links, boxes), [links, boxes]);
  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    const measure = () => {
      const origin = root.getBoundingClientRect();
      const next: Record<string, Box> = {};
      for (const el of root.querySelectorAll<HTMLElement>('[data-map-id]')) {
        const r = el.getBoundingClientRect();
        next[el.dataset.mapId!] = {x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height};
      }
      setBoxes(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [columns]);
  const label = (node: MapNode) => (node.unknown ? t('flow.mapUnknown') : node.label);
  return (
    <div className="rp-flowmap" ref={container}>
      <svg className="rp-flowmap-links" aria-hidden="true">
        {links.map(link => {
          const a = boxes[link.source];
          const b = boxes[link.target];
          const y1 = slots.out.get(link);
          const y2 = slots.into.get(link);
          if (!a || !b || y1 === undefined || y2 === undefined) return null;
          const x1 = a.x + a.w + 8;
          const x2 = b.x - 8;
          const mid = (x1 + x2) / 2;
          return (
            <path
              key={link.source + '>' + link.target + '@' + link.outbound}
              d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
              stroke={colour(link.outbound)}
              strokeWidth={link.count ? 1.5 + (2.5 * link.count) / heaviest : 1}
              strokeDasharray={link.count ? undefined : '4 4'}
              data-dim={focus && !focus.edges.has(link) ? '' : undefined}
            />
          );
        })}
      </svg>
      {columns.map(({stage, shown, hidden, max}) => (
        <div className="rp-flowmap-col rp-list" key={stage} role="group" aria-label={t(stageLabels[stage])}>
          <span className="rp-flowmap-head">{t(stageLabels[stage])}</span>
          {shown.map(node => (
            <Bar
              key={node.id}
              data-map-id={node.id}
              label={label(node)}
              value={formatNumber(node.count, locale)}
              pct={(node.count / max) * 100}
              color={rowColour(node)}
              selected={pinned === node.id}
              dim={!!focus && !focus.nodes.has(node.id)}
              onPress={selected => onPin(selected ? node.id : null)}
            />
          ))}
          {hidden > 0 && <span className="rp-label">{t('flow.mapOther', {n: hidden})}</span>}
        </div>
      ))}
    </div>
  );
}
