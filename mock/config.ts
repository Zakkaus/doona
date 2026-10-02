import type {ConfigDiagnostic, ConfigSource, ConfigValidationRequest, ConfigValidationResult} from '../src/api/model';
import {ApiError} from '../src/api/error';
import {sha256} from '../src/api/hash';
import * as vocab from '../src/dae/vocab';
import {blockEntries, scanConfig, uncomment, unquote, type TextBlock} from '../src/dae/text';
import {globMatch, isGlob, resolveIncludePath} from '../src/dae/newSource';

// `onDisk` is the text the digest and size describe when the served content is a redacted copy of it.
type Draft = Omit<ConfigSource, 'content_sha256' | 'bytes' | 'line_count'> & {content: string; onDisk?: string};
type Stored = ConfigSource & {content: string};

const sections = new Set(['global', 'subscription', 'node', 'group', 'dns', 'routing', 'upstream', 'request', 'response', 'include', 'experimental']);
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
  return linesOf(text, ranges);
}
// The statement lines directly inside one block, as sectionLines reads a top-level section.
export const blockLines = (text: string, block: TextBlock) =>
  linesOf(
    text,
    blockEntries(text, block).filter(entry => !entry.block)
  );
function linesOf(text: string, ranges: Array<{from: number; to: number}>) {
  return ranges.flatMap(({from, to}) => {
    const firstLine = text.slice(0, from).split('\n').length;
    return text
      .slice(from, to)
      .split('\n')
      .map((raw, index) => ({code: uncomment(raw).trim(), raw, line: firstLine + index}));
  });
}

export function includePaths(text: string) {
  return [
    ...sectionLines(text, 'include')
      .filter(({code}) => code)
      .map(({code, line}) => ({path: unquote(code), line})),
    ...sectionLines(text, 'routing', true).flatMap(({code, line}) => {
      const match = /^include\s+(\S+)$/.exec(code);
      return match ? [{path: unquote(match[1]), line}] : [];
    })
  ];
}

// The files an include of `path` loads, resolved against the main source at `base` whichever file holds it: every match
// of a glob, or the one file named.
export const includedFiles = <T extends {path: string}>(files: T[], base: string, path: string) =>
  files.filter(file => globMatch(resolveIncludePath(base, path), resolveIncludePath(undefined, file.path)));

