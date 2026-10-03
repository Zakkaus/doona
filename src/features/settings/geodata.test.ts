import {describe, expect, it} from 'vitest';
import type {GeoData} from '../../api/model';
import {geodataPreset, geodataPresets, liteCategories} from '../../dae/geodata';
import {translate, type Translator} from '../../i18n';
import {
  assetDetails,
  checkTimes,
  cleanUrls,
  customFields,
  customInvalid,
  intervalChoices,
  lackingCodes,
  matchPreset,
  missingCategories,
  presetNote,
  routeLabel,
  statusLine,
  urlProblem
} from './geodata';

const t: Translator = (key, params) => translate('en', key, params);
const full = geodataPreset('metacubex');
const lite = geodataPreset('metacubex-lite');
const loyal = geodataPreset('loyalsoldier');
const at = '2026-09-22T12:00:00Z';
const now = Date.parse('2026-09-25T12:00:00Z');
const asset = (kind: 'geosite' | 'geoip', over: Partial<GeoData['assets'][number]> = {}): GeoData['assets'][number] => ({
  kind,
  sha256: '0'.repeat(64),
  size_bytes: '4404019',
  modified_at: at,
  source_redacted: full.urls[kind][0],
  fetched_url_redacted: full.urls[kind][0],
  verified: true,
  download_route: {route: 'direct', group_id: null},
  ...over
});
const status = (over: Partial<GeoData> = {}): GeoData => ({observed_at: '', assets: [asset('geosite'), asset('geoip')], last_updated_at: at, ...over});

