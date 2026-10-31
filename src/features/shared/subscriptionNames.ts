// The Activity chunk reaches this through the nodes widgets, so code only later pages use stays out of it.
import type {Node, Provider} from '../../api/model';
import {urlHost, type SubscriptionText} from '../../dae/subscriptions';

// The one tag a provider's nodes carry. Node metadata authorizes a tag; URL and unmatched-entry guesses are display-only.
export function verifiedTags(nodes: readonly Node[]): (id: string) => string | undefined {
  const tags = new Map<string, Set<string>>();
  for (const node of nodes) {
    if (!node.provider_id || !node.subscription_tag) continue;
    const known = tags.get(node.provider_id) ?? new Set<string>();
    known.add(node.subscription_tag);
    tags.set(node.provider_id, known);
  }
  return id => {
    const known = tags.get(id);
    return known?.size === 1 ? [...known][0] : undefined;
  };
}
// What the nodes page calls each subscription provider, by id: the tag its nodes carry, else the one entry at its URL's
// host, else the one entry left over when one subscription is left over, else its own name.
export function subscriptionNames(providers: readonly Provider[], nodes: readonly Node[], entries: readonly SubscriptionText[]) {
  const verifiedTag = verifiedTags(nodes);
  const byHost = (item: Provider) => {
    const hostname = urlHost(item.url_redacted);
    const same = hostname ? entries.filter(entry => urlHost(entry.url) === hostname) : [];
    return same.length === 1 ? same[0].tag : undefined;
  };
  const named = new Map<string, string>();
  const subscriptions = providers.filter(item => item.kind === 'subscription');
  for (const item of subscriptions) {
    const tag = verifiedTag(item.id) ?? byHost(item);
    if (tag) named.set(item.id, tag);
  }
  const unnamed = subscriptions.filter(item => !named.has(item.id));
  const claimed = new Set(named.values());
  const unclaimed = entries.filter(entry => !claimed.has(entry.tag));
  if (unnamed.length === 1 && unclaimed.length === 1) named.set(unnamed[0].id, unclaimed[0].tag);
  for (const item of unnamed) if (!named.has(item.id)) named.set(item.id, item.name);
  return named;
}
