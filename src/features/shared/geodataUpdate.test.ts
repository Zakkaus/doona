import {expect, it} from 'vitest';
import type {Capabilities, GeoData} from '../../api/model';
import {geodataKinds, geodataNeed} from './geodataUpdate';

const asset = (kind: 'geoip' | 'geosite', size_bytes = '1024') => ({kind, size_bytes, sha256: 'a'.repeat(64), modified_at: null, source_redacted: null});
const read = (...assets: ReturnType<typeof asset>[]) => ({observed_at: '2026-10-05T00:00:00Z', assets}) as GeoData;
const caps = (assets: ('geoip' | 'geosite')[], can_update = assets.length > 0) =>
  ({available: true, can_update, assets}) as Capabilities['resources']['geodata'];

it('finds the geodata kinds a configuration uses outside comments', () => {
  expect(geodataKinds('routing {\n  # geosite:cn in a comment\n  dip(geoip:private) -> direct\n}')).toEqual(['geoip']);
  expect(geodataKinds('domain(geosite:cn) -> direct\ndip(geoip:cn) -> direct')).toEqual(['geosite', 'geoip']);
  expect(geodataKinds('domain(suffix: example.com) -> direct # geoip:cn')).toEqual([]);
  expect(geodataKinds('domain(suffix: geosite, geoip: cn)->direct')).toEqual(['geoip']);
});

it('reads geosite: and geoip: only where they start an argument, not inside quotes or words', () => {
  expect(geodataKinds("domain(full: '/tmp/not-geosite:log') -> direct")).toEqual([]);
  expect(geodataKinds('domain(regex: "geosite:cn") -> direct')).toEqual([]);
  expect(geodataKinds('domain(keyword: not-geosite:log) -> direct')).toEqual([]);
  expect(geodataKinds("qname(full: 'a#b', geosite:cn) -> direct")).toEqual(['geosite']);
  expect(geodataKinds('domain(suffix: example.com) -> direct\n# domain(geosite:cn) -> direct')).toEqual([]);
});

it('names a needed kind honk has not loaded and offers no update for it', () => {
  expect(geodataNeed(['geosite', 'geoip'], caps(['geoip']), read(asset('geoip')))).toEqual({missing: ['geosite.dat'], repair: false});
  expect(geodataNeed(['geosite'], caps([]), read())).toEqual({missing: ['geosite.dat'], repair: false});
});

it('offers the update when every needed kind is loaded, naming an empty one', () => {
  expect(geodataNeed(['geosite', 'geoip'], caps(['geosite', 'geoip']), read(asset('geosite', '0'), asset('geoip')))).toEqual({
    missing: ['geosite.dat'],
    repair: true
  });
  expect(geodataNeed(['geoip'], caps(['geosite', 'geoip']), read(asset('geosite'), asset('geoip')))).toEqual({missing: [], repair: true});
  expect(geodataNeed(['geoip'], caps(['geosite', 'geoip'], false), undefined)).toEqual({missing: [], repair: false});
});

it('offers nothing and names only empty loaded files while the needs or the backend are unknown', () => {
  expect(geodataNeed(null, caps(['geosite', 'geoip']), read(asset('geosite', '0'), asset('geoip')))).toEqual({missing: ['geosite.dat'], repair: false});
  expect(geodataNeed([], caps(['geoip']), read(asset('geoip')))).toEqual({missing: [], repair: false});
  expect(geodataNeed(['geosite'], {available: false} as Capabilities['resources']['geodata'], undefined)).toEqual({missing: [], repair: false});
  expect(geodataNeed(['geosite'], undefined, undefined)).toEqual({missing: [], repair: false});
});
