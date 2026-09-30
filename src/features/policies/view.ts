import {compareNames, formatLatency} from '../../i18n/format';
import {enumLabel} from '../../i18n/enum';
import type {ConfigSource, Group, HealthObservation, JsonPatch, ProbeResult} from '../../api/model';
import {isWritableName, nestedIn, readGroupEntries, type GroupEntry} from '../../dae/groups';
import {unquote} from '../../dae/text';
import {builtinOutboundNames} from '../../dae/vocab';
import type {Key} from '../../i18n';
import {compareLatency, healthMillis, safeHttpUrl, type MessageRef} from '../../api/selectors';
import {groupPolicyText, manualPolicy} from '../shared/policyText';
import {formatNumber, type Translator} from '../../i18n';
import {latencyTone, type Help, type NodeStatus} from '../../ui/ui';
import type {SearchItem, SearchSection} from '../../ui/SearchSelect';
import {regionOf} from '../shared/geo';
import type {PartialProbeError} from '../../store/groups';
import {errorText} from '../../api/error';
const groupConfigLabels: Record<string, Key> = {
  default_member_id: 'policy.cfg.defaultMember',
  final_outbound: 'policy.cfg.finalOutbound',
  check_url: 'policy.cfg.checkUrl',
  check_interval: 'policy.cfg.checkInterval',
  tolerance: 'policy.cfg.tolerance',
  idle_timeout: 'policy.cfg.idleTimeout',
  interrupt_connections: 'policy.cfg.interruptConnections'
};
const units: Record<string, Key> = {check_interval: 'policy.cfg.seconds', idle_timeout: 'policy.cfg.seconds', tolerance: 'policy.cfg.millis'};
// Known fields get a label and a unit; anything the contract adds later shows its raw name.
export function groupConfigFields(group: Group): Array<[Key | MessageRef, string | MessageRef]> {
  return Object.entries(group.config)
    .filter(([, value]) => value !== null)
    .map(([key, value]) => {
      const label: Key | MessageRef = groupConfigLabels[key] ?? {key: 'flow.f.input', params: {name: key}};
      if (typeof value === 'boolean') return [label, {key: value ? 'ui.yes' : 'ui.no'}];
      if (typeof value === 'number' && units[key]) return [label, {key: units[key], params: {n: value}}];
      if (key === 'default_member_id') return [label, group.members.find(member => member.id === value)?.name ?? String(value)];
      return [label, String(value)];
    });
}

