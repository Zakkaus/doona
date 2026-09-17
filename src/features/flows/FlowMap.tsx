import {useMemo, useState} from 'react';
import {useT, formatNumber, useLang, LOCALE} from '../../i18n';
import type {GroupSummary, Node} from '../../api/model';
import {outboundLabel, preferredHealth} from '../../api/selectors';
import {BrandIcon, Button, Chips, Light, NodeTile} from '../../ui/ui';
import {brandFor} from '../../ui/brand';
import {OutboundMark, PolicyMark} from '../policies/Flag';
import {lanes, type FlowMap as FlowMapData, type MapNode} from './map';

// The status light says what kind of exit it is, nothing more: a proxy group, direct, block, or unknown.
const kindOf = (outbound: MapNode) => (outbound.unknown ? 'unknown' : outbound.label === 'direct' ? 'direct' : outbound.label === 'block' ? 'block' : 'group');
const tones = {group: 'info', direct: 'ok', block: 'err', unknown: 'muted'} as const;

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
  // A row shows a handful of rules; the rest unfold on demand so a big config stays one screen.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const shownRules = 6;
  const policy = useMemo(() => new Map(groups.map(group => [group.name, group.policy.kind])), [groups]);
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
        return (
          <div className="rp-lane" key={lane.outbound.id} data-dim={dim ? '' : undefined}>
            <div className="rp-lane-title">
              <Light tone={tones[kind]}>
                {kind === 'group' ? (
                  <PolicyMark kind={policy.get(lane.outbound.label)} />
                ) : (
                  <OutboundMark name={lane.outbound.unknown ? null : lane.outbound.label} />
                )}
                <strong>{outboundLabel(lane.outbound.unknown ? null : lane.outbound.label, t)}</strong>
              </Light>
              <span className="rp-label">{facts}</span>
            </div>
            {lane.rules.length ? (
              <div className="rp-cluster">
                <Chips
                  label={t('flow.mapRule')}
                  items={(expanded.has(lane.outbound.id) ? lane.rules : lane.rules.slice(0, shownRules)).map(rule => ({
                    id: rule.node.id,
                    label: label(rule.node),
                    count: n(rule.count),
                    countLabel: t('flow.laneFlows', {n: n(rule.count)}),
                    icon: <BrandIcon brand={rule.node.unknown ? null : brandFor(rule.node.label)} />
                  }))}
                  value={pinned && lane.rules.some(rule => rule.node.id === pinned) ? pinned : null}
                  onChange={onPin}
                />
                {lane.rules.length > shownRules && (
                  <Button
                    small
                    onPress={() =>
                      setExpanded(prev => {
                        const next = new Set(prev);
                        if (next.has(lane.outbound.id)) next.delete(lane.outbound.id);
                        else next.add(lane.outbound.id);
                        return next;
                      })
                    }
                  >
                    {expanded.has(lane.outbound.id) ? t('flow.fewerRules') : t('flow.moreRules', {n: lane.rules.length - shownRules})}
                  </Button>
                )}
              </div>
            ) : (
              <span className="rp-label">{t('flow.laneNoRules')}</span>
            )}
            {lane.node ? (
              <div className="rp-lane-node">
                <NodeTile
                  name={label(lane.node.node)}
                  icon={<OutboundMark name={lane.node.node.unknown ? null : lane.node.node.label} />}
                  tcp={nodeHealth?.latency_ms ?? undefined}
                  alive={nodeHealth ? nodeHealth.state === 'healthy' : true}
                  unavailable={nodeHealth?.state === 'unavailable'}
                  description={lane.node.configured && !lane.node.count ? t('flow.laneSelected') : t('flow.laneFlows', {n: n(lane.node.count)})}
                  labels={{timeout: t('policy.unavailable'), nested: t('policy.group'), cur: t('policy.current')}}
                  selected={pinned === lane.node.node.id}
                  onPress={() => onPin(pinned === lane.node!.node.id ? null : lane.node!.node.id)}
                />
              </div>
            ) : (
              <div className="rp-lane-node">
                <NodeTile
                  name={outboundLabel(lane.outbound.label, t)}
                  icon={<OutboundMark name={lane.outbound.unknown ? null : lane.outbound.label} />}
                  description={t('flow.builtin')}
                  unavailable={false}
                  labels={{timeout: t('policy.unavailable'), nested: t('policy.group'), cur: t('policy.current')}}
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
