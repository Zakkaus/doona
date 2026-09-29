import type {BulkCloseQuery, Connection, ConnectionList} from '../../api/model';
import {tagId} from '../shared/taggedId';
import {ranked} from '../shared/ranked';
import {enumLabel} from '../../i18n/enum';
import {addU64, parseU64} from '../../api/u64';
import {storageKeys} from '../../api/storage';
import {
  chainLabel,
  chainPath,
  chainNames,
  connectionStates,
  nodeLabel,
  outboundLabel,
  sourceIp,
  addressPort,
  type MessageRef,
  type OutboundNames
} from '../../api/selectors';
import {compareNames, localTime, formatBytes, formatRate} from '../../i18n/format';
import {formatNumber, type Translator as LabelFn} from '../../i18n';
import {word} from '../../api/labels';
import type {Key} from '../../i18n';
import type {SortDescriptor} from 'react-aria-components';
import type {Help} from '../../ui/ui';
import {csvLine} from '../../ui/ui';
import {ruleHref, traceQuery} from '../shared/link';
import {within} from '../../shell/route';
const observers: Record<Connection['observed_by'], Key> = {userspace: 'conn.observed.userspace', ebpf: 'conn.observed.ebpf', mixed: 'conn.observed.mixed'};
// Where the chain came from: captured when the connection was routed, rebuilt from retained records, or not known.
const chainSources: Record<Connection['chain_source'], Key> = {
  evaluation: 'conn.chainSource.evaluation',
  reconstructed: 'conn.chainSource.reconstructed',
  unknown: 'ui.unknown'
};
export function connectionDetails(c: Connection, locale: string): Array<[Key, string | MessageRef]> {
  // A backend that predates the field leaves it out, and the row with it.
  const chainSource: Array<[Key, string | MessageRef]> = c.chain_source
    ? [['conn.f.chainSource', chainSources[c.chain_source] ? {key: chainSources[c.chain_source]} : c.chain_source]]
    : [];
  return [
    ['ui.device', c.src ?? '—'],
    ['conn.f.dst', c.dst ?? '—'],
    ['ui.domain', c.domain ?? '—'],
    ['conn.f.ingress', word(c.ingress)],
    ['conn.f.domainSource', word(c.domain_source)],
    ...chainSource,
    ['ui.process', c.pname ?? '—'],
    ['conn.f.observedBy', observers[c.observed_by] ? {key: observers[c.observed_by]} : c.observed_by],
    ['ui.upload', formatBytes(c.upload_bytes, locale)],
    ['ui.download', formatBytes(c.download_bytes, locale)],
    ['conn.f.uploadRate', formatRate(c.upload_bytes_per_second, locale)],
    ['conn.f.downloadRate', formatRate(c.download_bytes_per_second, locale)],
    ['conn.f.started', localTime(c.started_at, locale)]
  ];
}

