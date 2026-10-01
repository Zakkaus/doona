import type {Node, Provider} from '../../api/model';
import {compileFilters, describeFilters, exactTokens, isWritableName, quoteName} from '../../dae/groups';
import {regions} from '../../dae/regions';
import {flagChoices} from '../../dae/flags';
import {regionGroups} from '../../dae/templates';
import {quote, unquote} from '../../dae/text';

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
// Counts and previews share the matches of the exact filter strings kept in the draft.
export function includeMatches(filters: string[], nodes: Node[]) {
  const lines = filters.map(filter => filter.trim()).filter(Boolean);
  const cache = new Map<string, Node[]>();
  const matching = (filters: string[]) => {
    if (!filters.length) return nodes.filter(compileFilters([]));
    const matched = new Set(
      filters.flatMap(filter => {
        if (!cache.has(filter)) cache.set(filter, nodes.filter(compileFilters([filter])));
        return cache.get(filter)!;
      })
    );
    return nodes.filter(node => matched.has(node));
  };
  const selected = matching(lines);
  const regions = new Map(
    regionFilters.map(region => {
      const kept = lines.filter(filter => {
        const include = recogniseInclude(filter);
        return include?.kind === 'region' && include.values.includes(region.id);
      });
      return [region.id, matching(kept.length ? kept : [region.filter])];
    })
  );
  return {selected, regions};
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
  const subscriptions = [...tags].map(tag => {
    const owned = nodes.filter(node => node.subscription_tag === tag);
    const provider = providers.find(provider => provider.kind === 'subscription' && owned.some(node => node.provider_id === provider.id));
    return {id: tag, label: provider?.name ?? tag, count: owned.length, disabled: !isWritableName(tag)};
  });
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
