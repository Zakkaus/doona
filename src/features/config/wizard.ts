// The quick setup edits the two sections a person fills in by hand most: `subscription` and `group`. Both are
// one entry per line, so they are read and written line by line; every other section is kept verbatim, and a
// missing main source is generated whole from a template. No dae parser: sections are cut by brace matching.
export type Subscription = {name: string; url: string};
// `raw` is the line as it stands in the file; it is written back untouched until the form changes the group,
// so filters and policies the form cannot express survive a round trip.
// What a group is for: destination sets sent through it. The rules are generated from these, in list order.
export type Use = 'overseas' | 'streaming' | 'telegram' | 'ai' | 'games' | 'dev' | 'social' | 'apple' | 'google' | 'microsoft';
export const useRules: Record<Use, string> = {
  overseas: 'domain(geosite:geolocation-!cn)',
  streaming: 'domain(geosite:netflix, geosite:youtube, geosite:disney, geosite:hbo, geosite:spotify, geosite:primevideo)',
  telegram: 'domain(geosite:telegram)',
  ai: 'domain(geosite:openai, geosite:anthropic, geosite:category-ai-chat-!cn)',
  games: 'domain(geosite:category-games)',
  dev: 'domain(geosite:github, geosite:docker, geosite:python, geosite:npmjs, geosite:huggingface)',
  social: 'domain(geosite:twitter, geosite:facebook, geosite:instagram, geosite:reddit, geosite:discord)',
  apple: 'domain(geosite:apple)',
  google: 'domain(geosite:google)',
  microsoft: 'domain(geosite:microsoft)'
};
export const uses = Object.keys(useRules) as Use[];
export type GroupSpec = {name: string; policy: 'auto' | 'manual'; subscriptions: string[]; uses: Use[]; raw?: string};
export type WizardState = {
  subscriptions: Subscription[];
  groups: GroupSpec[];
  // keep the routing text as written, or generate it from the groups' uses.
  rules: 'keep' | 'generate';
  ads: boolean;
  chinaDirect: boolean;
  fallback: 'first' | 'direct';
  lanInterface: string;
};

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

// What the current text says, for the form.
export function readState(text: string): WizardState {
  const lines = text.split('\n');
  const found = sections(lines);
  const subscriptions: Subscription[] = [];
  for (const line of found.find(s => s.name === 'subscription')?.body ?? []) {
    const match = /^\s*(?:'([^']*)'|([\w.-]+))\s*:\s*'([^']*)'/.exec(line);
    if (match) subscriptions.push({name: match[1] ?? match[2], url: match[3]});
  }
  const groups: GroupSpec[] = [];
  for (const line of found.find(s => s.name === 'group')?.body ?? []) {
    const match = /^\s*([\w-]+)\s*\{(.*)\}\s*$/.exec(line);
    if (!match) continue;
    const tags =
      /subtag\(([^)]*)\)/
        .exec(match[2])?.[1]
        .split(',')
        .map(s => s.trim()) ?? [];
    groups.push({name: match[1], policy: /policy:\s*fixed/.test(match[2]) ? 'manual' : 'auto', subscriptions: tags, uses: [], raw: line});
  }
  const lan = /^\s*lan_interface:\s*(\S+)/m.exec(found.find(s => s.name === 'global')?.body.join('\n') ?? '')?.[1];
  return {subscriptions, groups, rules: 'keep', ads: true, chinaDirect: true, fallback: 'first', lanInterface: lan && lan !== 'auto' ? lan : ''};
}

function subscriptionBlock(state: WizardState): string[] {
  return ['subscription {', ...state.subscriptions.map(s => `  ${ident(s.name) || 'sub'}: ${quote(s.url.trim())}`), '}'];
}
function groupBlock(state: WizardState): string[] {
  return [
    'group {',
    ...state.groups.map(g => {
      if (g.raw !== undefined) return g.raw;
      const filter = g.subscriptions.length ? `filter: subtag(${g.subscriptions.map(ident).join(', ')}) ` : '';
      return `  ${ident(g.name) || 'proxy'} { ${filter}policy: ${g.policy === 'auto' ? 'min_moving_avg' : 'fixed(0)'} }`;
    }),
    '}'
  ];
}
// Routing from the groups' uses: presets, adverts, one line per use per group in list order, the China
// catch-all, then the fallback. A group with no uses gets traffic only through the fallback.
function routingBlock(state: WizardState): string[] {
  const first = ident(state.groups[0]?.name ?? 'proxy') || 'proxy';
  const lines = [...preset];
  if (state.ads) lines.push('# Advertising', 'domain(geosite:category-ads-all) -> block');
  for (const group of state.groups) {
    const name = ident(group.name) || 'proxy';
    if (group.uses.length) lines.push(`# ${name}`);
    for (const use of group.uses) lines.push(`${useRules[use]} -> ${name}`);
  }
  if (state.chinaDirect) lines.push('# Mainland China direct', 'dip(geoip:cn) -> direct', 'domain(geosite:cn) -> direct');
  lines.push(`fallback: ${state.fallback === 'direct' ? 'direct' : first}`);
  return ['routing {', ...lines.map(line => '  ' + line), '}'];
}
const dnsBlock = [
  'dns {',
  '  upstream {',
  "    cloudflare: 'tls://1.1.1.1:853'",
  "    alidns: 'udp://223.5.5.5:53'",
  '  }',
  '  routing {',
  '    request { qname(geosite:cn) -> alidns; fallback: cloudflare }',
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

// The text to write: the current text with subscription and group replaced (and routing/dns when a template is
// chosen), or a whole file when there is no text to keep.
export function writeState(current: string, state: WizardState): string {
  if (current.trim() === '') {
    return [...globalBlock(state), '', ...subscriptionBlock(state), '', ...groupBlock(state), '', ...dnsBlock, '', ...routingBlock(state), ''].join('\n');
  }
  const lines = current.replace(/\n$/, '').split('\n');
  const replacements = new Map<string, string[]>([
    ['subscription', subscriptionBlock(state)],
    ['group', groupBlock(state)]
  ]);
  if (state.rules !== 'keep') replacements.set('routing', routingBlock(state));
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
