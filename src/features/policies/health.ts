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
