import {expect, it, vi} from 'vitest';
import {connections} from '../../api/mock/fixtures';
import {columns, readView, tableRows} from './view';

it('sorts UInt64 downloads exactly with unknown values last in both directions', () => {
  const seed = connections.tcp[0];
  const rows = [
    {...seed, id: 'larger', download_bytes: '9007199254740993'},
    {...seed, id: 'unknown', download_bytes: null},
    {...seed, id: 'smaller', download_bytes: '9007199254740992'}
  ];
  expect(tableRows(rows, {hidden: [], group: 'none', sort: {column: 'down', direction: 'ascending'}}, 'en').map(row => row.id)).toEqual([
    'smaller',
    'larger',
    'unknown'
  ]);
  expect(tableRows(rows, {hidden: [], group: 'none', sort: {column: 'down', direction: 'descending'}}, 'en').map(row => row.id)).toEqual([
    'larger',
    'smaller',
    'unknown'
  ]);
});

it('sorts start times chronologically rather than by their displayed age', () => {
  const seed = connections.tcp[0];
  const rows = [
    {...seed, id: 'new', started_at: '2026-09-16T00:00:00Z'},
    {...seed, id: 'unknown', started_at: null},
    {...seed, id: 'old', started_at: '2026-09-15T00:00:00Z'}
  ];
  expect(tableRows(rows, {hidden: [], group: 'none', sort: {column: 'age', direction: 'ascending'}}, 'en').map(row => row.id)).toEqual([
    'old',
    'new',
    'unknown'
  ]);
});

it('keeps a usable table when stored view settings are invalid', () => {
  vi.stubGlobal('localStorage', {
    getItem: () => JSON.stringify({hidden: columns.map(column => column.id), sort: {column: 'rule', direction: 'ascending'}, group: 'invalid'})
  });
  try {
    expect(readView()).toEqual({hidden: [], sort: null, group: 'none'});
  } finally {
    vi.unstubAllGlobals();
  }
});
