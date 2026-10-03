import {groupFilterText, groupFilterTexts, reconcileGroupFilters, type GroupFilterDraft} from '../../../dae/groupConditions';
import type {Node, Provider} from '../../../api/model';
import {describeFilters, exactTokens, isWritableName, quoteName} from '../../../dae/groups';
import {compileFilters} from '../../../dae/groupFilters';
import {regions} from '../../../dae/regions';
import {flagChoices} from '../../../dae/flags';
import {regionGroups} from '../../../dae/templates';
import {quote, unquote} from '../../../dae/text';

export type IncludeKind = 'region' | 'subscription' | 'node' | 'group';
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const regionFilters = regions.map(([iso, keys]) => {
  const template = regionGroups.find(group => group.name === iso.toLowerCase());
  const pattern = keys.map(key => (/^[a-z0-9 ]+$/.test(key) ? `(?:^|[^a-z0-9])${escapeRegex(key)}(?:[^a-z0-9]|$)` : escapeRegex(key))).join('|');
  return {
    id: iso,
    filter: iso === 'CN' ? template!.lines[0].slice('filter: '.length) : `name(regex: ${quote('(?i)' + pattern)})`,
    legacy: template?.lines[0].slice('filter: '.length)
  };
});
export function recogniseInclude(filter: string): {kind: IncludeKind; values: string[]} | null {
  const region = regionFilters.find(region => region.filter === filter.trim() || region.legacy === filter.trim());
  if (region) return {kind: 'region', values: [region.id]};
  for (const [kind, call] of [
    ['node', 'name'],
    ['subscription', 'subtag'],
    ['group', 'group']
  ] as const) {
    const values = exactTokens(filter, call);
    if (values?.length) {
      const names = values.flatMap(value =>
        kind === 'group'
          ? unquote(value)
              .split(/[|,]/)
              .map(name => name.trim())
              .filter(Boolean)
          : [unquote(value)]
      );
      if (names.length) return {kind, values: names};
    }
  }
  return null;
}
export function selectedIncludes(filters: string[], kind: IncludeKind): string[] {
  return [
    ...new Set(
      filters.flatMap(filter => {
        const recognised = recogniseInclude(filter);
        return recognised?.kind === kind ? recognised.values : [];
      })
    )
  ];
}
export const noNodes = "!name(regex: '.*')";
export const includesEveryNode = (filters: string[]) => !filters.some(filter => filter.trim()) || describeFilters(filters).everyNode;
export function setEveryNode(filters: string[], selected: boolean): string[] {
  if (selected) return includesEveryNode(filters) ? filters : [...filters.filter(filter => filter !== noNodes), '!name(direct, block)'];
  const next = filters.filter(filter => filter.trim() && !describeFilters([filter]).everyNode);
  return next.length ? next : [noNodes];
}

