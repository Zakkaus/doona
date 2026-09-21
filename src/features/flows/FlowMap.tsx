import {useMemo} from 'react';
import {useT, formatNumber, useLang, LOCALE} from '../../i18n';
import type {GroupSummary, Node} from '../../api/model';
import {outboundLabel, policyKindLabels, preferredHealth} from '../../api/selectors';
import {Chips, Disclosure, Light, NodeTile} from '../../ui/ui';
import {lanes, type FlowMap as FlowMapData, type MapNode} from './map';

const kindOf = (outbound: MapNode) => (outbound.unknown ? 'unknown' : outbound.label === 'direct' ? 'direct' : outbound.label === 'block' ? 'block' : 'group');
const tones = {group: 'info', direct: 'ok', block: 'err', unknown: 'muted'} as const;

export function FlowMap({
  map,
  groups,
  nodes,
  pinned,
  onPin
}: {
  map: FlowMapData;
  groups: GroupSummary[];
  nodes: Node[];
  pinned: string | null;
  onPin: (id: string | null) => void;
}) {
  const t = useT();
  const locale = LOCALE[useLang()];
  const rows = useMemo(() => lanes(map), [map]);
  // A row shows a handful of rules; the rest unfold on demand so a big config stays one screen.
  const shownRules = 6;
  const policy = useMemo(() => new Map(groups.map(group => [group.name, t(policyKindLabels[group.policy.kind])])), [groups, t]);
  const health = useMemo(() => new Map(nodes.map(node => [node.name, preferredHealth(node)])), [nodes]);
  const label = (node: MapNode) => (node.unknown ? t('flow.mapUnknown') : node.label);
  const n = (value: number) => formatNumber(value, locale);
  return (
    <div className="rp-card rp-lanes">
      {rows.map(lane => {
        const kind = kindOf(lane.outbound);
        const members = [lane.outbound.id, ...lane.rules.map(rule => rule.node.id), ...(lane.node ? [lane.node.node.id] : [])];
        const dim = pinned !== null && !members.includes(pinned);
        const nodeHealth = lane.node ? health.get(lane.node.node.label) : undefined;
        const facts = [policy.get(lane.outbound.label), t('flow.laneFlows', {n: n(lane.outbound.count)})].filter(Boolean).join(' · ');
        const chips = (rules: typeof lane.rules) => (
          <Chips
            label={t('flow.mapRule')}
            items={rules.map(rule => ({id: rule.node.id, label: label(rule.node), count: n(rule.count), countLabel: t('flow.laneFlows', {n: n(rule.count)})}))}
            value={pinned && rules.some(rule => rule.node.id === pinned) ? pinned : null}
            onChange={onPin}
          />
        );
        return (
          <div className="rp-lane" key={lane.outbound.id} data-dim={dim ? '' : undefined}>
            <div className="rp-lane-title">
              <Light tone={tones[kind]}>
                <strong>{outboundLabel(lane.outbound.unknown ? null : lane.outbound.label, t)}</strong>
              </Light>
              <span className="rp-label">{facts}</span>
            </div>
            {lane.rules.length ? (
              <div className="rp-cluster">
                {chips(lane.rules.slice(0, shownRules))}
                {lane.rules.length > shownRules && (
                  <Disclosure title={t('flow.moreRules', {n: lane.rules.length - shownRules})}>{chips(lane.rules.slice(shownRules))}</Disclosure>
                )}
              </div>
            ) : (
              <span className="rp-label">{t('flow.laneNoRules')}</span>
            )}
            {lane.node ? (
              <div className="rp-lane-node">
                <NodeTile
                  name={label(lane.node.node)}
                  tcp={nodeHealth?.latency_ms ?? undefined}
                  alive={nodeHealth ? nodeHealth.state === 'healthy' : true}
                  unavailable={nodeHealth?.state === 'unavailable'}
                  description={lane.node.configured && !lane.node.count ? t('flow.laneSelected') : t('flow.laneFlows', {n: n(lane.node.count)})}
                  selected={pinned === lane.node.node.id}
                  onPress={() => onPin(pinned === lane.node!.node.id ? null : lane.node!.node.id)}
                />
              </div>
            ) : (
              <div className="rp-lane-node">
                {/* A group with no live selection has nothing to show on the right; direct and block are themselves. */}
                <NodeTile
                  name={kind === 'group' ? t('flow.laneNoNode') : outboundLabel(lane.outbound.label, t)}
                  description={kind === 'group' ? t('flow.laneNoNodeHelp') : t('flow.builtin')}
                  unavailable={kind === 'group'}
                  selected={pinned === lane.outbound.id}
                  onPress={() => onPin(pinned === lane.outbound.id ? null : lane.outbound.id)}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
