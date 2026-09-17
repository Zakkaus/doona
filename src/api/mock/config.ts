import type {ConfigDiagnostic, ConfigSource, ConfigValidationRequest, ConfigValidationResult} from '../model';
import {ApiError} from '../error';

type Draft = Omit<ConfigSource, 'content_sha256' | 'bytes' | 'line_count'> & {content: string};
type Stored = ConfigSource & {content: string};

const sections = new Set(['global', 'subscription', 'node', 'group', 'dns', 'routing', 'upstream', 'request', 'response']);
const builtinOutbounds = new Set(['direct', 'block', 'must_direct', 'must_block']);
const globalKeys = new Set([
  'tproxy_port',
  'log_level',
  'lan_interface',
  'wan_interface',
  'allow_insecure',
  'auto_config_kernel_parameter',
  'tcp_check_url',
  'udp_check_dns',
  'check_interval',
  'check_tolerance',
  'dial_mode',
  'disable_waiting_network',
  'enable_local_tcp_fast_redirect',
  'sniffing_timeout',
  'tls_implementation',
  'so_mark_reserved_upper',
  'pprof_port'
]);

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export const lineCount = (text: string) => (text === '' ? 0 : text.replace(/\n$/, '').split('\n').length);
export async function stored(draft: Draft): Promise<Stored> {
  return {...draft, content_sha256: await sha256(draft.content), bytes: new TextEncoder().encode(draft.content).length, line_count: lineCount(draft.content)};
}

// A small dae checker for the demo: braces must balance, sections must be known, routing lines must be
// rules, includes or the fallback, and rule targets must be groups the candidate defines or built-ins.
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
    const open = /^([A-Za-z_][\w.-]*)\s*\{\s*(.*)$/.exec(code);
    if (open) {
      const name = open[1];
      if (stack.length === 0 && !sections.has(name)) at(line, 1, 'error', 'unknown_section', `Unknown section "${name}"`);
      stack.push({name, line});
      if (/\}\s*$/.test(open[2])) stack.pop();
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
      if (mode === 'full' && !builtinOutbounds.has(target) && !groups.has(target))
        at(line, code.length - target.length + 1, 'error', 'unknown_outbound', `No group named "${target}"`);
      if (rule && !/\w\(/.test(rule[1])) at(line, 1, 'warning', 'bare_condition', 'Condition has no function call; it will never match');
    }
  });
  for (const left of stack) at(left.line, 1, 'error', 'section_not_closed', `Section "${left.name}" is never closed`);
  return out;
}
// Groups a candidate main source defines, for full validation.
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
