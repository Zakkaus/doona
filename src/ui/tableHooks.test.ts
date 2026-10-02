import {expect, it} from 'vitest';
import {cachedRows, fitColumns, revealScrollTop} from './tableHooks';

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

it('reveals the complete measured row while preserving an already visible row', () => {
  expect(revealScrollTop(0, 200, {y: 157, height: 80})).toBe(37);
  expect(revealScrollTop(120, 200, {y: 97, height: 80})).toBe(60);
  expect(revealScrollTop(60, 200, {y: 137, height: 80})).toBe(60);
  expect(revealScrollTop(0, 200, {y: 157, height: 40})).toBe(0);
});

it('fits the complete text column before horizontally scrolling secondary phone columns', () => {
  const cols = [
    {id: 'position', minWidth: 40},
    {id: 'expression', minWidth: 320, text: 'wrap' as const},
    {id: 'source', minWidth: 160, drop: 1}
  ];
  const fitted = fitColumns(cols, 324, true);
  expect(fitted.map(column => column.minWidth)).toEqual([40, 284, 160]);
  expect(fitted.map(column => column.id)).toEqual(['position', 'expression', 'source']);
  expect(fitColumns(cols, 700, true)).toEqual(cols);
  expect(cols[1].minWidth).toBe(320);
});
