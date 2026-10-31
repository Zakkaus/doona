import type {ConfigSource} from '../../api/model';
import {readSubscriptionEntries, type SubscriptionText} from '../../dae/subscriptions';

// Each subscription entry the config sources declare, by tag; a tag declared twice lists both declarations.
export function declaredSubscriptions(sources: readonly ConfigSource[]) {
  const found = new Map<string, Array<{source: ConfigSource; entry: SubscriptionText}>>();
  for (const item of sources)
    for (const entry of readSubscriptionEntries(item.content)) found.set(entry.tag, [...(found.get(entry.tag) ?? []), {source: item, entry}]);
  return found;
}
// The entries whose tag is declared once, the only ones a provider is matched to.
export const uniqueEntries = (declared: ReadonlyMap<string, ReadonlyArray<{entry: SubscriptionText}>>) =>
  [...declared.values()].filter(items => items.length === 1).map(items => items[0].entry);