// Demo-only validation checks braces, sections, routing syntax, and outbound references.
export function diagnose(sourceId: string, text: string, groups: Set<string>, mode: 'syntax' | 'full'): ConfigDiagnostic[] {
  const out: ConfigDiagnostic[] = [];
  const at = (line: number, column: number, level: ConfigDiagnostic['level'], code: string, message: string, params?: Record<string, string>) =>
    out.push({level, source_id: sourceId, line, column, span: null, code, message, ...(params ? {params} : {})});
  const {blocks, tokens} = scanConfig(text);
  const checkBlock = (block: TextBlock) => {
    if (block.depth === 0 && !sections.has(block.name))
      at(block.line + 1, 1, 'error', 'unknown_section', `Unknown section "${block.name}"`, {name: block.name});
    if (block.close === text.length) at(block.line + 1, 1, 'error', 'section_not_closed', `Section "${block.name}" is never closed`, {name: block.name});
    block.children.forEach(checkBlock);
  };
  blocks.forEach(checkBlock);
  const removed = new Set<string>();
  for (const block of blocks.filter(block => block.name === 'experimental').flatMap(block => block.children.filter(child => child.name === 'native_api'))) {
    for (const {code, line} of blockLines(text, block)) {
      const key = /^(probe_allowed_cidrs|probe_allowed_ports)\s*:/.exec(code)?.[1];
      if (!key || removed.has(key)) continue;
      removed.add(key);
      at(line, 1, 'warning', 'legacy-config-warning', `experimental.native_api.${key} was removed and can be deleted; its value is ignored`);
    }
  }
  for (const token of tokens) {
    if (token.kind === 'symbol' && token.depth === 0 && text[token.from] === '}')
      at(token.line + 1, 1, 'error', 'brace_without_section', 'Closing brace without an open section');
  }
  for (const {code, line} of sectionLines(text, 'global')) {
    if (!code) continue;
    const pair = /^([\w.-]+)\s*:\s*(.*)$/.exec(code);
    if (!pair) at(line, 1, 'error', 'not_a_setting', 'Expected "<key>: <value>"');
    else if (!globalKeys.has(pair[1])) at(line, 1, 'error', 'unknown_key', `Unknown global setting "${pair[1]}"`, {name: pair[1]});
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
      at(line, raw.lastIndexOf(target) + 1, 'error', 'unknown_outbound', `No group named "${outbound}"`, {name: outbound});
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

export function validate(
  request: ConfigValidationRequest,
  generationId: string,
  // `local` holds files a plain include may name beyond the request; `active` is the accepted source set a full validation
  // compares restart-only settings against.
  {local = [], active}: {local?: ConfigValidationRequest['sources']; active?: {id: string; content: string}[]} = {}
): ConfigValidationResult {
  const sources = request.sources.map((source, index) => ({...source, id: source.id ?? `source-${index + 1}`}));
  if (new Set(sources.map(source => source.id)).size !== sources.length) throw new ApiError(400, 'invalid_request', 'Source IDs must be unique');
  const diagnostics: ConfigDiagnostic[] = [];
  if (request.mode === 'full') {
    // The first source is the main one; every include resolves from its directory.
    const base = sources[0]?.path;
    const byPath = new Map([...local, ...sources].filter(source => source.path).map(source => [resolveIncludePath(undefined, source.path!), source]));
    const visited = new Set(sources.map(source => source.path && resolveIncludePath(undefined, source.path)));
    for (let index = 0; index < sources.length; index++) {
      const source = sources[index];
      for (const {path, line} of includePaths(source.content)) {
        const resolved = resolveIncludePath(base, path);
        // A glob may match no file yet; a plain path names one that must exist.
        if (isGlob(path)) {
          for (const [file, dependency] of byPath)
            if (globMatch(resolved, file) && !visited.has(file)) {
              visited.add(file);
              sources.push({...dependency, id: dependency.id ?? `source-${sources.length + 1}`});
            }
          continue;
        }
        const dependency = byPath.get(resolved);
        if (!dependency) {
          diagnostics.push({
            source_id: source.id,
            line,
            column: 1,
            span: null,
            level: 'error',
            code: 'include_not_found',
            message: `Include \"${path}\" cannot be resolved`,
            params: {path}
          });
        } else if (!visited.has(resolved)) {
          visited.add(resolved);
          sources.push({...dependency, id: dependency.id ?? `source-${sources.length + 1}`});
        }
      }
    }
  }
  const groups = request.mode === 'full' ? new Set(sources.flatMap(source => [...groupsIn(source.content)])) : new Set<string>();
  diagnostics.push(...sources.flatMap(source => diagnose(source.id, source.content, groups, request.mode)));
  if (request.mode === 'full' && active) diagnostics.push(...restartDiagnostics(active, sources));
  return {valid: !diagnostics.some(item => item.level === 'error'), diagnostics, generation_id: generationId, validated_at: new Date().toISOString()};
}

// The demo mirrors honk's global restart-only settings, so a candidate set that changes one of them from the accepted
// files is refused as honk's reload check refuses it. Each setting is read from the first statement in the global
// sections, so neither source IDs nor the layout of the block matter.
const restartOnlyKeys = [
  'check_interval',
  'tcp_check_url',
  'tcp_check_http_method',
  'udp_check_dns',
  'tls_implementation',
  'tproxy_port',
  'tproxy_mark',
  'tproxy_port_protect',
  'pprof_port',
  'so_mark_from_dae',
  'log_level',
  'log_file',
  'lan_interface',
  'wan_interface',
  'auto_config_kernel_parameter',
  'data_dir',
  'store_subscribe',
  'nfqueue_enable'
];
const globalSettings = (sources: {id: string; content: string}[]) => {
  const first = new Map<string, {id: string; line: number; value: string}>();
  for (const {id, content} of sources)
    for (const {code, line} of sectionLines(content, 'global')) {
      const match = /^(\w+)\s*:\s*(.*)$/.exec(code);
      if (match && !first.has(match[1])) first.set(match[1], {id, line, value: unquote(match[2])});
    }
  return first;
};
function restartDiagnostics(active: {id: string; content: string}[], candidate: {id: string; content: string}[]): ConfigDiagnostic[] {
  const before = globalSettings(active);
  const after = globalSettings(candidate);
  // honk compares tls_implementation only as "is utls". Removing a setting is not flagged: only a new value is a change the demo can name.
  const isUtls = (value?: string) => value?.toLowerCase() === 'utls';
  return restartOnlyKeys.flatMap(key => {
    const next = after.get(key);
    const prev = before.get(key);
    if (!next || (key === 'tls_implementation' ? isUtls(next.value) === isUtls(prev?.value) : next.value === prev?.value)) return [];
    return [
      {
        level: 'error' as const,
        source_id: next.id,
        line: next.line,
        column: null,
        span: null,
        code: 'restart-required',
        message: `Changing global.${key} requires restarting honk`
      }
    ];
  });
}
