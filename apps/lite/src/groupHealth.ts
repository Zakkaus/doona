import type {Group, Node} from '../../../src/api/model';
import {healthMillis, preferredHealth} from '../../../src/api/selectors';
import {memberHealth, selectionHealth} from '../../../src/features/policies/health';

export type HealthFallback = ReturnType<typeof selectionHealth>;
export type GroupStatus = 'healthy' | 'warning' | 'unavailable' | 'unknown';

export const memberName = (group: Group, id: string | undefined | null, unknown: string) =>
  group.members.find(member => member.id === id)?.name.trim() || id || unknown;

// Node health, plus nested groups resolved through their current member.
export function healthFallback(nodes: Node[], groups: Group[]): HealthFallback {
  return selectionHealth(
    new Map(nodes.map(node => [node.id, preferredHealth(node)])),
    groups.map(item => ({
      ...item,
      member_count: item.members.length,
      selection: {tcp_member_id: item.runtime.selection.tcp?.member_id ?? null, udp_member_id: item.runtime.selection.udp?.member_id ?? null}
    }))
  );
}

export const observedMembers = (group: Group, fallback: HealthFallback) => memberHealth(group, fallback);

// The current member decides the row: unreachable is an error, failing siblings a warning, untested neutral.
export function groupStatus(group: Group, fallback: HealthFallback): {status: GroupStatus; latency: number | null} {
  const observed = observedMembers(group, fallback);
  const current = observed.find(member => member.id === group.runtime.selection.tcp?.member_id);
  const state = current?.health?.state;
  const status =
    state === 'unavailable'
      ? 'unavailable'
      : observed.some(member => member.health?.state === 'unavailable')
        ? 'warning'
        : state === 'healthy'
          ? 'healthy'
          : 'unknown';
  return {status, latency: healthMillis(current?.health) ?? null};
}
