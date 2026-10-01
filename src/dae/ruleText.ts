import type {ConfigSource, DnsRoutingRule, RoutingRule, RuleSource} from '../api/model';
import {blockFields, scanConfig, unquote, type TextBlock} from './text';

export function sourceFor(list: ConfigSource[], source: RuleSource | null | undefined) {
  if (!source) return undefined;
  return list.find(item => item.id === source.source_id);
}

// `target` spans what a listed rule writes after its arrow or fallback colon, with the space before it.
// `open` and `close` wrap an added rule in a block the text does not have yet.
export type RuleAnchor = {
  from: number;
  to: number;
  indent: string;
  text: string;
  target?: {from: number; to: number; foldCase?: boolean};
  condition?: {from: number; to: number};
  open?: string;
  close?: string;
};
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
  bareInclude?: boolean;
};

const compact = (value: string) =>
  scanConfig(value)
    .tokens.filter(token => token.kind !== 'comment')
    .map(token => value.slice(token.from, token.to))
    .join('');

function anchorAt(source: ConfigSource, rule: Listed, place: Placement, scan?: ReturnType<typeof scanConfig>): RuleAnchor | null {
  if (!rule.source || rule.source.source_id !== source.id) return null;
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
  const within = place.within(blocks).some(block => first.from > block.open && last.to <= block.close && first.depth === block.depth + 1);
  if (!within && !(place.bareInclude && source.kind === 'include' && !blocks.length && first.depth === 0)) return null;
  const fallback = actual.length >= 3 && place.fallbacks.includes(text.slice(first.from, first.to)) && text.slice(actual[1].from, actual[1].to) === ':';
  if ((rule.kind === 'fallback') !== fallback) return null;
  // The line must still hold this rule: a source shifted since the list was read would otherwise edit its neighbour.
  const fold = (value: string) => (place.foldCase ? value.toLowerCase() : value);
  const bare = (from: number, to: number) => compact(text.slice(from, to));
  const arrow = fallback ? actual[1] : actual.find(token => token.parens === 0 && text.slice(token.from, token.to) === '->');
  const target = compact(place.target);
  if (!arrow || fold(bare(arrow.to, last.to)) !== fold(target)) return null;
  // The display expression may end with its target, as the contract shows it (`pname(curl) -> direct`), or not.
  const shown = compact(rule.expression);
  const condition = fold(shown).endsWith(fold('->' + target)) ? shown.slice(0, -target.length - 2) : shown;
  if (!fallback && !rule.expression.includes('<redacted>') && bare(first.from, arrow.from) !== condition) return null;
  const from = text.lastIndexOf('\n', first.from - 1) + 1;
  const newline = text.indexOf('\n', last.to);
  const to = newline === -1 ? text.length : newline + 1;
  const conditionEnd = actual[actual.indexOf(arrow) - 1];
  return {
    from,
    to,
    indent: text.slice(from, first.from),
    text: text.slice(from, to),
    target: {from: arrow.to, to: last.to, ...(place.foldCase ? {foldCase: true} : {})},
    ...(!fallback && conditionEnd ? {condition: {from: first.from, to: conditionEnd.to}} : {})
  };
}

