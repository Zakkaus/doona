import {expect, it} from 'vitest';
import {connections} from '../../api/mock/fixtures';
import {columns, tableRows} from './view';
import {fitColumns} from '../../ui/ui';

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
    'en-US'
  );
  expect(rows.map(row => ('group' in row ? [row.group, row.children.length, row.active, row.download, row.outbounds] : row.id))).toEqual([
    ['2001:db8::1', 2, 2, 9007199254741000n, ['proxy', 'direct']],
    ['10.0.0.7', 2, 1, null, ['proxy']]
  ]);
});

it('drops columns by priority until the minimum widths fit, keeping the target', () => {
  const ids = (width: number | null, hidden: string[] = []) =>
    fitColumns(
      columns.filter(column => !hidden.includes(column.id)),
      width
    ).map(column => column.id);
  expect(ids(null)).toEqual(['dst', 'src', 'chain', 'rule', 'state', 'down', 'age']);
  expect(ids(1032)).toEqual(['dst', 'src', 'chain', 'rule', 'state', 'down', 'age']);
  expect(ids(942)).toEqual(['dst', 'src', 'chain', 'state', 'down', 'age']);
  expect(ids(726)).toEqual(['dst', 'src', 'state', 'down', 'age']);
  expect(ids(726, ['down'])).toEqual(['dst', 'src', 'chain', 'state', 'age']);
  expect(ids(100)).toEqual(['dst']);
});
