import {applyChanges, classifyFilters, groupAdmits, readGroupEntries, removalWidens, type GroupChange} from '../../../dae/groups';
import type {Node, Provider} from '../../../api/model';
import type {Translator} from '../../../i18n';
import type {Key} from '../../../i18n/messages';

// The policies a new group can start with, in the order the picker offers them.
export const newGroupPolicies: Array<{id: string; label: Key; description: Key}> = [
  {id: 'min_moving_avg', label: 'arrange.policy.fastest', description: 'arrange.policy.fastestHint'},
  {id: 'fallback', label: 'arrange.policy.fallback', description: 'arrange.policy.fallbackHint'},
  {id: 'roundrobin', label: 'arrange.policy.spread', description: 'arrange.policy.spreadHint'},
  {id: 'select', label: 'arrange.policy.manual', description: 'arrange.policy.manualHint'}
];

export type TraySubscription = {tag: string; label: string; count: number};
export type TrayNode = {name: string; protocol: string; subscription: string | null};

// A subscription can be placed only when all its nodes carry one tag, which is what `subtag(...)` selects by.
export function traySubscriptions(providers: Provider[], nodes: Node[]): TraySubscription[] {
  return providers.flatMap(provider => {
    if (provider.kind !== 'subscription') return [];
    const owned = nodes.filter(node => node.provider_id === provider.id);
    const tags = new Set(owned.map(node => node.subscription_tag).filter(Boolean));
    if (tags.size !== 1) return [];
    return [{tag: [...tags][0]!, label: provider.name, count: owned.length}];
  });
}

export type ArrangeGroup = {
  name: string;
  isNew: boolean;
  // Holds every node: honk's reading of a group without any filter line.
  holdsAll: boolean;
  names: Array<{name: string; isNew: boolean; removable: boolean; blocked: string | null}>;
  subscriptions: Array<{tag: string; label: string; count: number | null; isNew: boolean; removable: boolean; blocked: string | null}>;
  rules: string[];
  ruleNote: string | null;
  // Nodes whose removal is staged but which another filter line still selects, so they stay in the group.
  stillIn: string[];
  // Staged removals stay listed, so the change is visible where it was made and can be undone there.
  removedNames: string[];
  removedSubscriptions: Array<{tag: string; label: string}>;
  // What the rule lines select today, as names; `ruleMore` counts the rest.
  ruleNodes: string[];
  ruleMore: number;
};
const RULE_SHOWN = 6;

// The groups as they will be once the staged changes are applied: exact members from the staged text, the rest
// described by the lines that select them. Runtime membership is not predicted; honk decides it after the reload.
export function arrangeView(text: string, changes: GroupChange[], subscriptions: TraySubscription[], nodes: Node[], t: Translator) {
  const before = new Map(readGroupEntries(text).map(entry => [entry.name, classifyFilters(entry)]));
  const staged = readGroupEntries(applyChanges(text, changes));
  const labels = new Map(subscriptions.map(item => [item.tag, item]));
  const blocked = t('arrange.lastMember');
  const removed = (group: string) =>
    new Set(
      changes.flatMap(change => {
        if (change.group !== group) return [];
        if (change.kind === 'removeNode') return nodes.filter(node => node.name === change.value);
        if (change.kind === 'removeSubscription') return nodes.filter(node => node.subscription_tag === change.value);
        return [];
      })
    );
  const groups: ArrangeGroup[] = staged.map(entry => {
    const now = classifyFilters(entry);
    const was = before.get(entry.name);
    return {
      name: entry.name,
      isNew: !was,
      holdsAll: entry.filters.length === 0,
      names: now.names.map(name => {
        const widens = removalWidens(entry, 'name', name);
        return {name, isNew: !!was && !was.names.includes(name), removable: !widens, blocked: widens ? blocked : null};
      }),
      subscriptions: now.subtags.map(tag => {
        const widens = removalWidens(entry, 'subtag', tag);
        return {
          tag,
          label: labels.get(tag)?.label ?? tag,
          count: labels.get(tag)?.count ?? null,
          isNew: !!was && !was.subtags.includes(tag),
          removable: !widens,
          blocked: widens ? blocked : null
        };
      }),
      rules: now.rules,
      ruleNote: now.rules.length ? t('arrange.ruleNote', {n: now.rules.length}) : null,
      stillIn: [...removed(entry.name)].filter(node => groupAdmits(entry.filters, node)).map(node => node.name),
      removedNames: changes.flatMap(change => (change.kind === 'removeNode' && change.group === entry.name ? [change.value] : [])),
      removedSubscriptions: changes.flatMap(change =>
        change.kind === 'removeSubscription' && change.group === entry.name ? [{tag: change.value, label: labels.get(change.value)?.label ?? change.value}] : []
      ),
      ...ruleSelection(now.rules, nodes)
    };
  });
  const byName = new Set(nodes.map(node => node.name));
  return {
    groups,
    // A staged name that matches no node is kept (it may appear after a subscription refresh) but flagged.
    unknown: new Set(groups.flatMap(group => group.names.filter(item => !byName.has(item.name)).map(item => item.name))),
    // A new group with no member yet would hold every node once written, so it cannot be applied like that.
    emptyNew: groups.filter(group => group.isNew && group.holdsAll).map(group => group.name)
  };
}

// The nodes that a group's rule lines select, whatever its exact lists add.
function ruleSelection(rules: string[], nodes: Node[]) {
  if (!rules.length) return {ruleNodes: [], ruleMore: 0};
  const names = nodes.filter(node => groupAdmits(rules, node)).map(node => node.name);
  return {ruleNodes: names.slice(0, RULE_SHOWN), ruleMore: Math.max(0, names.length - RULE_SHOWN)};
}

// One line per staged change, in the words the review sheet shows.
export function changeText(change: GroupChange, subscriptions: TraySubscription[], t: Translator): string {
  const label = (tag: string) => subscriptions.find(item => item.tag === tag)?.label ?? tag;
  switch (change.kind) {
    case 'addNode':
      return t('arrange.change.addNode', {name: change.value, group: change.group});
    case 'removeNode':
      return t('arrange.change.removeNode', {name: change.value, group: change.group});
    case 'addSubscription':
      return t('arrange.change.addSubscription', {name: label(change.value), group: change.group});
    case 'removeSubscription':
      return t('arrange.change.removeSubscription', {name: label(change.value), group: change.group});
    case 'createGroup':
      return t('arrange.change.createGroup', {group: change.group});
  }
}

// Staging an edit that undoes an earlier staged one removes both, so the review never lists a change and its reverse.
export function stage(changes: GroupChange[], next: GroupChange): GroupChange[] {
  const opposite: Partial<Record<GroupChange['kind'], GroupChange['kind']>> = {
    addNode: 'removeNode',
    removeNode: 'addNode',
    addSubscription: 'removeSubscription',
    removeSubscription: 'addSubscription'
  };
  if (next.kind === 'createGroup') return changes.some(change => change.kind === 'createGroup' && change.group === next.group) ? changes : [...changes, next];
  const undo = changes.findIndex(
    change => change.kind === opposite[next.kind] && change.group === next.group && 'value' in change && change.value === next.value
  );
  if (undo !== -1) return changes.filter((_, i) => i !== undo);
  if (changes.some(change => change.kind === next.kind && change.group === next.group && 'value' in change && change.value === next.value)) return changes;
  return [...changes, next];
}
