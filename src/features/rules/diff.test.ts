import {expect, it} from 'vitest';
import {lineDiff} from './diff';

it('shows each change with its context and counts the unchanged lines between', () => {
  const before = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].join('\n');
  const after = ['a', 'B', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].join('\n');
  expect(lineDiff(before, after, 1)).toEqual([
    {kind: 'same', text: 'a'},
    {kind: 'del', text: 'b'},
    {kind: 'add', text: 'B'},
    {kind: 'same', text: 'c'},
    {kind: 'gap', count: 5},
    {kind: 'same', text: 'i'},
    {kind: 'add', text: 'j'}
  ]);
});

it('gives nothing for equal texts', () => {
  expect(lineDiff('a\nb', 'a\nb')).toEqual([]);
});
