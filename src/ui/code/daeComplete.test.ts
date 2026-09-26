import {expect, it} from 'vitest';
import {CompletionContext} from '@codemirror/autocomplete';
import {EditorState} from '@codemirror/state';
import {completeDae} from './daeComplete';
import {readGroupEntries} from '../../dae/groups';

const complete = (doc: string) => completeDae(new CompletionContext(EditorState.create({doc}), doc.length, true), () => []);

it('inserts a policy value without duplicating an existing key', () => {
  const doc = 'group {\n  proxy {\n    policy: min';
  const result = complete(doc)!;
  const policy = result.options.find(option => option.label === 'min_avg10')!;
  expect(doc.slice(0, result.from) + (policy.apply ?? policy.label)).toBe('group {\n  proxy {\n    policy: min_avg10');
  const empty = complete('group { proxy {\n    min')!;
  expect(empty.options.find(option => option.label === 'min_avg10')?.apply).toBe('policy: min_avg10');
});

it('ignores quoted and commented braces and tracks multiple blocks on one line', () => {
  const global = complete("global {\n  log_file: '/tmp/}#log' # }\n  log_l")!;
  expect(global.options.find(option => option.label === 'log_level')?.apply).toBe('log_level: ');
  const nested = complete('group { first {} second {\n  policy: min')!;
  expect(nested.options.some(option => option.label === 'min_avg10')).toBe(true);
  expect(complete('group { first {} }\nglo')!.options.some(option => option.label === 'global')).toBe(true);
  expect(complete("global {\n  log_file: '/tmp/}")).toBeNull();
  expect(complete('global {\n # log_l')).toBeNull();
});

it('inserts a group after the arrow as its header writes it', () => {
  const content = `group {\n  proxy { policy: min }\n  'hk' { policy: min }\n  'my group' { policy: min }\n  "dq group" { policy: min }\n}\n`;
  const groups = readGroupEntries(content);
  const doc = 'routing {\n  domain(a) -> ';
  const result = completeDae(new CompletionContext(EditorState.create({doc}), doc.length, false), () => groups)!;
  const inserted = (label: string) => {
    const option = result.options.find(item => item.label === label)!;
    return option.apply ?? option.label;
  };
  // Listed unquoted; inserted with the header's own quotes, which honk keeps in the name `->` must match.
  expect(inserted('proxy')).toBe('proxy');
  expect(inserted('hk')).toBe("'hk'");
  expect(inserted('my group')).toBe("'my group'");
  expect(inserted('dq group')).toBe('"dq group"');
});