describe('preset matching', () => {
  it('names each preset from its direct links, raw first then jsDelivr fastly', () => {
    for (const preset of geodataPresets) {
      expect(preset.urls.geosite[0]).toMatch(/^https:\/\/raw\.githubusercontent\.com\//);
      expect(preset.urls.geosite[1]).toMatch(/^https:\/\/fastly\.jsdelivr\.net\/gh\//);
      expect(matchPreset(preset.urls)?.id).toBe(preset.id);
    }
  });
  it('accepts a reordered list, a single link or another jsDelivr node as the same preset', () => {
    expect(matchPreset({geosite: [...full.urls.geosite].reverse(), geoip: [full.urls.geoip[0]]})?.id).toBe('metacubex');
    expect(matchPreset({geosite: [full.mirrors.geosite[0]], geoip: [full.mirrors.geoip[1]]})?.id).toBe('metacubex');
  });
  it('matches nothing else to a preset', () => {
    const mirror = {geosite: ['https://mirror.example.net/geo/geosite.dat'], geoip: ['https://mirror.example.net/geo/geoip.dat']};
    expect(matchPreset(mirror)).toBeNull();
    // Mixing two presets, or one asset from a preset and one elsewhere, is not a preset.
    expect(matchPreset({geosite: full.urls.geosite, geoip: loyal.urls.geoip})).toBeNull();
    expect(matchPreset({geosite: full.urls.geosite, geoip: mirror.geoip})).toBeNull();
    expect(matchPreset({geosite: [], geoip: []})).toBeNull();
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
  it('asks before choosing a preset only when it lacks a category the rules use', () => {
    expect(lackingCodes(lite, {geosite: ['discord', 'cn'], geoip: ['us']}, t)).toBe('geosite:discord, geoip:us');
    expect(lackingCodes(lite, {geosite: ['cn'], geoip: ['private']}, t)).toBeNull();
    expect(lackingCodes(full, {geosite: ['discord'], geoip: []}, t)).toBeNull();
    expect(lackingCodes(lite, undefined, t)).toBeNull();
  });
});

describe('custom URLs', () => {
  it('blocks a list without a URL, with a bad URL or a repeat', () => {
    const lists = (geosite: string[]) => ({geosite, geoip: [...full.urls.geoip]});
    expect(customInvalid(lists(['https://m.example/a.dat']))).toBe(false);
    expect(customInvalid(lists(['']))).toBe(true);
    expect(customInvalid(lists(['ftp://m.example/a.dat']))).toBe(true);
    expect(customInvalid(lists(['https://m.example/a.dat', 'https://m.example/a.dat']))).toBe(true);
    expect(urlProblem('https://user:pw@m.example/a.dat', [])).toBe('settings.geodataUrlInvalid');
    expect(urlProblem('https://m.example/a.dat#x', [])).toBe('settings.geodataUrlInvalid');
    expect(urlProblem('', [])).toBeNull();
    // The 4096 limit counts characters, as JSON Schema's maxLength does, so a long non-ASCII path still fits.
    const long = (length: number) => 'https://m.example/' + 'é'.repeat(length - 'https://m.example/'.length);
    expect(urlProblem(long(4096), [])).toBeNull();
    expect(urlProblem(long(4097), [])).toBe('settings.geodataUrlInvalid');
    expect(t('settings.geodataUrlInvalid')).toContain('4096 characters');
  });
  it('stores the lists trimmed, in order, without blanks', () => {
    expect(cleanUrls({geosite: [' https://m.example/b.dat ', '', 'https://m.example/a.dat'], geoip: ['https://m.example/ip.dat']})).toEqual({
      geosite: ['https://m.example/b.dat', 'https://m.example/a.dat'],
      geoip: ['https://m.example/ip.dat']
    });
  });
  it('offers one blank field after the URLs until the list holds max_urls', () => {
    expect(customFields(['a'], 4)).toEqual(['a', '']);
    expect(customFields(['a', 'b', 'c', 'd'], 4)).toEqual(['a', 'b', 'c', 'd']);
    expect(customFields(['a', ''], 4)).toEqual(['a', '']);
    expect(customFields(['a', 'b'], 2)).toEqual(['a', 'b']);
  });
});

describe('rows', () => {
  it('describes a preset by its sizes, or by the categories the rules use that it lacks', () => {
    expect(presetNote(full, {geosite: ['discord'], geoip: []}, 'en-US', t)).toEqual({
      text: expect.stringMatching(/^geosite about .+, geoip about /),
      notice: false
    });
    expect(presetNote(lite, {geosite: ['discord', 'cn'], geoip: ['us']}, 'en-US', t)).toEqual({
      text: 'Lacks categories the rules use: geosite:discord, geoip:us',
      notice: true
    });
  });
  it('offers the intervals within the bounds with the default, and keeps a stored one outside them', () => {
    const bounds = {min: 1, max: 168, default: 24};
    expect(intervalChoices(24, bounds, 'en-US').map(item => item.label)).toEqual(['6 hours', '12 hours', '1 day', '3 days', '7 days']);
    expect(intervalChoices(48, bounds, 'en-US').map(item => item.id)).toEqual(['6', '12', '24', '48', '72', '168']);
    expect(intervalChoices(12, {min: 12, max: 48, default: 36}, 'en-US').map(item => item.id)).toEqual(['12', '24', '36']);
    expect(intervalChoices(2, {min: 1, max: 4, default: 2}, 'en-US').map(item => item.id)).toEqual(['2']);
  });
  it('names a route by its group where it has one', () => {
    const groups = [{id: 'proxy', name: 'Proxy'}] as Parameters<typeof routeLabel>[1];
    expect(routeLabel({route: 'direct', group_id: null}, groups, t)).toBe('Direct');
    expect(routeLabel({route: 'routing', group_id: null}, groups, t)).toBe('By routing rules');
    expect(routeLabel({route: 'routing', group_id: 'proxy'}, groups, t)).toBe('By routing rules (Proxy)');
    expect(routeLabel({route: 'group', group_id: 'proxy'}, groups, t)).toBe('Proxy');
    expect(routeLabel({route: 'group', group_id: null}, groups, t)).toBe('Group no longer exists');
  });
  it('reads the status as the last update and its checksums, an update in progress, or the last error', () => {
    expect(statusLine(status(), false, now, 'en-US', t)).toEqual({text: 'Last updated: 3 days ago, Verified', error: false});
    const unverified = statusLine(status({assets: [asset('geosite'), asset('geoip', {verified: false})]}), false, now, 'en-US', t);
    expect(unverified.text).toMatch(/Not verified$/);
    expect(unverified.help).toEqual({title: t('settings.geodataVerifiedNo'), text: t('settings.geodataUnverifiedHelp')});
    const unverifiedStatus = status({assets: [asset('geosite'), asset('geoip', {verified: false})]});
    expect(statusLine(unverifiedStatus, false, now, 'en-US', t, false, 'pinned').help?.text).toBe(t('settings.geodataUnverifiedPinnedHelp'));
    expect(statusLine(unverifiedStatus, false, now, 'en-US', t, false, null).help?.text).toBe(t('settings.geodataUnverifiedNoneHelp'));
    expect(statusLine(status(), false, now, 'en-US', t).help).toBeUndefined();
    expect(statusLine(status({last_updated_at: null}), false, now, 'en-US', t).text).toBe('Last updated: Never, Verified');
    expect(statusLine(undefined, false, now, 'en-US', t)).toEqual({text: 'Last updated: —', error: false});
    expect(statusLine(status(), true, now, 'en-US', t)).toEqual({text: 'Updating…', error: false});
    const failed = status({last_error: {code: 'geodata_update_failed', message: 'x', details: null}});
    expect(statusLine(failed, false, now, 'en-US', t)).toEqual({
      text: t('ui.valuePair', {label: 'Last error', value: t('ui.backend.geodataUpdateFailed')}),
      error: true
    });
    const staged = status({last_error: {code: 'staging_failed', message: 'Geodata update did not complete successfully', details: null}});
    expect(statusLine(staged, false, now, 'en-US', t).text).toBe(
      t('ui.valuePair', {
        label: 'Last error',
        value: t('ui.aside', {text: t('ui.backendMessage', {message: 'Geodata update did not complete successfully'}), note: 'staging_failed'})
      })
    );
  });
  it('explains a checksum failure beside the verify switch only where the backend offers it', () => {
    const text = {checksum_unavailable: 'settings.geodataVerifyChecksumHelp', checksum_mismatch: 'settings.geodataChecksumMismatchHelp'} as const;
    for (const code of ['checksum_unavailable', 'checksum_mismatch'] as const) {
      const failed = status({last_error: {code, message: 'x', details: null}});
      expect(statusLine(failed, false, now, 'en-US', t, true).help).toEqual({title: t('settings.geodataVerifyChecksum'), text: t(text[code])});
      expect(statusLine(failed, false, now, 'en-US', t).help).toBeUndefined();
    }
    const other = status({last_error: {code: 'download_timeout', message: 'x', details: null}});
    expect(statusLine(other, false, now, 'en-US', t, true).help).toBeUndefined();
  });
  it('lists each asset with its size, host and route, and the full URL behind it', () => {
    const details = assetDetails(status(), [], 'en-US', t);
    expect(details[0]).toEqual({label: 'geosite', value: expect.stringMatching(/^4\.4 MB, raw\.githubusercontent\.com, Direct$/), full: full.urls.geosite[0]});
    expect(assetDetails(undefined, [], 'en-US', t)).toEqual([]);
  });

  it.each([
    {
      name: 'both reported',
      over: {last_checked_at: at, next_check_at: '2026-09-25T18:00:00Z'},
      rows: [
        ['Last checked', '3 days ago'],
        ['Next check', 'in 6 hours']
      ]
    },
    {name: 'never checked, automatic updates off', over: {last_checked_at: null, next_check_at: null}, rows: [['Last checked', 'Never']]},
    {name: 'not reported', over: {}, rows: []}
  ])('lists the check times: $name', ({over, rows}) => {
    expect(checkTimes(status(over), now, 'en-US', t).map(row => (Array.isArray(row) ? row : [row.label, row.value]))).toEqual(rows);
  });
  it('has no check times before the status is read', () => {
    expect(checkTimes(undefined, now, 'en-US', t)).toEqual([]);
  });
});
