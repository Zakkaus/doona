import {expect, it} from 'vitest';
import type {ConfigSource, RoutingRule} from '../../api/model';
import {addRule, removeRule, ruleAnchor, sourceFor} from './source';

const rule: RoutingRule = {
  rule_id: 'r1',
  index: 0,
  kind: 'rule',
  expression: "domain('a#b')",
  outbound: 'proxy',
  must: true,
  source: {file: 'rules.dae', source_id: 'source', line: 2}
};

it('checks the complete rule at add and removal anchors, not just an arrow', () => {
  const text = "routing {\n  domain('a#b') -> proxy(must) # keep\n  fallback: proxy\n}\n";
  const anchor = ruleAnchor(text, rule);
  expect(anchor && text.slice(anchor.from, anchor.to)).toBe("  domain('a#b') -> proxy(must) # keep\n");
  const quotedArrow = text.replace('a#b', '->b');
  expect(ruleAnchor(quotedArrow, {...rule, expression: "domain('->b')"})).toEqual(anchor);
  expect(ruleAnchor(text.replace("domain('a#b')", 'domain(other)'), rule)).toBeNull();
  expect(ruleAnchor(text.replace('proxy(must)', 'direct(must)'), rule)).toBeNull();
  expect(ruleAnchor(text.replace('routing {', 'routing {\n  dport(80) -> direct'), rule)).toBeNull();
  expect(ruleAnchor(text.replace('routing {', 'dns {'), rule)).toBeNull();
  expect(ruleAnchor(text, {...rule, kind: 'fallback', expression: 'fallback: proxy', must: false, source: {...rule.source!, line: 3}})).not.toBeNull();
  expect(ruleAnchor("domain('a#b') -> proxy(must)\n", {...rule, source: {...rule.source!, line: 1}})).not.toBeNull();
});

it('links basename-only sources only when the match is unique', () => {
  const sources = [
    {id: 'a', path: 'rules.dae'},
    {id: 'b', path: '/etc/other/rules.dae'}
  ] as ConfigSource[];
  const source = {file: 'rules.dae', line: 1};
  expect(sourceFor(sources, source)).toBeUndefined();
  expect(sourceFor(sources.slice(1), source)?.id).toBe('b');
  expect(sourceFor(sources, {...source, source_id: 'a'})?.id).toBe('a');
  expect(sourceFor(sources, {...source, source_id: 'missing'})).toBeUndefined();
});

it('adds and removes only an unchanged complete rule anchor', () => {
  const text = "routing {\n  domain('a#b') -> proxy(must) # keep\n  fallback: proxy\n}\n";
  expect(addRule(text, rule, 'dip(2001:db8::1)', 'direct', false)).toBe(
    "routing {\n  dip(2001:db8::1) -> direct\n  domain('a#b') -> proxy(must) # keep\n  fallback: proxy\n}\n"
  );
  expect(removeRule(text, rule)).toBe('routing {\n  fallback: proxy\n}\n');
  const changed = text.replace('proxy(must)', 'block');
  expect(addRule(changed, rule, 'dip(a)', 'direct', true)).toBeNull();
  expect(removeRule(changed, rule)).toBeNull();
});
