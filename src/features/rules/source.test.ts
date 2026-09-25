import {expect, it} from 'vitest';
import type {ConfigSource, RoutingRule} from '../../api/model';
import {addRule, removeRule, ruleAnchor, sourceFor} from './source';

const rule: RoutingRule = {
  rule_id: 'r1',
  index: 0,
  kind: 'rule',
  expression: 'l4proto(<redacted>)',
  outbound: 'mix',
  must: false,
  source: {file: '<redacted>', source_id: 'source', line: 2, column: 3}
};
const text = 'routing {\n  l4proto(tcp, udp) -> mix # keep\n  fallback: direct\n}\n';
const source = {id: 'source', content: text} as ConfigSource;

it('anchors redacted display rules and bare fallbacks by source identity and location', () => {
  const anchor = ruleAnchor(source, rule)!;
  expect(removeRule(text, anchor)).toBe('routing {\n  fallback: direct\n}\n');
  const fallback = ruleAnchor(source, {...rule, kind: 'fallback', expression: 'fallback', outbound: 'direct', source: {...rule.source!, line: 3}})!;
  expect(addRule(text, fallback, 'dip(2001:db8::1)', 'direct', false)).toBe(
    'routing {\n  l4proto(tcp, udp) -> mix # keep\n  dip(2001:db8::1) -> direct\n  fallback: direct\n}\n'
  );
});

it('refuses changed source anchors, unavailable identities, withheld text and non-routing locations', () => {
  const anchor = ruleAnchor(source, rule)!;
  const changed = text.replace('mix', 'block');
  expect(addRule(changed, anchor, 'dip(a)', 'direct', true)).toBeNull();
  expect(removeRule(changed, anchor)).toBeNull();
  expect(ruleAnchor({...source, id: 'other'}, rule)).toBeNull();
  expect(ruleAnchor({...source, content: undefined}, rule)).toBeNull();
  expect(ruleAnchor({...source, content: text.replace('routing {', 'dns {')}, rule)).toBeNull();
  expect(ruleAnchor({...source, content: 'l4proto(tcp, udp) -> mix\n'}, {...rule, source: {...rule.source!, line: 1}})).toBeNull();
  expect(ruleAnchor(source, {...rule, source: {...rule.source!, line: 4}})).toBeNull();
  expect(ruleAnchor(source, {...rule, kind: 'fallback', expression: 'fallback'})).toBeNull();
  expect(ruleAnchor(source, {...rule, source: {...rule.source!, line: 3}})).toBeNull();
});

it('anchors a rule whose display expression ends with its outbound', () => {
  const shown = {...rule, expression: 'l4proto(tcp, udp) -> mix'};
  expect(ruleAnchor(source, shown)).toEqual(ruleAnchor(source, {...shown, expression: 'l4proto(tcp, udp)'}));
  expect(ruleAnchor(source, shown)).not.toBeNull();
  expect(ruleAnchor(source, {...shown, expression: 'l4proto(tcp) -> mix'})).toBeNull();
  expect(ruleAnchor(source, {...shown, expression: 'l4proto(tcp, udp) -> mix(must)'})).toBeNull();
});

it('links rule sources by ID even when display names match', () => {
  const sources = [
    {id: 'a', path: 'rules.dae'},
    {id: 'b', path: '/etc/other/rules.dae'}
  ] as ConfigSource[];
  const source = {file: 'rules.dae', source_id: 'a', line: 1, column: null};
  expect(sourceFor(sources, source)?.id).toBe('a');
  expect(sourceFor(sources.slice(1), source)).toBeUndefined();
  expect(sourceFor(sources, {...source, source_id: 'b'})?.id).toBe('b');
  expect(sourceFor(sources, {...source, source_id: 'missing'})).toBeUndefined();
});

it('removes a rule continued over several lines as a whole and leaves the rest byte-identical', () => {
  const head = 'routing {\n  pname(a) -> direct\n';
  const multi = '  domain(suffix: a.com,\n    # mirror\n    suffix: b.com) -> proxy # tail\n';
  const tail = '  fallback: direct\n}\n';
  const content = head + multi + tail;
  const anchor = ruleAnchor({id: 'source', content} as ConfigSource, {...rule, outbound: 'proxy', source: {...rule.source!, line: 3}})!;
  expect(removeRule(content, anchor)).toBe(head + tail);
  expect(addRule(content, anchor, 'dip(a)', 'direct', false)).toBe(head + '  dip(a) -> direct\n' + multi + tail);
});

it('refuses a line that no longer holds the listed rule', () => {
  const content = 'routing {\n  pname(a) -> direct\n  fallback: direct\n}\n';
  const listed: RoutingRule = {...rule, expression: 'pname(b)', outbound: 'direct', source: {...rule.source!, line: 2}};
  expect(ruleAnchor({id: 'source', content} as ConfigSource, listed)).toBeNull();
  expect(ruleAnchor({id: 'source', content} as ConfigSource, {...listed, expression: 'pname(a)', outbound: 'block'})).toBeNull();
});
