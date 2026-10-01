import type {Key, Translator} from '../i18n';
import {quote, scanConfig, unquote} from './text';
import {isBuiltinOutbound} from './vocab';
import {demoRouting, demoRoutingInclude} from './startingRouting';
export type RuleTemplate = 'global' | 'bypass' | 'gfw' | 'single' | 'services' | 'regions' | 'homebound';
export type TemplateOptions = {blockAds: boolean; blockQuic: boolean; networkManagerDirect: boolean};
export const defaultTemplateOptions: TemplateOptions = {blockAds: false, blockQuic: true, networkManagerDirect: true};
const networkManager = ['# NetworkManager', 'pname(NetworkManager) -> direct'];
const local = ['# dae presets: the LAN and multicast stay off the proxy', "dip(224.0.0.0/3, 'ff00::/8') -> direct", 'dip(geoip:private) -> direct'];
const quic = ['# Block UDP/443', 'l4proto(udp) && dport(443) -> block'];
const preset = [...networkManager, ...local, ...quic];
const ads = ['# Ads', 'domain(geosite:category-ads-all) -> block'];
const chinaVendors = ['# Google China services and mainland games', 'domain(geosite:google-cn, geosite:category-games@cn) -> direct'];
const china = ['# Mainland China', 'domain(geosite:cn) -> direct', 'dip(geoip:cn) -> direct'];
const telegram = (target: string) => ['# Telegram', `domain(geosite:telegram) -> ${target}`, `dip(geoip:telegram) -> ${target}`];
const media = (target: string) => [
  '# Overseas media',
  `domain(geosite:youtube, geosite:netflix, geosite:disney, geosite:hbo, geosite:primevideo, geosite:twitch, geosite:spotify) -> ${target}`
];
const gfw = (target: string) => ['# GFW list', `domain(geosite:gfw) -> ${target}`];

// Selector groups include nested groups and all proxy nodes. Exclude injected direct/block nodes because an
// unfiltered honk group would select them too.
type GroupSpec = {name: string; label: Key; flag?: string; lines: string[]};
export const everyNode = "filter: !name('direct', 'block')";
const selectGroup = (name: string, label: Key, nested: string[], fallback = nested[0]): GroupSpec => ({
  name,
  label,
  lines: [`filter: group(${nested.map(quote).join(', ')})`, everyNode, 'policy: select', `default: ${quote(fallback)}`]
});
// `exclude` drops nodes the pattern would also catch, such as Hong Kong nodes named 中国香港.
const region = (name: string, label: Key, flag: string, pattern: string, exclude?: string): GroupSpec => ({
  name,
  label,
  flag,
  lines: [`filter: name(regex: ${quote(pattern)})${exclude ? ` && !name(regex: ${quote(exclude)})` : ''}`, 'policy: min_moving_avg']
});
const templateText = {
  proxy: 'rule.template.group.proxy',
  auto: 'rule.template.group.auto',
  hk: ['rule.template.group.hk', '🇭🇰', '港|HK|Hong Kong|HongKong'],
  jp: ['rule.template.group.jp', '🇯🇵', '日|JP|Japan|Tokyo'],
  us: ['rule.template.group.us', '🇺🇸', '美|US|United States|America'],
  tw: ['rule.template.group.tw', '🇹🇼', '台|臺|TW|Taiwan'],
  sg: ['rule.template.group.sg', '🇸🇬', '新加坡|獅城|狮城|SG|Singapore'],
  kr: ['rule.template.group.kr', '🇰🇷', '韓|韩|KR|Korea'],
  cn: [
    'rule.template.group.cn',
    '🇨🇳',
    String.raw`(?i)回国|回國|中国|中國|大陆|大陸|(?:^|[^A-Za-z])(?:China|Mainland|CN)(?:[^A-Za-z]|$)`,
    String.raw`(?i)香港|澳门|澳門|台湾|台灣|臺灣|(?:^|[^A-Za-z])(?:HK|MO|TW)(?:[^A-Za-z]|$)|Hong ?Kong|Macau|Macao|Taiwan`
  ],
  telegram: 'rule.template.group.telegram',
  media: 'rule.template.group.media',
  apple: 'rule.template.group.apple',
  ai: 'rule.template.group.ai',
  youtube: 'rule.template.group.youtube',
  netflix: 'rule.template.group.netflix',
  bahamut: 'rule.template.group.bahamut'
} as const;

