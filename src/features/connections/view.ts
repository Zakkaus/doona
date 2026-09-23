import type {BulkCloseQuery, Connection, ConnectionList} from '../../api/model';
import {addU64, formatBytes, formatRate, parseU64} from '../../api/u64';
import {
  chainLabel,
  chainNames,
  connectionStates,
  localTime,
  outboundLabel,
  relativeStart,
  sourceIp,
  type MessageRef,
  type OutboundNames
} from '../../api/selectors';
import {formatNumber, type Translator as LabelFn} from '../../i18n';
import {word} from '../rules/flows/view';
import type {Key} from '../../i18n';
import type {SortDescriptor} from 'react-aria-components';
import {csvLine} from '../../ui/ui';
import {ruleHref} from '../rules/link';
import {within} from '../../shell/route';
const observers: Record<Connection['observed_by'], Key> = {userspace: 'conn.observed.userspace', ebpf: 'conn.observed.ebpf', mixed: 'conn.observed.mixed'};
export function connectionDetails(c: Connection, locale: string): Array<[Key, string | MessageRef]> {
  return [
    ['ui.source', c.src ?? '—'],
    ['conn.f.dst', c.dst ?? '—'],
    ['ui.domain', c.domain ?? '—'],
    ['conn.f.ingress', word(c.ingress)],
    ['conn.f.domainSource', word(c.domain_source)],
    ['ui.process', c.pname ?? '—'],
    ['conn.f.observedBy', observers[c.observed_by] ? {key: observers[c.observed_by]} : c.observed_by],
    ['ui.upload', formatBytes(c.upload_bytes)],
    ['ui.download', formatBytes(c.download_bytes)],
    ['conn.f.uploadRate', formatRate(c.upload_bytes_per_second)],
    ['conn.f.downloadRate', formatRate(c.download_bytes_per_second)],
    ['conn.f.started', localTime(c.started_at, locale)]
  ];
}

// `drop` orders which columns give way first when the table is narrower than the minima (see fitColumns);
// the target column always stays.
export const columns: Array<{id: string; label: Key; minWidth: number; sortable?: boolean; align?: 'end'; drop?: number}> = [
  {id: 'dst', label: 'ui.target', minWidth: 200, sortable: true},
  {id: 'src', label: 'ui.source', minWidth: 128, sortable: true, drop: 4},
  {id: 'chain', label: 'conn.chain', minWidth: 168, drop: 2},
  {id: 'rule', label: 'conn.rule', minWidth: 220, drop: 1},
  {id: 'state', label: 'ui.state', minWidth: 88, sortable: true, drop: 6},
  {id: 'down', label: 'ui.download', minWidth: 96, align: 'end', sortable: true, drop: 3},
  {id: 'age', label: 'ui.started', minWidth: 132, align: 'end', sortable: true, drop: 5}
];
export type ConnectionView = {hidden: string[]; sort: SortDescriptor | null; group: 'none' | 'source' | 'outbound'};
type GroupRow = {id: number; group: string; children: Connection[]; active: number; download: bigint | null};
type TableRow = {id: string; connection: Connection} | GroupRow;
export const viewKey = 'doona-connections-view';

