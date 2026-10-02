import type {Connection} from '../../api/model';
import {storageKeys} from '../../api/storage';
import {sourceIp, outboundLabel} from '../../api/selectors';
import type {Key, Translator as LabelFn} from '../../i18n';
import type {SortDescriptor} from 'react-aria-components';

// `drop` orders which columns give way first when a table wider than a phone is narrower than the minima (see fitColumns);
// the target column always stays.
export const columns: Array<{id: string; label: Key; minWidth: number; sortable?: boolean; drop?: number}> = [
  {id: 'dst', label: 'ui.target', minWidth: 200, sortable: true},
  {id: 'src', label: 'ui.device', minWidth: 128, sortable: true, drop: 5},
  {id: 'node', label: 'conn.node', minWidth: 120, drop: 3},
  {id: 'rule', label: 'conn.rule', minWidth: 220, drop: 2},
  {id: 'state', label: 'ui.state', minWidth: 112, sortable: true, drop: 7},
  {id: 'down', label: 'ui.download', minWidth: 96, sortable: true, drop: 4},
  {id: 'downRate', label: 'conn.f.downloadRate', minWidth: 128, sortable: true, drop: 1},
  {id: 'age', label: 'ui.started', minWidth: 132, sortable: true, drop: 6}
];
export type ConnectionView = {hidden: string[]; sort: SortDescriptor | null; group: 'none' | 'source' | 'outbound'};
export type GroupRow = {id: string; group: string; children: Connection[]; active: number; download: bigint | null};
export type TableRow = {id: string; connection: Connection} | GroupRow;
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
export const groupKey = (row: Connection, group: Exclude<ConnectionView['group'], 'none'>) =>
  group === 'source' ? (sourceIp(row.src ?? undefined) ?? row.src ?? '—') : (row.outbound ?? 'unknown');
export const groupName = (key: string, group: Exclude<ConnectionView['group'], 'none'>, t: LabelFn) => (group === 'source' ? key : outboundLabel(key, t));

// Groups and connections share the table's keys. A group's key is its own key after `g:`; a connection keeps its id
// as its key, the way links and the selection name it, unless the id could read as a group's key or as an escaped
// one, which is escaped with a backslash.
export const groupRowId = (group: string) => 'g:' + group;
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