// The settings the check dialog edits, in the order it shows them.
export const checkFieldOrder = ['check_url', 'check_interval', 'tolerance', 'idle_timeout'] as const;
export type CheckField = (typeof checkFieldOrder)[number];
type CountField = Exclude<CheckField, 'check_url'>;
const countFields = ['check_interval', 'tolerance', 'idle_timeout'] as const satisfies readonly CountField[];
export type CheckDraft = Record<CheckField, string>;
// The check settings a group takes writes to, as its mutable_config lists them. honk leaves check_url out for a
// selector group, which it does not probe; a backend that probes one lists it.
export function checkFields(g: Group): CheckField[] {
  return checkFieldOrder.filter(field => g.capabilities.mutable_config.includes(field));
}
const countText = (value: number | null) => (value === null ? '' : String(value));
export const checkDraft = (g: Group): CheckDraft => ({
  check_url: g.config.check_url ?? '',
  check_interval: countText(g.config.check_interval),
  tolerance: countText(g.config.tolerance),
  idle_timeout: countText(g.config.idle_timeout)
});
// A tolerance the group leaves unset opens as an empty field; while it stays empty its caption says the engine default
// applies, in place of the help.
export const checkUnset = (g: Group, field: CheckField, value: string) => field === 'tolerance' && g.config.tolerance === null && value === '';
// `theirs`: the fields both the user and the group changed since the dialog opened, with the group's value.
export type CheckEditDraft = {base: CheckDraft; value: CheckDraft; theirs: Partial<CheckDraft>};
// After a save refused as conflicting, a field only the group changed takes its current value and a field the user
// changed keeps the edit, with the group's value beside it. The current values become the base the next save tests
// against, so saving again replaces the group's value with the user's.
export function checkRebase(draft: CheckEditDraft, current: CheckDraft): CheckEditDraft {
  const value = {...draft.value};
  const theirs = {...draft.theirs};
  for (const field of checkFieldOrder) {
    if (current[field] === draft.base[field]) continue;
    if (draft.value[field] === draft.base[field]) value[field] = current[field];
    else if (draft.value[field] !== current[field]) theirs[field] = current[field];
  }
  return {base: current, value, theirs};
}
// The contract's floor: a check interval of at least one second, a tolerance or idle timeout of zero or more.
const countMinimum: Record<CountField, number> = {check_interval: 1, tolerance: 0, idle_timeout: 0};
// An empty field is valid: it clears the group's own value, so the global or default one applies.
export function checkInvalid(field: CheckField, value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  return field === 'check_url' ? !safeHttpUrl(text) : !/^\d+$/.test(text) || !Number.isSafeInteger(Number(text)) || Number(text) < countMinimum[field];
}
// For each offered field the user changed from `base`, the values the dialog opened with: a test that the group still holds
// the base value, then the replace; an empty field sends null. A field the user left alone is not sent, so a change another
// client made to it in the meantime is kept, and one made to a changed field fails the test with 409 instead of being overwritten.
export function checkPatch(g: Group, base: CheckDraft, draft: CheckDraft): JsonPatch {
  const fields = checkFields(g);
  const ops: JsonPatch = [];
  const url = (text: string) => text.trim() || null;
  const count = (text: string) => (text.trim() ? Number(text.trim()) : null);
  if (fields.includes('check_url') && url(draft.check_url) !== url(base.check_url)) {
    const path = '/config/check_url';
    ops.push({op: 'test', path, value: url(base.check_url)}, {op: 'replace', path, value: url(draft.check_url)});
  }
  for (const field of countFields) {
    if (!fields.includes(field) || count(draft[field]) === count(base[field])) continue;
    const path = `/config/${field}` as const;
    ops.push({op: 'test', path, value: count(base[field])}, {op: 'replace', path, value: count(draft[field])});
  }
  return ops;
}

// The default member and final outbound, which the edit dialog offers under the filters when the backend lists them as
// writable. The file names both by tag: a member's name, and a node, group, direct or block. honk reads the default
// member only under manual selection, so it follows `policy`, the one the dialog has selected.
export const routeFieldOrder = ['default_member_id', 'final_outbound'] as const;
export type RouteField = (typeof routeFieldOrder)[number];
export const routeFields = (g: Group | undefined, policy: string | null): RouteField[] =>
  g ? routeFieldOrder.filter(field => g.capabilities.mutable_config.includes(field) && (field !== 'default_member_id' || manualPolicy(policy))) : [];
// Picker ids carry the value behind a prefix, so None cannot collide with a name.
export const routeChoiceId = (value: string | null) => (value === null ? 'none' : `=${value}`);
export const routeChoiceValue = (id: string) => (id.startsWith('=') ? id.slice(1) : null);
// A value as the file writes it, read back without its quotes.
export const routeValue = (written: string | null) => (written === null ? null : unquote(written));
// A changed name must be one the file can hold; one read from the file is written back as it was.
export const routeWritable = (value: string | null, written: string | null) => value === null || value === routeValue(written) || isWritableName(value);

// What a final outbound can name, from what the page already reads: every group, every node with its latency, and
// the groups each declared group points at through `group(...)` filters and its own `final`.
export type OutboundCatalogue = {groups: string[]; nodes: Array<{name: string; tcp?: number; alive?: boolean}>; links: ReadonlyMap<string, string[]>};
export function outboundLinks(owners: ReadonlyMap<string, GroupOwner>): Map<string, string[]> {
  const links = new Map<string, string[]>();
  for (const [name, owner] of owners) {
    if (owner === 'ambiguous') continue;
    const final = routeValue(owner.entry.final);
    links.set(name, [...nestedIn(owner.entry), ...(final ? [final] : [])]);
  }
  return links;
}
// The groups a final outbound of `name` must not name: the group itself, and every group that leads back to it through
// nesting or finals, which honk would resolve in a cycle and fail closed.
export function finalExcluded(name: string, links: ReadonlyMap<string, string[]>): Set<string> {
  const back = new Map<string, string[]>();
  for (const [from, targets] of links) for (const to of targets) back.set(to, [...(back.get(to) ?? []), from]);
  const excluded = new Set([name]);
  const queue = [name];
  while (queue.length) {
    for (const from of back.get(queue.pop()!) ?? []) {
      if (excluded.has(from)) continue;
      excluded.add(from);
      queue.push(from);
    }
  }
  return excluded;
}

