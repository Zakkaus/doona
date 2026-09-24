import {expect, it} from 'vitest';
import {connections} from '../../api/mock/fixtures';
import {closeSelection, columns, connectionDetails, connectionsExport, connectionsView, connectionTableView, readView, tableRows} from './view';
import {fitColumns} from '../../ui/ui';
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

it('drops columns by priority until the minimum widths fit, keeping the target', () => {
  const ids = (width: number | null, hidden: string[] = []) =>
    fitColumns(
      columns.filter(column => !hidden.includes(column.id)),
      width
    ).map(column => column.id);
  expect(ids(null)).toEqual(['dst', 'src', 'node', 'rule', 'state', 'down', 'age']);
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
  const model = connectionsView([row], row, {...connections, visibility: 'partial'}, undefined, 'all', 'en-US', t, new Map(), false);
  expect(model.detail?.flowQuery).toBe('tab=flows&connection_id=a%2Fb');
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
  const detail = connectionsView([row], row, connections, undefined, 'all', 'en-US', t, names, true).detail;
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