const proxy = selectGroup('proxy', templateText.proxy, ['auto']);
const auto: GroupSpec = {name: 'auto', label: templateText.auto, lines: [everyNode, 'policy: min_moving_avg']};
const regions = (['hk', 'jp', 'us', 'tw', 'sg', 'kr'] as const).map(id => region(id, templateText[id][0], templateText[id][1], templateText[id][2]));
export const regionGroups = [...regions, region('cn', ...templateText.cn)];
const service = (name: string, label: Key, nested: string[] = ['proxy', 'auto'], fallback?: string) => selectGroup(name, label, nested, fallback);

// honk groups cannot contain direct; {group} names the file's first group.
export const templates: Record<RuleTemplate, {rules: string[]; fallback: string; groups: GroupSpec[]}> = {
  global: {rules: [...preset], fallback: '{group}', groups: []},
  bypass: {rules: [...preset, ...chinaVendors, ...china], fallback: '{group}', groups: []},
  gfw: {rules: [...preset, ...telegram('{group}'), ...gfw('{group}')], fallback: 'direct', groups: []},
  homebound: {
    rules: [...preset, '# Mainland China', 'domain(geosite:cn) -> cn', 'dip(geoip:cn) -> cn'],
    fallback: 'direct',
    groups: [regionGroups.at(-1)!]
  },
  single: {
    rules: [...preset, ...chinaVendors, ...telegram('proxy'), ...media('proxy'), ...gfw('proxy'), ...china],
    fallback: 'proxy',
    groups: [proxy, auto]
  },
  services: {
    rules: [
      ...preset,
      ...chinaVendors,
      '# Microsoft',
      'domain(geosite:microsoft) -> direct',
      '# Apple',
      'domain(geosite:apple) -> apple',
      ...telegram('telegram'),
      ...media('media'),
      ...gfw('proxy'),
      ...china
    ],
    fallback: 'proxy',
    groups: [proxy, auto, service('telegram', templateText.telegram), service('media', templateText.media), service('apple', templateText.apple)]
  },
  regions: {
    rules: [
      ...preset,
      ...chinaVendors,
      '# Microsoft',
      'domain(geosite:microsoft) -> direct',
      '# Apple',
      'domain(geosite:apple) -> direct',
      ...telegram('telegram'),
      '# OpenAI',
      'domain(geosite:openai) -> ai',
      '# NetEase Music',
      'domain(geosite:netease) -> direct',
      '# Games',
      'domain(geosite:category-games) -> direct',
      '# YouTube',
      'domain(geosite:youtube) -> youtube',
      '# Netflix',
      'domain(geosite:netflix) -> netflix',
      '# Bahamut',
      'domain(geosite:bahamut) -> bahamut',
      '# Bilibili',
      'domain(geosite:bilibili) -> direct',
      ...media('media'),
      ...gfw('proxy'),
      ...china
    ],
    fallback: 'proxy',
    groups: [
      selectGroup('proxy', templateText.proxy, ['auto', ...regions.map(r => r.name)]),
      auto,
      ...regions,
      service('telegram', templateText.telegram, ['proxy', 'auto', ...regions.map(r => r.name)]),
      service('ai', templateText.ai, ['proxy', 'auto', ...regions.map(r => r.name)]),
      service('youtube', templateText.youtube, ['proxy', 'auto', ...regions.map(r => r.name)]),
      service('netflix', templateText.netflix, ['proxy', 'auto', ...regions.map(r => r.name)]),
      service('bahamut', templateText.bahamut, ['tw', 'proxy', 'auto']),
      service('media', templateText.media, ['proxy', 'auto', ...regions.map(r => r.name)])
    ]
  }
};

export function templateGroupLabel(group: GroupSpec, t: Translator): string {
  return `${group.flag ? group.flag + ' ' : ''}${t(group.label)}`;
}

export function templateRules(template: RuleTemplate, options: Partial<TemplateOptions> = {}): string[] {
  const {blockAds, blockQuic, networkManagerDirect} = {...defaultTemplateOptions, ...options};
  return [
    ...(networkManagerDirect ? networkManager : []),
    ...local,
    ...(blockQuic ? quic : []),
    ...(blockAds ? ads : []),
    ...templates[template].rules.slice(preset.length)
  ];
}

