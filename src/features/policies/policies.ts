import {groupNameProblem} from '../../dae/groups';
import type {Translator} from '../../i18n';
import type {Key} from '../../i18n/messages';

// The policies a new group can start with, in the order the picker offers them.
export const newGroupPolicies: Array<{id: string; label: Key; description: Key}> = [
  {id: 'min_moving_avg', label: 'arrange.policy.fastest', description: 'arrange.policy.fastestHint'},
  {id: 'fallback', label: 'arrange.policy.fallback', description: 'arrange.policy.fallbackHint'},
  {id: 'roundrobin', label: 'arrange.policy.spread', description: 'arrange.policy.spreadHint'},
  {id: 'select', label: 'arrange.policy.manual', description: 'arrange.policy.manualHint'}
];
// A group without a policy line is a selector in honk, which is what `select` writes.
const IMPLIED = 'select';

// A policy as written in the file, in words when the picker offers it and as written otherwise.
export function policyLabel(value: string | null, t: Translator): string {
  const known = newGroupPolicies.find(item => item.id === (value ?? IMPLIED));
  return known ? t(known.label) : value!;
}

// The picker keeps a policy it does not offer as its own choice, so opening an editor never rewrites it.
export function policyChoices(value: string | null, t: Translator) {
  const items: Array<{id: string; label: string; desc?: string}> = newGroupPolicies.map(item => ({
    id: item.id,
    label: t(item.label),
    desc: t(item.description)
  }));
  return {selected: value ?? IMPLIED, items: value && !items.some(item => item.id === value) ? [{id: value, label: value}, ...items] : items};
}

const nameProblems = {invalid: 'arrange.badName', taken: 'arrange.takenName'} as const;
export function groupNameError(name: string, taken: ReadonlySet<string>, t: Translator): string | null {
  const problem = groupNameProblem(name, taken);
  return problem ? t(nameProblems[problem]) : null;
}
