import {useSyncExternalStore} from 'react';

// Brand icons come from a pack the user points at; nothing is bundled, so a service name only leaves the
// browser when a pack is set. Names follow the Qure convention (Loon and Stash users already have it).
export type IconPack = {id: string; label: string; base: string};
export const iconPacks: IconPack[] = [
  {id: 'qure-color', label: 'Qure Color', base: 'https://cdn.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/'},
  {id: 'qure-mini', label: 'Qure Mini', base: 'https://cdn.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Mini/'}
];
const key = 'doona-icon-pack';
const listeners = new Set<() => void>();
function read(): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}
export function setIconPack(value: string) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // Storage may be unavailable; the choice then lasts for the session only.
  }
  for (const listener of listeners) listener();
}
export function useIconPack(): string {
  return useSyncExternalStore(
    listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    read,
    () => ''
  );
}
export function iconUrl(pack: string, name: string): string {
  const base = iconPacks.find(item => item.id === pack)?.base ?? (pack.endsWith('/') ? pack : pack + '/');
  return base + encodeURIComponent(name) + '.png';
}

// geosite categories and registrable domains to Qure names; everything else has no icon.
const geosites: Record<string, string> = {
  cn: 'China',
  'geolocation-cn': 'China',
  'geolocation-!cn': 'Global',
  private: 'Direct',
  'category-ads': 'Advertising',
  'category-ads-all': 'Advertising',
  'category-ai-chat-!cn': 'AI',
  'category-games': 'Game',
  'category-games-!cn': 'Game',
  telegram: 'Telegram',
  discord: 'Discord',
  netflix: 'Netflix',
  youtube: 'YouTube',
  google: 'Google',
  github: 'GitHub',
  apple: 'Apple',
  icloud: 'iCloud',
  microsoft: 'Microsoft',
  onedrive: 'OneDrive',
  steam: 'Steam',
  spotify: 'Spotify',
  twitter: 'X',
  x: 'X',
  instagram: 'Instagram',
  facebook: 'Facebook',
  meta: 'Facebook',
  openai: 'ChatGPT',
  cloudflare: 'Cloudflare',
  alibaba: 'Taobao',
  tencent: 'QQ',
  wechat: 'WeChat',
  bilibili: 'bilibili',
  tiktok: 'TikTok',
  bytedance: 'TikTok',
  iqiyi: 'iQIYI',
  disney: 'Disney+',
  hbo: 'HBO',
  amazon: 'Amazon',
  primevideo: 'Prime_Video',
  paypal: 'PayPal',
  linkedin: 'Linkedin',
  line: 'Line',
  kakao: 'Kakao',
  notion: 'Notion',
  twitch: 'Twitch',
  epicgames: 'Epic_Games',
  xbox: 'Xbox',
  playstation: 'PlayStation',
  nintendo: 'Nintendo',
  speedtest: 'Speedtest',
  binance: 'Cryptocurrency',
  netease: 'Netease_Music',
  hulu: 'Hulu',
  dazn: 'DAZN',
  paramount: 'Paramount',
  bbc: 'BBC_iPlayer',
  abema: 'AbemaTV',
  niconico: 'niconico',
  streaming: 'Streaming',
  weibo: 'Weibo',
  zoom: 'Global'
};
const domains: Record<string, string> = {
  'telegram.org': 'Telegram',
  't.me': 'Telegram',
  'telegra.ph': 'Telegram',
  'discord.com': 'Discord',
  'discord.gg': 'Discord',
  'discordapp.com': 'Discord',
  'netflix.com': 'Netflix',
  'nflxvideo.net': 'Netflix',
  'youtube.com': 'YouTube',
  'googlevideo.com': 'YouTube',
  'ytimg.com': 'YouTube',
  'google.com': 'Google',
  'googleapis.com': 'Google',
  'gstatic.com': 'Google',
  'gmail.com': 'Gmail',
  'drive.google.com': 'Google_Drive',
  'github.com': 'GitHub',
  'githubusercontent.com': 'GitHub',
  'apple.com': 'Apple',
  'apps.apple.com': 'App_Store',
  'itunes.apple.com': 'App_Store',
  'music.apple.com': 'Apple_Music',
  'tv.apple.com': 'Apple_TV',
  'icloud.com': 'iCloud',
  'mzstatic.com': 'Apple',
  'microsoft.com': 'Microsoft',
  'live.com': 'Microsoft',
  'office.com': 'Microsoft',
  'onedrive.com': 'OneDrive',
  'windows.com': 'Windows',
  'xbox.com': 'Xbox',
  'azure.com': 'Azure',
  'steampowered.com': 'Steam',
  'steamcommunity.com': 'Steam',
  'steamstatic.com': 'Steam',
  'akamaihd.net': 'Steam',
  'spotify.com': 'Spotify',
  'scdn.co': 'Spotify',
  'x.com': 'X',
  'twitter.com': 'X',
  'twimg.com': 'X',
  'instagram.com': 'Instagram',
  'cdninstagram.com': 'Instagram',
  'facebook.com': 'Facebook',
  'fbcdn.net': 'Facebook',
  'openai.com': 'ChatGPT',
  'chatgpt.com': 'ChatGPT',
  'claude.ai': 'AI',
  'anthropic.com': 'AI',
  'cloudflare.com': 'Cloudflare',
  'taobao.com': 'Taobao',
  'tmall.com': 'Taobao',
  'alicdn.com': 'Taobao',
  'alipay.com': 'Alibaba',
  'aliyun.com': 'Alibaba',
  'qq.com': 'QQ',
  'weixin.qq.com': 'WeChat',
  'wechat.com': 'WeChat',
  'weibo.com': 'Weibo',
  'bilibili.com': 'bilibili',
  'hdslb.com': 'bilibili',
  'douyin.com': 'TikTok',
  'tiktok.com': 'TikTok',
  'tiktokcdn.com': 'TikTok',
  'iqiyi.com': 'iQIYI',
  'music.163.com': 'Netease_Music',
  'disneyplus.com': 'Disney+',
  'hbomax.com': 'HBO_Max',
  'max.com': 'HBO_Max',
  'amazon.com': 'Amazon',
  'primevideo.com': 'Prime_Video',
  'paypal.com': 'PayPal',
  'linkedin.com': 'Linkedin',
  'line.me': 'Line',
  'line-apps.com': 'Line',
  'kakao.com': 'Kakao',
  'notion.so': 'Notion',
  'twitch.tv': 'Twitch',
  'epicgames.com': 'Epic_Games',
  'playstation.com': 'PlayStation',
  'nintendo.net': 'Nintendo',
  'speedtest.net': 'Speedtest',
  'binance.com': 'Cryptocurrency',
  'hulu.com': 'Hulu',
  'dazn.com': 'DAZN',
  'paramountplus.com': 'Paramount',
  'bbc.co.uk': 'BBC_iPlayer',
  'abema.tv': 'AbemaTV',
  'nicovideo.jp': 'niconico',
  'vimeo.com': 'Vimeo',
  'yahoo.com': 'Yahoo',
  'doubleclick.net': 'Advertising',
  'googlesyndication.com': 'Advertising',
  'googleadservices.com': 'Advertising',
  'pornhub.com': 'Pornhub',
  'kkbox.com': 'KKBOX',
  'joox.com': 'JOOX',
  'viu.com': 'Viu',
  'tvb.com': 'TVB',
  'emby.media': 'Emby',
  'testflight.apple.com': 'TestFlight'
};
const outbounds: Record<string, string> = {
  direct: 'Direct',
  block: 'Reject',
  reject: 'Reject',
  proxy: 'Proxy',
  global: 'Global',
  final: 'Final',
  gaming: 'Game',
  game: 'Game',
  airport: 'Airport',
  streaming: 'Streaming',
  media: 'Media',
  ai: 'AI'
};