export function readView(stored: string | null): ConnectionView {
  const defaults: ConnectionView = {hidden: [], sort: null, group: 'source'};
  try {
    const value = JSON.parse(stored ?? 'null');
    if (!value || typeof value !== 'object') return defaults;
    const hidden = columns.filter(column => Array.isArray(value.hidden) && value.hidden.includes(column.id)).map(column => column.id);
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

// Sorts and groups by what the table shows: a state sorts by its label, not the wire value.
export function tableRows(rows: Connection[], view: ConnectionView, locale: string, t: LabelFn): TableRow[] {
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
          return t(connectionStates[row.state]);
        case 'down':
          return parseU64(row.download_bytes);
        case 'age':
          return row.started_at ? Date.parse(row.started_at) : null;
        default:
          return null;
      }
    };
    const collator = new Intl.Collator(locale, {numeric: true});
    sorted = [...rows].sort((a, b) => {
      const left = value(a),
        right = value(b);
      if (left == null) return right == null ? 0 : 1;
      if (right == null) return -1;
      const order = typeof left === 'string' && typeof right === 'string' ? collator.compare(left, right) : left < right ? -1 : left > right ? 1 : 0;
      return direction === 'descending' ? -order : order;
    });
  }
  if (view.group === 'none') return sorted.map(connection => ({id: connection.id, connection}));
  // Source groups key on the address without the port, so one client is one group.
  const groups = new Map<string, Connection[]>();
  for (const row of sorted) {
    const key = view.group === 'source' ? (sourceIp(row.src ?? undefined) ?? row.src ?? '—') : outboundLabel(row.outbound, t);
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  return [...groups].map(([group, children], id) => ({
    id,
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
  chain: string;
  rule: {expression: string | null; href: string | undefined};
  recomputed: string | null;
  state: string;
  download: string;
  age: string;
};
type ConnectionGroupView = {id: number; group: string; children: ConnectionRowView[]; label: string; totals: Record<string, string>};
export type ConnectionTableRow = {id: string; connection: ConnectionRowView} | ConnectionGroupView;
export function connectionTableView(
  rows: Connection[],
  view: ConnectionView,
  locale: string,
  names: OutboundNames,
  rulesListed: boolean,
  t: LabelFn,
  now = Date.now()
): ConnectionTableRow[] {
  const project = (c: Connection): ConnectionRowView => ({
    id: c.id,
    target: c.domain || c.dst || '—',
    source: c.src ?? '—',
    chain: chainLabel(c, t, names),
    rule: {expression: c.rule_expression, href: ruleHref(c.rule_id, rulesListed)},
    recomputed: c.rule_source === 'recomputed' ? t('conn.recomputed') : null,
    state: t(connectionStates[c.state]),
    download: formatBytes(c.download_bytes),
    age: relativeStart(c.started_at, locale, now)
  });
  return tableRows(rows, view, locale, t).map(row =>
    'connection' in row
      ? {id: row.id, connection: project(row.connection)}
      : {
          id: row.id,
          group: row.group,
          children: row.children.map(project),
          label: t('conn.groupCount', {name: row.group, n: row.children.length}),
          totals: {down: formatBytes(row.download), state: t('conn.activeCount', {n: row.active})}
        }
  );
}

export function connectionsView(
  rows: Array<Connection & {network: string}>,
  current: (Connection & {network: string}) | undefined,
  data: ConnectionList | undefined,
  src: string | undefined,
  rule: string,
  locale: string,
  t: LabelFn,
  names: OutboundNames,
  rulesListed: boolean
) {
  const seen = (values: Array<string | null | undefined>) => {
    const counts = new Map<string, number>();
    for (const value of values) if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  };
  return {
    networks: [
      ['all', t('ui.allCount', {n: rows.length})],
      ['tcp', t('ui.tcp')],
      ['udp', t('ui.udp')]
    ] as Array<[string, string]>,
    outbounds: [
      {id: 'all', label: t('conn.allOutbounds')},
      ...[...new Set(rows.flatMap(c => (c.outbound ? [c.outbound] : [])))].map(id => ({id, label: outboundLabel(id, t)}))
    ],
    picks: [
      {
        title: t('ui.source'),
        value: 'src:' + src,
        items: seen(rows.map(c => sourceIp(c.src))).map(([ip, n]) => ({id: 'src:' + ip, label: ip, desc: formatNumber(n, locale)}))
      },
      {
        title: t('conn.rule'),
        value: 'rule:' + rule,
        items: seen(rows.map(c => c.rule_expression)).map(([expression, n]) => ({id: 'rule:' + expression, label: expression, desc: formatNumber(n, locale)}))
      }
    ],
    visibility: data && data.visibility !== 'full' ? t(data.visibility === 'none' ? 'conn.visibilityNone' : 'conn.visibilityPartial') : null,
    detail: current
      ? {
          id: current.id,
          title: current.domain || current.dst || current.id,
          tone: current.state === 'blocked' || current.state === 'failed' ? ('err' as const) : current.state === 'active' ? ('ok' as const) : ('info' as const),
          status: t('ui.aside', {text: t(connectionStates[current.state]), note: current.network.toUpperCase()}),
          chain: chainLabel(current, t, names),
          outbound: outboundLabel(current.outbound, t),
          rule: {expression: current.rule_expression, href: ruleHref(current.rule_id, rulesListed)},
          fields: connectionDetails(current, locale).map(
            ([key, value]) => [t(key), typeof value === 'string' ? value : t(value.key, value.params)] as [string, string]
          ),
          flowQuery: within('', {tab: 'flows', ...(current.flow_id ? {id: current.flow_id} : {connection_id: current.id})}),
          source: current.src ? (sourceIp(current.src) ?? current.src) : null,
          closable: current.state === 'active' || current.state === 'dialing' || current.state === 'routing'
        }
      : null
  };
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
