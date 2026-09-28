import type {ConfigSource, DnsRoutingRule, RoutingRule, RuleSource} from '../api/model';
import {blockFields, scanConfig, uncomment, type TextBlock} from './text';
import {builtinOutboundNames} from './vocab';

export function sourceFor(list: ConfigSource[], source: RuleSource | null | undefined) {
  if (!source) return undefined;
  return list.find(item => item.id === source.source_id);
}

export type RuleAnchor = {from: number; to: number; indent: string; text: string};
// A listed rule as the anchor reads it: where it is, whether it is the fallback, and the target written after the
// arrow (an outbound, a DNS upstream or action).
type Listed = {kind: 'rule' | 'fallback'; expression: string; source: RuleSource | null};
type Placement = {
  // The blocks the rule's statement may sit directly inside.
  within: (blocks: TextBlock[]) => TextBlock[];
  fallbacks: string[];
  target: string;
  // honk resolves DNS upstream names without regard to case, so the list may spell one differently from the source.
  foldCase?: boolean;
};

const unquoteWhole = (value: string) => (/^(['"]).*\1$/.test(value) ? value.slice(1, -1) : value);

function anchorAt(source: ConfigSource, rule: Listed, place: Placement, scan?: ReturnType<typeof scanConfig>): RuleAnchor | null {
  if (!rule.source || rule.source.source_id !== source.id || source.content === undefined) return null;
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
  if (!place.within(blocks).some(block => first.from > block.open && last.to <= block.close && first.depth === block.depth + 1)) return null;
  const fallback = actual.length >= 3 && place.fallbacks.includes(text.slice(first.from, first.to)) && text.slice(actual[1].from, actual[1].to) === ':';
  if ((rule.kind === 'fallback') !== fallback) return null;
  // The line must still hold this rule: a source shifted since the list was read would otherwise edit its neighbour.
  const fold = (value: string) => (place.foldCase ? value.toLowerCase() : value);
  const bare = (from: number, to: number) => uncomment(text.slice(from, to)).replace(/\s+/g, '');
  const arrow = fallback ? actual[1] : actual.find(token => token.parens === 0 && text.slice(token.from, token.to) === '->');
  const target = place.target.replace(/\s+/g, '');
  // A name that is not bare is written quoted, while the list gives it bare.
  if (!arrow || fold(unquoteWhole(bare(arrow.to, last.to))) !== fold(target)) return null;
  // The display expression may end with its target, as the contract shows it (`pname(curl) -> direct`), or not.
  const shown = rule.expression.replace(/\s+/g, '');
  const tail = ['', "'", '"'].map(mark => `->${mark}${target}${mark}`).find(tail => fold(shown).endsWith(fold(tail)));
  const condition = tail ? shown.slice(0, -tail.length) : shown;
  if (!fallback && !rule.expression.includes('<redacted>') && bare(first.from, arrow.from) !== condition) return null;
  const from = text.lastIndexOf('\n', first.from - 1) + 1;
  const newline = text.indexOf('\n', last.to);
  const to = newline === -1 ? text.length : newline + 1;
  return {from, to, indent: text.slice(from, first.from), text: text.slice(from, to)};
}

export function ruleAnchor(source: ConfigSource, rule: RoutingRule, scan?: ReturnType<typeof scanConfig>): RuleAnchor | null {
  return anchorAt(
    source,
    rule,
    {
      within: blocks => blocks.filter(block => block.name === 'routing'),
      fallbacks: ['fallback'],
      target: (rule.outbound ?? '') + (rule.must ? '(must)' : '')
    },
    scan
  );
}

export type DnsRuleListId = 'request' | 'response';
// What a DNS rule writes after its arrow: an upstream name for `upstream` and `requery`, else the action itself.
export const dnsRuleTarget = (rule: Pick<DnsRoutingRule, 'action' | 'upstream'>) =>
  rule.action === 'upstream' || rule.action === 'requery' ? (rule.upstream ?? '') : rule.action;
// A DNS rule sits in `dns { routing { request { … } response { … } } }`; honk also reads `default:` as the fallback.
const named = (blocks: TextBlock[], name: string) => blocks.filter(block => block.name === name);
const dnsListBlocks = (blocks: TextBlock[], list: DnsRuleListId) =>
  named(blocks, 'dns')
    .flatMap(dns => named(dns.children, 'routing'))
    .flatMap(routing => named(routing.children, list));
export function dnsRuleAnchor(source: ConfigSource, rule: DnsRoutingRule, list: DnsRuleListId, scan?: ReturnType<typeof scanConfig>): RuleAnchor | null {
  return anchorAt(
    source,
    rule,
    {
      within: blocks => dnsListBlocks(blocks, list),
      fallbacks: ['fallback', 'default'],
      target: dnsRuleTarget(rule),
      foldCase: true
    },
    scan
  );
}
// Where a rule goes at the end of a DNS list that writes no fallback: before the line closing the list's block, indented
// as its rules are. Only a list written as one block, in a writable source, whose closing brace starts its line qualifies.
export function dnsListEnd(sources: ConfigSource[], list: DnsRuleListId): {source: ConfigSource; anchor: RuleAnchor} | null {
  const found = sources.flatMap(source =>
    source.content === undefined ? [] : dnsListBlocks(scanConfig(source.content).blocks, list).map(block => ({source, text: source.content!, block}))
  );
  if (found.length !== 1 || !found[0].source.writable) return null;
  const {source, text, block} = found[0];
  const from = text.lastIndexOf('\n', block.close - 1) + 1;
  const indent = text.slice(from, block.close);
  if (from <= block.open || !/^[ \t]*$/.test(indent)) return null;
  const newline = text.indexOf('\n', block.close);
  const to = newline === -1 ? text.length : newline + 1;
  const inner = text.slice(block.open + 1, block.close).match(/\n([ \t]+)\S/)?.[1] ?? indent + (indent.slice(0, indent.length / block.depth) || '    ');
  return {source, anchor: {from, to, indent: inner, text: text.slice(from, to)}};
}
// The upstream names `dns { upstream { … } }` defines, in the order written.
export function dnsUpstreamNames(text: string, scan = scanConfig(text)): string[] {
  return scan.blocks
    .filter(block => block.name === 'dns')
    .flatMap(dns => dns.children.filter(child => child.name === 'upstream'))
    .flatMap(upstream => blockFields(text, upstream, scan.tokens).map(field => field.name));
}

export const ruleLine = (condition: string, outbound: string, must = false) => `${condition} -> ${outbound}${must ? '(must)' : ''}`;
// What a new rule can route to: the groups the configuration defines, then the two built-in outbounds.
export const ruleOutbounds = (groups: Array<{name: string}>) => [...groups.map(group => group.name), ...builtinOutboundNames].map(id => ({id, label: id}));

export function addRule(text: string, anchor: RuleAnchor, condition: string, outbound: string, must: boolean): string | null {
  return text.slice(anchor.from, anchor.to) === anchor.text
    ? text.slice(0, anchor.from) + `${anchor.indent}${ruleLine(condition, outbound, must)}\n` + text.slice(anchor.from)
    : null;
}

export function removeRule(text: string, anchor: RuleAnchor): string | null {
  return text.slice(anchor.from, anchor.to) === anchor.text ? text.slice(0, anchor.from) + text.slice(anchor.to) : null;
}
