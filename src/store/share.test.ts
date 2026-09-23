import {expect, it} from 'vitest';
import {replaceEqualDeep} from './share';

it('returns the previous object for an equal one, however deep', () => {
  const previous = {a: 1, list: [{id: 'x', n: 1}], nested: {deep: {v: 'y'}}};
  expect(replaceEqualDeep(previous, structuredClone(previous))).toBe(previous);
});

it('copies only the path to a change and keeps every other subtree', () => {
  const previous = {
    list: [
      {id: 'x', n: 1},
      {id: 'y', n: 2}
    ],
    other: {v: 1}
  };
  const next = structuredClone(previous);
  next.list[1].n = 3;
  const shared = replaceEqualDeep(previous, next);
  expect(shared).not.toBe(previous);
  expect(shared).toEqual(next);
  expect(shared.other).toBe(previous.other);
  expect(shared.list[0]).toBe(previous.list[0]);
  expect(shared.list[1]).not.toBe(previous.list[1]);
});

it('treats added, removed and reordered entries as changes', () => {
  const previous = {list: [1, 2], a: 1} as Record<string, unknown>;
  expect(replaceEqualDeep(previous, {list: [1, 2, 3], a: 1})).not.toBe(previous);
  expect(replaceEqualDeep(previous, {list: [2, 1], a: 1})).not.toBe(previous);
  expect(replaceEqualDeep(previous, {list: [1, 2]})).not.toBe(previous);
  expect(replaceEqualDeep(previous, {list: [1, 2], a: 1, b: undefined})).not.toBe(previous);
});

it('compares only plain objects and arrays structurally', () => {
  const when = new Date(0);
  expect(replaceEqualDeep({when}, {when: new Date(0)}).when).not.toBe(when);
  expect(replaceEqualDeep(undefined, {a: 1})).toEqual({a: 1});
  expect(replaceEqualDeep({a: NaN}, {a: NaN})).toEqual({a: NaN});
});
