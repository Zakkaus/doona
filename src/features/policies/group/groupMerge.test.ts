import {expect, it} from 'vitest';
import {readGroupEntries, writeGroupEntry, type GroupEntry, type GroupEntryUpdate} from '../../../dae/groups';
import {mergeGroupRetry, type GroupFields} from './groupMerge';

const declare = (fields: string) => `group {\n  office {\n${fields}  }\n}\n`;
const entry = (text: string): GroupEntry => readGroupEntries(text)[0];
const opened = declare("    filter: name('hk-01')\n    policy: select\n    default: hk-01\n    interrupt_connections: true\n");
const mine: GroupFields = {filters: ["name('hk-01')"], policy: 'select', default: 'hk-01', final: null, interrupt: 'true'};
const routes = ['default', 'final'] as const;

it('merges edits to different fields, keeping the one changed on disk', () => {
  const disk = opened.replace("name('hk-01')", "name('hk-02')");
  const merge = mergeGroupRetry({...mine, policy: 'score'}, entry(opened), entry(disk), routes);
  expect(merge).toStrictEqual({kind: 'merge', keep: {filters: ["name('hk-02')"], interrupt: undefined, default: undefined, final: undefined}});
});

it('refuses a field changed here and on disk to different values', () => {
  const disk = opened.replace('policy: select', 'policy: min_moving_avg');
  expect(mergeGroupRetry({...mine, policy: 'score'}, entry(opened), entry(disk), routes)).toStrictEqual({kind: 'conflict'});
});

it('takes a field changed here and on disk to the same value as read again', () => {
  const disk = opened.replace('policy: select', 'policy: score');
  const merge = mergeGroupRetry({...mine, policy: 'score'}, entry(opened), entry(disk), routes);
  expect(merge).toMatchObject({kind: 'merge', keep: {policy: 'score'}});
});

it('keeps the spelling on disk of fields that hold the same value written differently', () => {
  const disk = opened.replace('default: hk-01', "default: 'hk-01'").replace('interrupt_connections: true', "interrupt_connections: 'true'");
  const merge = mergeGroupRetry({...mine, policy: 'score'}, entry(opened), entry(disk), routes);
  expect(merge.kind).toBe('merge');
  const update: GroupEntryUpdate = {filters: mine.filters, policy: 'score', interrupt: mine.interrupt, default: mine.default, final: mine.final};
  if (merge.kind === 'merge') Object.assign(update, merge.keep);
  expect(writeGroupEntry(disk, 'office', update)).toBe(disk.replace('policy: select', 'policy: score'));
});

it('refuses when the entry is gone', () => {
  expect(mergeGroupRetry(mine, entry(opened), undefined, routes)).toStrictEqual({kind: 'gone'});
});
