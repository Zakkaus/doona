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

it('diffs a long file changed at its end without a table the size of both files', () => {
  const lines = Array.from({length: 50_000}, (_, index) => `line ${index}`);
  const out = lineDiff(lines.join('\n'), [...lines.slice(0, -1), 'changed'].join('\n'));
  expect(out).toEqual([
    {kind: 'gap', count: 49_997},
    {kind: 'same', text: 'line 49997'},
    {kind: 'same', text: 'line 49998'},
    {kind: 'del', text: 'line 49999'},
    {kind: 'add', text: 'changed'}
  ]);
});

it('shows a large rewritten stretch as its old lines replaced by its new ones', () => {
  const before = Array.from({length: 3000}, (_, index) => `old ${index % 7}`);
  const after = Array.from({length: 3000}, (_, index) => `new ${index % 5} old ${index % 7}`);
  const out = lineDiff(['top', ...before, 'end'].join('\n'), ['top', ...after, 'end'].join('\n'));
  expect(out.filter(line => line.kind === 'del')).toHaveLength(3000);
  expect(out.filter(line => line.kind === 'add')).toHaveLength(3000);
  expect(out.findIndex(line => line.kind === 'add')).toBe(out.findIndex(line => line.kind === 'del') + 3000);
});
