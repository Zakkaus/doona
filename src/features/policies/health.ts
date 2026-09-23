import type {Group, GroupSummary, HealthObservation, Node} from '../../api/model';
import {healthMillis, preferredHealth, preferredObservation, resolveSelectedLeaf} from '../../api/selectors';

export type MemberHealth = {health?: HealthObservation; selectedNode?: {name: string; latency: number}};

export function policyHealth(nodes: Node[], groups: GroupSummary[]) {
  const fallback = new Map<string, MemberHealth>(nodes.map(node => [node.id, {health: preferredHealth(node)}]));
  const nodesById = new Map(nodes.map(node => [node.id, node]));
  const groupsById = new Map(groups.map(group => [group.id, group]));
  const groupsByName = new Map(groups.map(group => [group.name, group]));
  for (const group of groups) {
    const {node} = resolveSelectedLeaf(group.name, 'tcp', groupsByName, groupsById, nodesById);
    const latency = node && healthMillis(fallback.get(node.id)?.health);
    // A selected node's latency is display context, not an observation of this group.
    if (node && latency != null) fallback.set(group.id, {selectedNode: {name: node.name, latency}});
  }
  return fallback;
}

export function memberHealth(group: Group | undefined, fallback: ReadonlyMap<string, MemberHealth>) {
  if (!group) return [];
  const observations = new Map<string, HealthObservation[]>();
  for (const observation of group.runtime.health) {
    const member = observations.get(observation.member_id);
    if (member) member.push(observation);
    else observations.set(observation.member_id, [observation]);
  }
  return group.members.map(member => {
    const health = preferredObservation(observations.get(member.id) ?? []) ?? (member.kind === 'node' ? fallback.get(member.id)?.health : undefined);
    return {...member, ...(health ? {health} : member.kind === 'group' ? {selectedNode: fallback.get(member.id)?.selectedNode} : {})};
  });
}

type HealthMap = ReadonlyMap<string, MemberHealth>;
const shown = (h: HealthObservation | undefined) => h && [h.state, h.latency_ms, h.transport, h.purpose].join('\u0000');
// A node poll that changes nothing a tile shows keeps the previous map, so every card's projection stays memoised.
export function sameHealth(a: HealthMap, b: HealthMap) {
  if (a.size !== b.size) return false;
  for (const [id, member] of b) {
    const previous = a.get(id);
    if (!a.has(id) || shown(previous?.health) !== shown(member.health) || previous?.selectedNode?.name !== member.selectedNode?.name || previous?.selectedNode?.latency !== member.selectedNode?.latency) return false;
  }
  return true;
}
