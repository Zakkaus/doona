import type {Connection} from '../../api/model';
import {parseU64} from '../../api/u64';
import type {Key} from '../../i18n/messages';
import type {SortDescriptor} from 'react-aria-components';

export const columns: Array<{id: string; label: Key; width: number; sortable?: boolean; align?: 'end'}> = [
  {id: 'dst', label: 'ui.target', width: 200, sortable: true},
  {id: 'src', label: 'ui.source', width: 136, sortable: true},
  {id: 'chain', label: 'conn.chain', width: 180},
  {id: 'rule', label: 'conn.rule', width: 220},
  {id: 'state', label: 'ui.state', width: 100, sortable: true},
  {id: 'down', label: 'ui.download', width: 112, align: 'end', sortable: true},
  {id: 'age', label: 'ui.started', width: 156, align: 'end', sortable: true}
];
export type ConnectionView = {hidden: string[]; sort: SortDescriptor | null; group: 'none' | 'source' | 'outbound'};
export type TableRow = {id: string; connection: Connection} | {id: number; group: string; children: Connection[]};
export const viewKey = 'doona-connections-view';

export function readView(): ConnectionView {
  const defaults: ConnectionView = {hidden: [], sort: null, group: 'none'};
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
      group: value.group === 'source' || value.group === 'outbound' ? value.group : 'none'
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
  const groups = new Map<string, Connection[]>();
  for (const row of sorted) {
    const key = (view.group === 'source' ? row.src : row.outbound) ?? '—';
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  return [...groups].map(([group, children], id) => ({id, group, children}));
}
