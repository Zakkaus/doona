// The rule templates of the quick setup, after ACL4SSR's online configurations. Data only: the writer is
// wizard.ts. Group labels are ACL4SSR's own names, and the region patterns match node names in either script.
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

// A group the template needs: honk's `group` syntax with the ACL4SSR name as the comment. `select` groups list
// the nested groups they can switch to and every proxy node. honk injects `direct` and `block` into the node
// pool, so "every node" is spelled as everything but those two; an unfiltered group would take them as well.
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

// Templates in dae's own syntax, after ACL4SSR's online configurations: the same lists in the same order, as
// the v2fly geosite/geoip categories Loyalsoldier/v2ray-rules-dat ships (the data set dae fetches by default).
// Services ACL4SSR sends to a selector that defaults to DIRECT go direct here, since a honk group cannot hold
// `direct` as a member; services it sends through the proxy get their own selector group. `{group}` is the
// first group of the file, or `proxy` when it has none.
export const templates: Record<RuleTemplate, {rules: string[]; fallback: string; groups: GroupSpec[]}> = {
  // Everything except the presets through the group.
  global: {rules: [...preset], fallback: '{group}', groups: []},
  // Adverts dropped, mainland China direct, the rest through the group.
  bypass: {rules: [...preset, ...ads, ...chinaVendors, ...china], fallback: '{group}', groups: []},
  // Only the GFW list and Telegram through the group; the rest direct.
  gfw: {rules: [...preset, ...ads, ...telegram('{group}'), ...gfw('{group}')], fallback: 'direct', groups: []},
  // ACL4SSR_Online_Mini.
  mini: {
    rules: [...preset, ...ads, ...chinaVendors, ...telegram('proxy'), ...media('proxy'), ...gfw('proxy'), ...china],
    fallback: 'proxy',
    groups: [proxy, auto]
  },
  // ACL4SSR_Online: Telegram, overseas media and Apple get their own selectors; Microsoft goes direct.
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
  // ACL4SSR_Online_Full: region groups, AI, YouTube, Netflix and Bahamut selectors; games, Apple, Microsoft,
  // NetEase Music and Bilibili direct.
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
