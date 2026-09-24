import type {GeoAssetKind} from '../api/model';

// Known geodata sources, as measured on 2026-09-25. Each preset lists direct links only, raw first and then the
// jsDelivr fastly mirror: the backend does not follow redirects, so a GitHub /releases/download/ link never works.
// `mirrors` are other jsDelivr nodes serving the same bytes; a stored list made of them still counts as the preset.
// `categories` is the whole category list of a file small enough to know it; null means a full file.
export type GeodataPresetId = 'metacubex' | 'metacubex-lite' | 'loyalsoldier';
export type GeodataPreset = {
  id: GeodataPresetId;
  urls: Record<GeoAssetKind, string[]>;
  mirrors: Record<GeoAssetKind, string[]>;
  sizes: Record<GeoAssetKind, number>;
  categories: Record<GeoAssetKind, readonly string[]> | null;
};

const jsdelivr = ['fastly', 'cdn', 'testingcf'];
function preset(
  id: GeodataPresetId,
  repo: string,
  files: Record<GeoAssetKind, string>,
  sizes: Record<GeoAssetKind, number>,
  categories: GeodataPreset['categories']
) {
  const raw = (file: string) => `https://raw.githubusercontent.com/${repo}/release/${file}`;
  const cdn = (host: string, file: string) => `https://${host}.jsdelivr.net/gh/${repo}@release/${file}`;
  const kinds = Object.keys(files) as GeoAssetKind[];
  return {
    id,
    urls: Object.fromEntries(kinds.map(kind => [kind, [raw(files[kind]), cdn('fastly', files[kind])]])) as GeodataPreset['urls'],
    mirrors: Object.fromEntries(kinds.map(kind => [kind, jsdelivr.slice(1).map(host => cdn(host, files[kind]))])) as GeodataPreset['mirrors'],
    sizes,
    categories
  };
}

// The lite files carry 24 geosite and 12 geoip categories and lack common ones such as geolocation-!cn and
// category-ads-all, so the settings page checks a configuration's categories against these before applying the preset.
export const liteCategories: Record<GeoAssetKind, readonly string[]> = {
  geosite: [
    'abema',
    'apple',
    'applemusic',
    'bahamut',
    'bilibili',
    'biliintl',
    'cloudflare',
    'cn',
    'ehentai',
    'github',
    'google',
    'microsoft',
    'netflix',
    'onedrive',
    'openai',
    'pixiv',
    'private',
    'proxy',
    'proxymedia',
    'spotify',
    'telegram',
    'tiktok',
    'twitter',
    'youtube'
  ],
  geoip: ['apple', 'bilibili', 'cloudflare', 'cloudfront', 'cn', 'facebook', 'google', 'jp', 'netflix', 'private', 'telegram', 'twitter']
};

export const geodataPresets: readonly GeodataPreset[] = [
  preset('metacubex', 'MetaCubeX/meta-rules-dat', {geosite: 'geosite.dat', geoip: 'geoip.dat'}, {geosite: 4_200_000, geoip: 16_600_000}, null),
  preset(
    'metacubex-lite',
    'MetaCubeX/meta-rules-dat',
    {geosite: 'geosite-lite.dat', geoip: 'geoip-lite.dat'},
    {geosite: 176_000, geoip: 207_000},
    liteCategories
  ),
  preset('loyalsoldier', 'Loyalsoldier/v2ray-rules-dat', {geosite: 'geosite.dat', geoip: 'geoip.dat'}, {geosite: 11_100_000, geoip: 16_900_000}, null)
];
// The backend's built-in sources when nothing is stored.
export const defaultGeodataPreset = geodataPresets[0];
