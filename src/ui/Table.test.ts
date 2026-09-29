import {expect, it} from 'vitest';
import {cachedRows, fitColumns} from './Table';

it('builds a row once per source object and keeps it across lists', () => {
  const built: string[] = [];
  const build = (item: {id: string}) => {
    built.push(item.id);
    return {label: item.id.toUpperCase()};
  };
  const cache = new WeakMap<{id: string}, {label: string}>();
  const a = {id: 'a'},
    b = {id: 'b'},
    c = {id: 'c'};
  const first = cachedRows(cache, [a, b, c], build);
  const narrowed = cachedRows(cache, [c, a], build);
  expect(narrowed).toEqual([first[2], first[0]]);
  expect(narrowed[0]).toBe(first[2]);
  const changed = {id: 'b'};
  const next = cachedRows(cache, [a, changed], build);
  expect(next[0]).toBe(first[0]);
  expect(next[1]).not.toBe(first[1]);
  expect(next[1]).toEqual(first[1]);
  expect(built).toEqual(['a', 'b', 'c', 'b']);
});

it('fits columns by the width alone, dropping one only below the sum of the minima', () => {
  const cols = [
    {id: 'target', minWidth: 200},
    {id: 'device', minWidth: 128, drop: 2},
    {id: 'rate', minWidth: 128, drop: 1}
  ];
  const ids = (width: number) => fitColumns(cols, width).map(column => column.id);
  expect(ids(456)).toEqual(['target', 'device', 'rate']);
  // The same width always gives the same columns, however often the table asks.
  expect(fitColumns(cols, 456)).toBe(fitColumns(cols, 456));
  expect(ids(455)).toEqual(['target', 'device']);
  expect(ids(455)).toEqual(ids(455));
  expect(ids(328)).toEqual(['target', 'device']);
  expect(ids(327)).toEqual(['target']);
});
