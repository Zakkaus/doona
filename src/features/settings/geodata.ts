import type {GeoData, GeoDataDownload, GroupSummary} from '../../api/model';
import {geodataKinds, missingCategories, validGeodataUrl, type GeodataPreset, type GeodataPresetId, type GeodataUrls} from '../../dae/geodata';
import type {Key, Lang, Translator} from '../../i18n';
import {formatBytes, relativeStart} from '../../i18n/format';
import {backendMessage, oneLine} from '../../i18n/backend';
import type {KvItem} from '../../ui/ui';
import {docsHref} from '../shared/docs';
import {lastingGeodataFailure} from '../shared/geodataUpdate';

export const presetLabels: Record<GeodataPresetId, Key> = {
  metacubex: 'settings.geodataPreset.metacubex',
  'metacubex-lite': 'settings.geodataPreset.metacubexLite',
  loyalsoldier: 'settings.geodataPreset.loyalsoldier'
};

// A URL's host, which names a download source without the path the full URL carries.
export const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

export function urlProblem(url: string, list: string[]): Key | null {
  const value = url.trim();
  if (!value) return null;
  if (!validGeodataUrl(value)) return 'settings.geodataUrlInvalid';
  if (list.filter(item => item.trim() === value).length > 1) return 'settings.geodataUrlDuplicate';
  return null;
}

// The custom URL fields: each stored URL, then one blank to add another while the list is under the backend's max.
export function customFields(urls: string[], max: number): string[] {
  return urls.length < max && urls.every(url => url.trim()) ? [...urls, ''] : urls;
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

// The automatic update intervals offered: the presets within the backend's bounds and its default, with the stored
// value kept so the select can show it.
const intervals = [6, 12, 24, 72, 168];
export function intervalChoices(current: number, bounds: {min: number; max: number; default: number} | undefined, locale: string) {
  const offered = bounds ? [...intervals.filter(value => value >= bounds.min && value <= bounds.max), bounds.default] : intervals;
  const hours = [...new Set([...offered, current])].sort((a, b) => a - b);
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
// canSkipChecksum: the backend verifies checksums and lets that be turned off, which a checksum failure then explains.
// checksum: how the backend verifies downloads (resources.geodata.checksum), which the unverified help names.
// lang: the docs language, for the stages a retry does not get past.
export function statusLine(
  data: GeoData | undefined,
  updating: boolean,
  now: number,
  locale: string,
  t: Translator,
  canSkipChecksum = false,
  checksum: 'sha256sum' | 'pinned' | null = 'sha256sum',
  lang?: Lang
) {
  if (updating) return {text: t('settings.geodataUpdating'), error: false};
  // last_error's code is the failed stage and its message is always the same, so a stage without words of its own
  // shows its code beside the message.
  if (data?.last_error) {
    const {code, message} = data.last_error;
    const reason = backendMessage(code, message, t, {stage: code});
    return {
      text: t('ui.valuePair', {label: t('settings.geodataLastError'), value: oneLine(reason, t)}),
      error: true,
      // A mismatch may be a damaged or altered file, so it is not worded as a reason to turn verification off.
      // A stage a retry does not get past shows the whole reason, which the line shortens, with the docs on that stage.
      help:
        canSkipChecksum && (code === 'checksum_unavailable' || code === 'checksum_mismatch')
          ? {
              title: t('settings.geodataVerifyChecksum'),
              text: t(code === 'checksum_mismatch' ? 'settings.geodataChecksumMismatchHelp' : 'settings.geodataVerifyChecksumHelp')
            }
          : lang && lastingGeodataFailure(code)
            ? {
                title: t('settings.geodataLastError'),
                text: reason.detail ? [reason.summary, reason.detail] : reason.summary,
                link: {href: docsHref(lang, 'geodata-update'), text: t('ov.lim.docsGeodataUpdate'), external: true}
              }
            : undefined
    };
  }
  const at = data?.last_updated_at;
  const when = !data ? '—' : at ? relativeStart(at, locale, now) : t('settings.geodataNever');
  const checked = data?.assets.length && data.assets.every(asset => asset.verified !== undefined);
  const unverified = checked && !data.assets.every(asset => asset.verified);
  const verified = checked ? t(unverified ? 'settings.geodataVerifiedNo' : 'settings.geodataVerifiedYes') : null;
  return {
    text: t('ui.valuePair', {label: t('settings.geodataLastUpdated'), value: verified ? when + t('ui.separator') + verified : when}),
    error: false,
    // An unverified file still loads, which the word alone does not say.
    help: unverified
      ? {
          title: t('settings.geodataVerifiedNo'),
          text: t(
            checksum === 'sha256sum'
              ? 'settings.geodataUnverifiedHelp'
              : checksum === 'pinned'
                ? 'settings.geodataUnverifiedPinnedHelp'
                : 'settings.geodataUnverifiedNoneHelp'
          )
        }
      : undefined
  };
}

// Each asset's size, download host and route, with the full URL behind the host.
export function assetDetails(data: GeoData | undefined, groups: GroupSummary[] | undefined, locale: string, t: Translator): KvItem[] {
  return (data?.assets ?? []).map(asset => {
    const url = asset.fetched_url_redacted ?? asset.source_redacted ?? '';
    const parts = [formatBytes(asset.size_bytes, locale), url ? hostOf(url) : null, asset.download_route ? routeLabel(asset.download_route, groups, t) : null];
    return {label: asset.kind, value: parts.filter(Boolean).join(t('ui.separator')), full: url};
  });
}

// When the last update attempt finished and when the next automatic one is due. A field the backend does not report
// has no row; no next check means automatic updates are off, which their switch already shows.
export function checkTimes(data: GeoData | undefined, now: number, locale: string, t: Translator): KvItem[] {
  if (!data) return [];
  const rows: KvItem[] = [];
  if (data.last_checked_at !== undefined)
    rows.push({
      label: t('settings.geodataLastChecked'),
      value: data.last_checked_at ? relativeStart(data.last_checked_at, locale, now) : t('settings.geodataNever')
    });
  if (data.next_check_at) rows.push({label: t('settings.geodataNextCheck'), value: relativeStart(data.next_check_at, locale, now)});
  return rows;
}
