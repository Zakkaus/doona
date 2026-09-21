import {blockBody, blockFields, scanConfig, uncomment} from './blocks';
import {readGroupEntries} from './groups';
import {defaultTemplate, quote, templates, type RuleTemplate} from './templates';

type Subscription = {name: string; url: string; raw?: string; section?: number};
export type {RuleTemplate};
export {defaultTemplate};
export type WizardState = {subscriptions: Subscription[]; group: string | null; rules: 'keep' | RuleTemplate; lanInterface: string};

const ident = (value: string) => value.trim().replace(/[^\w-]/g, '-');
export const isSubscriptionUrl = (value: string) => /^https?:\/\/\S+$/.test(value.trim());

export function readState(text: string): WizardState {
  const {blocks, tokens} = scanConfig(text);
  const subscriptions: Subscription[] = [];
  for (const [section, block] of blocks.filter(block => block.name === 'subscription').entries()) {
    for (const line of blockBody(text, block)) {
      const match = /^\s*(?:'([^']*)'|([\w.-]+))\s*:\s*'([^']*)'\s*$/.exec(uncomment(line));
      // Only an http(s) URL is edited in the form; a file or any other shape stays as written.
      if (match && isSubscriptionUrl(match[3])) subscriptions.push({name: match[1] ?? match[2], url: match[3], raw: line, section});
      else subscriptions.push({name: '', url: '', raw: line, section});
    }
  }
  const group = readGroupEntries(text)[0]?.name ?? null;
  const global = blocks.find(block => block.name === 'global');
  const lan = global ? blockFields(text, global, tokens).find(field => field.name === 'lan_interface')?.value : undefined;
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
  const {blocks} = scanConfig(current);
  const edits: Array<{from: number; to: number; text: string}> = [];
  const subscriptionSections = blocks.filter(block => block.name === 'subscription');
  for (const [section, block] of subscriptionSections.entries()) {
    const subscriptions = state.subscriptions.filter(item => (item.section ?? 0) === section);
    const body = subscriptions.map(item => item.raw ?? `  ${ident(item.name) || 'sub'}: ${quote(item.url.trim())}`);
    if (body.join('\n') !== blockBody(current, block).join('\n')) {
      edits.push({from: block.open + 1, to: block.close, text: '\n' + body.join('\n') + '\n'});
    }
  }
  const appended: string[] = [];
  if (!subscriptionSections.length) appended.push(subscriptionBlock(state).join('\n'));
  const groupSection = blocks.find(block => block.name === 'group');
  const missing = groupLines(
    readGroupEntries(current).map(entry => entry.name),
    state.rules
  );
  if (!groupSection) appended.push(['group {', ...missing, '}'].join('\n'));
  else if (missing.length) {
    const at = current.lastIndexOf('\n', groupSection.close - 1) + 1;
    const inline = !/^[ \t]*$/.test(current.slice(at, groupSection.close));
    edits.push({from: inline ? groupSection.close : at, to: inline ? groupSection.close : at, text: (inline ? '\n' : '') + missing.join('\n') + '\n'});
  }
  if (state.rules !== 'keep') {
    const routing = blocks.find(block => block.name === 'routing');
    const text = routingBlock(state, state.rules).join('\n');
    if (routing) edits.push({from: routing.from, to: routing.to, text});
    else appended.push(text);
  }
  let out = current;
  for (const edit of edits.sort((a, b) => b.from - a.from)) out = out.slice(0, edit.from) + edit.text + out.slice(edit.to);
  if (appended.length) out = out.replace(/\n$/, '') + '\n\n' + appended.join('\n\n') + '\n';
  return out;
}
