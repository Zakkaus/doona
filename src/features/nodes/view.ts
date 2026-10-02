import {isNodeLink} from '../../dae/nodes';
export {isNodeLink} from '../../dae/nodes';
import type {Capabilities, ConfigSource, Node, Provider, ProviderCreate} from '../../api/model';
import {enumLabel} from '../../i18n/enum';
import {compareLatency, healthMillis, nodeOwner, preferredHealth, pseudoOwner, pseudoOwnerId, type PseudoOwner} from '../../api/selectors';
import type {TableSort} from '../../ui/ui';
import {isSubscriptionUrl, urlHost, type SubscriptionOption, type SubscriptionText} from '../../dae/subscriptions';
import {formatList, formatNumber, type Lang, type Translator} from '../../i18n';
import type {Key} from '../../i18n';
import type {OutboundNames} from '../../api/selectors';
import {addU64} from '../../api/u64';
import {compareNames, localTime, formatBytes, formatLatency} from '../../i18n/format';
import {backendMessage, oneLine} from '../../i18n/backend';
import {latencyTone} from '../../ui/ui';
import {isBareName, isQuotable} from '../../dae/text';
import {groupsNamingNode, readNodeEntries, type NodeEntry} from '../../dae/nodes';
import {citingGroups, groupsNamingTag, namedInExpression, type GroupEntry} from '../../dae/groups';
import {groupOwners} from '../shared/groupText';
import {draftInterval, intervalText} from '../shared/subscription';

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
    removeLabel: t('nodes.remove', {name: node.name})
  };
}

export type ProviderRow = (Provider | (Omit<Provider, 'kind'> & {kind: 'builtin' | 'unattributed'})) & {
  displayName?: string;
  sourceTag?: string;
  configTag?: string;
};
const latencyOf = (node: Node) => healthMillis(preferredHealth(node));

export const editableSource = (daeText: boolean, canWrite: boolean, source: ConfigSource, complete: boolean | null | undefined) =>
  daeText && canWrite && source.writable && complete === true;

// What the edit dialog changes in the entry, as the write reads it: names and URLs trimmed, a blank User-Agent as none,
// an empty route as `routing`, and the cache switch against the entry's value or the default it falls back to. An
// interval not yet valid counts as changed, so the draft is kept; the dialog refuses to save it.
export function providerChanges(form: ProviderForm, entry: SubscriptionText, defaultCache: boolean | undefined) {
  const interval = draftInterval(form.interval);
  return {
    name: form.name.trim() !== entry.tag,
    url: form.value.trim() !== entry.url,
    interval: form.interval !== '' && (interval === null || interval !== entry.interval),
    agent: form.agent !== (entry.ua ?? '') && (form.agent.trim() || null) !== (entry.ua ?? null),
    cache: form.cache !== null && form.cache !== (entry.cache ?? defaultCache),
    route: (form.route || 'routing') !== (entry.route || 'routing')
  };
}

export function subscriptionActionKind(unique: boolean, daeText: boolean, canWrite: boolean, source: ConfigSource, complete: boolean | undefined) {
  if (unique && daeText && canWrite && source.writable && complete === undefined) return null;
  return unique && editableSource(daeText, canWrite, source, complete) ? 'edit' : 'open';
}

export function subscriptionPlace(places: Array<{source: ConfigSource; entry: SubscriptionText}>, item: ProviderRow, providers: Provider[]) {
  if (!places.length) return null;
  // Duplicate tags only open the source, preferring the one on this provider's host.
  const own = places.length > 1 ? places.filter(({entry}) => urlHost(entry.url) === urlHost(item.url_redacted)) : places;
  return {
    ...(own.length === 1 ? own[0] : places[0]),
    unique: places.length === 1 && providers.filter(other => other.kind === 'subscription' && other.name === item.name).length === 1
  };
}

export function nodeEditState(sources: ConfigSource[], source: ConfigSource, entry: NodeEntry, nodes: Node[], form: ProviderForm, t: Translator) {
  const name = form.name.trim();
  const renamed = name !== entry.name;
  const blocked = renamed && sources.some(item => item.id !== source.id && groupsNamingNode(item.content, entry.name).length > 0);
  const taken =
    renamed &&
    (nodes.some(node => node.name === name) ||
      sources.some(item => (item.kind === 'main' || item.kind === 'include') && readNodeEntries(item.content).some(entry => entry.name === name)));
  const nameError = taken ? t('nodes.nameTaken') : !isQuotable(name) ? t('config.unquotable') : null;
  const error = blocked ? t('nodes.renameElsewhere') : !isQuotable(form.value.trim()) ? t('config.unquotable') : null;
  return {
    nameError,
    error,
    valid: !!name && isNodeLink(form.value) && !error && !nameError && (form.name !== entry.name || form.value !== entry.link)
  };
}

export function subscriptionRemoval(sources: ConfigSource[] | undefined, loading: boolean, item: Provider | null) {
  const subscription = item?.kind === 'subscription';
  return {
    blockers: subscription ? [...new Set((sources ?? []).flatMap(source => groupsNamingTag(source.content, item.name)))] : [],
    checking: subscription && loading && !sources
  };
}

