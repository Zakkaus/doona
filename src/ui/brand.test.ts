import {expect, it} from 'vitest';
import {brandFor, builtinPack, iconForName, iconSource, iconUrl} from './brand';

const id = (text: string | null) => brandFor(text)?.id ?? null;

it('maps rule expressions, hostnames and addresses to catalogue entries', () => {
  expect(id('domain(geosite: netflix)')).toBe('netflix');
  expect(id('domain(geosite: category-ads-all)')).toBe('category-ads');
  expect(id('domain(full: api.telegram.org)')).toBe('telegram');
  expect(id('domain(suffix: zhihu.com, zhimg.com)')).toBe('zhihu');
  expect(id('domain(suffix: unknown.example, discord.gg)')).toBe('discord');
  expect(id('domain(keyword: steamcdn)')).toBeNull();
  expect(id('domain(keyword: reddit)')).toBeNull();
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

it('resolves named icons from the local mapping, then the configuration', () => {
  const overrides = [{name: 'gaming', icon: 'steam'}];
  expect(iconForName('gaming', 'https://icons.example/g.png', overrides)).toBe('steam');
  expect(iconForName('proxy', 'https://icons.example/p.png', overrides)).toBe('https://icons.example/p.png');
  expect(iconForName('proxy', null, overrides)).toBeNull();
  expect(iconSource(builtinPack, 'steam')).toBe('/brands/steam.png');
  expect(iconSource('', 'steam')).toBeNull();
  expect(iconSource(builtinPack, 'https://icons.example/p.png')).toBe('https://icons.example/p.png');
  expect(iconSource(builtinPack, 'javascript:alert(1)')).toBeNull();
});
