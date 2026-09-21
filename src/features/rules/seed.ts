import {conditionKinds, type ConditionKind} from '../../dae/groups';
import {buildHash} from '../../shell/route';

export type RuleSeed = {kind: ConditionKind; value: string};
export function parseRuleSeed(value: string | null): RuleSeed | null {
  if (!value) return null;
  const colon = value.indexOf(':');
  const kind = value.slice(0, colon) as ConditionKind;
  return colon > 0 && conditionKinds.includes(kind) ? {kind, value: value.slice(colon + 1)} : null;
}
export function ruleSeedHref(seed: RuleSeed): string {
  return buildHash('rules', 'tab=list&add=' + encodeURIComponent(seed.kind + ':' + seed.value));
}
