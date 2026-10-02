import {expect, it} from 'vitest';
import type {Group} from '../src/api/model';
import {activateInventory} from './activation';

it('preserves groups by name across reorder and edits, replaces renamed or recreated IDs and resolves nested IDs', () => {
  const groups: Group[] = [];
  const apply = (text: string) => activateInventory(`group { ${text} }`, '41', [], groups, []);
  apply('a { policy: fixed(0) } b { policy: fixed(0) }');
  const [a, b] = groups.map(group => group.id);
  apply('b { policy: min } a { policy: fixed(0) }');
  expect(groups.map(group => group.id)).toEqual([b, a]);
  apply('c { policy: fixed(0) } a { policy: fixed(0) }');
  expect(groups[0].id).not.toBe(b);
  apply('b { policy: fixed(0) } a { filter: group(b) policy: fixed(0) }');
  expect(groups[0].id).not.toBe(b);
  expect(groups[1].id).toBe(a);
  expect(groups[1].members).toContainEqual({id: groups[0].id, name: 'b', kind: 'group'});
  apply('a { policy: min } b { policy: fixed(0) } a { policy: fixed(0) }');
  expect(groups.map(group => group.name)).toEqual(['b', 'a']);
  expect(groups[1].id).toBe(a);
  expect(groups[1].policy.native).toBe('fixed(0)');
});

it('keeps the visible ID for the last name occurrence as duplicates are added, reordered and removed', () => {
  const groups: Group[] = [];
  const apply = (text: string) => activateInventory(`group { ${text} }`, '41', [], groups, []);
  apply('dup { policy: min } dup { policy: fixed(0) } other { policy: min }');
  const id = groups.find(group => group.name === 'dup')!.id;
  for (const text of [
    'dup { policy: score } other { policy: min } dup { policy: min } dup { policy: fixed(0) }',
    'other { policy: min } dup { policy: fixed(0) } dup { policy: min }',
    'dup { policy: min } other { policy: min }'
  ]) {
    apply(text);
    expect(groups.find(group => group.name === 'dup')!.id).toBe(id);
  }
  apply('renamed { policy: min } other { policy: min }');
  expect(groups.find(group => group.name === 'renamed')!.id).not.toBe(id);
});
