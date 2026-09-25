import {describe, expect, it} from 'vitest';
import type {Capabilities, GeoDataSettings} from '../../api/model';
import {capabilities, capabilitiesBase} from '../../api/mock/fixtures/capabilities';
import {geodataPreset, geodataPresets, liteCategories} from '../../dae/geodata';
import {translate, type Translator} from '../../i18n';
import {
  customFields,
  draftInvalid,
  geodataConfigurable,
  geodataDraft,
  geodataPatch,
  geodataStatus,
  matchPreset,
  missingCategories,
  sourceName,
  urlProblem,
  type GeodataDraft
} from './geodata';
import {settingsCardList} from './view';

const t: Translator = (key, params) => translate('en', key, params);
const full = geodataPreset('metacubex');
const lite = geodataPreset('metacubex-lite');
const loyal = geodataPreset('loyalsoldier');
const settings = (over: Partial<GeoDataSettings> = {}): GeoDataSettings => ({
  source: 'default',
  geosite: {urls: [...full.urls.geosite]},
  geoip: {urls: [...full.urls.geoip]},
  auto_update: {enabled: false, interval_hours: 24},
  download: {route: 'direct', group_id: null},
  ...over
});
const draft = (over: Partial<GeodataDraft> = {}): GeodataDraft => ({...geodataDraft(settings()), ...over});

