import {formatLatency} from '../../i18n/format';
import type {Group, HealthObservation, ProbeResult} from '../../api/model';
import type {Key} from '../../i18n';
import {compareLatency, healthMillis, type MessageRef} from '../../api/selectors';
import {groupPolicyText} from '../shared/policyText';
import {formatNumber, type Translator} from '../../i18n';
import {latencyTone, type NodeStatus} from '../../ui/ui';
import {regionOf} from '../shared/geo';
import type {PartialProbeError} from '../../store/groups';
import {errorText} from '../../api/error';
const groupConfigLabels: Record<string, Key> = {
  default_member_id: 'policy.cfg.defaultMember',
  final_outbound: 'policy.cfg.finalOutbound',
  check_url: 'policy.cfg.checkUrl',
  check_interval: 'policy.cfg.checkInterval',
  tolerance: 'policy.cfg.tolerance',
  idle_timeout: 'policy.cfg.idleTimeout',
  interrupt_connections: 'policy.cfg.interruptConnections'
};
const units: Record<string, Key> = {check_interval: 'policy.cfg.seconds', idle_timeout: 'policy.cfg.seconds', tolerance: 'policy.cfg.millis'};
// Known fields get a label and a unit; anything the contract adds later shows its raw name.
export function groupConfigFields(group: Group): Array<[Key | MessageRef, string | MessageRef]> {
  return Object.entries(group.config)
    .filter(([, value]) => value !== null)
    .map(([key, value]) => {
      const label: Key | MessageRef = groupConfigLabels[key] ?? {key: 'flow.f.input', params: {name: key}};
      if (typeof value === 'boolean') return [label, {key: value ? 'ui.yes' : 'ui.no'}];
      if (typeof value === 'number' && units[key]) return [label, {key: units[key], params: {n: value}}];
      if (key === 'default_member_id') return [label, group.members.find(member => member.id === value)?.name ?? String(value)];
      return [label, String(value)];
    });
}

// A partial probe says how far it got and why it stopped.
export function actionErrorText(error: Error, t: Translator): string {
  if (!('partialResult' in error)) return errorText(error, t);
  const {completed, total, cause} = error as PartialProbeError;
  const progress = t('policy.probePartial', {done: completed, n: total, error: errorText(cause, t)});
  return t('ui.valuePair', {label: errorText(error, t), value: progress});
}
// Count each member's worst address-family outcome, without letting an absent address hide a measured result.
const probeRank = {unknown: 0, healthy: 1, unavailable: 2};
export function probeSummary(result: ProbeResult): MessageRef {
  const members = new Map<string, 'healthy' | 'unavailable' | 'unknown'>();
  for (const item of result.results) {
    const previous = members.get(item.member_id);
    if (!previous || probeRank[item.state] > probeRank[previous]) members.set(item.member_id, item.state);
  }
  const states = [...members.values()];
  return {
    key: result.selection_changed.tcp || result.selection_changed.udp ? 'policy.probeChanged' : 'policy.probeUnchanged',
    params: {
      healthy: states.filter(s => s === 'healthy').length,
      unavailable: states.filter(s => s === 'unavailable').length,
      unknown: states.filter(s => s === 'unknown').length
    }
  };
}

