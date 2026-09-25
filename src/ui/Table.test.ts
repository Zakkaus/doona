import {expect, it} from 'vitest';
import {cachedRows} from './Table';

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
