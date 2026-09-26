import type {GeoAssetKind, GeoData, GeoDataDownload, GroupSummary} from '../../api/model';
import {geodataPresets, maxGeodataUrls, validGeodataUrl, type GeodataPreset, type GeodataPresetId} from '../../dae/geodata';
import type {Key, Translator} from '../../i18n';
import {formatBytes, relativeStart} from '../../i18n/format';
import {backendMessage} from '../../i18n/backend';

export const geodataKinds: GeoAssetKind[] = ['geosite', 'geoip'];
export type GeodataChoice = GeodataPresetId | 'custom';
export type GeodataUrls = Record<GeoAssetKind, string[]>;

export const presetLabels: Record<GeodataPresetId, Key> = {
  metacubex: 'settings.geodataPreset.metacubex',
  'metacubex-lite': 'settings.geodataPreset.metacubexLite',
  loyalsoldier: 'settings.geodataPreset.loyalsoldier'
};

// A list names a preset when every URL of both assets is one of that preset's links or mirrors, in any order.
export function matchPreset(urls: GeodataUrls): GeodataPreset | null {
  return (
    geodataPresets.find(preset =>
      geodataKinds.every(kind => urls[kind].length > 0 && urls[kind].every(url => preset.urls[kind].includes(url) || preset.mirrors[kind].includes(url)))
    ) ?? null
  );
}

// A URL's host, which names a download source without the path the full URL carries.
export const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

// The categories the configuration uses that a preset's file does not carry; null when nothing is missing or the
// preset's list is unknown.
export function missingCategories(preset: GeodataPreset | null, required: GeoData['required_codes'] | undefined): Partial<GeodataUrls> | null {
  if (!preset?.categories || !required) return null;
  const missing: Partial<GeodataUrls> = {};
  for (const kind of geodataKinds) {
    const known = new Set(preset.categories[kind]);
    const lacking = (required[kind] ?? []).filter(code => !known.has(code));
    if (lacking.length) missing[kind] = lacking;
  }
  return Object.keys(missing).length ? missing : null;
}

export function urlProblem(url: string, list: string[]): Key | null {
  const value = url.trim();
  if (!value) return null;
  if (!validGeodataUrl(value)) return 'settings.geodataUrlInvalid';
  if (list.filter(item => item.trim() === value).length > 1) return 'settings.geodataUrlDuplicate';
  return null;
}

// The custom URL fields: each stored URL, then one blank to add another while the list has room.
export function customFields(urls: string[]): string[] {
  return urls.length < maxGeodataUrls && urls.every(url => url.trim()) ? [...urls, ''] : urls;
}

// A custom list can be stored when each asset has a URL and none is malformed or repeated.
export const customInvalid = (urls: GeodataUrls) =>
  geodataKinds.some(kind => !urls[kind].some(url => url.trim()) || urls[kind].some(url => urlProblem(url, urls[kind])));
export const cleanUrls = (urls: GeodataUrls): GeodataUrls => ({
  geosite: urls.geosite.map(url => url.trim()).filter(Boolean),
  geoip: urls.geoip.map(url => url.trim()).filter(Boolean)
});

// The categories a preset lacks as `kind:code` names, or null when it lacks none or its list is unknown. Choosing a
// preset that lacks some asks first, since the backend refuses its files on update.
export function lackingCodes(preset: GeodataPreset, required: GeoData['required_codes'] | undefined, t: Translator): string | null {
  const missing = missingCategories(preset, required);
  return missing && geodataKinds.flatMap(kind => (missing[kind] ?? []).map(code => `${kind}:${code}`)).join(t('ui.separator'));
}

// A preset's secondary line: the categories the rules use that it lacks, else its approximate sizes.
export function presetNote(preset: GeodataPreset, required: GeoData['required_codes'] | undefined, locale: string, t: Translator) {
  const codes = lackingCodes(preset, required, t);
  if (codes) return {text: t('settings.geodataMissing', {codes}), notice: true};
  return {
    text: t('settings.geodataPresetSize', {geosite: formatBytes(preset.sizes.geosite, locale), geoip: formatBytes(preset.sizes.geoip, locale)}),
    notice: false
  };
}

// The automatic update intervals offered, with a stored value outside them kept so the select can show it.
const intervals = [6, 12, 24, 72, 168];
export function intervalChoices(current: number, locale: string) {
  const hours = intervals.includes(current) ? intervals : [...intervals, current].sort((a, b) => a - b);
  return hours.map(value => {
    const days = value % 24 === 0;
    const label = new Intl.NumberFormat(locale, {style: 'unit', unit: days ? 'day' : 'hour', unitDisplay: 'long'}).format(days ? value / 24 : value);
    return {id: String(value), label};
  });
}

// How a download went out: the group by its name, or the route itself.
export function routeLabel(route: GeoDataDownload, groups: GroupSummary[] | undefined, t: Translator): string {
  if (route.route === 'direct') return t('settings.geodataRouteDirect');
  const group = route.group_id ? (groups?.find(item => item.id === route.group_id)?.name ?? route.group_id) : null;
  if (route.route === 'routing') return group ? t('settings.geodataRouteRoutingVia', {group}) : t('settings.geodataRouteRouting');
  return group ?? t('settings.geodataRouteGroupGone');
}

// The status row: an update in progress, else the last error in error tone, else when the files last changed and
// whether their checksums were verified.
export function statusLine(data: GeoData | undefined, updating: boolean, now: number, locale: string, t: Translator) {
  if (updating) return {text: t('settings.geodataUpdating'), error: false};
  if (data?.last_error)
    return {
      text: t('ui.valuePair', {label: t('settings.geodataLastError'), value: backendMessage(data.last_error.code, data.last_error.message, t)}),
      error: true
    };
  const at = data?.last_updated_at;
  const when = !data ? '—' : at ? relativeStart(at, locale, now) : t('settings.geodataNever');
  const checked = data?.assets.length && data.assets.every(asset => asset.verified !== undefined);
  const verified = checked ? t(data.assets.every(asset => asset.verified) ? 'settings.geodataVerifiedYes' : 'settings.geodataVerifiedNo') : null;
  return {text: t('ui.valuePair', {label: t('settings.geodataLastUpdated'), value: verified ? when + t('ui.separator') + verified : when}), error: false};
}

// Each asset's size, download host and route, with the full URL behind the host.
export function assetDetails(data: GeoData | undefined, groups: GroupSummary[] | undefined, locale: string, t: Translator): Array<[string, string, string]> {
  return (data?.assets ?? []).map(asset => {
    const url = asset.fetched_url_redacted ?? asset.source_redacted ?? '';
    const parts = [formatBytes(asset.size_bytes, locale), url ? hostOf(url) : null, asset.download_route ? routeLabel(asset.download_route, groups, t) : null];
    return [asset.kind, parts.filter(Boolean).join(t('ui.separator')), url];
  });
}
