import {expect, it} from 'vitest';
import {cardGroup, chartedRates, shareRows} from './Contents';
const groups = [
  {id: 'auto', policy: {kind: 'urltest'}},
  {id: 'proxy', policy: {kind: 'selector'}},
  {id: 'media', policy: {kind: 'selector'}}
];
it.each([
  ['the chosen group', 'media', 'media'],
  ['the first manual group without a choice', undefined, 'proxy'],
  ['the first manual group when the choice is gone', 'removed', 'proxy']
])('picks %s', (_name, chosen, expected) => expect(cardGroup(groups, chosen)?.id).toBe(expected));
it('finds nothing without a manual group, so the card offers to create one', () => expect(cardGroup(groups.slice(0, 1), undefined)).toBeUndefined());
it.each([
  [
    'splits the total among the rows with a value',
    [
      {name: 'a', count: 3},
      {name: 'b', count: 1},
      {name: 'c', count: 0}
    ],
    [75, 25],
    ['#0', '#1']
  ],
  [
    'keeps a share measured against a larger total',
    [
      {name: 'a', count: 3, percent: 30},
      {name: 'b', count: 1, color: 'red'}
    ],
    [30, 25],
    ['#0', 'red']
  ]
])('%s', (_name, rows, pct, colors) => {
  const shares = shareRows(rows, ['#0', '#1']);
  expect(shares.rows.map(row => row.pct)).toEqual(pct);
  expect(shares.rows.map(row => row.color)).toEqual(colors);
});
it('has no total without a row that has a value, so the card shows its empty text', () => expect(shareRows([{name: 'a', count: 0}], []).total).toBe(0));
it.each([
  ['a charted rate widget leaves its rates to the legend', 'speed', 'medium', 'sparkline', true],
  ['a large area chart', 'history', 'large', 'area', true],
  ['one direction charted', 'download', 'medium', 'area', true],
  ['the key-value form lists the rates itself', 'speed', 'medium', 'kv', false],
  ['a small widget has no chart', 'speed', 'small', 'sparkline', false],
  ['cumulative traffic is not a rate', 'traffic', 'medium', 'kv', false]
] as const)('%s', (_name, id, size, form, expected) => expect(chartedRates({id, size}, form)).toBe(expected));
