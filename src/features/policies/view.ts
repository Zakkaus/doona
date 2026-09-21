import type {Group, HealthObservation, ProbeResult} from '../../api/model';
import type {Key} from '../../i18n/messages';
import {compareLatency, healthMillis, type MessageRef} from '../../api/selectors';
import type {Translator} from '../../i18n';
import {millis} from '../../api/u64';
import {latencyTone, type NodeStatus} from '../../ui/ui';
import {regionOf} from './geo';
export const policyKindLabels: Record<Group['policy']['kind'], Key> = {
  selector: 'policy.kind.selector',
  urltest: 'policy.kind.urltest',
  loadbalance: 'policy.kind.loadbalance',
  fallback: 'policy.kind.fallback',
  random: 'policy.kind.random',
  score: 'policy.kind.score'
};
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
      return [label, String(value)];
    });
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
  nested: boolean;
  tcp?: number;
  unavailable: boolean;
  healthy: boolean;
  status: NodeStatus;
  description: string;
  region: string;
};
// The tile's status slot: a group badge, a latency with its tone, or the state when there is no latency.
function memberStatus(member: {kind: string; health?: HealthObservation}, t: Translator): NodeStatus {
  if (member.kind === 'group') return {text: t('ui.group'), badge: true};
  const tcp = healthMillis(member.health);
  if (tcp != null) return {text: t('ui.latency', {n: millis(tcp)}), tone: latencyTone(tcp)};
  return member.health?.state === 'unavailable' ? {text: t('ui.unavailable'), tone: 'err'} : {text: '—'};
}
export function memberViews(members: Array<Group['members'][number] & {health?: HealthObservation}>, t: Translator): MemberView[] {
  return members.map(member => ({
    id: member.id,
    name: member.name,
    nested: member.kind === 'group',
    tcp: healthMillis(member.health),
    unavailable: member.health?.state === 'unavailable',
    healthy: member.health?.state === 'healthy',
    status: memberStatus(member, t),
    description: member.health ? `${member.health.transport.toUpperCase()} · ${member.health.purpose}` : ' ',
    region: regionOf(member.name) ?? '?'
  }));
}
export function menuViews(nodes: Array<{name: string; tcp?: number; alive?: boolean}>, t: Translator) {
  const items = nodes.map(node => ({
    id: node.name,
    label: node.name,
    tcp: node.tcp,
    region: regionOf(node.name) ?? '—',
    description: node.alive === false ? t('ui.unavailable') : node.tcp === undefined ? '—' : t('ui.latency', {n: millis(node.tcp)}),
    className: node.alive === false ? 'desc err' : node.tcp === undefined ? 'desc' : `desc ${latencyTone(node.tcp)}`
  }));
  const groups = new Map<string, typeof items>();
  for (const node of [...items].sort((a, b) => compareLatency(a.tcp, b.tcp))) {
    const group = groups.get(node.region);
    if (group) group.push(node);
    else groups.set(node.region, [node]);
  }
  return {items, sections: [...groups].map(([title, items]) => ({title, items, count: ` · ${items.length}`}))};
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
    kind: g.policy.native || g.policy.kind,
    selected: network === 'tcp' ? tcp : network === 'udp' ? udp : tcp === udp ? tcp : undefined,
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
  t: Translator
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
      ...[...counts].sort((a, b) => b[1] - a[1]).map(([id, count]) => ({id, label: id === '?' ? '—' : id, desc: String(count)}))
    ],
    regionLabel: filter.region === 'all' ? t('policy.allRegions') : filter.region === '?' ? '—' : filter.region,
    count: down ? t('policy.membersDown', {n: shown.length, down}) : t('policy.members', {n: shown.length})
  };
}