// A rename rewrites only exact subtag filters in the declaring source, so groups elsewhere that name the tag, and any
// expression naming it, are left for the person to edit.
export function renameReferences(sources: ConfigSource[], declaring: ConfigSource, tag: string) {
  return {
    here: citingGroups(declaring.content ?? '', tag),
    elsewhere: sources.filter(
      item => (item.id !== declaring.id && citingGroups(item.content ?? '', tag).length > 0) || namedInExpression(item.content ?? '', tag)
    )
  };
}

export function providerRows(providers: Provider[], nodes: Node[], entries: SubscriptionText[], t: Translator) {
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
  const rows: ProviderRow[] = providers.map(item => {
    const tag = verifiedTag(item.id);
    return {
      ...item,
      displayName: named.get(item.id) ?? item.name,
      configTag: item.kind === 'subscription' && tag && entries.filter(entry => entry.tag === tag).length === 1 ? tag : undefined,
      // A subscription provider is named by its tag, so an entry is found before any fetch has tagged a node.
      sourceTag: item.kind === 'subscription' ? item.name : undefined
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

// The name of the source row a node is listed under, for results that span every source.
export function nodeSource(list: ProviderRow[], providers: Provider[]): (node: Node) => string {
  const names = new Map(list.map(item => [item.id, item.displayName ?? item.name]));
  return node => names.get(nodeOwner(node, providers)) ?? '—';
}

// `contains` is the locale-aware matcher the policy grid also uses, so both pages find the same names.
export function nodeRows(
  owned: Node[],
  search: string,
  group: string,
  protocol: string,
  sort: TableSort,
  contains: (value: string, query: string) => boolean,
  locale: string
) {
  const needle = search.trim();
  const kept = owned.filter(
    node => (!needle || contains(node.name, needle)) && (!group || node.group_ids.includes(group)) && (!protocol || node.protocol === protocol)
  );
  const sign = sort.direction === 'ascending' ? 1 : -1;
  const byName = compareNames(locale);
  const latency = sort.column === 'latency' ? new Map(kept.map(node => [node.id, latencyOf(node)])) : new Map();
  const by: Record<string, (a: Node, b: Node) => number> = {
    name: (a, b) => byName(a.name, b.name),
    protocol: (a, b) => byName(a.protocol ?? '', b.protocol ?? ''),
    latency: (a, b) => compareLatency(latency.get(a.id), latency.get(b.id)) || byName(a.name, b.name)
  };
  return kept.sort((a, b) => sign * (by[sort.column] ?? by.name)(a, b));
}

// The options an edit leaves as written. The User-Agent, interval, cache
// and the download route while their controls show, have their own controls.
export function keptOptions(options: SubscriptionOption[], controls: {cache: boolean; route: boolean}): SubscriptionOption[] {
  return options.filter(
    option =>
      option.name !== 'ua' &&
      option.name !== 'interval' &&
      !(option.name === 'cache' && controls.cache) &&
      !((option.name === 'route' || option.name === 'download_detour') && controls.route)
  );
}

export type ProviderForm = {name: string; value: string; interval: string; agent: string; cache: boolean | null; route: string};
type CreateOptions = Capabilities['resources']['providers']['create_options'];
// An option left at the backend's default is not sent, so the entry stays a one-line scalar.
export function providerCreate(form: ProviderForm, options: CreateOptions): ProviderCreate {
  const request: ProviderCreate = {name: form.name.trim(), kind: 'subscription', url: form.value.trim()};
  const seconds = draftInterval(form.interval);
  if (options?.update_interval !== undefined && seconds != null && seconds !== options.update_interval) request.update_interval = seconds;
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
  // stale also covers a subscription that holds nothing yet: never loaded, and no failure to say why.
  const never = item.kind === 'subscription' && item.status === 'stale' && item.updated_at === null && item.last_error === null;
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
    status: pseudo ? null : never ? t('nodes.status.never') : enumLabel(statuses, item.status, t),
    tone: never ? ('neutral' as const) : tones[item.status],
    error: item.last_error ? oneLine(backendMessage(item.last_error.code, item.last_error.message, t), t) : undefined,
    refreshLabel: t('nodes.refresh', {name}),
    removeLabel: t('nodes.remove', {name})
  };
}

// Why the add dialog's submit is disabled, first applicable. Null while every required field is still empty, which
// speaks for itself, and for a problem its own field already shows (the User-Agent, a group name).
export function nodeFormReason(kind: string | undefined, name: string, value: string, t: Translator): string | null {
  const bare = name.trim();
  if ((kind !== 'provider' && kind !== 'node') || (!bare && !value.trim())) return null;
  if (!bare) return t('nodes.nameMissing');
  if (kind === 'node') return isNodeLink(value) ? null : t('nodes.linkInvalid');
  if (!isBareName(bare)) return t('nodes.nameInvalid');
  return isSubscriptionUrl(value) ? null : t('nodes.urlInvalid');
}

// Joining opens the group's editor in the source that declares it, so only a group that editor can write is offered:
// declared once, in a writable source whose content is known complete and that no write is changing.
export function joinableGroups(
  sources: ConfigSource[],
  isComplete: (source: ConfigSource) => boolean | undefined,
  isBusy: (source: ConfigSource) => boolean
): GroupEntry[] {
  return [...groupOwners(sources).values()].flatMap(owner =>
    owner !== 'ambiguous' && owner.origin.writable && isComplete(owner.origin) === true && !isBusy(owner.origin) ? [owner.entry] : []
  );
}
