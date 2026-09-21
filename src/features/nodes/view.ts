import type {Node, Provider} from '../../api/model';
import {compareLatency, healthMillis, preferredHealth} from '../../api/selectors';
import type {TableSort} from '../../ui/ui';
import type {SubscriptionEntry} from './subscriptions';
import {formatList, formatNumber, type Lang, type Translator} from '../../i18n';
import type {Key} from '../../i18n/messages';
import type {OutboundNames} from '../../api/selectors';
import {addU64, formatBytes, millis} from '../../api/u64';
import {formatDuration, localTime, relativeStart} from '../../api/selectors';
import {latencyTone} from '../../ui/ui';

export function nodeRowView(node: Node, names: OutboundNames, lang: Lang, t: Translator) {
  const health = preferredHealth(node);
  const measured = health?.state === 'healthy' && health.latency_ms != null;
  return {
    id: node.id,
    name: node.name,
    protocol: node.protocol ?? '—',
    latency: measured ? t('ui.latency', {n: millis(health.latency_ms!)}) : health?.state === 'unavailable' ? t('ui.unavailable') : '—',
    latencyClass: measured ? `ms ${latencyTone(health.latency_ms!)}` : 'ms err',
    groups: node.group_ids.length
      ? formatList(
          lang,
          node.group_ids.map(id => names.get(id) ?? id)
        )
      : '—',
    probeLabel: t('nodes.probe', {name: node.name}),
    joinLabel: t('nodes.joinGroup', {name: node.name}),
    removeLabel: t('nodes.remove', {name: node.name})
  };
}

export type ProviderRow = Provider | (Omit<Provider, 'kind'> & {kind: 'builtin' | 'unattributed'});
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

export function providerRows(providers: Provider[], nodes: Node[], entries: SubscriptionEntry[], t: Translator) {
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
  const rows: ProviderRow[] = providers.map(item => (named.has(item.id) ? {...item, name: named.get(item.id)!} : item));
  let builtin = 0,
    unattributed = 0;
  for (const node of nodes) {
    if (node.provider_id != null) continue;
    if (node.protocol === 'direct' || node.protocol === 'block') builtin++;
    else unattributed++;
  }
  const pseudo: ProviderRow[] = [];
  for (const [kind, count] of [
    ['builtin', builtin],
    ['unattributed', unattributed]
  ] as const) {
    if (!count) continue;
    let id: string = kind;
    while (providers.some(provider => provider.id === id)) id += '-';
    pseudo.push({
      id,
      name: t(kind === 'builtin' ? 'nodes.kind.builtin' : 'nodes.kind.unattributed'),
      kind,
      url_redacted: null,
      node_count: count,
      updated_at: null,
      expires_at: null,
      traffic: null,
      status: 'ok',
      last_error: null
    });
  }
  return {list: [...pseudo, ...rows]};
}

// Null selects loose nodes; built-in outbounds have their own provenance.
export function ownedNodes(nodes: Node[], ownerId: string | null | undefined, kind?: ProviderRow['kind']) {
  return nodes.filter(
    node =>
      ownerId === undefined ||
      (ownerId === null
        ? node.provider_id == null && (node.protocol === 'direct' || node.protocol === 'block') === (kind === 'builtin')
        : node.provider_id === ownerId)
  );
}

export function nodeRows(owned: Node[], search: string, group: string, protocol: string, sort: TableSort) {
  const needle = search.trim().toLowerCase();
  const kept = owned.filter(
    node => (!needle || node.name.toLowerCase().includes(needle)) && (!group || node.group_ids.includes(group)) && (!protocol || node.protocol === protocol)
  );
  const sign = sort.direction === 'ascending' ? 1 : -1;
  const latency = sort.column === 'latency' ? new Map(kept.map(node => [node.id, latencyOf(node)])) : new Map();
  const by: Record<string, (a: Node, b: Node) => number> = {
    name: (a, b) => collator.compare(a.name, b.name),
    protocol: (a, b) => collator.compare(a.protocol ?? '', b.protocol ?? ''),
    latency: (a, b) => compareLatency(latency.get(a.id), latency.get(b.id)) || collator.compare(a.name, b.name)
  };
  return kept.sort((a, b) => sign * (by[sort.column] ?? by.name)(a, b));
}

const intervals = [3600, 21600, 43200, 86400];
export function intervalText(seconds: number, locale: string, t: Translator) {
  return seconds === 0
    ? t('nodes.manualOnly')
    : intervals.includes(seconds)
      ? t('nodes.everyHours', {n: formatNumber(seconds / 3600, locale)})
      : formatDuration(String(seconds), locale);
}
export function providerRowView(item: ProviderRow, seconds: number | undefined, locale: string, t: Translator) {
  const kinds: Record<ProviderRow['kind'], Key> = {
    subscription: 'nodes.kind.subscription',
    file: 'nodes.kind.file',
    inline: 'nodes.kind.inline',
    builtin: 'nodes.kind.builtin',
    unattributed: 'nodes.kind.unattributed'
  };
  const statuses: Record<Provider['status'], Key> = {ok: 'nodes.status.ok', stale: 'nodes.status.stale', error: 'nodes.status.error'};
  const tones = {ok: 'ok', stale: 'warn', error: 'err'} as const;
  const pseudo = item.kind === 'builtin' || item.kind === 'unattributed';
  const used = item.traffic ? addU64(item.traffic.upload_bytes, item.traffic.download_bytes) : null;
  const interval = item.kind === 'subscription' ? seconds : undefined;
  return {
    id: item.id,
    name: item.name,
    url: item.url_redacted ?? undefined,
    kind: t(kinds[item.kind]),
    count: formatNumber(item.node_count, locale),
    usage:
      used === null
        ? '—'
        : item.traffic?.total_bytes
          ? t('nodes.used', {used: formatBytes(used), total: formatBytes(item.traffic.total_bytes)})
          : formatBytes(used),
    updated: pseudo ? '—' : relativeStart(item.updated_at, locale),
    updatedTitle: item.updated_at ? localTime(item.updated_at, locale) : undefined,
    expires: item.expires_at ? localTime(item.expires_at, locale) : '—',
    interval: interval === undefined ? '—' : intervalText(interval, locale, t),
    intervalValue: String(interval),
    hasInterval: interval !== undefined,
    intervalLabel: t('nodes.intervalOf', {name: item.name}),
    intervals:
      interval === undefined
        ? []
        : [0, ...intervals, ...(intervals.includes(interval) || interval === 0 ? [] : [interval])].map(value => ({
            id: String(value),
            label: intervalText(value, locale, t)
          })),
    status: pseudo ? null : t(statuses[item.status]),
    tone: tones[item.status],
    error: item.last_error?.message,
    refreshLabel: t('nodes.refresh', {name: item.name}),
    removeLabel: t('nodes.remove', {name: item.name})
  };
}
