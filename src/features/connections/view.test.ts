import {expect, it} from 'vitest';
import {connections} from '../../api/mock/fixtures';
import {
  closeSelection,
  columns,
  connectionDetail,
  connectionDetails,
  connectionsExport,
  connectionsView,
  filterMenu,
  connectionTableView,
  readView,
  sortByKey,
  tableRows,
  type ConnectionView
} from './view';
import {parseU64} from '../../api/u64';
import {fitColumns} from '../../ui/ui';
import {formatRate} from '../../i18n/format';
import {translate, type Translator} from '../../i18n';
const t: Translator = (key, params) => translate('en', key, params);

it('groups by client address without losing IPv6 hosts or UInt64 precision', () => {
  const c = connections.tcp[0];
  const rows = tableRows(
    [
      {...c, id: 'a', src: '[2001:db8::1]:123', download_bytes: '9007199254740993'},
      {...c, id: 'b', src: '[2001:db8::1]:456', download_bytes: '7', outbound: 'direct'},
      {...c, id: 'c', src: '10.0.0.7:123', download_bytes: null},
      {...c, id: 'd', src: '10.0.0.7:456', state: 'closed', download_bytes: '2'}
    ],
    {hidden: [], sort: null, group: 'source'},
    'en-US',
    t
  );
  expect(rows.map(row => ('group' in row ? [row.group, row.children.length, row.active, row.download] : row.id))).toEqual([
    ['2001:db8::1', 2, 2, 9007199254741000n],
    ['10.0.0.7', 2, 1, null]
  ]);
});

it('groups, sorts and describes by the displayed labels', () => {
  const c = connections.tcp[0];
  const list = [
    {...c, id: 'a', outbound: 'direct', state: 'dialing' as const},
    {...c, id: 'b', outbound: null, state: 'active' as const},
    {...c, id: 'c', outbound: 'unknown', state: 'blocked' as const}
  ];
  const groups = tableRows(list, {hidden: [], sort: null, group: 'outbound'}, 'en-US', t);
  expect(groups.map(row => ('group' in row ? [row.group, row.children.length] : row.id))).toEqual([
    [t('ui.direct'), 1],
    [t('ui.unknown'), 2]
  ]);
  const sorted = tableRows(list, {hidden: [], sort: {column: 'state', direction: 'ascending'}, group: 'none'}, 'en-US', t);
  expect(sorted.map(row => row.id)).toEqual(
    [...list].sort((x, y) => t(`conn.state.${x.state}`).localeCompare(t(`conn.state.${y.state}`), 'en-US')).map(row => row.id)
  );
  const fields = connectionDetails({...c, observed_by: 'ebpf'}, 'en-US');
  expect(fields.find(([key]) => key === 'conn.f.observedBy')?.[1]).toEqual({key: 'conn.observed.ebpf'});
});

it('computes each sort key once and keeps equal keys in their order', () => {
  const seen: string[] = [];
  const items = ['b2', 'a1', 'b1', 'a2', 'c1'];
  const sorted = sortByKey(
    items,
    item => {
      seen.push(item);
      return item[0];
    },
    (a, b) => a.localeCompare(b)
  );
  expect(sorted).toEqual(['a1', 'a2', 'b2', 'b1', 'c1']);
  expect(seen).toEqual(items);
  expect(items).toEqual(['b2', 'a1', 'b1', 'a2', 'c1']);
});

it('sorts every column as comparing the displayed values pairwise would', () => {
  const c = connections.tcp[0];
  const states = ['active', 'closed', 'blocked', 'dialing'] as const;
  const list = Array.from({length: 40}, (_, i) => ({
    ...c,
    id: 'r' + i,
    domain: i % 5 === 0 ? null : `host${(i * 7) % 13}.example`,
    dst: i % 9 === 0 ? undefined : `10.0.0.${i % 6}:443`,
    src: i % 11 === 0 ? undefined : `192.168.1.${(i * 3) % 8}:${1000 + i}`,
    state: states[i % states.length],
    download_bytes: i % 7 === 0 ? null : String((i * 7919) % 23),
    download_bytes_per_second: i % 6 === 0 ? null : String((i * 104729) % 100003),
    started_at: i % 8 === 0 ? null : i % 13 === 0 ? 'not a time' : new Date(Date.UTC(2026, 0, 1, 0, (i * 17) % 29)).toISOString()
  }));
  const shown = (row: (typeof list)[number], column: string) =>
    column === 'dst'
      ? row.domain || row.dst
      : column === 'src'
        ? row.src
        : column === 'state'
          ? t(`conn.state.${row.state}`)
          : column === 'down'
            ? parseU64(row.download_bytes)
            : column === 'downRate'
              ? parseU64(row.download_bytes_per_second)
              : row.started_at
                ? Date.parse(row.started_at)
                : null;
  const collator = new Intl.Collator('en-US', {numeric: true});
  for (const column of columns.filter(column => column.sortable).map(column => column.id))
    for (const direction of ['ascending', 'descending'] as const) {
      const expected = [...list].sort((a, b) => {
        const left = shown(a, column),
          right = shown(b, column);
        if (left == null) return right == null ? 0 : 1;
        if (right == null) return -1;
        const order = typeof left === 'string' && typeof right === 'string' ? collator.compare(left, right) : left < right ? -1 : left > right ? 1 : 0;
        return direction === 'descending' ? -order : order;
      });
      const sorted = tableRows(list, {hidden: [], sort: {column, direction}, group: 'none'}, 'en-US', t);
      expect(sorted.map(row => row.id)).toEqual(expected.map(row => row.id));
    }
});

