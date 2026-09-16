import {expect, it} from 'vitest';
import {brandFor, iconUrl} from './brand';

it('maps rule expressions, domains and outbounds to pack names', () => {
  expect(brandFor('domain(geosite: netflix)')).toBe('Netflix');
  expect(brandFor('domain(geosite: category-ads-all)')).toBe('Advertising');
  expect(brandFor('domain(full: api.telegram.org)')).toBe('Telegram');
  expect(brandFor('domain(suffix: zhihu.com, zhimg.com)')).toBeNull();
  expect(brandFor('domain(suffix: unknown.example, discord.gg)')).toBe('Discord');
  expect(brandFor('dip(geoip:cn)')).toBe('China');
  expect(brandFor('fallback: gaming')).toBe('Game');
  expect(brandFor('rr1---sn-ab5l6n7z.googlevideo.com')).toBe('YouTube');
  expect(brandFor('apps.apple.com')).toBe('App_Store');
  expect(brandFor('direct')).toBe('Direct');
  expect(brandFor('hk-01')).toBeNull();
  expect(brandFor(null)).toBeNull();
});

it('builds pack URLs for presets and custom prefixes', () => {
  expect(iconUrl('qure-color', 'Disney+')).toBe('https://cdn.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Disney%2B.png');
  expect(iconUrl('https://icons.example/pack', 'Netflix')).toBe('https://icons.example/pack/Netflix.png');
});
