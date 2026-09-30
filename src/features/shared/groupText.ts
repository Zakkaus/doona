import type {ConfigSource, Group, Node} from '../../api/model';
import {compileFilters, isWritableName, nestedIn, readGroupEntries, type GroupEntry} from '../../dae/groups';
import {unquote} from '../../dae/text';
import {builtinOutboundNames} from '../../dae/vocab';
import {formatLatency} from '../../i18n/format';
import type {Key, Translator} from '../../i18n';
import {latencyTone, type NodeStatus} from '../../ui/ui';
import type {SearchItem, SearchSection} from '../../ui/SearchSelect';
import {manualPolicy} from './policyText';
import {errorText} from '../../api/error';
import {healthMillis, preferredHealth} from '../../api/selectors';
export const groupConfigLabels = {
  default_member_id: 'policy.cfg.defaultMember',
  final_outbound: 'policy.cfg.finalOutbound',
  check_url: 'policy.cfg.checkUrl',
  check_interval: 'policy.cfg.checkInterval',
  tolerance: 'policy.cfg.tolerance',
  idle_timeout: 'policy.cfg.idleTimeout',
  interrupt_connections: 'policy.cfg.interruptConnections'
} as const satisfies Record<string, Key>;
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
export function memberSections(members: Array<{name: string; status: NodeStatus}>, held: Array<string | null>, t: Translator): SearchSection[] {
  const items = firstOfEach(members, member => member.name).map(member => ({
    id: routeChoiceId(member.name),
    label: member.name,
    desc: member.status.text,
    tone: member.status.tone
  }));
  return [noneFirst(items, held, t), {id: 'members', title: t('policy.pickMembers'), items}].filter(section => section.items.length);
}

// A new group's direct members follow its draft filters, before it exists on the backend.
export function draftMembers(filters: string[], nodes: Node[], t: Translator): Array<{name: string; status: NodeStatus}> {
  const admits = compileFilters(filters);
  return [
    ...nestedIn({filters}).map(name => ({name, status: {text: t('ui.group'), badge: true}})),
    ...nodes.filter(admits).map(node => {
      const health = preferredHealth(node);
      const tcp = healthMillis(health);
      const status: NodeStatus =
        tcp !== undefined
          ? {text: formatLatency(tcp, t), tone: latencyTone(tcp)}
          : health?.state === 'unavailable'
            ? {text: t('ui.unavailable'), tone: 'err'}
            : {text: '—'};
      return {name: node.name, status};
    })
  ];
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
