import {conditionKinds, type ConditionKind} from '../../dae/groups';
import {readTag, tagId} from './taggedId';
import {href} from '../../shell/route';

// Where a rule sits in the rule list, when the backend lists rules and the reference names one.
export const ruleHref = (ruleId: string | null, listed: boolean) => (listed && ruleId ? href('rules', {tab: 'list', rule: ruleId}) : undefined);

export type RuleSeed = {kind: ConditionKind; value: string};
export function parseRuleSeed(value: string | null): RuleSeed | null {
  return value ? readTag(value, conditionKinds) : null;
}
export function ruleSeedHref(seed: RuleSeed): string {
  return href('rules', {tab: 'list', add: tagId(seed.kind, seed.value)});
}
