import {groupNameProblem, type GroupEntry} from '../../dae/groups';
import {enumLabel} from '../../i18n/enum';
import {isFragment} from '../../dae/text';
import type {Translator} from '../../i18n';
import {policyKindLabels} from '../../api/selectors';
import {newGroupPolicies} from '../../dae/vocab';
import type {Group} from '../../api/model';

// A group without a policy line is a selector in honk, which is what `select` writes.
const IMPLIED = 'select';

// A policy as written in the file, in words when the picker offers it and as written otherwise.
export function policyLabel(value: string | null, t: Translator): string {
  const known = newGroupPolicies.find(item => item.id === (value ?? IMPLIED));
  return known ? t(known.label) : value!;
}

// A live group's policy in words: the picker's when it offers the policy, otherwise its kind's. `id` is the engine's
// spelling, set only when the label differs from it.
export function groupPolicyText(policy: Pick<Group['policy'], 'kind' | 'native'>, t: Translator): {label: string; id?: string} {
  const offered = newGroupPolicies.some(item => item.id === (policy.native ?? IMPLIED));
  const label = policy.native && offered ? policyLabel(policy.native, t) : enumLabel(policyKindLabels, policy.kind, t);
  const id = policy.native || policy.kind;
  return label === id ? {label} : {label, id};
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

// Values read from the file are written back as they were; only edited ones must fit on one line.
export function groupEditSafe(filters: string[], policy: string | null, entry: Pick<GroupEntry, 'filters' | 'policy'> | undefined): boolean {
  return filters.every(filter => entry?.filters.includes(filter) || isFragment(filter)) && (policy === (entry?.policy ?? null) || isFragment(policy ?? ''));
}
