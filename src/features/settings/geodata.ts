import type {Capabilities, GeoAssetKind, GeoData, GeoDataSettings, GeoDataSettingsPatch} from '../../api/model';
import {geodataIntervalRange, geodataPresets, maxGeodataUrls, validGeodataUrl, type GeodataPreset, type GeodataPresetId} from '../../dae/geodata';
import type {Key, Translator} from '../../i18n';
import {localTime} from '../../i18n/format';

export const geodataKinds: GeoAssetKind[] = ['geosite', 'geoip'];
export type GeodataChoice = GeodataPresetId | 'custom';
export type GeodataUrls = Record<GeoAssetKind, string[]>;

export const presetLabels: Record<GeodataPresetId, Key> = {
  metacubex: 'settings.geodataPreset.metacubex',
  'metacubex-lite': 'settings.geodataPreset.metacubexLite',
  loyalsoldier: 'settings.geodataPreset.loyalsoldier'
};
export const geodataSourceLabels: Record<GeoDataSettings['source'], Key> = {
  config: 'settings.geodataFromConfig',
  db: 'settings.geodataFromDb',
  default: 'settings.geodataFromDefault'
};

// The sources section needs both the capability and geodata among the runtime settings fields; without either the
// page keeps the plain geodata table in the backend actions card.
export function geodataConfigurable(resources: Capabilities['resources'] | undefined): boolean {
  return (
    resources?.geodata.available === true &&
    resources.geodata.configurable_sources === true &&
    resources.runtime_settings.available &&
    (resources.runtime_settings.fields ?? []).includes('geodata')
  );
}

// A list names a preset when every URL of both assets is one of that preset's links or mirrors, in any order.
export function matchPreset(urls: GeodataUrls): GeodataPreset | null {
  return (
    geodataPresets.find(preset =>
      geodataKinds.every(kind => urls[kind].length > 0 && urls[kind].every(url => preset.urls[kind].includes(url) || preset.mirrors[kind].includes(url)))
    ) ?? null
  );
}

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};
// Users cannot name sources: a preset shows its name, anything else "Custom" with the host of its first URL.
export function sourceName(urls: GeodataUrls, t: Translator): string {
  const preset = matchPreset(urls);
  if (preset) return t(presetLabels[preset.id]);
  const first = urls.geosite[0] ?? urls.geoip[0];
  return first ? t('settings.geodataCustomHost', {host: hostOf(first)}) : '—';
}

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

export type GeodataDraft = {choice: GeodataChoice; custom: GeodataUrls; enabled: boolean; interval: string};
export function geodataDraft(settings: GeoDataSettings): GeodataDraft {
  const urls = {geosite: settings.geosite.urls, geoip: settings.geoip.urls};
  return {
    choice: matchPreset(urls)?.id ?? 'custom',
    custom: {geosite: [...urls.geosite], geoip: [...urls.geoip]},
    enabled: settings.auto_update.enabled,
    interval: String(settings.auto_update.interval_hours)
  };
}
// The URLs a draft would store: a preset's links, or the custom fields with blanks dropped.
export function draftUrls(draft: GeodataDraft): GeodataUrls {
  const preset = geodataPresets.find(item => item.id === draft.choice);
  if (preset) return {geosite: [...preset.urls.geosite], geoip: [...preset.urls.geoip]};
  return {geosite: draft.custom.geosite.map(url => url.trim()).filter(Boolean), geoip: draft.custom.geoip.map(url => url.trim()).filter(Boolean)};
}

export function urlProblem(url: string, list: string[]): Key | null {
  const value = url.trim();
  if (!value) return null;
  if (!validGeodataUrl(value)) return 'settings.geodataUrlInvalid';
  if (list.filter(item => item.trim() === value).length > 1) return 'settings.geodataUrlDuplicate';
  return null;
}
export const intervalInvalid = (value: string) => !/^\d+$/.test(value) || Number(value) < geodataIntervalRange.min || Number(value) > geodataIntervalRange.max;

// Whether a draft can be sent: custom lists need one valid URL per asset, and the interval must lie in range.
export function draftInvalid(draft: GeodataDraft, source: GeoDataSettings['source']): boolean {
  if (intervalInvalid(draft.interval)) return true;
  if (source === 'config' || draft.choice !== 'custom') return false;
  return geodataKinds.some(kind => !draft.custom[kind].some(url => url.trim()) || draft.custom[kind].some(url => urlProblem(url, draft.custom[kind])));
}

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((url, i) => url === b[i]);
// The PATCH /runtime/settings geodata member for what the draft changed, or null when nothing did. URLs go as both
// lists together, since the backend stores both anyway; under source config they stay out, because the configuration
// file owns them and the backend would answer 409.
export function geodataPatch(baseline: GeoDataSettings, draft: GeodataDraft): Exclude<GeoDataSettingsPatch, null> | null {
  const patch: Exclude<GeoDataSettingsPatch, null> = {};
  if (baseline.source !== 'config') {
    const urls = draftUrls(draft);
    if (!geodataKinds.every(kind => sameList(urls[kind], baseline[kind].urls))) {
      patch.geosite = {urls: urls.geosite};
      patch.geoip = {urls: urls.geoip};
    }
  }
  const auto: NonNullable<Exclude<GeoDataSettingsPatch, null>['auto_update']> = {};
  if (draft.enabled !== baseline.auto_update.enabled) auto.enabled = draft.enabled;
  if (!intervalInvalid(draft.interval) && Number(draft.interval) !== baseline.auto_update.interval_hours) auto.interval_hours = Number(draft.interval);
  if (Object.keys(auto).length) patch.auto_update = auto;
  return Object.keys(patch).length ? patch : null;
}

// The custom URL fields: each stored URL, then one blank to add another while the list has room.
export function customFields(urls: string[]): string[] {
  return urls.length < maxGeodataUrls && urls.every(url => url.trim()) ? [...urls, ''] : urls;
}

// The update status as label and value pairs; timestamps are local times, with "never" before the first attempt.
export function geodataStatus(data: GeoData | undefined, autoUpdate: boolean, locale: string, t: Translator): Array<[string, string]> {
  const time = (at: string | null | undefined) => (at ? localTime(at, locale) : t('settings.geodataNever'));
  return [
    [t('settings.geodataLastChecked'), time(data?.last_checked_at)],
    [t('settings.geodataLastUpdated'), time(data?.last_updated_at)],
    [t('settings.geodataNextCheck'), data?.next_check_at ? localTime(data.next_check_at, locale) : autoUpdate ? '—' : t('settings.geodataAutoOff')],
    [t('settings.geodataLastError'), data?.last_error ? data.last_error.message : t('settings.geodataNoError')]
  ];
}
