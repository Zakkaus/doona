import type {ConfigDiagnostic, ConfigSource, ConfigValidationRequest, ConfigValidationResult} from '../model';
import {ApiError} from '../error';
import {sha256} from '../hash';
import * as vocab from '../daeVocab';

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

// Demo-only validation checks braces, sections, routing syntax, and outbound references.
export function diagnose(sourceId: string, text: string, groups: Set<string>, mode: 'syntax' | 'full'): ConfigDiagnostic[] {
  const out: ConfigDiagnostic[] = [];
  const at = (line: number, column: number, level: ConfigDiagnostic['level'], code: string, message: string) =>
    out.push({level, source_id: sourceId, line, column, span: null, code, message});
  const stack: Array<{name: string; line: number}> = [];
  // A file without sections is an include of bare rules, read as if inside routing.
  const bare = !/\{/.test(text);
  const lines = text.split('\n');
  lines.forEach((raw, index) => {
    const line = index + 1;
    const code = raw.replace(/#.*$/, '').trim();
    if (!code) return;
    // A section is `name {`; an entry block inside one is `tag: {`, the tag quoted or bare.
    const open = /^(?:'([^']*)'|"([^"]*)"|([A-Za-z_][\w.-]*))\s*:?\s*\{\s*(.*)$/.exec(code);
    if (open) {
      const name = open[1] ?? open[2] ?? open[3];
      if (stack.length === 0 && !sections.has(name)) at(line, 1, 'error', 'unknown_section', `Unknown section "${name}"`);
      stack.push({name, line});
      if (/\}\s*$/.test(open[4])) stack.pop();
      return;
    }
    if (code === '}') {
      if (!stack.pop()) at(line, 1, 'error', 'brace_without_section', 'Closing brace without an open section');
      return;
    }
    const section = bare ? 'routing' : stack[stack.length - 1]?.name;
    if (section === 'global') {
      const pair = /^([\w.-]+)\s*:\s*(.*)$/.exec(code);
      if (!pair) at(line, 1, 'error', 'not_a_setting', 'Expected "<key>: <value>"');
      else if (!globalKeys.has(pair[1])) at(line, 1, 'error', 'unknown_key', `Unknown global setting "${pair[1]}"`);
      return;
    }
    if (section === 'routing' && stack.length <= 1) {
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
        at(line, code.length - target.length + 1, 'error', 'unknown_outbound', `No group named "${outbound}"`);
      if (rule && !/\w\(/.test(rule[1])) at(line, 1, 'warning', 'bare_condition', 'Condition has no function call; it will never match');
    }
  });
  for (const left of stack) at(left.line, 1, 'error', 'section_not_closed', `Section "${left.name}" is never closed`);
  return out;
}
export function groupsIn(text: string): Set<string> {
  const names = new Set<string>();
  const body = /group\s*\{([\s\S]*?)\n\}/.exec(text)?.[1] ?? '';
  for (const match of body.matchAll(/^\s*([A-Za-z_][\w-]*)\s*\{/gm)) names.add(match[1]);
  return names;
}

export function validate(request: ConfigValidationRequest, generationId: string, fallbackGroups: Set<string>): ConfigValidationResult {
  const ids = request.sources.map((source, index) => source.id ?? `source-${index + 1}`);
  if (new Set(ids).size !== ids.length) throw new ApiError(400, 'invalid_request', 'Source IDs must be unique');
  const main = request.sources[0]?.content ?? '';
  const groups = request.mode === 'full' ? new Set([...groupsIn(main), ...(groupsIn(main).size ? [] : fallbackGroups)]) : new Set<string>();
  const diagnostics = request.sources.flatMap((source, index) => diagnose(ids[index], source.content, groups, request.mode));
  return {valid: !diagnostics.some(item => item.level === 'error'), diagnostics, generation_id: generationId, validated_at: new Date().toISOString()};
}