it('sorts the download rate by value, with unknown rates last', () => {
  const c = connections.tcp[0];
  const list = ['900', null, '10000', '0'].map((rate, i) => ({...c, id: 'r' + i, download_bytes_per_second: rate}));
  const order = (direction: 'ascending' | 'descending') =>
    tableRows(list, {hidden: [], sort: {column: 'downRate', direction}, group: 'none'}, 'en-US', t).map(row => row.id);
  expect(order('descending')).toEqual(['r2', 'r0', 'r3', 'r1']);
  expect(order('ascending')).toEqual(['r3', 'r0', 'r2', 'r1']);
  const [row] = connectionTableView(list.slice(2, 3), {hidden: [], sort: null, group: 'none'}, 'en-US', new Map(), false, t);
  expect('connection' in row && row.connection.downloadRate).toBe(formatRate('10000', 'en-US'));
});

it('drops columns by priority until the minimum widths fit, keeping the target', () => {
  const ids = (width: number | null, hidden: string[] = []) =>
    fitColumns(
      columns.filter(column => !hidden.includes(column.id)),
      width
    ).map(column => column.id);
  expect(ids(null)).toEqual(['dst', 'src', 'node', 'rule', 'state', 'down', 'downRate', 'age']);
  expect(ids(1112)).toEqual(['dst', 'src', 'node', 'rule', 'state', 'down', 'downRate', 'age']);
  // The rate goes first, before any column the table had without it.
  expect(ids(1032)).toEqual(['dst', 'src', 'node', 'rule', 'state', 'down', 'age']);
  expect(ids(942)).toEqual(['dst', 'src', 'node', 'state', 'down', 'age']);
  expect(ids(726)).toEqual(['dst', 'src', 'state', 'down', 'age']);
  expect(ids(726, ['down'])).toEqual(['dst', 'src', 'node', 'state', 'age']);
  expect(ids(100)).toEqual(['dst']);
});

it('rejects corrupt saved preferences and prevents hiding every column', () => {
  expect(readView('{')).toEqual({hidden: [], sort: null, group: 'source'});
  expect(readView(JSON.stringify({hidden: columns.map(column => column.id), sort: {column: 'bogus', direction: 'ascending'}}))).toMatchObject({
    hidden: [],
    sort: null
  });
  expect(readView(JSON.stringify({hidden: ['rule', 'bogus'], group: 'none', sort: {column: 'down', direction: 'descending'}}))).toEqual({
    hidden: ['rule'],
    group: 'none',
    sort: {column: 'down', direction: 'descending'}
  });
});

it('prepares grouped cells and rule-link availability without losing unknown counters', () => {
  const row = {...connections.tcp[0], src: undefined, domain: undefined, dst: undefined, download_bytes: null, rule_source: 'recomputed' as const};
  const collection = connectionTableView([row], {hidden: [], sort: null, group: 'source'}, 'en-US', new Map(), false, t);
  const group = collection[0];
  expect('children' in group).toBe(true);
  if (!('children' in group)) throw new Error('Expected client group');
  expect(group.children[0]).toMatchObject({target: '—', source: '—', download: '—', rule: {href: undefined}});
  expect(group.totals.down).toBe('—');
  expect(connectionDetails(row, 'en-US')).toContainEqual(['ui.device', '—']);
});

it('captures IDs without expanding the confirmed selection when live rows arrive', () => {
  const rows = connections.tcp.slice(0, 2);
  const scope = {network: 'tcp', src: undefined, narrowed: true, truncated: false, bulkLimit: 1000};
  const selection = closeSelection(rows, scope);
  rows.push({...rows[0], id: 'later'});
  expect(selection).toEqual({ids: connections.tcp.slice(0, 2).map(row => row.id)});
  expect(closeSelection(rows, {...scope, narrowed: false, src: '10.0.0.7'})).toEqual({
    ids: rows.map(row => row.id),
    query: {type: 'tcp', src: '10.0.0.7', all: true}
  });
  expect(closeSelection(rows, {...scope, narrowed: false, truncated: true}).query).toBeUndefined();
  expect(closeSelection(rows, {...scope, narrowed: false, bulkLimit: 1}).query).toBeUndefined();
});