// `drop` orders which columns give way first when a table wider than a phone is narrower than the minima (see fitColumns);
// the target column always stays.
export const columns: Array<{id: string; label: Key; minWidth: number; sortable?: boolean; align?: 'end'; drop?: number}> = [
  {id: 'dst', label: 'ui.target', minWidth: 200, sortable: true},
  {id: 'src', label: 'ui.device', minWidth: 128, sortable: true, drop: 5},
  {id: 'node', label: 'conn.node', minWidth: 120, drop: 3},
  {id: 'rule', label: 'conn.rule', minWidth: 220, drop: 2},
  {id: 'state', label: 'ui.state', minWidth: 88, sortable: true, drop: 7},
  {id: 'down', label: 'ui.download', minWidth: 96, align: 'end', sortable: true, drop: 4},
  {id: 'downRate', label: 'conn.f.downloadRate', minWidth: 128, align: 'end', sortable: true, drop: 1},
  {id: 'age', label: 'ui.started', minWidth: 132, align: 'end', sortable: true, drop: 6}
];
export type ConnectionView = {hidden: string[]; sort: SortDescriptor | null; group: 'none' | 'source' | 'outbound'};
type GroupRow = {id: string; group: string; children: Connection[]; active: number; download: bigint | null};
type TableRow = {id: string; connection: Connection} | GroupRow;
export const viewKey = storageKeys.connectionsView;
// Which groups are folded: all but the exceptions once everything is collapsed, otherwise only the exceptions. A group
// that arrives later takes the default, so a poll neither reopens a folded group nor folds an open one.
export type GroupCollapse = {allCollapsed: boolean; exceptions: ReadonlySet<string>};
export const collapseAll = (allCollapsed: boolean): GroupCollapse => ({allCollapsed, exceptions: new Set()});
export const isCollapsed = (state: GroupCollapse, group: string) => state.allCollapsed !== state.exceptions.has(group);
export function toggleGroup(state: GroupCollapse, group: string): GroupCollapse {
  const exceptions = new Set(state.exceptions);
  if (!exceptions.delete(group)) exceptions.add(group);
  return {allCollapsed: state.allCollapsed, exceptions};
}
export const expandGroup = (state: GroupCollapse, group: string) => (isCollapsed(state, group) ? toggleGroup(state, group) : state);
// Groups key on what the backend sent, not on its label, so a change of language keeps which groups are folded and
// an outbound named like a built-in label stays its own group. Source groups key on the address without the port, so
// one client is one group; a connection without an outbound joins `unknown`, which its label already reads as.
const groupKey = (row: Connection, group: Exclude<ConnectionView['group'], 'none'>) =>
  group === 'source' ? (sourceIp(row.src ?? undefined) ?? row.src ?? '—') : (row.outbound ?? 'unknown');
const groupName = (key: string, group: Exclude<ConnectionView['group'], 'none'>, t: LabelFn) => (group === 'source' ? key : outboundLabel(key, t));

// Groups and connections share the table's keys. A group's key is its own key after `g:`; a connection keeps its id
// as its key, the way links and the selection name it, unless the id could read as a group's key or as an escaped
// one, which is escaped with a backslash.
const groupRowId = (group: string) => 'g:' + group;
export const connectionKey = (id: string) => (id.startsWith('g:') || id.startsWith('\\') ? '\\' + id : id);
export const connectionId = (key: string) => (key.startsWith('\\') ? key.slice(1) : key);

// The group a selected connection shows in, and a token that changes when it moves to another group or the grouping
// changes, so its group unfolds once for each move and folding it again holds.
export function revealTarget(connection: Connection | undefined, group: ConnectionView['group']): {group: string; token: string} | null {
  if (!connection || group === 'none') return null;
  const key = groupKey(connection, group);
  return {group: key, token: JSON.stringify([connection.id, group, key])};
}

export function readView(stored: string | null): ConnectionView {
  const defaults: ConnectionView = {hidden: [], sort: null, group: 'source'};
  try {
    const value = JSON.parse(stored ?? 'null');
    if (!value || typeof value !== 'object') return defaults;
    // The chain column became the node column; a view saved before the rename keeps it hidden.
    const saved: unknown[] = Array.isArray(value.hidden) ? value.hidden.map((id: unknown) => (id === 'chain' ? 'node' : id)) : [];
    const hidden = columns.filter(column => saved.includes(column.id)).map(column => column.id);
    const sort = value.sort;
    return {
      hidden: hidden.length === columns.length ? [] : hidden,
      sort:
        sort && columns.some(column => column.sortable && column.id === sort.column) && ['ascending', 'descending'].includes(sort.direction)
          ? {column: sort.column, direction: sort.direction}
          : null,
      group: value.group === 'none' || value.group === 'outbound' ? value.group : 'source'
    };
  } catch {
    return defaults;
  }
}