export type MemberView = {
  id: string;
  name: string;
  tcp?: number;
  unavailable: boolean;
  healthy: boolean;
  status: NodeStatus;
  description: string;
  region: string;
};
const purposes: Record<HealthObservation['purpose'], Key> = {data: 'policy.purpose.data', dns: 'policy.purpose.dns', shared: 'policy.purpose.shared'};
// The tile's status slot: a group badge, a latency with its tone, or the state when there is no latency.
function memberStatus(member: {kind: string; health?: HealthObservation}, t: Translator): NodeStatus {
  if (member.kind === 'group') return {text: t('ui.group'), badge: true};
  const tcp = healthMillis(member.health);
  if (tcp != null) return {text: formatLatency(tcp, t), tone: latencyTone(tcp)};
  return member.health?.state === 'unavailable' ? {text: t('ui.unavailable'), tone: 'err'} : {text: '—'};
}
export function memberViews(members: Array<Group['members'][number] & {health?: HealthObservation}>, t: Translator): MemberView[] {
  return members.map(member => ({
    id: member.id,
    name: member.name,
    tcp: healthMillis(member.health),
    unavailable: member.health?.state === 'unavailable',
    healthy: member.health?.state === 'healthy',
    status: memberStatus(member, t),
    // Only an observation other than the usual TCP on the data path says how it was made.
    description:
      member.health && (member.health.transport !== 'tcp' || member.health.purpose !== 'data')
        ? t('policy.observedVia', {transport: t(member.health.transport === 'udp' ? 'ui.udp' : 'ui.tcp'), purpose: t(purposes[member.health.purpose])})
        : ' ',
    region: regionOf(member.name) ?? '?'
  }));
}
export function policyCardView(g: Group, members: MemberView[], network: 'both' | 'tcp' | 'udp', t: Translator) {
  const tcp = g.runtime.selection.tcp?.member_id;
  const udp = g.runtime.selection.udp?.member_id;
  const selectable = g.policy.kind === 'selector' && g.capabilities.can_select;
  const overridable = !selectable && g.capabilities.can_override;
  const pinned = overridable && [g.runtime.selection.tcp, g.runtime.selection.udp].some(item => item?.source === 'override');
  const interruptable = g.capabilities.mutable_config.includes('interrupt_connections');
  const healthy = members.filter(member => member.healthy).length;
  const down = members.filter(member => member.unavailable).length;
  const untested = members.length - healthy - down;
  return {
    id: g.id,
    name: g.name,
    policy: groupPolicyText(g.policy, t),
    selected: network === 'tcp' ? tcp : network === 'udp' ? udp : tcp === udp ? tcp : undefined,
    // Both networks on different members: neither is the selection, so each is marked with the network it carries.
    marks: network === 'both' && tcp && udp && tcp !== udp ? {[tcp]: t('ui.tcp'), [udp]: t('ui.udp')} : ({} as Record<string, string>),
    selectable,
    overridable,
    pinned,
    interruptable,
    interrupt: g.config.interrupt_connections,
    showNetwork: selectable || overridable || tcp !== udp,
    networkLabel: t('policy.network', {name: g.name}),
    healthy: t('policy.healthy', {n: healthy}),
    down: down ? t('policy.down', {n: down}) : null,
    untested: untested ? t('policy.untested', {n: untested}) : null,
    overrideTone: pinned ? ('neutral' as const) : ('ok' as const),
    overrideText: t(pinned ? 'policy.overridden' : 'policy.automatic'),
    fields: groupConfigFields(g)
      .filter(([key]) => !(interruptable && key === 'policy.cfg.interruptConnections'))
      .map(([key, value]): [string, string] => [
        typeof key === 'string' ? t(key) : t(key.key, key.params),
        typeof value === 'string' ? value : t(value.key, value.params)
      ])
  };
}

export function nodeGridView(
  nodes: MemberView[],
  filter: {q: string; region: string; sort: string; aliveOnly: boolean},
  contains: (value: string, query: string) => boolean,
  t: Translator,
  locale: string
) {
  const big = nodes.length > 12;
  const counts = new Map<string, number>();
  for (const node of nodes) counts.set(node.region, (counts.get(node.region) ?? 0) + 1);
  const shown = big
    ? nodes.filter(
        node =>
          (!filter.q || contains(node.name, filter.q)) && (filter.region === 'all' || node.region === filter.region) && (!filter.aliveOnly || node.healthy)
      )
    : nodes;
  if (big && filter.sort === 'latency') shown.sort((a, b) => compareLatency(a.tcp, b.tcp));
  else if (big && filter.sort === 'name') shown.sort((a, b) => a.name.localeCompare(b.name));
  const down = shown.filter(node => node.unavailable).length;
  return {
    big,
    shown,
    regions: [
      {id: 'all', label: t('policy.allRegions')},
      ...[...counts].sort((a, b) => b[1] - a[1]).map(([id, count]) => ({id, label: id === '?' ? '—' : id, desc: formatNumber(count, locale)}))
    ],
    regionLabel: filter.region === 'all' ? t('policy.allRegions') : filter.region === '?' ? '—' : filter.region,
    count: down ? t('policy.membersDown', {n: shown.length, down}) : t('policy.members', {n: shown.length})
  };
}
