import {expect, it} from 'vitest';
import {ranked} from './ranked';

it('keeps the largest counts and totals the rest', () => {
  expect(ranked(['x', 'y', 'y', 'z'], 1)).toEqual({top: [{key: 'y', count: 2}], rest: 2});
});

it('breaks ties the same way whatever order the keys arrive in, with a missing key last', () => {
  expect(ranked(['b', null, 'a'], 3).top.map(item => item.key)).toEqual(['a', 'b', null]);
  expect(ranked(['a', 'b'], 2)).toEqual(ranked(['b', 'a'], 2));
});