const noneFirst = (values: SearchItem[], held: Array<string | null>, t: Translator): SearchSection => ({
  id: 'none',
  // A value outside the lists, such as a tag the file names that is gone, stays choosable after None.
  items: [
    {id: routeChoiceId(null), label: t('ui.none')},
    ...[...new Set(held)]
      .filter((value): value is string => value !== null && !values.some(item => item.id === routeChoiceId(value)))
      .map(value => ({id: routeChoiceId(value), label: value}))
  ]
});
// Keeps the first of each name: the picker's ids are names, and honk resolves a repeated name to its first declaration.
function firstOfEach<T>(items: T[], name: (item: T) => string, taken = new Set<string>()): T[] {
  return items.filter(item => {
    const key = name(item);
    if (taken.has(key)) return false;
    taken.add(key);
    return true;
  });
}
const nodeTone = (node: {tcp?: number; alive?: boolean}) => (node.alive === false ? 'err' : node.tcp === undefined ? undefined : latencyTone(node.tcp));
// The final outbound's choices in sections: None, then direct and block, the groups that close no cycle, and the nodes
// with their latency as the node menus show it. `held`: the values the dialog opened with and holds now.
export function finalSections(name: string, catalogue: OutboundCatalogue, held: Array<string | null>, t: Translator): SearchSection[] {
  const excluded = finalExcluded(name, catalogue.links);
  const taken = new Set([...builtinOutboundNames, ...catalogue.groups]);
  const builtin = builtinOutboundNames.map(value => ({id: routeChoiceId(value), label: value}));
  const groups = catalogue.groups.filter(group => !excluded.has(group)).map(group => ({id: routeChoiceId(group), label: group}));
  const nodes = firstOfEach(catalogue.nodes, node => node.name, taken).map(node => ({
    id: routeChoiceId(node.name),
    label: node.name,
    desc: node.alive === false ? t('ui.unavailable') : node.tcp === undefined ? '—' : formatLatency(node.tcp, t),
    tone: nodeTone(node)
  }));
  const all = [...builtin, ...groups, ...nodes];
  return [
    noneFirst(all, held, t),
    {id: 'builtin', title: t('policy.pickBuiltin'), items: builtin},
    {id: 'groups', title: t('policy.pickGroups'), items: groups},
    {id: 'nodes', title: t('policy.pickNodes'), items: nodes}
  ].filter(section => section.items.length);
}
// The default member's choices: None, then the group's direct members with the status their tiles show.
export function memberSections(members: MemberView[], held: Array<string | null>, t: Translator): SearchSection[] {
  const items = firstOfEach(members, member => member.name).map(member => ({
    id: routeChoiceId(member.name),
    label: member.name,
    desc: member.status.text,
    tone: member.status.tone
  }));
  return [noneFirst(items, held, t), {id: 'members', title: t('policy.pickMembers'), items}].filter(section => section.items.length);
}

// A partial probe says how far it got and why it stopped.
export function actionErrorText(error: Error, t: Translator, showRequestId = true): string {
  if (!('partialResult' in error)) return errorText(error, t, showRequestId);
  const {completed, total, cause} = error as PartialProbeError;
  const progress = t('policy.probePartial', {done: completed, n: total, error: errorText(cause, t, showRequestId)});
  return t('ui.valuePair', {label: errorText(error, t, showRequestId), value: progress});
}
// Count each member's worst address-family outcome, without letting an absent address hide a measured result.
const probeRank = {unknown: 0, healthy: 1, unavailable: 2};
export function probeSummary(result: ProbeResult): MessageRef {
  const members = new Map<string, 'healthy' | 'unavailable' | 'unknown'>();
  for (const item of result.results) {
    const previous = members.get(item.member_id);
    if (!previous || probeRank[item.state] > probeRank[previous]) members.set(item.member_id, item.state);
  }
  const states = [...members.values()];
  return {
    key: result.selection_changed.tcp || result.selection_changed.udp ? 'policy.probeChanged' : 'policy.probeUnchanged',
    params: {
      healthy: states.filter(s => s === 'healthy').length,
      unavailable: states.filter(s => s === 'unavailable').length,
      unknown: states.filter(s => s === 'unknown').length
    }
  };
}

