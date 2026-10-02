import {isBuiltinOutbound} from '../../dae/vocab';
import type {Connection, ConnectionList} from '../../api/model';
import {tagId} from '../shared/taggedId';
import {ranked} from '../shared/ranked';
import {enumLabel} from '../../i18n/enum';
import {addU64, parseU64} from '../../api/u64';
import {chainPath, connectionStates, nodeLabel, outboundLabel, sourceIp, type OutboundNames} from '../../api/selectors';
import {compareNames, formatBytes, formatRate} from '../../i18n/format';
import {formatNumber, type Translator as LabelFn} from '../../i18n';
import {ruleHref} from '../shared/link';
import {connectionKey, groupKey, groupName, groupRowId, type ConnectionView, type TableRow} from './viewState';

// Decorate, sort, undecorate: each item's key is computed once rather than on every comparison.
export function sortByKey<T, K>(items: T[], key: (item: T) => K, compare: (a: K, b: K) => number): T[] {
  return items
    .map(item => ({item, key: key(item)}))
    .sort((a, b) => compare(a.key, b.key))
    .map(entry => entry.item);
}

// Sorts and groups by what the table shows: a state sorts by its label, not the wire value.
export function tableRows(rows: Connection[], view: ConnectionView, locale: string, t: LabelFn): TableRow[] {
  let sorted = rows;
  if (view.sort) {
    const {column, direction} = view.sort;
    const byName = compareNames(locale);
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
      const order = typeof left === 'string' && typeof right === 'string' ? byName(left, right) : left < right ? -1 : left > right ? 1 : 0;
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
  nodeName: boolean;
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
      nodeName: !isBuiltinOutbound(c.outbound) && c.chain.length > 0,
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
  return tableRows(rows, view, locale, t).map(row =>
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
  // Every device and rule is listed, most connections first, and a long list is filtered in the menu; equal counts
  // keep one order across refreshes rather than the order the rows arrived in.
  const seen = (values: Array<string | null | undefined>) => {
    const present = values.flatMap(value => (value ? [value] : []));
    return ranked(present, Infinity).top;
  };
  const outboundItems = [{id: 'all', label: t('conn.allOutbounds')}, ...[...outbounds].map(id => ({id, label: outboundLabel(id, t)}))];
  return {
    networks: [
      ['all', t('ui.allCount', {n: rows.length})],
      ['tcp', t('ui.tcp')],
      ['udp', t('ui.udp')]
    ] as Array<[string, string]>,
    outbounds: outboundItems,
    // The same choices for the searchable picker, in one untitled section.
    outboundSections: [{id: 'outbounds', items: outboundItems}],
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
