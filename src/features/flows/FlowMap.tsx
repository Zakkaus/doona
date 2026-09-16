import {useMemo} from 'react';
import {useT, formatNumber, useLang, LOCALE} from '../../i18n';
import {Bar} from '../../ui/ui';
import {usePalette} from '../../ui/Charts';
import {lanes, type FlowMap as FlowMapData, type MapNode} from './map';

// One lane per outbound, read left to right: the rules that send traffic there, the outbound itself,
// the node it currently selects. Nothing crosses and nothing moves on hover; a click pins one item
// and dims the lanes it is not part of.
export function FlowMap({map, pinned, onPin}: {map: FlowMapData; pinned: string | null; onPin: (id: string | null) => void}) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const palette = usePalette();
  const rows = useMemo(() => lanes(map), [map]);
  const busiest = Math.max(1, ...rows.map(lane => lane.outbound.count));
  const colour = (index: number, outbound: string) => (outbound === 'block' ? palette.love : palette.cat[index % palette.cat.length]);
  const label = (node: MapNode) => (node.unknown ? t('flow.mapUnknown') : node.label);
  const n = (value: number) => formatNumber(value, locale);
  return (
    <div className="rp-lanes">
      <div className="rp-lane rp-lane-head" aria-hidden="true">
        <span>{t('flow.mapRule')}</span>
        <span />
        <span>{t('flow.mapOutbound')}</span>
        <span />
        <span>{t('flow.mapNode')}</span>
      </div>
      {rows.map((lane, index) => {
        const tint = colour(index, lane.outbound.label);
        const members = [lane.outbound.id, ...lane.rules.map(rule => rule.node.id), ...(lane.node ? [lane.node.node.id] : [])];
        const dim = pinned !== null && !members.includes(pinned);
        const press = (id: string) => (selected: boolean) => onPin(selected ? id : null);
        return (
          <div className="rp-lane" key={lane.outbound.id} data-dim={dim ? '' : undefined} style={{'--lane': tint} as React.CSSProperties}>
            <div className="rp-lane-rules rp-list">
              {lane.rules.length ? (
                lane.rules.map(rule => (
                  <Bar
                    key={rule.node.id}
                    label={label(rule.node)}
                    value={n(rule.count)}
                    pct={(rule.count / lane.outbound.count) * 100}
                    color={tint}
                    selected={pinned === rule.node.id}
                    dim={pinned !== null && !dim && pinned !== rule.node.id && pinned !== lane.outbound.id && pinned !== lane.node?.node.id}
                    onPress={press(rule.node.id)}
                  />
                ))
              ) : (
                <span className="rp-label">{t('flow.laneNoRules')}</span>
              )}
            </div>
            <span className="rp-lane-arrow" data-empty={lane.rules.length ? undefined : ''} aria-hidden="true" />
            <div className="rp-lane-outbound">
              <Bar
                label={label(lane.outbound)}
                value={n(lane.outbound.count)}
                pct={(lane.outbound.count / busiest) * 100}
                color={tint}
                selected={pinned === lane.outbound.id}
                onPress={press(lane.outbound.id)}
              />
            </div>
            {lane.node ? (
              <>
                <span className="rp-lane-arrow" data-empty={lane.node.count ? undefined : ''} aria-hidden="true" />
                <div className="rp-lane-node">
                  <Bar
                    label={label(lane.node.node)}
                    value={lane.node.configured && !lane.node.count ? t('flow.laneSelected') : n(lane.node.count)}
                    pct={lane.outbound.count ? (lane.node.count / lane.outbound.count) * 100 : 0}
                    color={tint}
                    selected={pinned === lane.node.node.id}
                    onPress={press(lane.node.node.id)}
                  />
                </div>
              </>
            ) : (
              <>
                <span />
                <span className="rp-label rp-lane-terminal">{t('flow.laneTerminal')}</span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
