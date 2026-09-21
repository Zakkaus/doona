import type {ConfigSource, RoutingRule, RuleSource} from '../../api/model';
import {scanConfig} from '../../dae/text';

export function sourceFor(list: ConfigSource[], source: RuleSource | null | undefined) {
  if (!source) return undefined;
  if (source.source_id) return list.find(item => item.id === source.source_id);
  const matches = list.filter(item => item.path === source.file || item.path.endsWith('/' + source.file));
  return matches.length === 1 ? matches[0] : undefined;
}

export function ruleAnchor(text: string, rule: RoutingRule): {from: number; to: number; indent: string} | null {
  if (!rule.source) return null;
  const line = rule.source.line - 1;
  const {blocks, tokens} = scanConfig(text);
  const actual = tokens.filter(token => token.line === line && token.kind !== 'comment');
  if (!actual.length) return null;
  const first = actual[0];
  const last = actual.at(-1)!;
  if (blocks.length && !blocks.some(block => block.name === 'routing' && first.from > block.open && last.to <= block.close && first.depth === 1)) return null;
  const expected = scanConfig(rule.expression)
    .tokens.filter(token => token.kind !== 'comment')
    .map(token => rule.expression.slice(token.from, token.to));
  if (rule.kind !== 'fallback' && !expected.includes('->')) {
    const target = `-> ${rule.outbound}${rule.must ? '(must)' : ''}`;
    expected.push(...scanConfig(target).tokens.map(token => target.slice(token.from, token.to)));
  }
  if (actual.length !== expected.length || actual.some((token, i) => text.slice(token.from, token.to) !== expected[i])) return null;
  const from = text.lastIndexOf('\n', first.from - 1) + 1;
  const newline = text.indexOf('\n', last.to);
  return {from, to: newline === -1 ? text.length : newline + 1, indent: text.slice(from, first.from)};
}

export function addRule(text: string, anchor: RoutingRule, condition: string, outbound: string, must: boolean): string | null {
  const range = ruleAnchor(text, anchor);
  return range ? text.slice(0, range.from) + `${range.indent}${condition} -> ${outbound}${must ? '(must)' : ''}\n` + text.slice(range.from) : null;
}

export function removeRule(text: string, rule: RoutingRule): string | null {
  const range = ruleAnchor(text, rule);
  return range ? text.slice(0, range.from) + text.slice(range.to) : null;
}