describe('preset matching', () => {
  it('names each preset from its direct links, raw first then jsDelivr fastly', () => {
    for (const preset of geodataPresets) {
      expect(preset.urls.geosite[0]).toMatch(/^https:\/\/raw\.githubusercontent\.com\//);
      expect(preset.urls.geosite[1]).toMatch(/^https:\/\/fastly\.jsdelivr\.net\/gh\//);
      expect(matchPreset(preset.urls)?.id).toBe(preset.id);
    }
    expect(sourceName(lite.urls, t)).toBe('MetaCubeX lite');
    expect(sourceName(loyal.urls, t)).toBe('Loyalsoldier');
  });
  it('accepts a reordered list, a single link or another jsDelivr node as the same preset', () => {
    expect(matchPreset({geosite: [...full.urls.geosite].reverse(), geoip: [full.urls.geoip[0]]})?.id).toBe('metacubex');
    expect(matchPreset({geosite: [full.mirrors.geosite[0]], geoip: [full.mirrors.geoip[1]]})?.id).toBe('metacubex');
  });
  it('shows anything else as custom with the host of its first URL', () => {
    const mirror = {geosite: ['https://mirror.example.net/geo/geosite.dat'], geoip: ['https://mirror.example.net/geo/geoip.dat']};
    expect(matchPreset(mirror)).toBeNull();
    expect(sourceName(mirror, t)).toBe('Custom (mirror.example.net)');
    // Mixing two presets, or one asset from a preset and one elsewhere, is not a preset.
    expect(matchPreset({geosite: full.urls.geosite, geoip: loyal.urls.geoip})).toBeNull();
    expect(matchPreset({geosite: full.urls.geosite, geoip: mirror.geoip})).toBeNull();
    expect(sourceName({geosite: [], geoip: []}, t)).toBe('—');
  });
});

describe('lite pre-check', () => {
  it('lists the required categories the lite files lack, per asset', () => {
    const required = {geosite: ['category-ads-all', 'cn', 'geolocation-!cn', 'telegram'], geoip: ['cn', 'private', 'us']};
    expect(missingCategories(lite, required)).toEqual({geosite: ['category-ads-all', 'geolocation-!cn'], geoip: ['us']});
    expect(liteCategories.geosite).not.toContain('geolocation-!cn');
    expect(liteCategories.geosite).not.toContain('category-ads-all');
  });
  it('stays quiet when nothing is missing, for full presets, and before the codes are known', () => {
    expect(missingCategories(lite, {geosite: ['cn'], geoip: ['private']})).toBeNull();
    expect(missingCategories(full, {geosite: ['geolocation-!cn'], geoip: []})).toBeNull();
    expect(missingCategories(lite, undefined)).toBeNull();
    expect(missingCategories(null, {geosite: ['x'], geoip: []})).toBeNull();
  });
});

describe('settings patch', () => {
  it('sends nothing for an unchanged draft', () => {
    expect(geodataPatch(settings(), geodataDraft(settings()))).toBeNull();
  });
  it('sends both URL lists when a preset or custom list changes', () => {
    expect(geodataPatch(settings(), draft({choice: 'loyalsoldier'}))).toEqual({geosite: {urls: loyal.urls.geosite}, geoip: {urls: loyal.urls.geoip}});
    const custom = draft({choice: 'custom', custom: {geosite: [' https://m.example/geosite.dat ', ''], geoip: [...full.urls.geoip]}});
    expect(geodataPatch(settings(), custom)).toEqual({geosite: {urls: ['https://m.example/geosite.dat']}, geoip: {urls: full.urls.geoip}});
  });
  it('treats a reordered list as a change, since order is fallback order', () => {
    const custom = draft({choice: 'custom', custom: {geosite: [...full.urls.geosite].reverse(), geoip: [...full.urls.geoip]}});
    expect(geodataPatch(settings(), custom)?.geosite?.urls).toEqual([...full.urls.geosite].reverse());
  });
  it('sends only the changed auto-update fields', () => {
    expect(geodataPatch(settings(), draft({enabled: true}))).toEqual({auto_update: {enabled: true}});
    expect(geodataPatch(settings(), draft({interval: '48'}))).toEqual({auto_update: {interval_hours: 48}});
    expect(geodataPatch(settings(), draft({interval: '5'}))).toBeNull();
  });
  it('sends and checks URLs written from the configuration file like any others', () => {
    const seeded = settings({source: 'config', geosite: {urls: ['https://m.example/geosite.dat']}, geoip: {urls: [...full.urls.geoip]}});
    expect(geodataPatch(seeded, {...geodataDraft(seeded), choice: 'metacubex', enabled: true})).toEqual({
      geosite: {urls: full.urls.geosite},
      geoip: {urls: full.urls.geoip},
      auto_update: {enabled: true}
    });
    expect(geodataPatch(seeded, {...geodataDraft(seeded), enabled: true})).toEqual({auto_update: {enabled: true}});
    expect(draftInvalid({...geodataDraft(seeded), choice: 'custom', custom: {geosite: [], geoip: []}})).toBe(true);
  });
  it('blocks a custom list without a URL, with a bad URL or a repeat, and an interval out of range', () => {
    const custom = (geosite: string[]) => draft({choice: 'custom', custom: {geosite, geoip: [...full.urls.geoip]}});
    expect(draftInvalid(custom(['https://m.example/a.dat']))).toBe(false);
    expect(draftInvalid(custom(['']))).toBe(true);
    expect(draftInvalid(custom(['ftp://m.example/a.dat']))).toBe(true);
    expect(draftInvalid(custom(['https://m.example/a.dat', 'https://m.example/a.dat']))).toBe(true);
    expect(draftInvalid(draft({interval: '169'}))).toBe(true);
    expect(urlProblem('https://user:pw@m.example/a.dat', [])).toBe('settings.geodataUrlInvalid');
    expect(urlProblem('https://m.example/a.dat#x', [])).toBe('settings.geodataUrlInvalid');
    expect(urlProblem('', [])).toBeNull();
    // The 4096 limit counts characters, as JSON Schema's maxLength does, so a long non-ASCII path still fits.
    const long = (length: number) => 'https://m.example/' + 'é'.repeat(length - 'https://m.example/'.length);
    expect(urlProblem(long(4096), [])).toBeNull();
    expect(urlProblem(long(4097), [])).toBe('settings.geodataUrlInvalid');
  });
  it('offers one blank field after the URLs until the list holds four', () => {
    expect(customFields(['a'])).toEqual(['a', '']);
    expect(customFields(['a', 'b', 'c', 'd'])).toEqual(['a', 'b', 'c', 'd']);
    expect(customFields(['a', ''])).toEqual(['a', '']);
  });
});

describe('capability and status', () => {
  it('shows the geodata card only with configurable sources and the geodata settings field', () => {
    expect(geodataConfigurable(capabilities.resources)).toBe(true);
    expect(settingsCardList(capabilities.resources).map(card => card.id)).toContain('geodata');
    const without: Capabilities['resources'] = {...capabilities.resources, geodata: {available: true, can_update: true, assets: ['geosite', 'geoip']}};
    expect(geodataConfigurable(without)).toBe(false);
    expect(settingsCardList(without).map(card => card.id)).not.toContain('geodata');
    expect(geodataConfigurable({...capabilities.resources, runtime_settings: {available: true, fields: ['log.level']}})).toBe(false);
    expect(geodataConfigurable(capabilitiesBase.resources)).toBe(false);
  });
  it('writes never, off and none before the first update', () => {
    const status = geodataStatus({observed_at: '', assets: []}, false, 'en-US', t);
    expect(status).toEqual([
      ['Last checked', 'Never'],
      ['Last updated', 'Never'],
      ['Next check', 'Automatic updates off'],
      ['Last error', 'None']
    ]);
  });
  it('words the last error by its code, as other operation failures are', () => {
    const failed = (code: string) =>
      geodataStatus(
        {observed_at: '', assets: [], last_error: {code, message: 'Geodata update did not complete successfully', details: null}},
        false,
        'en-US',
        t
      )[3][1];
    expect(failed('geodata_update_failed')).toBe(t('ui.backend.geodataUpdateFailed'));
    expect(failed('adapter_specific')).toBe(t('ui.backendMessage', {message: 'Geodata update did not complete successfully'}));
  });
});
