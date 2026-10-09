import {expect, it} from 'vitest';
import {connections} from '../../../mock/fixtures';
import {closeSelection, connectionDetail, connectionStateHelp, connectionsExport, filterMenu} from './view';
import {connectionsView} from './tableRows';
import {translate, type Translator} from '../../i18n';
const t: Translator = (key, params) => translate('en', key, params);

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
  const model = connectionsView([row], {...connections, visibility: 'partial'}, undefined, 'all', 'all', 'en-US', t);
  expect(connectionDetail(row, 'en-US', t, new Map(), false)?.flowQuery).toBe('tab=records&connection_id=a%2Fb');
  expect(
    connectionDetail(
      {...row, domain: 'example.com', dst: '[2001:db8::1]:443', src: '10.0.0.2:5353', network: 'udp', pname: 'curl'},
      'en-US',
      t,
      new Map(),
      false
    )?.traceQuery
  ).toBe('tab=trace&network=udp&domain=example.com&dst_ip=2001%3Adb8%3A%3A1&dst_port=443&src_ip=10.0.0.2&src_port=5353&pname=curl');
  expect(connectionDetail({...row, domain: null, dst: undefined}, 'en-US', t, new Map(), false)?.traceQuery).toBeNull();
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

it('folds the secondary filters into one menu that counts the ones in force', () => {
  const rows = connections.tcp.map(row => ({...row, network: 'tcp'}));
  const src = connections.tcp[0]!.src!.split(':')[0];
  const lists = connectionsView(rows, connections, src, 'all', 'all', 'en-US', t);
  const menu = filterMenu(lists, {network: 'tcp', out: 'all', src, rule: 'all'}, t);
  expect(menu.active).toBe(2);
  expect(menu.submenus.map(submenu => submenu.label)).toEqual(['Network protocol', 'Outbound', 'Device', 'Rule']);
  expect(menu.submenus.map(submenu => submenu.filter)).toEqual(['network', 'out', 'src', 'rule']);
  expect(menu.submenus.map(submenu => submenu.searchLabel)).toEqual([undefined, 'Filter outbounds', 'Filter devices', 'Filter rules']);
  const [network, , device, rule] = menu.submenus.map(submenu => submenu.sections[0]);
  expect(network.value).toBe('tcp');
  expect(device.items[0]).toEqual({id: 'src:', label: 'All devices'});
  expect(device.items.some(item => item.id === device.value)).toBe(true);
  expect(rule.items[0]).toEqual({id: 'rule:all', label: 'All rules'});
  expect(rule.value).toBe('rule:all');
  expect(filterMenu(lists, {network: 'all', out: 'all', src: undefined, rule: 'all'}, t).active).toBe(0);
  // An outbound a link filters by stays a choice while no open connection uses it.
  const idle = connectionsView(rows, connections, undefined, 'all', 'idle-group', 'en-US', t);
  expect(idle.outbounds.map(item => item.id)).toContain('idle-group');
  expect(lists.outbounds.map(item => item.id)).not.toContain('idle-group');
});

it('explains the states before a connection is established, and no other', () => {
  const help = connectionStateHelp('routing', t);
  expect(help?.title).toBe(t('ui.state'));
  expect(help?.text).toEqual([
    t('ui.valuePair', {label: t('conn.state.observed'), value: t('conn.stateHelp.observed')}),
    t('ui.valuePair', {label: t('conn.state.routing'), value: t('conn.stateHelp.routing')}),
    t('ui.valuePair', {label: t('conn.state.dialing'), value: t('conn.stateHelp.dialing')})
  ]);
  expect(connectionStateHelp('active', t)).toBeNull();
});

it.each([
  ['192.0.2.1:443', {ip: '192.0.2.1', address: '192.0.2.1:443'}],
  ['[2001:0DB8:0:0::1]:443', {ip: '2001:db8::1', address: '[2001:0DB8:0:0::1]:443'}],
  ['2001:db8::1', {ip: '2001:db8::1', address: '2001:db8::1'}],
  ['10.0.0.1:443', '10.0.0.1:443'],
  [undefined, '—']
])('prepares a lookup only in the public destination field: %s', (dst, value) => {
  const detail = connectionDetail({...connections.tcp[0], network: 'tcp', dst}, 'en-US', t, new Map(), false);
  expect(detail?.fields.find(([label]) => label === t('conn.f.dst'))?.[1]).toEqual(value);
});
