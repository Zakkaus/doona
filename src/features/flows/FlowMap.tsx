import {useLayoutEffect, useMemo, useRef, useState} from 'react';
import {ToggleButton} from 'react-aria-components';
import {useT, formatNumber, useLang, LOCALE} from '../../i18n';
import type {Key} from '../../i18n/messages';
import {TextTooltip} from '../../ui/ui';
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

// The config as columns, links drawn between the boxes once they have been laid out. Nothing moves on hover:
// a click pins a path and the rest fades, a second click releases it.
export function FlowMap({map, pinned, onPin}: {map: FlowMapData; pinned: string | null; onPin: (id: string | null) => void}) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const container = useRef<HTMLDivElement>(null);
  const [boxes, setBoxes] = useState<Record<string, Box>>({});
  const columns = useMemo(
    () =>
      mapStages.map(stage => {
        const nodes = map.nodes.filter(node => node.stage === stage);
        return {stage, shown: nodes.slice(0, perColumn), hidden: nodes.length - Math.min(nodes.length, perColumn)};
      }),
    [map]
  );
  const shown = useMemo(() => new Set(columns.flatMap(column => column.shown.map(node => node.id))), [columns]);
  const focus = useMemo(() => (pinned ? connected(map.links, pinned) : null), [map, pinned]);
  const heaviest = Math.max(1, ...map.links.map(link => link.count));
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
    <div className="rp-flowmap" ref={container} data-pinned={pinned ? '' : undefined}>
      <svg className="rp-flowmap-links" aria-hidden="true">
        {map.links.map(link => {
          const a = boxes[link.source];
          const b = boxes[link.target];
          if (!a || !b || !shown.has(link.source) || !shown.has(link.target)) return null;
          const x1 = a.x + a.w;
          const y1 = a.y + a.h / 2;
          const x2 = b.x;
          const y2 = b.y + b.h / 2;
          const mid = (x1 + x2) / 2;
          return (
            <path
              key={link.source + '>' + link.target}
              d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
              strokeWidth={link.count ? 1 + (3 * link.count) / heaviest : 1}
              strokeDasharray={link.count ? undefined : '4 4'}
              data-on={focus?.edges.has(link) ? '' : undefined}
              data-dim={focus && !focus.edges.has(link) ? '' : undefined}
            />
          );
        })}
      </svg>
      {columns.map(({stage, shown, hidden}) => (
        <div className="rp-flowmap-col" key={stage} role="group" aria-label={t(stageLabels[stage])}>
          <span className="rp-flowmap-head">{t(stageLabels[stage])}</span>
          {shown.map(node => (
            <ToggleButton
              key={node.id}
              className="rp-flowmap-node"
              data-map-id={node.id}
              data-stage={stage}
              data-dim={focus && !focus.nodes.has(node.id) ? '' : undefined}
              isSelected={pinned === node.id}
              onChange={selected => onPin(selected ? node.id : null)}
              aria-label={`${t(stageLabels[stage])}: ${label(node)} · ${formatNumber(node.count, locale)}`}
            >
              <TextTooltip>{label(node)}</TextTooltip>
              <span className="n">{formatNumber(node.count, locale)}</span>
            </ToggleButton>
          ))}
          {hidden > 0 && <span className="rp-label">{t('flow.mapOther', {n: hidden})}</span>}
        </div>
      ))}
    </div>
  );
}
