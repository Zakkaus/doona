import type {Connection} from '../../api/model';
import {addU64, formatBytes, formatRate, parseU64} from '../../api/u64';
import {localTime, sourceIp, type MessageRef} from '../../api/selectors';
import {word} from '../flows/view';
import type {Key} from '../../i18n/messages';
import type {SortDescriptor} from 'react-aria-components';
export function connectionDetails(c: Connection, locale: string): Array<[Key, string | MessageRef]> {
  return [
    ['ui.source', c.src ?? '—'],
    ['conn.f.dst', c.dst ?? '—'],
    ['ui.domain', c.domain ?? '—'],
    ['conn.f.ingress', word(c.ingress)],
    ['conn.f.domainSource', word(c.domain_source)],
    ['ui.process', c.pname ?? '—'],
    ['conn.f.observedBy', c.observed_by],
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
export type GroupRow = {id: number; group: string; children: Connection[]; active: number; download: bigint | null};
export type TableRow = {id: string; connection: Connection} | GroupRow;
export const viewKey = 'doona-connections-view';

export function readView(): ConnectionView {
  const defaults: ConnectionView = {hidden: [], sort: null, group: 'source'};
  try {
    const value = JSON.parse(localStorage.getItem(viewKey) ?? 'null');
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

export function tableRows(rows: Connection[], view: ConnectionView, locale: string): TableRow[] {
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
          return row.state;
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
    const key = (view.group === 'source' ? (sourceIp(row.src ?? undefined) ?? row.src) : row.outbound) ?? '—';
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