export type MemberView = {
  id: string;
  name: string;
  tcp?: number;
  unavailable: boolean;
  healthy: boolean;
  status: NodeStatus;
  description: string;
  region: string;
};
const purposes: Record<HealthObservation['purpose'], Key> = {data: 'policy.purpose.data', dns: 'policy.purpose.dns', shared: 'policy.purpose.shared'};
// The tile's status slot: a group badge, a latency with its tone, or the state when there is no latency.
function memberStatus(member: {kind: string; health?: HealthObservation}, t: Translator): NodeStatus {
  if (member.kind === 'group') return {text: t('ui.group'), badge: true};
  const tcp = healthMillis(member.health);
  if (tcp != null) return {text: formatLatency(tcp, t), tone: latencyTone(tcp)};
  return member.health?.state === 'unavailable' ? {text: t('ui.unavailable'), tone: 'err'} : {text: '—'};
}
export function memberViews(members: Array<Group['members'][number] & {health?: HealthObservation}>, t: Translator): MemberView[] {
  return members.map(member => ({
    id: member.id,
    name: member.name,
    tcp: healthMillis(member.health),
    unavailable: member.health?.state === 'unavailable',
    healthy: member.health?.state === 'healthy',
    status: memberStatus(member, t),
    // Only an observation other than the usual TCP on the data path says how it was made.
    description:
      member.health && (member.health.transport !== 'tcp' || member.health.purpose !== 'data')
        ? t('policy.observedVia', {
            transport: t(member.health.transport === 'udp' ? 'ui.udp' : 'ui.tcp'),
            purpose: enumLabel(purposes, member.health.purpose, t)
          })
        : ' ',
    region: regionOf(member.name) ?? '?'
  }));
}
export function policyCardView(g: Group, members: MemberView[], network: 'both' | 'tcp' | 'udp', t: Translator) {
  const tcp = g.runtime.selection.tcp?.member_id;
  const udp = g.runtime.selection.udp?.member_id;
  const selectable = g.policy.kind === 'selector' && g.capabilities.can_select;
  const overridable = !selectable && g.capabilities.can_override;
  const pinned = overridable && [g.runtime.selection.tcp, g.runtime.selection.udp].some(item => item?.source === 'override');
  const interruptable = g.capabilities.mutable_config.includes('interrupt_connections');
  const healthy = members.filter(member => member.healthy).length;
  const down = members.filter(member => member.unavailable).length;
  const untested = members.length - healthy - down;
  return {
    id: g.id,
    name: g.name,
    policy: groupPolicyText(g.policy, t),
    selected: network === 'tcp' ? tcp : network === 'udp' ? udp : tcp === udp ? tcp : undefined,
    // Both networks on different members: neither is the selection, so each is marked with the network it carries.
    marks: network === 'both' && tcp && udp && tcp !== udp ? {[tcp]: t('ui.tcp'), [udp]: t('ui.udp')} : ({} as Record<string, string>),
    selectable,
    overridable,
    pinned,
    interruptable,
    interrupt: g.config.interrupt_connections === true,
    // null: the group sets no value and the engine's default applies.
    interruptUnset: g.config.interrupt_connections === null,
    showNetwork: selectable || overridable || tcp !== udp,
    networkLabel: t('policy.network', {name: g.name}),
    healthy: t('policy.healthy', {n: healthy}),
    down: down ? t('policy.down', {n: down}) : null,
    untested: untested ? t('policy.untested', {n: untested}) : null,
    overrideTone: pinned ? ('neutral' as const) : ('ok' as const),
    overrideText: t(pinned ? 'policy.overridden' : 'policy.automatic'),
    fields: groupConfigFields(g)
      .filter(([key]) => !(interruptable && key === 'policy.cfg.interruptConnections'))
      .map(([key, value]): [string, string] => [
        typeof key === 'string' ? t(key) : t(key.key, key.params),
        typeof value === 'string' ? value : t(value.key, value.params)
      ])
  };
}

