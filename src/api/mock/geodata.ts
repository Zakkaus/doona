import type {Capabilities, GeoAssetKind, GeoData, GeoDataDownload, GeoDataSettings, GeoDataSettingsPatch} from '../model';
import {ApiError} from '../error';
import {defaultGeodataPreset, geodataIntervalRange, geodataPresets, maxGeodataUrls, validGeodataUrl} from '../../dae/geodata';
import {scanConfig} from '../../dae/text';
import * as fixtures from './fixtures/inventory';
import {rules} from './rules';

const kinds: GeoAssetKind[] = ['geosite', 'geoip'];
// The categories the demo configuration's rules use, lowercase and without attribute suffixes, as honk reports them.
function requiredCodes(): Record<GeoAssetKind, string[]> {
  const codes = {geosite: new Set<string>(), geoip: new Set<string>()};
  for (const {cond} of rules) {
    const words = scanConfig(cond).tokens.map(token => cond.slice(token.from, token.to));
    words.forEach((word, i) => {
      if ((word === 'geosite' || word === 'geoip') && words[i + 1] === ':') codes[word].add(words[i + 2].split('@')[0].toLowerCase());
    });
  }
  return {geosite: [...codes.geosite].sort(), geoip: [...codes.geoip].sort()};
}
// raw.githubusercontent.com and jsDelivr serve the .sha256sum files the known sources publish; other hosts do not.
const publishesChecksum = (url: string) => /^https:\/\/(raw\.githubusercontent\.com|[a-z]+\.jsdelivr\.net)\//.test(url);
const presetAt = (kind: GeoAssetKind, url: string) => geodataPresets.find(preset => preset.urls[kind].includes(url) || preset.mirrors[kind].includes(url));

// The stored geodata settings and update status: the backend keeps them across reloads, unlike the other runtime settings.
export function createGeodataState(capabilities: Capabilities, groupIds: () => Set<string>) {
  const configurable = capabilities.resources.geodata.configurable_sources === true;
  let stored: Record<GeoAssetKind, string[]> | null = null;
  const auto = {enabled: true, interval_hours: 24};
  let download: GeoDataDownload = {route: 'routing', group_id: null};
  const data = structuredClone(fixtures.geodata);
  data.required_codes = requiredCodes();
  const urls = () => stored ?? {geosite: [...defaultGeodataPreset.urls.geosite], geoip: [...defaultGeodataPreset.urls.geoip]};
  const nextCheck = (from: number) => (auto.enabled ? new Date(from + auto.interval_hours * 3600_000 + 17 * 60_000).toISOString() : null);
  data.next_check_at = nextCheck(Date.parse(data.last_checked_at ?? '') || Date.now());
  const invalid = (message: string) => new ApiError(400, 'invalid_request', message);
  const status = (): GeoData => {
    const view = structuredClone(data);
    if (!configurable) {
      for (const asset of view.assets) {
        delete asset.fetched_url_redacted;
        delete asset.verified;
        delete asset.download_route;
      }
      delete view.last_checked_at;
      delete view.last_updated_at;
      delete view.next_check_at;
      delete view.last_error;
      delete view.required_codes;
    }
    return {...view, observed_at: new Date().toISOString()};
  };
  return {
    settings: (): GeoDataSettings => ({
      source: stored ? 'db' : 'default',
      geosite: {urls: urls().geosite},
      geoip: {urls: urls().geoip},
      auto_update: {...auto},
      // A stored group that no longer exists reads as null.
      download: {...download, group_id: download.group_id && groupIds().has(download.group_id) ? download.group_id : null}
    }),
    // Checks the whole patch before storing any of it, as the backend does.
    patch(patch: GeoDataSettingsPatch) {
      if (patch === null) {
        stored = null;
        Object.assign(auto, {enabled: true, interval_hours: 24});
        download = {route: 'routing', group_id: null};
      } else {
        for (const kind of kinds) {
          const list = patch[kind]?.urls;
          if (!list) continue;
          if (!list.length || list.length > maxGeodataUrls) throw invalid(`geodata.${kind}.urls must hold 1 to ${maxGeodataUrls} URLs`);
          if (new Set(list).size !== list.length) throw invalid(`geodata.${kind}.urls must not repeat a URL`);
          if (!list.every(validGeodataUrl)) throw invalid(`geodata.${kind}.urls holds an invalid URL`);
        }
        const interval = patch.auto_update?.interval_hours;
        const {min, max} = geodataIntervalRange;
        if (interval !== undefined && (!Number.isInteger(interval) || interval < min || interval > max))
          throw invalid(`geodata.auto_update.interval_hours must lie in [${min}, ${max}]`);
        const route = patch.download;
        if (route && (route.route === 'group') !== (route.group_id !== undefined)) throw invalid('geodata.download.group_id is required for route group only');
        if (route?.group_id !== undefined && !groupIds().has(route.group_id))
          throw new ApiError(422, 'unsupported_value', `geodata.download.group_id ${route.group_id} is not a current group`);
        if (patch.geosite || patch.geoip) stored = {geosite: patch.geosite?.urls ?? urls().geosite, geoip: patch.geoip?.urls ?? urls().geoip};
        Object.assign(auto, patch.auto_update ?? {});
        if (route) download = {route: route.route, group_id: route.group_id ?? null};
      }
      data.next_check_at = nextCheck(Date.now());
    },
    status,
    // Downloads from the first URL of each asset; a file lacking a category the rules use fails the whole update.
    update(): GeoData {
      const now = Date.now();
      const at = new Date(now).toISOString();
      data.last_checked_at = at;
      data.next_check_at = nextCheck(now);
      const lists = urls();
      for (const kind of kinds) {
        // A known small file has a known category list; any other file is taken to carry every category.
        const known = presetAt(kind, lists[kind][0])?.categories?.[kind];
        const missing = known ? (data.required_codes?.[kind] ?? []).filter(code => !known.includes(code)) : [];
        if (missing.length) {
          const message = `The new ${kind} file lacks categories the configuration uses: ${missing.join(', ')}.`;
          data.last_error = {code: 'asset_validation_failed', message, details: null};
          throw new Error(message);
        }
      }
      for (const asset of data.assets) {
        const url = lists[asset.kind][0];
        asset.modified_at = at;
        asset.sha256 = Array.from({length: 64}, () => Math.floor(Math.random() * 16).toString(16)).join('');
        asset.size_bytes = String((presetAt(asset.kind, url)?.sizes[asset.kind] ?? Number(asset.size_bytes)) + Math.floor(Math.random() * 65536));
        asset.source_redacted = url;
        asset.fetched_url_redacted = url;
        asset.verified = publishesChecksum(url);
        asset.download_route = {route: download.route, group_id: download.route === 'group' ? download.group_id : null};
      }
      data.last_updated_at = at;
      data.last_error = null;
      return status();
    }
  };
}
export type MockGeodataState = ReturnType<typeof createGeodataState>;
