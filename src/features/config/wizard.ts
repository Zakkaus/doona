// Rewrite owned subscription/routing sections and append required groups; preserve unrecognized lines and all other sections verbatim. This uses brace matching, not a dae parser.
import {defaultTemplate, quote, templates, type RuleTemplate} from './templates';

type Subscription = {name: string; url: string; raw?: string};
export type {RuleTemplate};
export {defaultTemplate};
export type WizardState = {subscriptions: Subscription[]; group: string | null; rules: 'keep' | RuleTemplate; lanInterface: string};

const ident = (value: string) => value.trim().replace(/[^\w-]/g, '-');
export const isSubscriptionUrl = (value: string) => /^https?:\/\/\S+$/.test(value.trim());

type Section = {name: string; start: number; end: number; body: string[]};
function sections(lines: string[]): Section[] {
  const out: Section[] = [];
  let open: {name: string; start: number; depth: number} | null = null;
  lines.forEach((raw, index) => {
    const code = raw.replace(/#.*$/, '');
    if (!open) {
      const match = /^([A-Za-z_][\w.-]*)\s*\{/.exec(code.trim());
      if (!match) return;
      open = {name: match[1], start: index, depth: 0};
    }
    open.depth += (code.match(/\{/g) ?? []).length - (code.match(/\}/g) ?? []).length;
    if (open.depth === 0) {
      // A section written on one line (`node { 'a': '...' }`) has its body between the braces of that line.
      const body = open.start === index ? [code.slice(code.indexOf('{') + 1, code.lastIndexOf('}'))] : lines.slice(open.start + 1, index);
      out.push({name: open.name, start: open.start, end: index, body});
      open = null;
    }
  });
  return out;
}

function groupNames(body: string[]): string[] {
  return body.map(line => /^[ \t]*([^\s{}]+)[ \t]*\{/.exec(line.replace(/#.*$/, ''))?.[1]).filter((name): name is string => !!name);
}
export function readState(text: string): WizardState {
  const lines = text.split('\n');
  const found = sections(lines);
  const subscriptions: Subscription[] = [];
  for (const line of found.find(s => s.name === 'subscription')?.body ?? []) {
    const match = /^\s*(?:'([^']*)'|([\w.-]+))\s*:\s*'([^']*)'\s*$/.exec(line.replace(/#.*$/, ''));
    // Only an http(s) URL is edited in the form; a file or any other shape stays as written.
    if (match && isSubscriptionUrl(match[3])) subscriptions.push({name: match[1] ?? match[2], url: match[3], raw: line});
    else subscriptions.push({name: '', url: '', raw: line});
  }
  const group = groupNames(found.find(s => s.name === 'group')?.body ?? [])[0] ?? null;
  const lan = /^\s*lan_interface:\s*(\S+)/m.exec(found.find(s => s.name === 'global')?.body.join('\n') ?? '')?.[1];
  return {subscriptions, group, rules: 'keep', lanInterface: lan && lan !== 'auto' ? lan : ''};
}

function subscriptionBlock(state: WizardState): string[] {
  return ['subscription {', ...state.subscriptions.map(s => s.raw ?? `  ${ident(s.name) || 'sub'}: ${quote(s.url.trim())}`), '}'];
}
export const defaultGroup = 'proxy';
function routingBlock(state: WizardState, rules: RuleTemplate): string[] {
  // The name as written: the templates must route to the group the file already has.
  const first = state.group ?? defaultGroup;
  const fill = (line: string) => '  ' + line.replaceAll('{group}', first);
  return ['routing {', ...templates[rules].rules.map(fill), fill(`fallback: ${templates[rules].fallback}`), '}'];
}
const dnsBlock = [
  'dns {',
  '  upstream {',
  "    cloudflare: 'tls://1.1.1.1:853'",
  "    alidns: 'udp://223.5.5.5:53'",
  '  }',
  '  routing {',
  '    request {',
  '      qname(geosite:cn) -> alidns',
  '      fallback: cloudflare',
  '    }',
  '  }',
  '}'
];
function globalBlock(state: WizardState): string[] {
  return [
    'global {',
    '  tproxy_port: 12345',
    '  log_level: info',
    `  lan_interface: ${state.lanInterface.trim() || 'auto'}`,
    '  wan_interface: auto',
    '  allow_insecure: false',
    '  auto_config_kernel_parameter: true',
    '}'
  ];
}

function groupLines(current: string[], rules: RuleTemplate | 'keep'): string[] {
  const have = new Set(current);
  const wanted = rules === 'keep' ? [] : templates[rules].groups.filter(group => !have.has(group.name));
  if (!wanted.length && current.length) return [];
  if (!wanted.length) return [`  ${defaultGroup} { filter: !name('direct', 'block') policy: min_moving_avg }`];
  return wanted.flatMap(group => [`  # ${group.label}`, `  ${group.name} {`, ...group.lines.map(line => '    ' + line), '  }']);
}
export function writeState(current: string, state: WizardState): string {
  if (current.trim() === '') {
    return [
      ...globalBlock(state),
      '',
      ...subscriptionBlock(state),
      '',
      'group {',
      ...groupLines([], state.rules === 'keep' ? defaultTemplate : state.rules),
      '}',
      '',
      ...dnsBlock,
      '',
      ...routingBlock(state, state.rules === 'keep' ? defaultTemplate : state.rules),
      ''
    ].join('\n');
  }
  const lines = current.replace(/\n$/, '').split('\n');
  const found = sections(lines);
  const replacements = new Map<string, string[]>([['subscription', subscriptionBlock(state)]]);
  const groupSection = found.find(section => section.name === 'group');
  const missing = groupLines(groupNames(groupSection?.body ?? []), state.rules);
  if (!groupSection) replacements.set('group', ['group {', ...missing, '}']);
  else if (missing.length) replacements.set('group', [...lines.slice(groupSection.start, groupSection.end), ...missing, lines[groupSection.end]]);
  if (state.rules !== 'keep') replacements.set('routing', routingBlock(state, state.rules));
  const out: string[] = [];
  const done = new Set<string>();
  let index = 0;
  for (const section of found) {
    out.push(...lines.slice(index, section.start));
    const replacement = replacements.get(section.name);
    if (replacement && !done.has(section.name)) {
      out.push(...replacement);
      done.add(section.name);
    } else out.push(...lines.slice(section.start, section.end + 1));
    index = section.end + 1;
  }
  out.push(...lines.slice(index));
  for (const [name, block] of replacements) if (!done.has(name)) out.push('', ...block);
  return out.join('\n') + '\n';
}
