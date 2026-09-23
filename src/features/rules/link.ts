import {conditionKinds, type ConditionKind} from '../../dae/groups';
import {href} from '../../shell/route';

// Where a rule sits in the rule list, when the backend lists rules and the reference names one.
export const ruleHref = (ruleId: string | null, listed: boolean) => (listed && ruleId ? href('rules', {tab: 'list', rule: ruleId}) : undefined);

export type RuleSeed = {kind: ConditionKind; value: string};
export function parseRuleSeed(value: string | null): RuleSeed | null {
  if (!value) return null;
  const colon = value.indexOf(':');
  const kind = value.slice(0, colon) as ConditionKind;
  return colon > 0 && conditionKinds.includes(kind) ? {kind, value: value.slice(colon + 1)} : null;
}
export function ruleSeedHref(seed: RuleSeed): string {
  return href('rules', {tab: 'list', add: seed.kind + ':' + seed.value});
}
