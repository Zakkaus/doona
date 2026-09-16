import {useMemo} from 'react';
import {useT, formatNumber, useLang, LOCALE} from '../../i18n';
import type {Key} from '../../i18n/messages';
import type {GroupSummary, Node} from '../../api/model';
import {preferredHealth} from '../../api/selectors';
import {Badge, Chips, Light, NodeTile} from '../../ui/ui';
import {Flag} from '../policies/Flag';
import {lanes, type FlowMap as FlowMapData, type MapNode} from './map';

// The status light says what kind of exit it is, nothing more: a proxy group, direct, block, or unknown.
const kindOf = (outbound: MapNode) => (outbound.unknown ? 'unknown' : outbound.label === 'direct' ? 'direct' : outbound.label === 'block' ? 'block' : 'group');
const tones = {group: 'info', direct: 'ok', block: 'err', unknown: 'muted'} as const;
const kindLabels: Record<keyof typeof tones, Key> = {
  group: 'flow.kind.group',
  direct: 'flow.kind.direct',
  block: 'flow.kind.block',
  unknown: 'flow.kind.unknown'
};

// One card per outbound, three labelled columns like every detail view: the rules that send traffic there,
// the outbound itself, the node it currently selects. A click pins one item and dims the cards it is not in.
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
  const policy = useMemo(() => new Map(groups.map(group => [group.name, group.policy.kind])), [groups]);
  const health = useMemo(() => new Map(nodes.map(node => [node.name, preferredHealth(node)])), [nodes]);
  const label = (node: MapNode) => (node.unknown ? t('flow.mapUnknown') : node.label);
  const n = (value: number) => formatNumber(value, locale);
  return (
    <div className="rp-list">
      {rows.map(lane => {
        const kind = kindOf(lane.outbound);
        const members = [lane.outbound.id, ...lane.rules.map(rule => rule.node.id), ...(lane.node ? [lane.node.node.id] : [])];
        const dim = pinned !== null && !members.includes(pinned);
        const nodeHealth = lane.node ? health.get(lane.node.node.label) : undefined;
        return (
          <div className="rp-card rp-lane" key={lane.outbound.id} data-dim={dim ? '' : undefined}>
            <div className="rp-field">
              <span className="rp-label">{t('flow.mapRule')}</span>
              {lane.rules.length ? (
                <Chips
                  label={t('flow.mapRule')}
                  items={lane.rules.map(rule => ({id: rule.node.id, label: label(rule.node), count: n(rule.count)}))}
                  value={pinned && lane.rules.some(rule => rule.node.id === pinned) ? pinned : null}
                  onChange={onPin}
                />
              ) : (
                <span className="rp-empty-inline">{t('flow.laneNoRules')}</span>
              )}
            </div>
            <div className="rp-field">
              <span className="rp-label">{t('flow.mapOutbound')}</span>
              <div className="rp-cluster">
                <Chips
                  label={t('flow.mapOutbound')}
                  items={[{id: lane.outbound.id, label: label(lane.outbound), count: n(lane.outbound.count)}]}
                  value={pinned === lane.outbound.id ? pinned : null}
                  onChange={onPin}
                />
                <Light small tone={tones[kind]}>
                  {t(kindLabels[kind])}
                </Light>
                {policy.get(lane.outbound.label) && <Badge>{policy.get(lane.outbound.label)}</Badge>}
              </div>
            </div>
            <div className="rp-field">
              <span className="rp-label">{t('flow.mapNode')}</span>
              {lane.node ? (
                <NodeTile
                  name={label(lane.node.node)}
                  icon={<Flag name={lane.node.node.label} />}
                  tcp={nodeHealth?.latency_ms ?? undefined}
                  alive={nodeHealth ? nodeHealth.state === 'healthy' : true}
                  unavailable={nodeHealth?.state === 'unavailable'}
                  description={lane.node.configured && !lane.node.count ? t('flow.laneSelected') : t('flow.laneFlows', {n: n(lane.node.count)})}
                  labels={{timeout: t('policy.unavailable'), nested: t('policy.group'), cur: t('policy.current')}}
                  selected={pinned === lane.node.node.id}
                  onPress={() => onPin(pinned === lane.node!.node.id ? null : lane.node!.node.id)}
                />
              ) : (
                <span className="rp-empty-inline">{t('flow.laneTerminal')}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
