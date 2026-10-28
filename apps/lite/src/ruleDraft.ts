import {modeRuleLines, readMode, writeMode} from '../../../src/dae/outboundMode';
import {conditionValues, parseConditionValues} from '../../../src/dae/groupConditions';
import {lineDiff} from '../../../src/features/rules/diff';
import {parseConditions, serializeConditions, type RuleConditionRow} from '../../../src/dae/conditions';
import {conditionKinds, dnsConditionKinds, type RuleConditionKind} from '../../../src/dae/groups';
import {replaceRule, ruleLine, type RuleAnchor} from '../../../src/dae/ruleText';
import {isFragment, isQuotable, quote, scanConfig, unquote, type TextBlock} from '../../../src/dae/text';

export type RuleListKind = 'routing' | 'request' | 'response';
export type Condition = {kind: string; value: string; negate: boolean};
const extra: Record<string, [string, string]> = {
  domainRegex: ['domain', 'regex'],
  ipversion: ['ipversion', ''],
  mac: ['mac', ''],
  dscp: ['dscp', ''],
  qnameRegex: ['qname', 'regex']
};
export function kindsFor(kind: RuleListKind): string[] {
  return kind === 'routing' ? [...conditionKinds, 'domainRegex', 'ipversion', 'mac', 'dscp'] : [...dnsConditionKinds[kind], 'qnameRegex'];
}
export function serializeBuilder(rows: Condition[]): string | null {
  if (!rows.length) return null;
  const result = rows.map(row => {
    if (!extra[row.kind]) return serializeConditions([row as RuleConditionRow]);
    const [name, prefix] = extra[row.kind];
    const values = parseConditionValues(row.value);
    if (!values?.length || values.some(value => !isQuotable(value))) return null;
    const call = `${row.negate ? '!' : ''}${name}(${values.map(value => `${prefix ? prefix + ': ' : ''}${quote(value)}`).join(', ')})`;
    return isFragment(call) ? call : null;
  });
  return result.some(v => v === null) ? null : result.join(' && ');
}
function parseBuilder(text: string, kind: RuleListKind): Condition[] | null {
  const parsed = parseConditions(text, kindsFor(kind).filter(k => !extra[k]) as RuleConditionKind[]);
  if (parsed) return parsed;
  // Unsupported expressions remain opaque; this branch accepts only complete, quoted extra calls.
  const parts = text.split(/\s+&&\s+/);
  const rows: Condition[] = [];
  for (const part of parts) {
    const ordinary = parseConditions(part, kindsFor(kind).filter(k => !extra[k]) as RuleConditionKind[]);
    if (ordinary) {
      rows.push(...ordinary);
      continue;
    }
    const match = /^(!?)\s*(\w+)\((.*)\)$/.exec(part.trim());
    if (!match) return null;
    const tokens = scanConfig(match[3]).tokens;
    const values: string[] = [];
    let prefix = '';
    let i = 0;
    while (i < tokens.length) {
      const raw = (n: number) => match[3].slice(tokens[n].from, tokens[n].to);
      let p = '';
      if (tokens[i + 1] && raw(i + 1) === ':') {
        p = raw(i);
        i += 2;
      }
      if (!tokens[i] || tokens[i].kind !== 'quoted' || (values.length && p !== prefix)) return null;
      prefix = p;
      values.push(unquote(raw(i++)));
      if (i < tokens.length && raw(i++) !== ',') return null;
    }
    const key = Object.keys(extra).find(k => kindsFor(kind).includes(k) && extra[k][0] === match[2] && extra[k][1] === prefix);
    if (!key || !values.length) return null;
    rows.push({kind: key, value: conditionValues(values), negate: !!match[1]});
  }
  return serializeBuilder(rows) ? rows : null;
}
export type DraftRule = {
  from: number;
  to: number;
  raw: string;
  note: string;
  expression: string;
  target: string;
  fallback: boolean;
  conditions: Condition[] | null;
  anchor: RuleAnchor;
};
type RuleDocument = {text: string; kind: RuleListKind; block: TextBlock | null; rows: DraftRule[]; ambiguous: boolean};
const listPath = (kind: RuleListKind) => (kind === 'routing' ? ['routing'] : ['dns', 'routing', kind]);
export function findBlocks(text: string, path: string[]): TextBlock[] {
  let blocks = scanConfig(text).blocks;
  for (const [index, name] of path.entries()) {
    const found = blocks.filter(b => b.name === name);
    if (index === path.length - 1) return found;
    blocks = found.flatMap(b => b.children);
  }
  return [];
}
export function parseRuleList(text: string, kind: RuleListKind): RuleDocument {
  const blocks = findBlocks(text, listPath(kind));
  const block = blocks.length === 1 ? blocks[0] : null;
  const document: RuleDocument = {
    text,
    kind,
    block,
    rows: [],
    ambiguous: listPath(kind).some((_, i, path) => findBlocks(text, path.slice(0, i + 1)).length > 1)
  };
  if (!block) return document;
  const tokens = scanConfig(text).tokens.filter(t => t.from > block.open && t.to <= block.close && t.kind !== 'comment');
  let i = 0;
  let cursor = block.open + 1;
  // Keep the initial newline with the block, then attach preceding comments to the following row.
  if (/^[ \t]*\r?\n/.test(text.slice(cursor))) cursor = text.indexOf('\n', cursor) + 1;
  while (i < tokens.length) {
    const first = tokens[i++];
    let last = first;
    while (i < tokens.length && (tokens[i].line === last.line || tokens[i].parens > 0)) last = tokens[i++];
    const newline = text.indexOf('\n', last.to);
    const to = newline < 0 || newline >= block.close ? last.to : newline + 1;
    const actual = tokens.filter(t => t.from >= first.from && t.to <= last.to);
    const rawToken = (n: number) => (actual[n] ? text.slice(actual[n].from, actual[n].to) : '');
    const fallback = ['fallback', 'default'].includes(rawToken(0)) && rawToken(1) === ':';
    const arrow = fallback ? actual[1] : actual.find(t => t.parens === 0 && text.slice(t.from, t.to) === '->');
    const before = arrow && actual[actual.indexOf(arrow) - 1];
    const expression = arrow && before ? text.slice(first.from, before.to) : text.slice(first.from, last.to);
    const target = arrow ? text.slice(arrow.to, last.to).trim() : '';
    const lineFrom = text.lastIndexOf('\n', first.from - 1) + 1;
    const anchor: RuleAnchor = {
      from: cursor,
      to,
      text: text.slice(cursor, to),
      indent: text.slice(Math.max(lineFrom, block.open + 1), first.from),
      ...(arrow ? {target: {from: arrow.to, to: last.to}} : {}),
      ...(!fallback && before ? {condition: {from: first.from, to: before.to}} : {})
    };
    const note = text
      .slice(cursor, first.from)
      .split(/\r?\n/)
      .filter(line => /^\s*#/.test(line))
      .map(line => line.replace(/^\s*#\s?/, ''))
      .join('\n');
    document.rows.push({
      from: cursor,
      to,
      raw: text.slice(cursor, to),
      note,
      expression,
      target,
      fallback,
      conditions: !fallback && arrow ? parseBuilder(expression, kind) : null,
      anchor
    });
    cursor = to;
  }
  document.ambiguous ||= document.rows.filter(row => row.fallback).length > 1;
  return document;
}
// Unedited slots retain their original bytes, including whitespace and comments.
export function writeRuleList(doc: RuleDocument, rows: DraftRule[] = doc.rows): string {
  if (rows.length !== doc.rows.length) throw new Error('Rule slot count changed');
  let result = '';
  let cursor = 0;
  for (let i = 0; i < doc.rows.length; i++) {
    const slot = doc.rows[i];
    result += doc.text.slice(cursor, slot.from) + rows[i].raw;
    cursor = slot.to;
  }
  return result + doc.text.slice(cursor);
}
export function moveRule(text: string, kind: RuleListKind, from: number, to: number): string {
  const doc = parseRuleList(text, kind);
  const slots = doc.rows.map((r, i) => (!r.fallback ? i : -1)).filter(i => i >= 0);
  if (from === to || slots[from] === undefined || slots[to] === undefined) return text;
  const ordered = slots.map(i => doc.rows[i]);
  const [moved] = ordered.splice(from, 1);
  ordered.splice(to, 0, moved);
  const rows = [...doc.rows];
  slots.forEach((slot, i) => (rows[slot] = ordered[i]));
  return writeRuleList(doc, rows);
}
export function ensureBlock(text: string, path: string[]): string {
  if (findBlocks(text, path).length) return text;
  if (path.length === 1) return text + `${text.endsWith('\n') ? '' : '\n'}${path[0]} {\n}\n`;
  text = ensureBlock(text, path.slice(0, -1));
  const parent = findBlocks(text, path.slice(0, -1));
  if (parent.length !== 1) throw new Error('Ambiguous block');
  const block = parent[0];
  const at = text.lastIndexOf('\n', block.close - 1) + 1;
  const indent = '  '.repeat(path.length - 1);
  const pos = /^[ \t]*$/.test(text.slice(at, block.close)) ? at : block.close;
  return text.slice(0, pos) + `${indent}${path.at(-1)} {\n${indent}}\n` + text.slice(pos);
}
export function addDraftRule(text: string, kind: RuleListKind, condition: string, target: string, position: 'first' | 'last' = 'last'): string {
  text = ensureBlock(text, listPath(kind));
  const doc = parseRuleList(text, kind);
  if (!doc.block || doc.ambiguous) throw new Error('Ambiguous block');
  const fallback = doc.rows.find(r => r.fallback);
  const line = text.lastIndexOf('\n', doc.block.close - 1) + 1;
  const at = (position === 'first' ? doc.rows[0]?.from : fallback?.from) ?? (/^[ \t]*$/.test(text.slice(line, doc.block.close)) ? line : doc.block.close);
  const indent = doc.rows[0]?.anchor.indent || '  '.repeat(listPath(kind).length);
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  return text.slice(0, at) + (text[at - 1] === '\n' ? '' : eol) + `${indent}${ruleLine(condition, target)}${eol}` + text.slice(at);
}
export function editDraftRule(text: string, rule: DraftRule, conditions: Condition[], target: string): string {
  const condition = serializeBuilder(conditions);
  if (!condition) throw new Error('Invalid condition');
  // Saving an unchanged form must not normalize the original condition spelling.
  const unchanged = JSON.stringify(conditions) === JSON.stringify(rule.conditions);
  return replaceRule(text, rule.anchor, unchanged ? rule.expression : condition, target, false) ?? text;
}
export function setFallback(text: string, kind: RuleListKind, target: string): string {
  text = ensureBlock(text, listPath(kind));
  const doc = parseRuleList(text, kind);
  const row = doc.rows.find(r => r.fallback);
  if (row) return replaceRule(text, row.anchor, '', target, false) ?? text;
  if (!doc.block || doc.ambiguous) throw new Error('Ambiguous block');
  const line = text.lastIndexOf('\n', doc.block.close - 1) + 1;
  const at = /^[ \t]*$/.test(text.slice(line, doc.block.close)) ? line : doc.block.close;
  const indent = doc.rows[0]?.anchor.indent || '  '.repeat(listPath(kind).length);
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  return text.slice(0, at) + (text[at - 1] === '\n' ? '' : eol) + `${indent}fallback: ${target}${eol}` + text.slice(at);
}

export function changeCount(before: string, after: string): number {
  const diff = lineDiff(before, after);
  return Math.max(diff.filter(row => row.kind === 'add').length, diff.filter(row => row.kind === 'del').length);
}

// The mode marker belongs to the mode control. Visual edits preserve its original bytes.
export function stageAuthoredRules(before: string, after: string): string {
  if (writeMode(before, {mode: 'rule'}) === after) return before;
  const mode = readMode(before);
  if (mode.mode === 'rule') return after;
  const lines = before.split(/(?<=\n)/);
  const owned = modeRuleLines(before)
    .map(line => lines[line - 1])
    .join('');
  const doc = parseRuleList(after, 'routing');
  const first = doc.rows.find(row => row.fallback || !/\(\s*must\s*\)\s*$/.test(row.target));
  const at = first?.from ?? after.lastIndexOf('\n', doc.block!.close - 1) + 1;
  return after.slice(0, at) + owned + after.slice(at);
}
