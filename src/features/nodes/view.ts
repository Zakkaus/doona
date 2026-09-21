import type {Node, Provider} from '../../api/model';
import {compareLatency, healthMillis, preferredHealth} from '../../api/selectors';
import type {TableSort} from '../../ui/ui';
import type {SubscriptionEntry} from './subscriptions';

export const INLINE = 'inline';
// Names sort by pinyin, numeric value, then case-insensitive text.
export const collator = new Intl.Collator(['zh-Hans-CN', 'en'], {numeric: true, sensitivity: 'base'});
const latencyOf = (node: Node) => healthMillis(preferredHealth(node));

function redactedHost(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}

export function providerRows(providers: Provider[], nodes: Node[], entries: SubscriptionEntry[], inlineName: string) {
  // Match by node tag, then unique URL host, then the sole unclaimed entry.
  const tags = new Map<string, string>();
  for (const node of nodes) if (node.provider_id && node.subscription_tag) tags.set(node.provider_id, node.subscription_tag);
  const byHost = (item: Provider) => {
    const hostname = redactedHost(item.url_redacted);
    const same = hostname ? entries.filter(entry => entry.host === hostname) : [];
    return same.length === 1 ? same[0].tag : undefined;
  };
  const named = new Map<string, string>();
  const subscriptions = providers.filter(item => item.kind === 'subscription');
  for (const item of subscriptions) {
    const tag = tags.get(item.id) ?? byHost(item);
    if (tag) named.set(item.id, tag);
  }
  const unnamed = subscriptions.filter(item => !named.has(item.id));
  const claimed = new Set(named.values());
  const unclaimed = entries.filter(entry => !claimed.has(entry.tag));
  if (unnamed.length === 1 && unclaimed.length === 1) named.set(unnamed[0].id, unclaimed[0].tag);
  const rows = providers.map(item => (named.has(item.id) ? {...item, name: named.get(item.id)!} : item));
  const loose = nodes.filter(node => node.provider_id === null).length;
  if (!loose || rows.some(item => item.kind === 'inline')) return {list: rows, synthetic: false};
  const inline: Provider = {
    id: INLINE,
    name: inlineName,
    kind: 'inline',
    url_redacted: null,
    node_count: loose,
    updated_at: null,
    expires_at: null,
    traffic: null,
    status: 'ok',
    last_error: null
  };
  return {list: [inline, ...rows], synthetic: true};
}

// Undefined means no provider filter; null selects nodes without a provider.
export function ownedNodes(nodes: Node[], ownerId: string | null | undefined) {
  return nodes.filter(node => ownerId === undefined || node.provider_id === ownerId);
}

export function nodeRows(owned: Node[], search: string, group: string, protocol: string, sort: TableSort) {
  const needle = search.trim().toLowerCase();
  const kept = owned.filter(
    node => (!needle || node.name.toLowerCase().includes(needle)) && (!group || node.group_ids.includes(group)) && (!protocol || node.protocol === protocol)
  );
  const sign = sort.direction === 'ascending' ? 1 : -1;
  const by: Record<string, (a: Node, b: Node) => number> = {
    name: (a, b) => collator.compare(a.name, b.name),
    protocol: (a, b) => collator.compare(a.protocol ?? '', b.protocol ?? ''),
    latency: (a, b) => compareLatency(latencyOf(a), latencyOf(b)) || collator.compare(a.name, b.name)
  };
  return kept.sort((a, b) => sign * (by[sort.column] ?? by.name)(a, b));
}
