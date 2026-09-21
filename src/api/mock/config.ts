import type {ConfigDiagnostic, ConfigSource, ConfigValidationRequest, ConfigValidationResult} from '../model';
import {ApiError} from '../error';
import {sha256} from '../hash';
import * as vocab from '../../dae/vocab';
import {blockEntries, scanConfig, uncomment, type TextBlock} from '../../dae/text';

// `onDisk` is the text the digest and size describe when the served content is a redacted copy of it.
type Draft = Omit<ConfigSource, 'content_sha256' | 'bytes' | 'line_count'> & {content: string; onDisk?: string};
type Stored = ConfigSource & {content: string};

const sections = new Set(['global', 'subscription', 'node', 'group', 'dns', 'routing', 'upstream', 'request', 'response']);
const builtinOutbounds = new Set(vocab.builtinOutbounds);
const globalKeys = new Set(vocab.globalKeys);

const lineCount = (text: string) => (text === '' ? 0 : text.replace(/\n$/, '').split('\n').length);
export async function stored({onDisk, ...draft}: Draft): Promise<Stored> {
  const text = onDisk ?? draft.content;
  return {...draft, content_sha256: await sha256(text), bytes: new TextEncoder().encode(text).length, line_count: lineCount(text)};
}

export function sectionLines(text: string, section: string, bare = false) {
  const {blocks} = scanConfig(text);
  const ranges = blocks.filter(block => block.name === section).flatMap(block => blockEntries(text, block).filter(entry => !entry.block));
  if (bare && !blocks.length) ranges.push({from: 0, to: text.length, block: undefined});
  return ranges.flatMap(({from, to}) => {
    const firstLine = text.slice(0, from).split('\n').length;
    return text
      .slice(from, to)
      .split('\n')
      .map((raw, index) => ({code: uncomment(raw).trim(), raw, line: firstLine + index}));
  });
}

// Demo-only validation checks braces, sections, routing syntax, and outbound references.
export function diagnose(sourceId: string, text: string, groups: Set<string>, mode: 'syntax' | 'full'): ConfigDiagnostic[] {
  const out: ConfigDiagnostic[] = [];
  const at = (line: number, column: number, level: ConfigDiagnostic['level'], code: string, message: string) =>
    out.push({level, source_id: sourceId, line, column, span: null, code, message});
  const {blocks, tokens} = scanConfig(text);
  const checkBlock = (block: TextBlock) => {
    if (block.depth === 0 && !sections.has(block.name)) at(block.line + 1, 1, 'error', 'unknown_section', `Unknown section "${block.name}"`);
    if (block.close === text.length) at(block.line + 1, 1, 'error', 'section_not_closed', `Section "${block.name}" is never closed`);
    block.children.forEach(checkBlock);
  };
  blocks.forEach(checkBlock);
  for (const token of tokens) {
    if (token.kind === 'symbol' && token.depth === 0 && text[token.from] === '}')
      at(token.line + 1, 1, 'error', 'brace_without_section', 'Closing brace without an open section');
  }
  for (const {code, line} of sectionLines(text, 'global')) {
    if (!code) continue;
    const pair = /^([\w.-]+)\s*:\s*(.*)$/.exec(code);
    if (!pair) at(line, 1, 'error', 'not_a_setting', 'Expected "<key>: <value>"');
    else if (!globalKeys.has(pair[1])) at(line, 1, 'error', 'unknown_key', `Unknown global setting "${pair[1]}"`);
  }
  sectionLines(text, 'routing', true).forEach(({code, raw, line}) => {
    if (!code) return;
    if (/^include\s+\S+$/.test(code)) return;
    const fallback = /^fallback:\s*(\S+)$/.exec(code);
    const rule = /^(.+?)\s*->\s*(\S+)$/.exec(code);
    const target = fallback?.[1] ?? rule?.[2];
    if (!target) {
      at(line, 1, 'error', 'not_a_rule', 'Expected "<condition> -> <outbound>", "include <file>" or "fallback: <outbound>"');
      return;
    }
    // `name(must)` and `name(mark: 0x800)` address the same outbound as `name`.
    const outbound = target.replace(/\(.*\)$/, '');
    if (mode === 'full' && !builtinOutbounds.has(target) && !builtinOutbounds.has(outbound) && !groups.has(outbound))
      at(line, raw.lastIndexOf(target) + 1, 'error', 'unknown_outbound', `No group named "${outbound}"`);
    if (rule && !/\w\(/.test(rule[1])) at(line, 1, 'warning', 'bare_condition', 'Condition has no function call; it will never match');
  });
  return out;
}
function groupsIn(text: string): Set<string> {
  return new Set(
    scanConfig(text)
      .blocks.filter(block => block.name === 'group')
      .flatMap(block => block.children.map(child => child.name))
  );
}

export function validate(request: ConfigValidationRequest, generationId: string): ConfigValidationResult {
  const ids = request.sources.map((source, index) => source.id ?? `source-${index + 1}`);
  if (new Set(ids).size !== ids.length) throw new ApiError(400, 'invalid_request', 'Source IDs must be unique');
  const main = request.sources[0]?.content ?? '';
  const groups = request.mode === 'full' ? groupsIn(main) : new Set<string>();
  const diagnostics = request.sources.flatMap((source, index) => diagnose(ids[index], source.content, groups, request.mode));
  return {valid: !diagnostics.some(item => item.level === 'error'), diagnostics, generation_id: generationId, validated_at: new Date().toISOString()};
}
