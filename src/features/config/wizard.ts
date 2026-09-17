// The quick setup edits `subscription` (one entry per line) and swaps `routing` for a template; `group` is
// only read, to find the group the templates route to, and a main source without one gets a single `proxy`.
// Every other section, and every subscription line the form does not recognise, is kept verbatim; a missing
// main source is generated whole. No dae parser: sections are cut by brace matching.
// `raw` is the line as it stands in the file; a line the form has not changed is written back untouched.
export type Subscription = {name: string; url: string; raw?: string};
export type WizardState = {subscriptions: Subscription[]; group: string | null; rules: 'keep' | RuleTemplate; lanInterface: string};

export type RuleTemplate = 'dae' | 'whitelist' | 'blacklist' | 'global';
// The preset lines dae ships in example.dae: keep the local network manager and LAN traffic off the proxy, and
// drop HTTP/3, which the engine cannot proxy well and which browsers retry over TCP anyway.
const preset = [
  '# dae presets: the local network manager, the LAN and multicast stay off the proxy',
  'pname(NetworkManager) -> direct',
  "dip(224.0.0.0/3, 'ff00::/8') -> direct",
  'dip(geoip:private) -> direct',
  '# HTTP/3 cannot be proxied; block it so browsers fall back to TCP',
  'l4proto(udp) && dport(443) -> block'
];
const ads = ['# Advertising', 'domain(geosite:category-ads-all) -> block'];
const china = ['# Mainland China direct', 'domain(geosite:cn) -> direct', 'dip(geoip:cn) -> direct'];
// Templates in dae's own syntax. Category names are the v2fly geosite/geoip tags as shipped by
// Loyalsoldier/v2ray-rules-dat, the data set dae fetches by default; the whitelist and blacklist templates are
// that project's documented routing configurations, line for line. `{group}` is the first group.
export const templates: Record<RuleTemplate, {rules: string[]; fallback: string}> = {
  // The routing section of dae's example.dae.
  dae: {rules: [...preset, ...china], fallback: '{group}'},
  // Loyalsoldier whitelist mode: adverts dropped, Chinese services of global vendors and games sold in China
  // direct, known overseas destinations through the group, mainland China direct, the rest through the group.
  whitelist: {
    rules: [
      ...preset,
      ...ads,
      '# Chinese services of global vendors and games sold in China direct',
      'domain(geosite:private, geosite:apple-cn, geosite:google-cn, geosite:tld-cn, geosite:category-games@cn) -> direct',
      '# Known overseas destinations through the group',
      'domain(geosite:geolocation-!cn) -> {group}',
      ...china
    ],
    fallback: '{group}'
  },
  // Loyalsoldier blacklist mode: adverts dropped, the GFW list and Telegram through the group, the rest direct.
  blacklist: {
    rules: [...preset, ...ads, '# The GFW list and Telegram through the group', 'domain(geosite:gfw) -> {group}', 'dip(geoip:telegram) -> {group}'],
    fallback: 'direct'
  },
  // Everything except the presets through the group.
  global: {rules: [...preset], fallback: '{group}'}
};

const ident = (value: string) => value.trim().replace(/[^\w-]/g, '-');
const quote = (value: string) => "'" + value.replace(/'/g, '') + "'";
export const isSubscriptionUrl = (value: string) => /^https?:\/\/\S+$/.test(value.trim());

type Section = {name: string; start: number; end: number; body: string[]};
// Top-level sections with their line ranges (inclusive of the braces).
function sections(lines: string[]): Section[] {
  const out: Section[] = [];
  let open: {name: string; start: number; depth: number} | null = null;
  lines.forEach((raw, index) => {
    const code = raw.replace(/#.*$/, '');
    if (!open) {
      const match = /^([A-Za-z_][\w.-]*)\s*\{\s*$/.exec(code.trim());
      if (match) open = {name: match[1], start: index, depth: 1};
      return;
    }
    open.depth += (code.match(/\{/g) ?? []).length - (code.match(/\}/g) ?? []).length;
    if (open.depth === 0) {
      out.push({name: open.name, start: open.start, end: index, body: lines.slice(open.start + 1, index)});
      open = null;
    }
  });
  return out;
}

// What the current text says, for the form: the recognised `tag: 'url'` lines, the first group's name.
export function readState(text: string): WizardState {
  const lines = text.split('\n');
  const found = sections(lines);
  const subscriptions: Subscription[] = [];
  for (const line of found.find(s => s.name === 'subscription')?.body ?? []) {
    const match = /^\s*(?:'([^']*)'|([\w.-]+))\s*:\s*'([^']*)'\s*$/.exec(line.replace(/#.*$/, ''));
    if (match) subscriptions.push({name: match[1] ?? match[2], url: match[3], raw: line});
    else if (line.trim()) subscriptions.push({name: '', url: '', raw: line});
  }
  const group = /^\s*([\w-]+)\s*\{/m.exec(found.find(s => s.name === 'group')?.body.join('\n') ?? '')?.[1] ?? null;
  const lan = /^\s*lan_interface:\s*(\S+)/m.exec(found.find(s => s.name === 'global')?.body.join('\n') ?? '')?.[1];
  return {subscriptions, group, rules: 'keep', lanInterface: lan && lan !== 'auto' ? lan : ''};
}

function subscriptionBlock(state: WizardState): string[] {
  return ['subscription {', ...state.subscriptions.map(s => s.raw ?? `  ${ident(s.name) || 'sub'}: ${quote(s.url.trim())}`), '}'];
}
export const defaultGroup = 'proxy';
function routingBlock(state: WizardState, rules: RuleTemplate): string[] {
  const first = ident(state.group ?? defaultGroup) || defaultGroup;
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

const groupBlock = ['group {', `  ${defaultGroup} { policy: min_moving_avg }`, '}'];
// The text to write: the current text with subscription replaced (and routing when a template is chosen), a
// group section added when there is none, or a whole file when there is no text to keep.
export function writeState(current: string, state: WizardState): string {
  if (current.trim() === '') {
    return [
      ...globalBlock(state),
      '',
      ...subscriptionBlock(state),
      '',
      ...groupBlock,
      '',
      ...dnsBlock,
      '',
      ...routingBlock(state, state.rules === 'keep' ? 'whitelist' : state.rules),
      ''
    ].join('\n');
  }
  const lines = current.replace(/\n$/, '').split('\n');
  const replacements = new Map<string, string[]>([['subscription', subscriptionBlock(state)]]);
  if (!state.group) replacements.set('group', groupBlock);
  if (state.rules !== 'keep') replacements.set('routing', routingBlock(state, state.rules));
  const out: string[] = [];
  const done = new Set<string>();
  const found = sections(lines);
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