// Only touched exact lists are rewritten; unrelated lines retain their spelling and position.
export function setIncludes(filters: string[], kind: IncludeKind, selected: string[]): string[] {
  const wanted = new Set(selected);
  const held = new Set<string>();
  const next = filters.flatMap(filter => {
    const recognised = recogniseInclude(filter);
    if (recognised?.kind !== kind) return [filter];
    const kept = recognised.values.filter(value => wanted.has(value));
    kept.forEach(value => held.add(value));
    if (kept.length === recognised.values.length) return [filter];
    if (!kept.length) return [];
    const call = kind === 'node' ? 'name' : kind === 'group' ? 'group' : 'subtag';
    return [
      `${call}(${exactTokens(filter, call)!
        .flatMap(value => {
          if (kind !== 'group') return wanted.has(unquote(value)) ? [value] : [];
          const names = unquote(value)
            .split(/[|,]/)
            .map(name => name.trim())
            .filter(Boolean);
          const retained = names.filter(name => wanted.has(name));
          return retained.length === names.length ? [value] : retained.map(quoteName);
        })
        .join(', ')})`
    ];
  });
  for (const value of wanted) {
    if (held.has(value)) continue;
    if (kind === 'region') {
      const region = regionFilters.find(region => region.id === value);
      if (region) next.push(region.filter);
    } else if (isWritableName(value) && (kind !== 'group' || !/[|,]/.test(value)))
      next.push(`${kind === 'node' ? 'name' : kind === 'group' ? 'group' : 'subtag'}(${quoteName(value)})`);
  }
  if (next.length === filters.length && next.every((filter, i) => filter === filters[i])) return filters;
  const active = next.filter(filter => filter.trim() && filter !== noNodes);
  if (active.length) return active;
  return filters.some(filter => filter.trim()) ? [noNodes] : next;
}
// Nodes matching a set of filter lines, each distinct line compiled once.
function matcher(nodes: Node[]) {
  const cache = new Map<string, Node[]>();
  return (filters: string[]) => {
    if (!filters.length) return nodes.filter(compileFilters([]));
    const matched = new Set(
      filters.flatMap(filter => {
        if (!cache.has(filter)) cache.set(filter, nodes.filter(compileFilters([filter])));
        return cache.get(filter)!;
      })
    );
    return nodes.filter(node => matched.has(node));
  };
}
const includeLines = (filters: string[]) => filters.map(filter => filter.trim()).filter(Boolean);
// A region counts the lines that select it, or its own filter when none does.
function regionLines(lines: string[], region: (typeof regionFilters)[number]) {
  const kept = lines.filter(filter => {
    const include = recogniseInclude(filter);
    return include?.kind === 'region' && include.values.includes(region.id);
  });
  return kept.length ? kept : [region.filter];
}
// Counts and previews share the matches of the exact filter strings kept in the draft.
export function includeMatches(filters: string[], nodes: Node[]) {
  const lines = includeLines(filters);
  const matching = matcher(nodes);
  return {selected: matching(lines), regions: new Map(regionFilters.map(region => [region.id, matching(regionLines(lines, region))]))};
}
const subscriptionLabel = (tag: string, nodes: Node[], providers: Provider[]) => {
  const owned = nodes.filter(node => node.subscription_tag === tag);
  return providers.find(provider => provider.kind === 'subscription' && owned.some(node => node.provider_id === provider.id))?.name ?? tag;
};
// What a card names for the regions and subscriptions a group selects. Unlike includeChoices, it matches only the
// selected regions, since a card never lists the others.
export function selectedIncludeLabels(filters: string[], nodes: Node[], providers: Provider[], locale: string) {
  const lines = includeLines(filters);
  const matching = matcher(nodes);
  const names = new Map(flagChoices(locale).map(region => [region.id, region.label]));
  return {
    regions: new Map(
      selectedIncludes(filters, 'region').flatMap(id => {
        const region = regionFilters.find(region => region.id === id);
        return region ? [[id, {label: names.get(id) ?? id, count: matching(regionLines(lines, region)).length}] as const] : [];
      })
    ),
    subscriptions: new Map(selectedIncludes(filters, 'subscription').map(tag => [tag, subscriptionLabel(tag, nodes, providers)]))
  };
}
export function includeChoices(filters: string[], nodes: Node[], providers: Provider[], locale: string, declaredTags: string[] = []) {
  const matches = includeMatches(filters, nodes);
  const names = new Map(flagChoices(locale).map(region => [region.id, region.label]));
  const regions = regionFilters.map(region => ({
    id: region.id,
    label: names.get(region.id) ?? region.id,
    count: matches.regions.get(region.id)!.length
  }));
  const subscriptionIds = new Set(providers.filter(provider => provider.kind === 'subscription').map(provider => provider.id));
  const tags = new Set([
    ...declaredTags,
    ...nodes.flatMap(node => (node.subscription_tag && subscriptionIds.has(node.provider_id ?? '') ? [node.subscription_tag] : [])),
    ...selectedIncludes(filters, 'subscription')
  ]);
  const subscriptions = [...tags].map(tag => ({
    id: tag,
    label: subscriptionLabel(tag, nodes, providers),
    count: nodes.filter(node => node.subscription_tag === tag).length,
    disabled: !isWritableName(tag)
  }));
  const nodeCounts = new Map<string, number>();
  for (const node of nodes) nodeCounts.set(node.name, (nodeCounts.get(node.name) ?? 0) + 1);
  const nodeNames = new Set([...nodeCounts.keys(), ...selectedIncludes(filters, 'node')]);
  const individual = [...nodeNames].map(name => ({
    id: name,
    label: name,
    count: nodeCounts.get(name) ?? 0,
    disabled: !isWritableName(name)
  }));
  return {region: regions, subscription: subscriptions, node: individual, matchedNodes: matches.selected};
}

export function retainedIncludes(before: string[], after: string[], nodes: Node[]): string[] {
  if (!after.some(filter => filter.trim())) return [];
  const removed = (['region', 'subscription', 'node'] as const).flatMap(kind => {
    const current = new Set(selectedIncludes(after, kind));
    return selectedIncludes(before, kind)
      .filter(value => !current.has(value))
      .flatMap(value =>
        nodes.filter(
          compileFilters(
            kind === 'region'
              ? before.filter(filter => {
                  const include = recogniseInclude(filter);
                  return include?.kind === kind && include.values.includes(value);
                })
              : setIncludes([], kind, [value])
          )
        )
      );
  });
  return [...new Set(removed.filter(compileFilters(after)).map(node => node.name))];
}

export const advancedFilter = (filter: GroupFilterDraft) =>
  recogniseInclude(groupFilterText(filter) ?? filter.source)?.kind !== 'group' &&
  (filter.advanced || (filter.source !== noNodes && !recogniseInclude(filter.source) && !describeFilters([filter.source]).everyNode));
export function editMembership(filters: GroupFilterDraft[], change: (values: string[]) => string[]): GroupFilterDraft[] {
  const quick = filters.filter(filter => !advancedFilter(filter));
  const hasAdvanced = filters.some(filter => advancedFilter(filter) && groupFilterText(filter)?.trim());
  const next = reconcileGroupFilters(quick, change(groupFilterTexts(quick))).filter(
    filter => filter.source !== noNodes || !hasAdvanced || filters.some(previous => previous.id === filter.id)
  );
  return [...filters.flatMap(filter => (advancedFilter(filter) ? [filter] : next.length ? [next.shift()!] : [])), ...next];
}
