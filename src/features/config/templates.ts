// Adapted from ACL4SSR templates; preserve its group labels and bilingual region patterns.
export const quote = (value: string) => "'" + value.replace(/'/g, '') + "'";
export type RuleTemplate = 'global' | 'bypass' | 'gfw' | 'mini' | 'standard' | 'full';
export const defaultTemplate: RuleTemplate = 'standard';
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
const ads = ['# BanAD, BanProgramAD', 'domain(geosite:category-ads-all) -> block'];
const chinaVendors = ['# GoogleCN, SteamCN', 'domain(geosite:google-cn, geosite:category-games@cn) -> direct'];
const china = ['# ChinaDomain, ChinaCompanyIp, GEOIP CN', 'domain(geosite:cn) -> direct', 'dip(geoip:cn) -> direct'];
const telegram = (target: string) => ['# Telegram', `domain(geosite:telegram) -> ${target}`, `dip(geoip:telegram) -> ${target}`];
const media = (target: string) => [
  '# ProxyMedia',
  `domain(geosite:youtube, geosite:netflix, geosite:disney, geosite:hbo, geosite:primevideo, geosite:twitch, geosite:spotify) -> ${target}`
];
const gfw = (target: string) => ['# ProxyGFWlist', `domain(geosite:gfw) -> ${target}`];

// Selector groups include nested groups and all proxy nodes. Exclude injected direct/block nodes because an unfiltered honk group would select them too.
type GroupSpec = {name: string; label: string; lines: string[]};
const everyNode = "filter: !name('direct', 'block')";
const selectGroup = (name: string, label: string, nested: string[], fallback = nested[0]): GroupSpec => ({
  name,
  label,
  lines: [`filter: group(${nested.map(quote).join(', ')})`, everyNode, 'policy: select', `default: ${quote(fallback)}`]
});
const region = (name: string, label: string, pattern: string): GroupSpec => ({
  name,
  label,
  lines: [`filter: name(regex: ${quote(pattern)})`, 'policy: min_moving_avg']
});
const proxy = selectGroup('proxy', '节点选择', ['auto']);
const auto: GroupSpec = {name: 'auto', label: '自动选择', lines: [everyNode, 'policy: min_moving_avg']};
const regions = [
  region('hk', '香港节点', '港|HK|Hong Kong|HongKong'),
  region('jp', '日本节点', '日|JP|Japan|Tokyo'),
  region('us', '美国节点', '美|US|United States|America'),
  region('tw', '台湾节点', '台|TW|Taiwan'),
  region('sg', '狮城节点', '新加坡|獅城|狮城|SG|Singapore'),
  region('kr', '韩国节点', '韓|韩|KR|Korea')
];
const service = (name: string, label: string, nested: string[] = ['proxy', 'auto'], fallback?: string) => selectGroup(name, label, nested, fallback);

// Preserve ACL4SSR rule order using dae's default geosite/geoip data. honk groups cannot contain direct, so DIRECT services remain direct and {group} names the file's first group.
export const templates: Record<RuleTemplate, {rules: string[]; fallback: string; groups: GroupSpec[]}> = {
  global: {rules: [...preset], fallback: '{group}', groups: []},
  bypass: {rules: [...preset, ...ads, ...chinaVendors, ...china], fallback: '{group}', groups: []},
  gfw: {rules: [...preset, ...ads, ...telegram('{group}'), ...gfw('{group}')], fallback: 'direct', groups: []},
  mini: {
    rules: [...preset, ...ads, ...chinaVendors, ...telegram('proxy'), ...media('proxy'), ...gfw('proxy'), ...china],
    fallback: 'proxy',
    groups: [proxy, auto]
  },
  standard: {
    rules: [
      ...preset,
      ...ads,
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
    groups: [proxy, auto, service('telegram', '电报消息'), service('media', '国外媒体'), service('apple', '苹果服务')]
  },
  full: {
    rules: [
      ...preset,
      ...ads,
      ...chinaVendors,
      '# Bing, OneDrive, Microsoft',
      'domain(geosite:microsoft) -> direct',
      '# Apple',
      'domain(geosite:apple) -> direct',
      ...telegram('telegram'),
      '# AI, OpenAi',
      'domain(geosite:openai) -> ai',
      '# NetEaseMusic',
      'domain(geosite:netease) -> direct',
      '# Epic, Origin, Sony, Steam, Nintendo',
      'domain(geosite:category-games) -> direct',
      '# YouTube',
      'domain(geosite:youtube) -> youtube',
      '# Netflix',
      'domain(geosite:netflix) -> netflix',
      '# Bahamut',
      'domain(geosite:bahamut) -> bahamut',
      '# BilibiliHMT, Bilibili',
      'domain(geosite:bilibili) -> direct',
      ...media('media'),
      ...gfw('proxy'),
      ...china
    ],
    fallback: 'proxy',
    groups: [
      selectGroup('proxy', '节点选择', ['auto', ...regions.map(r => r.name)]),
      auto,
      ...regions,
      service('telegram', '电报消息', ['proxy', 'auto', ...regions.map(r => r.name)]),
      service('ai', 'Ai平台', ['proxy', 'auto', ...regions.map(r => r.name)]),
      service('youtube', '油管视频', ['proxy', 'auto', ...regions.map(r => r.name)]),
      service('netflix', '奈飞视频', ['proxy', 'auto', ...regions.map(r => r.name)]),
      service('bahamut', '巴哈姆特', ['tw', 'proxy', 'auto']),
      service('media', '国外媒体', ['proxy', 'auto', ...regions.map(r => r.name)])
    ]
  }
};
