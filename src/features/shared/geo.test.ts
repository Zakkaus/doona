import {expect, it, vi} from 'vitest';
import {nodeFixtures} from '../../../mock/fixtures/inventory';
import {regions} from '../../dae/regions';
import {regionOf} from './geo';

// The one-regex-per-alias matcher that geo.ts replaced, kept as the reference the single pass must agree with.
const legacyAliases = regions.flatMap(([iso, keys]) =>
  [...new Set([iso, ...keys].map(key => (key.toUpperCase() === iso ? iso : key)))].map(key => ({
    iso,
    pattern: new RegExp(
      /\p{Script=Han}/u.test(key) ? key : `(?<![\\p{L}\\p{M}])${key}(?![\\p{L}\\p{M}])`,
      key.toUpperCase() === iso && ['IN', 'IT', 'MY', 'NO', 'ID'].includes(iso) ? 'u' : 'iu'
    )
  }))
);
function legacyRegionOf(name: string): string | null {
  let chosen: {iso: string; index: number; length: number} | undefined;
  for (const {iso, pattern} of legacyAliases) {
    const match = pattern.exec(name);
    if (match && (!chosen || match.index < chosen.index || (match.index === chosen.index && match[0].length > chosen.length)))
      chosen = {iso, index: match.index, length: match[0].length};
  }
  return chosen?.iso ?? null;
}
const keys = [...new Set(regions.flatMap(([iso, aliases]) => [iso, ...aliases]))];

it('guesses regions from whole Latin tokens and spaced phrases', () => {
  expect(regionOf('HK-01')).toBe('HK');
  expect(regionOf('FRA 02')).toBe('DE');
  expect(regionOf('Paris CDG')).toBe('FR');
  expect(regionOf('San Jose premium')).toBe('US');
  expect(regionOf('shkhk')).toBeNull();
});

it.each([
  ['港 01', 'HK'],
  ['Macau', 'MO'],
  ['澳門節點', 'MO'],
  ['ZA-01', 'ZA'],
  ['India', 'IN'],
  ['印度尼西亞', 'ID'],
  ['China via Hong Kong', 'CN'],
  ['France via JP', 'FR'],
  ['United States of America', 'US'],
  ['Türkiye', 'TR'],
  ['best node in Singapore', 'SG'],
  ['my node', null],
  ['it works', null],
  ['no country', null],
  ['node id 42', null],
  ['ChinaTown', null],
  ['ÉJapan', null],
  ['Japané', null],
  ['Japan\u0301', null],
  ['xUnited States', null],
  ['United Statesman', null]
])('uses bounded aliases and location order for %s', (name, expected) => expect(regionOf(name)).toBe(expected));

it('caches both recognized and unknown regions without regex work', () => {
  regionOf('FRA region memo');
  regionOf('unknown region memo');
  const spy = vi.spyOn(RegExp.prototype, 'exec');
  regionOf('FRA region memo');
  regionOf('unknown region memo');
  const calls = spy.mock.calls.length;
  spy.mockRestore();
  expect(calls).toBe(0);
});

it('keeps aliases to letters, with Han aliases starting on a Han character', () => {
  // geo.ts relies on this: no position can start both a Han and a Latin alias, and no key needs regex escaping.
  for (const key of keys) {
    expect(key).toMatch(/^[\p{L} ]+$/u);
    expect(/\p{Script=Han}/u.test(key)).toBe(/^\p{Script=Han}+$/u.test(key));
  }
});

it('matches the per-alias reference on every alias, its case forms and its surroundings', () => {
  const forms = (key: string) => {
    const title = key.replace(/(^|\s)\S/g, letter => letter.toUpperCase());
    const alternating = [...key].map((letter, i) => (i % 2 ? letter.toUpperCase() : letter.toLowerCase())).join('');
    return [...new Set([key, key.toLowerCase(), key.toUpperCase(), title, alternating])];
  };
  const around = (form: string) => [
    form,
    `${form}-01`,
    `01 ${form} IPLC`,
    `x${form}`,
    `${form}x`,
    `${form}2`,
    `é${form}`,
    `${form}\u0301`,
    `🇯🇵 ${form}`,
    `${form}节点`,
    `[${form}]`,
    `${form}|${form}`
  ];
  const names = keys.flatMap(key => forms(key).flatMap(around));
  const mismatches = names.filter(name => regionOf(name) !== legacyRegionOf(name));
  expect(names.length).toBeGreaterThan(10000);
  expect(mismatches).toEqual([]);
});

it('matches the per-alias reference on every ordered pair of aliases', () => {
  // Pairs cover location order across regions and every alias that sits inside another (in, india, indonesia).
  const names = keys.flatMap(first =>
    keys.flatMap(second => [`${first} ${second}`, ...(first.includes(second) || second.includes(first) ? [first + second, `${first}-${second}`] : [])])
  );
  const mismatches = names.filter(name => regionOf(name) !== legacyRegionOf(name));
  expect(mismatches).toEqual([]);
});

it.each([
  ...nodeFixtures(120).nodes.map(node => node.name),
  'Node 7 🇯🇵 Tokyo-7 IPLC x0',
  '🇭🇰 HK 01',
  '🇺🇸',
  '美国 洛杉矶 01 家宽',
  '香港-HK',
  '印度尼西亚 01',
  '印度 Mumbai',
  '阿聯酋 迪拜',
  'Indonesia India',
  'India IN',
  'IN 01',
  'In 01',
  'in 01',
  'ID 42',
  'NO-1 Norway',
  'no route',
  'IT milan',
  'MY kul',
  'Hong Kong HK',
  'hongkong',
  'Sao Paulo',
  'São Paulo',
  'TÜRKIYE',
  'türkıye',
  'İndia',
  '\u212Ar seoul',
  'ſg',
  'ſingapore',
  'J\u200bapan',
  '𝐉apan Tokyo',
  'usa-us',
  'UK london',
  'SINsg',
  '',
  ' '
])('matches the per-alias reference on %j', name => expect(regionOf(name)).toBe(legacyRegionOf(name)));
