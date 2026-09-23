import type {ConfigSource, RoutingRule, RuleSource} from '../../api/model';
import {scanConfig} from '../../dae/text';

export function sourceFor(list: ConfigSource[], source: RuleSource | null | undefined) {
  if (!source) return undefined;
  if (source.source_id) return list.find(item => item.id === source.source_id);
  const matches = list.filter(item => item.path === source.file || item.path.endsWith('/' + source.file));
  return matches.length === 1 ? matches[0] : undefined;
}

export type RuleAnchor = {from: number; to: number; indent: string; text: string};

export function ruleAnchor(source: ConfigSource, rule: RoutingRule, scan?: ReturnType<typeof scanConfig>): RuleAnchor | null {
  if (!rule.source?.source_id || rule.source.source_id !== source.id || source.content === undefined) return null;
  const text = source.content;
  let line = rule.source.line - 1;
  const {blocks, tokens} = scan ?? scanConfig(text);
  const start = tokens.findIndex(token => token.line === line && token.kind !== 'comment');
  if (start === -1 || tokens[start].parens !== 0) return null;
  // A rule continues onto later lines while its parentheses stay open.
  const actual = [];
  for (let i = start; i < tokens.length && (tokens[i].line === line || tokens[i].parens > 0); i++) {
    if (tokens[i].kind !== 'comment') actual.push(tokens[i]);
    if (tokens[i].line !== line) line = tokens[i].line;
  }
  const first = actual[0];
  const last = actual.at(-1)!;
  if (!blocks.some(block => block.name === 'routing' && first.from > block.open && last.to <= block.close && first.depth === 1)) return null;
  const fallback = actual.length >= 3 && text.slice(first.from, first.to) === 'fallback' && text.slice(actual[1].from, actual[1].to) === ':';
  if ((rule.kind === 'fallback') !== fallback) return null;
  const from = text.lastIndexOf('\n', first.from - 1) + 1;
  const newline = text.indexOf('\n', last.to);
  const to = newline === -1 ? text.length : newline + 1;
  return {from, to, indent: text.slice(from, first.from), text: text.slice(from, to)};
}

export function addRule(text: string, anchor: RuleAnchor, condition: string, outbound: string, must: boolean): string | null {
  return text.slice(anchor.from, anchor.to) === anchor.text
    ? text.slice(0, anchor.from) + `${anchor.indent}${condition} -> ${outbound}${must ? '(must)' : ''}\n` + text.slice(anchor.from)
    : null;
}

export function removeRule(text: string, anchor: RuleAnchor): string | null {
  return text.slice(anchor.from, anchor.to) === anchor.text ? text.slice(0, anchor.from) + text.slice(anchor.to) : null;
}
