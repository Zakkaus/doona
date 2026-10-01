import {groupConfigLabels} from '../shared/groupText';
import {compareNames, formatLatency} from '../../i18n/format';
import {enumLabel} from '../../i18n/enum';
import type {Group, HealthObservation, JsonPatch, ProbeResult} from '../../api/model';
import type {Key} from '../../i18n';
import {compareLatency, foldFamilies, healthMillis, safeHttpUrl, type MessageRef} from '../../api/selectors';
import {groupPolicyText} from '../shared/policyText';
import {formatNumber, type Translator} from '../../i18n';
import {latencyTone, type Help, type NodeStatus} from '../../ui/ui';
import {regionOf} from '../shared/geo';
import type {PartialProbeError} from '../../store/groups';
import {errorText} from '../../api/error';
import {within} from '../../shell/route';
const units: Record<string, Key> = {check_interval: 'policy.cfg.seconds', idle_timeout: 'policy.cfg.seconds', tolerance: 'policy.cfg.millis'};
// Known fields get a label and a unit; anything the contract adds later shows its raw name.
export function groupConfigFields(group: Group): Array<[Key | MessageRef, string | MessageRef]> {
  return Object.entries(group.config)
    .filter(([, value]) => value !== null)
    .map(([key, value]) => {
      const label: Key | MessageRef = (groupConfigLabels as Record<string, Key | undefined>)[key] ?? {key: 'flow.f.input', params: {name: key}};
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

// A partial probe says how far it got and why it stopped.
export function actionErrorText(error: Error, t: Translator, showRequestId = true): string {
  if (!('partialResult' in error)) return errorText(error, t, showRequestId);
  const {completed, total, cause} = error as PartialProbeError;
  const progress = t('policy.probePartial', {done: completed, n: total, error: errorText(cause, t, showRequestId)});
  return t('ui.valuePair', {label: errorText(error, t, showRequestId), value: progress});
}
// Count each member once, its address families folded as its tile folds them.
export function probeSummary(result: ProbeResult): MessageRef {
  const rows = new Map<string, ProbeResult['results']>();
  for (const item of result.results) rows.set(item.member_id, [...(rows.get(item.member_id) ?? []), item]);
  const states = [...rows.values()].map(items => foldFamilies(items)?.state);
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
  nodeName: boolean;
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
    nodeName: member.kind === 'node',
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
// Which filter a group falls under: manual when the backend runs it as a selector, whose member is picked by hand, and
// automatic for every other policy it lists. The contract's kind is honk's own reading of the policy, so a spelling
// doona does not know still lands on the right side.
export type GroupKind = 'manual' | 'auto';
export type KindFilter = GroupKind | 'all';
export const groupKind = (policy: Pick<Group['policy'], 'kind'>): GroupKind => (policy.kind === 'selector' ? 'manual' : 'auto');
// The filter a query asks for; anything else shows every group.
export const kindFilter = (value: string | null): KindFilter => (value === 'manual' || value === 'auto' ? value : 'all');
export const kindQuery = (query: string, next: string) => within(query, {kind: kindFilter(next) === 'all' ? null : kindFilter(next), group: null});
// The groups the filter shows and its choices with their counts. A link to a group the filter would hide shows every
// group instead, so the link still lands on it.
export function kindView<T extends {id: string; kind: GroupKind}>(cards: T[], requested: KindFilter, focus: string | null, t: Translator) {
  const target = focus === null ? undefined : cards.find(card => card.id === focus);
  const kind: KindFilter = target && requested !== 'all' && target.kind !== requested ? 'all' : requested;
  const manual = cards.filter(card => card.kind === 'manual').length;
  const shown = kind === 'all' ? cards : cards.filter(card => card.kind === kind);
  return {
    kind,
    shown,
    items: [
      ['all', t('policy.kind.all', {n: cards.length})],
      ['manual', t('policy.kind.manual', {n: manual})],
      ['auto', t('policy.kind.auto', {n: cards.length - manual})]
    ] as Array<[KindFilter, string]>,
    // Only a filter can leave the list empty here; no groups at all has its own message.
    empty: cards.length && !shown.length ? t(kind === 'manual' ? 'policy.kind.noManual' : 'policy.kind.noAuto') : null
  };
}
// A collapsed automatic group's one line: the member in place, each network's when they differ, and how many members
// are available.
export function selectionSummary(g: Pick<Group, 'runtime'>, members: MemberView[], t: Translator): string {
  const name = (id: string) => members.find(member => member.id === id)?.name ?? id;
  const tcp = g.runtime.selection.tcp?.member_id;
  const udp = g.runtime.selection.udp?.member_id;
  const n = members.filter(member => member.healthy).length;
  if (tcp && udp && tcp !== udp) return t('policy.summarySplit', {tcp: name(tcp), udp: name(udp), n});
  const id = tcp ?? udp;
  return t('policy.summary', {member: id ? name(id) : t('policy.noneSelected'), n});
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
    automatic: groupKind(g.policy) === 'auto',
    summary: selectionSummary(g, members, t),
    interruptable,
    interrupt: g.config.interrupt_connections === true,
    // null: the group sets no value and the engine's default applies.
    interruptUnset: g.config.interrupt_connections === null,
    showNetwork: selectable || overridable || tcp !== udp,
    networkLabel: t('policy.network', {name: g.name}),
    healthy: t('policy.healthy', {n: healthy}),
    down: down ? t('policy.down', {n: down}) : null,
    untested: untested ? t('policy.untested', {n: untested}) : null,
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