// The top-level routing of `text` as honk reads it, one token list per rule or field: comments dropped, and spacing,
// line breaks inside parentheses and quotes around match arguments ignored. Null when a routing block nests a section, which no template writes.
function routingEntries(text: string): string[][] | null {
  const {blocks, tokens} = scanConfig(text);
  const entries: string[][] = [];
  for (const block of blocks.filter(block => block.name === 'routing')) {
    if (block.children.length) return null;
    let line = -1;
    // Parentheses count from the block's own brace: an unquoted `(` elsewhere, as in `log_file: /var/log/honk(.log`,
    // leaves the scanner's count raised for the rest of the file.
    let parens = 0;
    for (const token of tokens) {
      if (token.from <= block.open || token.from >= block.close || token.kind === 'comment') continue;
      const raw = text.slice(token.from, token.to);
      if (token.line !== line && parens === 0) entries.push([]);
      line = token.line;
      // A match argument reads the same quoted or not; an outbound keeps its quotes, which honk keeps in group names.
      // The scanner keeps `&&` and `!` in the word they touch, as in `l4proto(udp)&&dport(443)`.
      entries.at(-1)!.push(...(token.kind === 'quoted' ? [parens ? unquote(raw) : raw] : raw.split(/(&&|\|\||!)/).filter(Boolean)));
      if (token.kind === 'symbol' && raw === '(') parens++;
      else if (token.kind === 'symbol' && raw === ')') parens = Math.max(0, parens - 1);
    }
  }
  return entries;
}
// Stands for the `{group}` a template fills with the file's first group, as one token that no written name uses.
const groupSlot = '\u0000group';
const templateEntries = (template: RuleTemplate, options: TemplateOptions) =>
  routingEntries(
    ['routing {', ...templateRules(template, options), `fallback: ${templates[template].fallback}`, '}'].join('\n').replaceAll('{group}', groupSlot)
  )!;
// The template whose rules and fallback the top-level routing of `text` holds, in order and nothing else, with the
// group its `{group}` names; null for any other routing, including none. A group slot takes one proxy group, the same
// wherever the template repeats it.
export function detectTemplate(text: string): (TemplateOptions & {template: RuleTemplate; group: string | null}) | null {
  const entries = routingEntries(text);
  if (!entries?.length) return null;
  for (const template of Object.keys(templates) as RuleTemplate[]) {
    for (const blockAds of [false, true]) {
      for (const blockQuic of [true, false]) {
        for (const networkManagerDirect of [true, false]) {
          const options = {blockAds, blockQuic, networkManagerDirect};
          const expected = templateEntries(template, options);
          if (expected.length !== entries.length) continue;
          let group: string | null = null;
          const same = expected.every((want, i) => {
            const got = entries[i];
            return (
              want.length === got.length &&
              want.every((token, j) => {
                if (token !== groupSlot) return token === got[j];
                if (isBuiltinOutbound(got[j]) || (group !== null && group !== got[j])) return false;
                group = got[j];
                return true;
              })
            );
          });
          if (same) return {template, group, ...options};
        }
      }
    }
  }
  return null;
}

const directFallback = ['fallback', ':', 'direct'];
function combinedRoutingEntries(text: string): string[][] | null {
  const entries = routingEntries(text);
  if (!entries) return null;
  const {blocks} = scanConfig(text);
  // Includes can be bare routing fragments; only text outside top-level blocks belongs to those fragments.
  let fragments = text;
  for (const block of [...blocks].reverse()) fragments = fragments.slice(0, block.from) + '\n' + fragments.slice(block.to);
  const bare = routingEntries('routing {\n' + fragments + '\n}');
  if (!bare) return null;
  const combined = [...entries, ...bare].filter(entry => entry[0] !== 'include');
  return [...combined.filter(entry => entry[0] !== 'fallback'), ...combined.filter(entry => entry[0] === 'fallback')];
}
const startingEntries = [
  [...templateEntries('global', defaultTemplateOptions).slice(0, -1), directFallback],
  [directFallback],
  combinedRoutingEntries(demoRouting + '\n' + demoRoutingInclude)!
];
export function isPresetRouting(text: string): boolean {
  const entries = combinedRoutingEntries(text);
  if (!entries) return false;
  if (!entries.length) return true;
  return startingEntries.some(
    expected =>
      entries.length === expected.length &&
      entries.every((entry, i) => entry.length === expected[i].length && entry.every((token, j) => token === expected[i][j]))
  );
}
