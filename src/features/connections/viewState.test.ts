import {expect, it} from 'vitest';
import {connections} from '../../../mock/fixtures';
import {collapseAll, columns, isCollapsed, revealTarget, readView, toggleGroup} from './viewState';

it('unfolds a selected connection again when it moves to another group, and only then', () => {
  const c = {...connections.tcp[0], id: 'moving', outbound: null};
  const before = revealTarget(c, 'outbound')!;
  expect(before.group).toBe('unknown');
  expect(revealTarget({...c, download_bytes: '9'}, 'outbound')).toEqual(before);
  const moved = revealTarget({...c, outbound: 'proxy'}, 'outbound')!;
  expect(moved.group).toBe('proxy');
  expect(moved.token).not.toBe(before.token);
  expect(revealTarget(c, 'none')).toBeNull();
  expect(revealTarget(undefined, 'source')).toBeNull();
});

it('folds groups by a default and its exceptions, so later groups take the default', () => {
  let state = collapseAll(false);
  expect(isCollapsed(state, 'a')).toBe(false);
  state = toggleGroup(state, 'a');
  expect([isCollapsed(state, 'a'), isCollapsed(state, 'b')]).toEqual([true, false]);
  state = collapseAll(true);
  expect([isCollapsed(state, 'a'), isCollapsed(state, 'new')]).toEqual([true, true]);
  const opened = toggleGroup(state, 'a');
  expect([isCollapsed(opened, 'a'), isCollapsed(opened, 'new')]).toEqual([false, true]);
  expect(isCollapsed(state, 'a')).toBe(true);
  expect(toggleGroup(opened, 'a').exceptions.size).toBe(0);
  expect(isCollapsed(collapseAll(false), 'a')).toBe(false);
});

it('rejects corrupt saved preferences and prevents hiding every column', () => {
  expect(readView('{')).toEqual({hidden: [], sort: null, group: 'source'});
  expect(readView(JSON.stringify({hidden: columns.map(column => column.id), sort: {column: 'bogus', direction: 'ascending'}}))).toMatchObject({
    hidden: [],
    sort: null
  });
  expect(readView(JSON.stringify({hidden: ['rule', 'bogus'], group: 'none', sort: {column: 'down', direction: 'descending'}}))).toEqual({
    hidden: ['rule'],
    group: 'none',
    sort: {column: 'down', direction: 'descending'}
  });
});

it('keeps a column hidden that was saved under its old chain id', () => {
  expect(readView(JSON.stringify({hidden: ['chain', 'rule'], sort: null, group: 'none'})).hidden).toEqual(['node', 'rule']);
});
