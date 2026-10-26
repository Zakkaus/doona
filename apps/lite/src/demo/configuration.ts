import * as original from '../../../../mock/fixtures/configuration';
export * from '../../../../mock/fixtures/configuration';

export const configMain = original.configMain.replace(
  /subscription \{\n/,
  "subscription {\n  pacific: 'https://pacific.example.net/subscribe?token=demo'\n  atlas: 'https://atlas.example.net/subscribe?token=demo'\n"
);
const routingNotes: Record<string, string> = {
  NetworkManager: '网络管理程序',
  'dae presets: the LAN and multicast stay off the proxy': '局域网与组播直连',
  'Block UDP/443': '拦截 QUIC',
  Ads: '拦截广告',
  'Google China services and mainland games': '中国大陆服务与游戏',
  'Overseas media': '海外媒体',
  'NetEase Music': '网易云音乐',
  Games: '游戏'
};
const localizeRoutingNotes = (text: string) =>
  text
    .replace(/^[ \t]*# (?:Mainland China|GFW list|Microsoft|Apple|Telegram|OpenAI|NetEase Music|Games|YouTube|Netflix|Bahamut|Bilibili)\r?\n/gm, '')
    .replace(/^(\s*# )(.*)$/gm, (line, prefix, note) => (routingNotes[note] ? prefix + routingNotes[note] : line));
const main = <T extends {kind: string; content: string}>(source: T): T =>
  source.kind === 'main' ? {...source, content: localizeRoutingNotes(configMain)} : source;
export const configSources = original.configSources.map(main);
export const faultSources = original.faultSources.map(main);
export const faultDisk = original.faultDisk.map(main);
