import {blockBody, blockEntries, blockFields, quote, scanConfig, unquote} from './text';
import {quoteName, readGroupEntries} from './groups';
import {defaultTemplate, templates, type RuleTemplate} from './templates';

type Subscription = {name: string; url: string; raw?: string; section?: number; tag?: string};
export type WizardState = {
  subscriptions: Subscription[];
  group: string | null;
  rules: 'keep' | RuleTemplate;
  lanInterface: string;
  listenerPort: string;
  defaultDns: string;
  chinaDns: string;
};

const networkDefaults = {listenerPort: '12345', defaultDns: 'tls://1.1.1.1:853', chinaDns: 'udp://223.5.5.5:53'};

export const isPort = (value: string) => /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 65535;
export function validNetwork(state: WizardState): boolean {
  return isPort(state.listenerPort) && !!state.defaultDns.trim() && !!state.chinaDns.trim();
}

export const isSubscriptionUrl = (value: string) => /^https?:\/\/\S+$/.test(value.trim());
export function validSubscriptions(subscriptions: Subscription[]): boolean {
  const names = subscriptions.map(item => item.name.trim() || item.tag).filter((name): name is string => !!name);
  return new Set(names).size === names.length && subscriptions.every(item => item.raw !== undefined || (!!item.name.trim() && isSubscriptionUrl(item.url)));
}

// The first free `sub-N`: counting rows alone repeats a name once one was removed or already taken.
export function nextSubscriptionName(subscriptions: Subscription[]): string {
  const taken = new Set(subscriptions.map(item => item.name.trim() || item.tag));
  let n = subscriptions.length + 1;
  while (taken.has(`sub-${n}`)) n++;
  return `sub-${n}`;
}

export function readState(text: string): WizardState {
  const {blocks, tokens} = scanConfig(text);
  const subscriptions: Subscription[] = [];
  for (const [section, block] of blocks.filter(block => block.name === 'subscription').entries()) {
    const fields = blockFields(text, block, tokens);
    if (!text.slice(block.open + 1, block.close).trim()) continue;
    for (const entry of blockEntries(text, block)) {
      const line = text.slice(entry.from, entry.to);
      const entryFields = fields.filter(field => field.from >= entry.from && field.to <= entry.to);
      const field = entry.block ? undefined : entryFields.length === 1 ? entryFields[0] : undefined;
      const url = field ? unquote(field.value) : '';
      if (field && isSubscriptionUrl(url)) subscriptions.push({name: field.name, url, raw: line, section});
      else subscriptions.push({name: '', url: '', raw: line, section, ...(entry.block || field ? {tag: entry.block?.name ?? field!.name} : {})});
    }
  }
  const group = readGroupEntries(text)[0]?.name ?? null;
  const global = blocks.find(block => block.name === 'global');
  const lan = global ? blockFields(text, global, tokens).find(field => field.name === 'lan_interface')?.value : undefined;
  return {subscriptions, group, rules: 'keep', lanInterface: lan && lan !== 'auto' ? lan : '', ...networkDefaults};
}

function subscriptionBlock(state: WizardState): string[] {
  return ['subscription {', ...state.subscriptions.map(s => s.raw ?? `  ${quoteName(s.name.trim())}: ${quote(s.url.trim())}`), '}'];
}
export const defaultGroup = 'proxy';
function routingBlock(state: WizardState, rules: RuleTemplate): string[] {
  // The name as written: the templates must route to the group the file already has.
  const first = state.group ?? defaultGroup;
  const fill = (line: string) => '  ' + line.replaceAll('{group}', quoteName(first));
  return ['routing {', ...templates[rules].rules.map(fill), fill(`fallback: ${templates[rules].fallback}`), '}'];
}
function dnsBlock(state: WizardState): string[] {
  return [
    'dns {',
    '  upstream {',
    `    cloudflare: ${quote(state.defaultDns.trim())}`,
    `    alidns: ${quote(state.chinaDns.trim())}`,
    '  }',
    '  routing {',
    '    request {',
    '      qname(geosite:cn) -> alidns',
    '      fallback: cloudflare',
    '    }',
    '  }',
    '}'
  ];
}
function globalBlock(state: WizardState): string[] {
  return [
    'global {',
    `  tproxy_port: ${state.listenerPort}`,
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
  if (!wanted.length && (current.length || rules === 'keep')) return [];
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
      ...dnsBlock(state),
      '',
      ...routingBlock(state, state.rules === 'keep' ? defaultTemplate : state.rules),
      ''
    ].join('\n');
  }
  const {blocks} = scanConfig(current);
  const edits: Array<{from: number; to: number; text: string}> = [];
  const subscriptionSections = blocks.filter(block => block.name === 'subscription');
  for (const [section, block] of subscriptionSections.entries()) {
    const subscriptions = state.subscriptions.filter(item => (item.section ?? subscriptionSections.length - 1) === section);
    const body = subscriptions.map(item => item.raw ?? `  ${quoteName(item.name.trim())}: ${quote(item.url.trim())}`);
    if (body.join('\n') !== blockBody(current, block).join('\n')) {
      edits.push({from: block.open + 1, to: block.close, text: '\n' + body.join('\n') + '\n'});
    }
  }
  const appended: string[] = [];
  if (!subscriptionSections.length && state.subscriptions.length) appended.push(subscriptionBlock(state).join('\n'));
  const groupSection = blocks.find(block => block.name === 'group');
  const missing = groupLines(
    readGroupEntries(current).map(entry => entry.name),
    state.rules
  );
  if (!groupSection && missing.length) appended.push(['group {', ...missing, '}'].join('\n'));
  else if (groupSection && missing.length) {
    const at = current.lastIndexOf('\n', groupSection.close - 1) + 1;
    const inline = !/^[ \t]*$/.test(current.slice(at, groupSection.close));
    edits.push({from: inline ? groupSection.close : at, to: inline ? groupSection.close : at, text: (inline ? '\n' : '') + missing.join('\n') + '\n'});
  }
  if (state.rules !== 'keep') {
    const routing = blocks.filter(block => block.name === 'routing');
    const text = routingBlock(state, state.rules).join('\n');
    if (routing.length) {
      routing.forEach((block, index) => edits.push({from: block.from, to: block.to, text: index === 0 ? text : ''}));
    } else appended.push(text);
  }
  let out = current;
  for (const edit of edits.sort((a, b) => b.from - a.from)) out = out.slice(0, edit.from) + edit.text + out.slice(edit.to);
  if (appended.length) out = out.replace(/\n$/, '') + '\n\n' + appended.join('\n\n') + '\n';
  return out;
}
