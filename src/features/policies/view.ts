import type {Group, ProbeResult} from '../../api/model';
import type {Key} from '../../i18n/messages';
import type {MessageRef} from '../../api/selectors';
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