it('prepares fallback flow links and exports only visible raw counters', () => {
  const row = {...connections.tcp[0], network: 'tcp', id: 'a/b', flow_id: null, download_bytes: '9007199254740993'};
  const model = connectionsView([row], {...connections, visibility: 'partial'}, undefined, 'all', 'en-US', t);
  expect(connectionDetail(row, 'en-US', t, new Map(), false)?.flowQuery).toBe('tab=flows&connection_id=a%2Fb');
  expect(connectionsExport([row], new Map())).toContain('9007199254740993');
  expect(model.visibility).toBe(t('conn.visibilityPartial'));
});

it('keeps resolved routing diagnostics in details when table columns are hidden', () => {
  const row = {
    ...connections.tcp[0],
    network: 'tcp',
    outbound: 'proxy',
    chain: ['group-id', 'node-id'],
    rule_expression: 'domain(example.com)',
    rule_id: 'rule-1'
  };
  const names = new Map([
    ['group-id', 'proxy'],
    ['node-id', 'HK']
  ]);
  const detail = connectionDetail(row, 'en-US', t, names, true);
  expect(detail?.chain).toBe('proxy → HK');
  expect(detail?.outbound).toBe('proxy');
  expect(detail?.rule).toEqual({expression: 'domain(example.com)', href: '#/rules?tab=list&rule=rule-1'});
});

it('shows only the leaf node in the table and keeps the full path for the tooltip', () => {
  const names = new Map([
    ['group-id', 'proxy'],
    ['node-id', 'HK']
  ]);
  const base = {...connections.tcp[0], network: 'tcp'};
  const rows = [
    {...base, id: 'a', outbound: 'proxy', chain: ['group-id', 'node-id']},
    {...base, id: 'b', outbound: 'proxy', chain: []},
    {...base, id: 'c', outbound: 'direct', chain: []},
    {...base, id: 'd', outbound: null, chain: []}
  ];
  const view = connectionTableView(rows, {hidden: [], sort: null, group: 'none'}, 'en-US', names, true, t);
  const cells = view.flatMap(row => ('connection' in row ? [row.connection] : row.children)).map(c => [c.node, c.path]);
  expect(cells).toEqual([
    ['HK', 'proxy → HK'],
    ['proxy', null],
    [t('ui.direct'), null],
    ['—', null]
  ]);
});

it('keeps a column hidden that was saved under its old chain id', () => {
  expect(readView(JSON.stringify({hidden: ['chain', 'rule'], sort: null, group: 'none'})).hidden).toEqual(['node', 'rule']);
});

it('reuses a projected row until the connection or a label input changes', () => {
  const row = {...connections.tcp[0], id: 'kept'};
  const view: ConnectionView = {hidden: [], sort: null, group: 'none'};
  const names = new Map();
  const project = (list: (typeof row)[], locale = 'en-US', listed = true, translate = t) =>
    connectionTableView(list, view, locale, names, listed, translate).map(item => ('connection' in item ? item.connection : null));
  const [first] = project([row]);
  expect(project([row])[0]).toBe(first);
  expect(project([{...row}])[0]).not.toBe(first);
  expect(project([{...row}])[0]).toEqual(first);
  expect(project([row], 'zh-CN')[0]).not.toBe(first);
  expect(project([row], 'en-US', false)[0]).not.toBe(first);
  const other: Translator = (key, params) => translate('zh-CN', key, params);
  expect(project([row], 'en-US', true, other)[0]?.state).toBe(other(`conn.state.${row.state}`));
});

it('folds the secondary filters into one menu that counts the ones in force', () => {
  const rows = connections.tcp.map(row => ({...row, network: 'tcp'}));
  const src = connections.tcp[0]!.src!.split(':')[0];
  const lists = connectionsView(rows, connections, src, 'all', 'en-US', t);
  const menu = filterMenu(lists, {network: 'tcp', out: 'all', src, rule: 'all'}, t);
  expect(menu.active).toBe(2);
  expect(menu.submenus.map(submenu => submenu.label)).toEqual(['Network protocol', 'Outbound', 'Device', 'Rule']);
  expect(menu.submenus.map(submenu => submenu.filter)).toEqual(['network', 'out', 'src', 'rule']);
  const [network, , device, rule] = menu.submenus.map(submenu => submenu.sections[0]);
  expect(network.value).toBe('tcp');
  expect(device.items[0]).toEqual({id: 'src:', label: 'All devices'});
  expect(device.items.some(item => item.id === device.value)).toBe(true);
  expect(rule.items[0]).toEqual({id: 'rule:all', label: 'All rules'});
  expect(rule.value).toBe('rule:all');
  expect(filterMenu(lists, {network: 'all', out: 'all', src: undefined, rule: 'all'}, t).active).toBe(0);
});
