import type {Capabilities, Node, Provider, ProviderCreate} from '../../api/model';
import {enumLabel} from '../../i18n/enum';
import {compareLatency, healthMillis, preferredHealth, pseudoOwner, pseudoOwnerId, type PseudoOwner} from '../../api/selectors';
import type {TableSort} from '../../ui/ui';
import {urlHost, type SubscriptionEntry} from './subscriptions';
import {formatList, formatNumber, type Lang, type Translator} from '../../i18n';
import type {Key} from '../../i18n';
import type {OutboundNames} from '../../api/selectors';
import {addU64} from '../../api/u64';
import {compareNames, formatDuration, localTime, formatBytes, formatLatency} from '../../i18n/format';
import {backendMessage} from '../../i18n/backend';
import {latencyTone} from '../../ui/ui';

export function nodeRowView(node: Node, names: OutboundNames, lang: Lang, t: Translator) {
  const health = preferredHealth(node);
  const measured = health?.state === 'healthy' && health.latency_ms != null;
  return {
    id: node.id,
    name: node.name,
    protocol: node.protocol ?? '—',
    latency: measured ? formatLatency(health.latency_ms!, t) : health?.state === 'unavailable' ? t('ui.unavailable') : '—',
    latencyClass: measured ? `ms ${latencyTone(health.latency_ms!)}` : health?.state === 'unavailable' ? 'ms err' : 'ms',
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

export type ProviderRow = (Provider | (Omit<Provider, 'kind'> & {kind: 'builtin' | 'unattributed'})) & {displayName?: string; configTag?: string};
const latencyOf = (node: Node) => healthMillis(preferredHealth(node));

export function providerRows(providers: Provider[], nodes: Node[], entries: SubscriptionEntry[], t: Translator) {
  // Node metadata authorizes a tag; URL and unmatched-entry guesses are display-only.
  const tags = new Map<string, Set<string>>();
  for (const node of nodes) {
    if (!node.provider_id || !node.subscription_tag) continue;
    const known = tags.get(node.provider_id) ?? new Set<string>();
    known.add(node.subscription_tag);
    tags.set(node.provider_id, known);
  }
  const verifiedTag = (id: string) => {
    const known = tags.get(id);
    return known?.size === 1 ? [...known][0] : undefined;
  };
  const byHost = (item: Provider) => {
    const hostname = urlHost(item.url_redacted);
    const same = hostname ? entries.filter(entry => entry.host === hostname) : [];
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
  const rows: ProviderRow[] = providers.map(item => {
    const tag = verifiedTag(item.id);
    return {
      ...item,
      displayName: named.get(item.id) ?? item.name,
      configTag: item.kind === 'subscription' && tag && entries.filter(entry => entry.tag === tag).length === 1 ? tag : undefined
    };
  });
  const counts: Record<PseudoOwner, number> = {builtin: 0, unattributed: 0};
  for (const node of nodes) if (node.provider_id == null) counts[pseudoOwner(node)]++;
  const pseudo: ProviderRow[] = [];
  for (const kind of ['builtin', 'unattributed'] as const) {
    const count = counts[kind];
    if (!count) continue;
    pseudo.push({
      id: pseudoOwnerId(kind, providers),
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
// The provider the link names while it is listed; a stale one falls back to the first real source, not every node.
export function selectedProvider(list: ProviderRow[], requested: string | null): string | null {
  if (requested !== null && list.some(item => item.id === requested)) return requested;
  return (list.find(item => item.kind !== 'builtin' && item.kind !== 'unattributed') ?? list[0])?.id ?? null;
}
export function ownedNodes(nodes: Node[], ownerId: string | null | undefined, kind?: ProviderRow['kind']) {
  return nodes.filter(
    node =>
      ownerId === undefined ||
      (ownerId === null ? node.provider_id == null && (pseudoOwner(node) === 'builtin') === (kind === 'builtin') : node.provider_id === ownerId)
  );
}

// `contains` is the locale-aware matcher the policy grid also uses, so both pages find the same names.
export function nodeRows(owned: Node[], search: string, group: string, protocol: string, sort: TableSort, contains: (value: string, query: string) => boolean) {
  const needle = search.trim();
  const kept = owned.filter(
    node => (!needle || contains(node.name, needle)) && (!group || node.group_ids.includes(group)) && (!protocol || node.protocol === protocol)
  );
  const sign = sort.direction === 'ascending' ? 1 : -1;
  const latency = sort.column === 'latency' ? new Map(kept.map(node => [node.id, latencyOf(node)])) : new Map();
  const by: Record<string, (a: Node, b: Node) => number> = {
    name: (a, b) => compareNames(a.name, b.name),
    protocol: (a, b) => compareNames(a.protocol ?? '', b.protocol ?? ''),
    latency: (a, b) => compareLatency(latency.get(a.id), latency.get(b.id)) || compareNames(a.name, b.name)
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
// The presets, with a value outside them kept so a select can show it.
export function intervalItems(current: number | null, locale: string, t: Translator) {
  return [0, ...intervals, ...(current === null || current === 0 || intervals.includes(current) ? [] : [current])].map(value => ({
    id: String(value),
    label: intervalText(value, locale, t)
  }));
}

export type ProviderForm = {name: string; value: string; interval: string; agent: string; cache: boolean | null};
type CreateOptions = Capabilities['resources']['providers']['create_options'];
// An option left at the backend's default is not sent, so the entry stays a one-line scalar.
export function providerCreate(form: ProviderForm, options: CreateOptions): ProviderCreate {
  const request: ProviderCreate = {name: form.name.trim(), kind: 'subscription', url: form.value.trim()};
  const seconds = Number(form.interval);
  if (options?.update_interval !== undefined && form.interval && seconds !== options.update_interval) request.update_interval = seconds;
  const agent = form.agent.trim();
  if (options?.user_agent !== undefined && agent && agent !== options.user_agent) request.user_agent = agent;
  if (options?.cache !== undefined && form.cache !== null && form.cache !== options.cache) request.cache = form.cache;
  return request;
}

export function providerRowView(item: ProviderRow, seconds: number | null | undefined, locale: string, t: Translator) {
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
  // undefined: no configuration entry to write; null: an entry without an interval, which can still get one.
  const interval = item.kind === 'subscription' ? seconds : undefined;
  const name = item.displayName ?? item.name;
  return {
    id: item.id,
    name,
    url: item.url_redacted ?? undefined,
    kind: enumLabel(kinds, item.kind, t),
    count: formatNumber(item.node_count, locale),
    usage:
      used === null
        ? '—'
        : item.traffic?.total_bytes
          ? t('ui.fraction', {part: formatBytes(used, locale), whole: formatBytes(item.traffic.total_bytes, locale)})
          : formatBytes(used, locale),
    updatedAt: pseudo ? null : item.updated_at,
    expires: item.expires_at ? localTime(item.expires_at, locale) : '—',
    interval: interval == null ? '—' : intervalText(interval, locale, t),
    intervalValue: interval == null ? '' : String(interval),
    hasInterval: interval !== undefined,
    intervalLabel: t('nodes.intervalOf', {name}),
    intervals: interval === undefined ? [] : intervalItems(interval, locale, t),
    status: pseudo ? null : enumLabel(statuses, item.status, t),
    tone: tones[item.status],
    error: item.last_error ? backendMessage(item.last_error.code, item.last_error.message, t) : undefined,
    refreshLabel: t('nodes.refresh', {name}),
    removeLabel: t('nodes.remove', {name})
  };
}
