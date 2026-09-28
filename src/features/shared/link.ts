import {conditionKinds, type RuleConditionKind} from '../../dae/groups';
import {readTag, tagId} from './taggedId';
import {href} from '../../shell/route';

// Where a rule sits in the rule list, when the backend lists rules and the reference names one.
export const ruleHref = (ruleId: string | null, listed: boolean) => (listed && ruleId ? href('rules', {tab: 'list', rule: ruleId}) : undefined);

// A condition a link prefills in the add-rule dialog of the routing list, or with `tab: 'dns'` of the DNS request list.
export type RuleSeed = {kind: RuleConditionKind; value: string};
export function parseRuleSeed(value: string | null, kinds: readonly RuleConditionKind[] = conditionKinds): RuleSeed | null {
  return value ? readTag(value, kinds) : null;
}
export function ruleSeedHref(seed: RuleSeed, tab: 'list' | 'dns' = 'list'): string {
  return href('rules', {tab, add: tagId(seed.kind, seed.value)});
}