function forDomain(host: string): string | null {
  const name = host.toLowerCase().replace(/\.$/, '');
  const labels = name.split('.');
  for (let i = 0; i < labels.length - 1; i++) {
    const hit = domains[labels.slice(i).join('.')];
    if (hit) return hit;
  }
  return null;
}

// The icon a rule expression, a domain, or an outbound name maps to, or null when the pack has nothing for it.
export function brandFor(text: string | null | undefined): string | null {
  if (!text) return null;
  const rule = /^domain\((geosite|suffix|full|keyword|regex):\s*([^)]*)\)/.exec(text);
  if (rule) {
    const terms = rule[2].split(',').map(term => term.trim().toLowerCase());
    if (rule[1] === 'geosite') return terms.map(term => geosites[term]).find(Boolean) ?? null;
    if (rule[1] === 'regex') return null;
    return terms.map(forDomain).find(Boolean) ?? null;
  }
  if (/^dip\(geoip:\s*cn\)/.test(text)) return 'China';
  if (/^dip\(geoip:\s*private\)/.test(text)) return 'Direct';
  if (/^fallback:\s*(.+)$/.test(text)) return outbounds[/^fallback:\s*(.+)$/.exec(text)![1].toLowerCase()] ?? null;
  if (/^[a-z0-9.-]+$/i.test(text) && text.includes('.')) return forDomain(text);
  return outbounds[text.toLowerCase()] ?? null;
}