export function nodeGridView(
  nodes: MemberView[],
  filter: {q: string; region: string; sort: string; aliveOnly: boolean},
  contains: (value: string, query: string) => boolean,
  t: Translator,
  locale: string
) {
  const big = nodes.length > 12;
  const counts = new Map<string, number>();
  for (const node of nodes) counts.set(node.region, (counts.get(node.region) ?? 0) + 1);
  const shown = big
    ? nodes.filter(
        node =>
          (!filter.q || contains(node.name, filter.q)) && (filter.region === 'all' || node.region === filter.region) && (!filter.aliveOnly || node.healthy)
      )
    : nodes;
  if (big && filter.sort === 'latency') shown.sort((a, b) => compareLatency(a.tcp, b.tcp));
  else if (big && filter.sort === 'name') shown.sort((a, b) => compareNames(locale)(a.name, b.name));
  const down = shown.filter(node => node.unavailable).length;
  return {
    big,
    shown,
    regions: [
      {id: 'all', label: t('policy.allRegions')},
      ...[...counts].sort((a, b) => b[1] - a[1]).map(([id, count]) => ({id, label: id === '?' ? '—' : id, desc: formatNumber(count, locale)}))
    ],
    regionLabel: filter.region === 'all' ? t('policy.allRegions') : filter.region === '?' ? '—' : filter.region,
    count: down ? t('policy.membersDown', {n: shown.length, down}) : t('policy.members', {n: shown.length})
  };
}

// Why members are untested, and whether Test all can settle it: it cannot when the backend offers no TCP probe within
// its limits, or the group has no members or takes no TCP probe.
export function untestedHelp(untested: string | null, canProbe: boolean, t: Translator): Help | null {
  return untested ? {title: untested, text: [t('policy.untestedHelp'), t(canProbe ? 'policy.untestedProbe' : 'policy.untestedNoProbe')]} : null;
}

// Where a group is declared: its entry and the source whose group section holds it. 'ambiguous' when more than one
// entry declares the name, since editing one would leave the other in force.
export type GroupOwner = {entry: GroupEntry; origin: ConfigSource} | 'ambiguous';
export function groupOwners(sources: ConfigSource[]): Map<string, GroupOwner> {
  const owners = new Map<string, GroupOwner>();
  for (const origin of sources) {
    for (const entry of readGroupEntries(origin.content)) owners.set(entry.name, owners.has(entry.name) ? 'ambiguous' : {entry, origin});
  }
  return owners;
}

// Why a group's Edit is disabled, or null when it can open: the configuration is read, the group is declared once, and
// the declaring source is writable and complete. `complete` is undefined while its digest is being checked. A failed
// fetch explains a missing declaration better than its absence does.
export function editBlocked(
  owner: GroupOwner | undefined,
  state: {loaded: boolean; complete: boolean | undefined; error: Error | null},
  t: Translator
): string | null {
  if (state.error) return errorText(state.error, t);
  if (!state.loaded) return t('policy.editNoConfig');
  if (!owner) return t('policy.editNoEntry');
  if (owner === 'ambiguous') return t('policy.editAmbiguous');
  if (!owner.origin.writable) return t('policy.editReadOnly', {file: owner.origin.path});
  if (state.complete === undefined) return t('policy.editNoConfig');
  return state.complete ? null : t('config.incomplete');
}

// Why a group's header actions are disabled, shown under them: Edit first, then Test all. Null while both can run, while
// Edit is hidden, or while a change is in flight (the pending button shows that).
export function groupActionsReason(
  edit: {shown: boolean; busy: boolean; blocked: string | null},
  probe: {busy: boolean; canProbe: boolean},
  t: Translator
): string | null {
  if (edit.shown && !edit.busy && edit.blocked) return edit.blocked;
  return probe.busy || probe.canProbe ? null : t('policy.noProbe');
}