export function ruleAnchor(source: ConfigSource, rule: RoutingRule, scan?: ReturnType<typeof scanConfig>): RuleAnchor | null {
  return anchorAt(
    source,
    rule,
    {
      within: blocks => blocks.filter(block => block.name === 'routing'),
      fallbacks: ['fallback'],
      bareInclude: true,
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
// A list with no block at all gets a new one, `open` and `close` around the rule, at the end of the one
// `dns { routing { … } }` block under the same conditions; honk reads an absent list as empty.
export function dnsListEnd(sources: ConfigSource[], list: DnsRuleListId): {source: ConfigSource; anchor: RuleAnchor} | null {
  const blocks = (within: (blocks: TextBlock[]) => TextBlock[]) =>
    sources.flatMap(source => within(scanConfig(source.content).blocks).map(block => ({source, block})));
  const lists = blocks(scanned => dnsListBlocks(scanned, list));
  if (lists.length) {
    const end = lists.length === 1 ? blockEnd(lists[0].source, lists[0].block) : null;
    return end && {source: end.source, anchor: end.anchor};
  }
  const routings = blocks(scanned => named(scanned, 'dns').flatMap(dns => named(dns.children, 'routing')));
  const end = routings.length === 1 ? blockEnd(routings[0].source, routings[0].block) : null;
  if (!end) return null;
  const {closing, anchor} = end;
  const {indent} = anchor;
  const step = indent.startsWith(closing) && indent.length > closing.length ? indent.slice(closing.length) : '    ';
  return {source: end.source, anchor: {...anchor, indent: indent + step, open: `${indent}${list} {\n`, close: `${indent}}\n`}};
}
function blockEnd(source: ConfigSource, block: TextBlock): {source: ConfigSource; anchor: RuleAnchor; closing: string} | null {
  const text = source.content!;
  if (!source.writable) return null;
  const from = text.lastIndexOf('\n', block.close - 1) + 1;
  const closing = text.slice(from, block.close);
  if (from <= block.open || !/^[ \t]*$/.test(closing)) return null;
  const newline = text.indexOf('\n', block.close);
  const to = newline === -1 ? text.length : newline + 1;
  const inner = text.slice(block.open + 1, block.close).match(/\n([ \t]+)\S/)?.[1] ?? closing + (closing.slice(0, closing.length / block.depth) || '    ');
  return {source, anchor: {from, to, indent: inner, text: text.slice(from, to)}, closing};
}
// The upstreams `dns { upstream { … } }` defines, in the order written: each name with its quotes, since honk keeps a
// key's quotes in its name and `->` must repeat the key verbatim, and the address it is written with.
export function dnsUpstreams(text: string, scan = scanConfig(text)): Array<{name: string; address: string}> {
  return scan.blocks
    .filter(block => block.name === 'dns')
    .flatMap(dns => dns.children.filter(child => child.name === 'upstream'))
    .flatMap(upstream =>
      blockFields(text, upstream, scan.tokens).map(field => ({
        name: text.slice(field.from, scan.tokens.find(token => token.from === field.from)!.to),
        address: unquote(field.value)
      }))
    );
}
export const dnsUpstreamNames = (text: string, scan = scanConfig(text)): string[] => dnsUpstreams(text, scan).map(upstream => upstream.name);

export const ruleLine = (condition: string, outbound: string, must = false) => `${condition} -> ${outbound}${must ? '(must)' : ''}`;

export function addRule(text: string, anchor: RuleAnchor, condition: string, outbound: string, must: boolean): string | null {
  return text.slice(anchor.from, anchor.to) === anchor.text
    ? text.slice(0, anchor.from) +
        (anchor.open ?? '') +
        `${anchor.indent}${ruleLine(condition, outbound, must)}\n` +
        (anchor.close ?? '') +
        text.slice(anchor.from)
    : null;
}

// Rewrites only the rule's target, so its condition and any comment after it stay as written.
export function replaceRuleTarget(text: string, anchor: RuleAnchor, outbound: string, must: boolean): string | null {
  if (!anchor.target || text.slice(anchor.from, anchor.to) !== anchor.text) return null;
  const target = `${outbound}${must ? '(must)' : ''}`;
  const fold = (value: string) => (anchor.target?.foldCase ? value.toLowerCase() : value);
  if (fold(compact(text.slice(anchor.target.from, anchor.target.to))) === fold(compact(target))) return text;
  return text.slice(0, anchor.target.from) + ` ${target}` + text.slice(anchor.target.to);
}

export function removeRule(text: string, anchor: RuleAnchor): string | null {
  return text.slice(anchor.from, anchor.to) === anchor.text ? text.slice(0, anchor.from) + text.slice(anchor.to) : null;
}

// Replace the located condition and target, retaining trailing markers and comments inside a continued condition.
export function replaceRule(text: string, anchor: RuleAnchor, condition: string, outbound: string, must: boolean): string | null {
  const targeted = replaceRuleTarget(text, anchor, outbound, must);
  if (targeted === null || !anchor.condition) return targeted;
  const {from, to} = anchor.condition;
  if (text.slice(from, to) === condition) return targeted;
  const newline = anchor.text.includes('\r\n') ? '\r\n' : '\n';
  const comments = scanConfig(text.slice(from, to))
    .tokens.filter(token => token.kind === 'comment')
    .map(token => text.slice(from + token.from, from + token.to).replace(/\r$/, '') + newline + anchor.indent)
    .join('');
  return targeted.slice(0, from) + comments + condition + targeted.slice(to);
}

export function addFallback(text: string, anchor: RuleAnchor, target: string): string | null {
  return text.slice(anchor.from, anchor.to) === anchor.text
    ? text.slice(0, anchor.from) + (anchor.open ?? '') + `${anchor.indent}fallback: ${target}\n` + (anchor.close ?? '') + text.slice(anchor.from)
    : null;
}

// The current rule dialogs edit targets; conditions and include directives still need raw access.
export function ruleTargetValues(text: string) {
  const tokens = scanConfig(text).tokens.filter(token => token.kind !== 'comment');
  const raw = (index: number) => text.slice(tokens[index].from, tokens[index].to);
  const values: string[][] = [];
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    const target = token.parens === 0 && (raw(index) === '->' || (raw(index) === ':' && index > 0 && ['fallback', 'default'].includes(raw(index - 1))));
    if (!target) continue;
    const parts: string[] = [];
    while (++index < tokens.length) {
      const next = tokens[index];
      if (next.depth < token.depth || (next.kind === 'symbol' && raw(index) === '}') || (next.line > token.line && next.parens === 0)) break;
      parts.push(raw(index));
    }
    values.push(parts);
    index--;
  }
  return values;
}