// Decorate, sort, undecorate: each item's key is computed once rather than on every comparison.
export function sortByKey<T, K>(items: T[], key: (item: T) => K, compare: (a: K, b: K) => number): T[] {
  return items
    .map(item => ({item, key: key(item)}))
    .sort((a, b) => compare(a.key, b.key))
    .map(entry => entry.item);
}

// Sorts and groups by what the table shows: a state sorts by its label, not the wire value.
export function tableRows(rows: Connection[], view: ConnectionView, t: LabelFn): TableRow[] {
  let sorted = rows;
  if (view.sort) {
    const {column, direction} = view.sort;
    const value = (row: Connection) => {
      switch (column) {
        case 'dst':
          return row.domain || row.dst;
        case 'src':
          return row.src;
        case 'state':
          return enumLabel(connectionStates, row.state, t);
        case 'down':
          return parseU64(row.download_bytes);
        case 'downRate':
          return parseU64(row.download_bytes_per_second);
        case 'age':
          return row.started_at ? Date.parse(row.started_at) : null;
        default:
          return null;
      }
    };
    sorted = sortByKey(rows, value, (left, right) => {
      if (left == null) return right == null ? 0 : 1;
      if (right == null) return -1;
      const order = typeof left === 'string' && typeof right === 'string' ? compareNames(left, right) : left < right ? -1 : left > right ? 1 : 0;
      return direction === 'descending' ? -order : order;
    });
  }
  if (view.group === 'none') return sorted.map(connection => ({id: connectionKey(connection.id), connection}));
  const groups = new Map<string, Connection[]>();
  for (const row of sorted) {
    const key = groupKey(row, view.group);
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  // A group's id is its key, not its place, so the table's expansion and focus follow the group across polls.
  return [...groups].map(([group, children]) => ({
    id: groupRowId(group),
    group,
    children,
    active: children.filter(c => c.state === 'active').length,
    download: addU64(...children.map(c => c.download_bytes))
  }));
}

export type ConnectionRowView = {
  id: string;
  target: string;
  source: string;
  node: string;
  path: string | null;
  rule: {expression: string | null; href: string | undefined};
  recomputed: string | null;
  state: string;
  download: string;
  downloadRate: string;
  startedAt: string | null;
};
type ConnectionGroupView = {id: string; group: string; children: ConnectionRowView[]; label: string; totals: Record<string, string>};
export type ConnectionTableRow = {id: string; connection: ConnectionRowView} | ConnectionGroupView;
// A connection a poll re-reads unchanged keeps its identity, so its row is projected once per locale, outbound names
// and rules capability, and the table keeps that row's cached item.
const projected = new WeakMap<Connection, {locale: string; names: OutboundNames; rulesListed: boolean; t: LabelFn; row: ConnectionRowView}>();
export function connectionTableView(
  rows: Connection[],
  view: ConnectionView,
  locale: string,
  names: OutboundNames,
  rulesListed: boolean,
  t: LabelFn
): ConnectionTableRow[] {
  const project = (c: Connection): ConnectionRowView => {
    const hit = projected.get(c);
    if (hit && hit.locale === locale && hit.names === names && hit.rulesListed === rulesListed && hit.t === t) return hit.row;
    const row: ConnectionRowView = {
      id: connectionKey(c.id),
      target: c.domain || c.dst || '—',
      source: c.src ?? '—',
      node: nodeLabel(c, t, names),
      path: chainPath(c, t, names),
      rule: {expression: c.rule_expression, href: ruleHref(c.rule_id, rulesListed)},
      recomputed: c.rule_source === 'recomputed' ? t('conn.recomputed') : null,
      state: enumLabel(connectionStates, c.state, t),
      download: formatBytes(c.download_bytes, locale),
      downloadRate: formatRate(c.download_bytes_per_second, locale),
      startedAt: c.started_at
    };
    projected.set(c, {locale, names, rulesListed, t, row});
    return row;
  };
  return tableRows(rows, view, t).map(row =>
    'connection' in row
      ? {id: row.id, connection: project(row.connection)}
      : {
          id: row.id,
          group: row.group,
          children: row.children.map(project),
          label: t('conn.groupCount', {name: groupName(row.group, view.group as Exclude<ConnectionView['group'], 'none'>, t), n: row.children.length}),
          totals: {down: formatBytes(row.download, locale), state: t('conn.activeCount', {n: row.active})}
        }
  );
}

// The filter menus and counts follow the list; the detail follows the selection, so selecting a row does not
// recount the list.
export function connectionsView(
  rows: Array<Connection & {network: string}>,
  data: ConnectionList | undefined,
  src: string | undefined,
  rule: string,
  out: string,
  locale: string,
  t: LabelFn
) {
  // A link can filter by an outbound no open connection uses, such as one from the usage totals; it stays listed so the
  // picker still shows it.
  const outbounds = new Set(rows.flatMap(c => (c.outbound ? [c.outbound] : [])));
  if (out !== 'all') outbounds.add(out);
  // Equal counts keep one order across refreshes rather than the order the rows arrived in.
  const seen = (values: Array<string | null | undefined>) => {
    const present = values.flatMap(value => (value ? [value] : []));
    return ranked(present, 12).top;
  };
  return {
    networks: [
      ['all', t('ui.allCount', {n: rows.length})],
      ['tcp', t('ui.tcp')],
      ['udp', t('ui.udp')]
    ] as Array<[string, string]>,
    outbounds: [{id: 'all', label: t('conn.allOutbounds')}, ...[...outbounds].map(id => ({id, label: outboundLabel(id, t)}))],
    picks: [
      {
        title: t('ui.device'),
        value: tagId('src', src ?? ''),
        items: seen(rows.map(c => sourceIp(c.src))).map(({key: ip, count}) => ({id: tagId('src', ip), label: ip, desc: formatNumber(count, locale)}))
      },
      {
        title: t('conn.rule'),
        value: tagId('rule', rule),
        items: seen(rows.map(c => c.rule_expression)).map(({key: expression, count}) => ({
          id: tagId('rule', expression),
          label: expression,
          desc: formatNumber(count, locale)
        }))
      }
    ],
    visibility: data && data.visibility !== 'full' ? t(data.visibility === 'none' ? 'conn.visibilityNone' : 'conn.visibilityPartial') : null
  };
}
// A phone folds the secondary filters into one menu: a row per filter showing its choice, each opening that filter's
// choices, and each with an entry that lifts it. The count of filters in force labels the menu's button.
export function filterMenu(
  lists: ReturnType<typeof connectionsView>,
  filters: {network: string; out: string; src: string | undefined; rule: string},
  t: LabelFn
) {
  const [devices, rules] = lists.picks;
  // Each row names the filter it sets, so the page binds its handler by name rather than by position.
  const one = (filter: 'network' | 'out' | 'src' | 'rule', title: string, items: Array<{id: string; label: string; desc?: string}>, value: string) => ({
    filter,
    label: title,
    sections: [{title, items, value}]
  });
  return {
    active: [filters.network !== 'all', filters.out !== 'all', !!filters.src, filters.rule !== 'all'].filter(Boolean).length,
    submenus: [
      one(
        'network',
        t('ui.network'),
        lists.networks.map(([id, label]) => ({id, label})),
        filters.network
      ),
      one('out', t('ui.outbound'), lists.outbounds, filters.out),
      one('src', devices.title, [{id: tagId('src', ''), label: t('conn.allDevices')}, ...devices.items], devices.value),
      one('rule', rules.title, [{id: tagId('rule', 'all'), label: t('conn.allRules')}, ...rules.items], rules.value)
    ]
  };
}

// The states before a connection is established say little by name, so each is explained beside the status: the
// three steps are listed together because a connection held at one of them is read against the others.
const pendingStates = {
  observed: ['conn.state.observed', 'conn.stateHelp.observed'],
  routing: ['conn.state.routing', 'conn.stateHelp.routing'],
  dialing: ['conn.state.dialing', 'conn.stateHelp.dialing']
} as const satisfies Record<string, [Key, Key]>;
export function connectionStateHelp(state: Connection['state'], t: LabelFn): Help | null {
  if (!Object.hasOwn(pendingStates, state)) return null;
  return {title: t('ui.state'), text: Object.values(pendingStates).map(([label, help]) => t('ui.valuePair', {label: t(label), value: t(help)}))};
}

export function connectionDetail(
  current: (Connection & {network: string}) | undefined,
  locale: string,
  t: LabelFn,
  names: OutboundNames,
  rulesListed: boolean
) {
  return current
    ? {
        id: current.id,
        title: current.domain || current.dst || current.id,
        tone: current.state === 'blocked' || current.state === 'failed' ? ('err' as const) : current.state === 'active' ? ('ok' as const) : ('info' as const),
        status: t('ui.aside', {text: enumLabel(connectionStates, current.state, t), note: current.network.toUpperCase()}),
        chain: chainLabel(current, t, names),
        outbound: outboundLabel(current.outbound, t),
        rule: {expression: current.rule_expression, href: ruleHref(current.rule_id, rulesListed)},
        fields: connectionDetails(current, locale).map(
          ([key, value]) => [t(key), typeof value === 'string' ? value : t(value.key, value.params)] as [string, string]
        ),
        flowQuery: within('', {tab: 'records', ...(current.flow_id ? {id: current.flow_id} : {connection_id: current.id})}),
        // The trace of this connection's target, from its source; null when it has neither a domain nor an address.
        traceQuery:
          current.domain || sourceIp(current.dst)
            ? traceQuery({
                network: current.network === 'udp' ? 'udp' : 'tcp',
                domain: current.domain ?? '',
                dst_ip: sourceIp(current.dst),
                dst_port: addressPort(current.dst),
                src_ip: sourceIp(current.src)
              })
            : null,
        source: current.src ? (sourceIp(current.src) ?? current.src) : null,
        closable: current.state === 'active' || current.state === 'dialing' || current.state === 'routing',
        // An ebpf-only observation is kernel-forwarded: the backend has no userspace transport to cancel.
        closeReason: current.observed_by === 'ebpf' ? t('conn.notClosable') : null,
        stateHelp: connectionStateHelp(current.state, t)
      }
    : null;
}

export function connectionsExport(shown: Array<Connection & {network: string}>, names: OutboundNames) {
  return (
    [
      csvLine(['id', 'target', 'domain', 'source', 'network', 'state', 'outbound', 'chain', 'rule', 'upload_bytes', 'download_bytes', 'started_at']),
      ...shown.map(c =>
        csvLine([
          c.id,
          c.dst,
          c.domain,
          c.src,
          c.network,
          c.state,
          c.outbound,
          chainNames(c.chain, names).join(' > '),
          c.rule_expression,
          c.upload_bytes,
          c.download_bytes,
          c.started_at
        ])
      )
    ].join('\n') + '\n'
  );
}

// The contract's bulk close selects every live connection of a network and source; anything narrower (an
// outbound, rule or text filter, or a truncated list) closes the listed ids one by one. The ids travel with the
// bulk query so a 413 from the advertised limit can fall back to them without widening the confirmed scope.
export type CloseSelection = {ids: string[]; query?: NonNullable<BulkCloseQuery>};
export function closeSelection(
  shown: Connection[],
  scope: {network: string; src: string | undefined; narrowed: boolean; truncated: boolean; bulkLimit: number | null | undefined}
): CloseSelection {
  const ids = shown.map(c => c.id);
  const overLimit = scope.bulkLimit != null && ids.length > scope.bulkLimit;
  return scope.narrowed || scope.truncated || overLimit ? {ids} : {ids, query: {type: scope.network as 'all' | 'tcp' | 'udp', src: scope.src, all: true}};
}
