import type {Group, HealthObservation} from '../../api/model';
import {preferredObservation} from '../../api/selectors';

export function memberHealth(group: Group | undefined, fallback: ReadonlyMap<string, HealthObservation | undefined>) {
  if (!group) return [];
  const observations = new Map<string, HealthObservation[]>();
  for (const observation of group.runtime.health) {
    const member = observations.get(observation.member_id);
    if (member) member.push(observation);
    else observations.set(observation.member_id, [observation]);
  }
  return group.members.map(member => ({...member, health: preferredObservation(observations.get(member.id) ?? []) ?? fallback.get(member.id)}));
}

type HealthMap = ReadonlyMap<string, HealthObservation | undefined>;
const shown = (h: HealthObservation | undefined) => h && [h.state, h.latency_ms, h.transport, h.purpose].join('\u0000');
// A node poll that changes nothing a tile shows keeps the previous map, so every card's projection stays memoised.
export function sameHealth(a: HealthMap, b: HealthMap) {
  if (a.size !== b.size) return false;
  for (const [id, health] of b) if (!a.has(id) || shown(a.get(id)) !== shown(health)) return false;
  return true;
}
