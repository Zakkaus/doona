import {expect, it} from 'vitest';
import {brandFor, builtinPack, iconUrl} from './brand';

const id = (text: string | null) => brandFor(text)?.id ?? null;

it('maps rule expressions, hostnames and addresses to catalogue entries', () => {
  expect(id('domain(geosite: netflix)')).toBe('netflix');
  expect(id('domain(geosite: category-ads-all)')).toBe('category-ads');
  expect(id('domain(full: api.telegram.org)')).toBe('telegram');
  expect(id('domain(suffix: zhihu.com, zhimg.com)')).toBe('zhihu');
  expect(id('domain(suffix: unknown.example, discord.gg)')).toBe('discord');
  expect(id('domain(keyword: steamcdn)')).toBe('steam');
  expect(id('domain(keyword: reddit)')).toBe('reddit');
  expect(id('domain(regex: ^cdn\\d+\\.example$)')).toBeNull();
  expect(id('dip(geoip:cn)')).toBe('china-zone');
  expect(id('fallback: gaming')).toBe('rule-fallback');
  expect(id('rr1---sn-ab5l6n7z.googlevideo.com')).toBe('youtube');
  expect(id('apps.apple.com')).toBe('app-store');
  expect(id('proxy')).toBeNull();
  expect(id('hk-01')).toBeNull();
  expect(id('1.1.1.1:53')).toBe('cloudflare');
  expect(id('[2001:4860:4860::8888]:53')).toBe('google');
  expect(id('223.5.5.5')).toBe('alidns');
  expect(id('203.0.113.9:8443')).toBeNull();
  expect(id(null)).toBeNull();
});

it('builds icon URLs for the bundled set and custom prefixes', () => {
  const netflix = brandFor('netflix.com')!;
  expect(iconUrl(builtinPack, netflix)).toBe('/brands/netflix.png');
  expect(iconUrl('https://icons.example/pack', netflix)).toBe('https://icons.example/pack/netflix.png');
});
