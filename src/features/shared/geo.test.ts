import {expect, it, vi} from 'vitest';
import {nodeFixtures} from '../../../mock/fixtures/inventory';
import {allRegions, capitalOnlyRegionCodes, regionFlag, regions} from '../../dae/regions';
import {MAX_PAGE} from '../../store/cadence';
import {regionOf} from './geo';

// The one-regex-per-alias matcher that geo.ts replaced, kept as the reference the single pass must agree with.
const legacyAliases = regions.flatMap(([iso, keys]) =>
  [...new Set([iso, ...keys].map(key => (key.toUpperCase() === iso ? iso : key)))].map(key => ({
    iso,
    pattern: new RegExp(
      /\p{Script=Han}/u.test(key) ? key : `(?<![\\p{L}\\p{M}])${key}(?![\\p{L}\\p{M}])`,
      key.toUpperCase() === iso && capitalOnlyRegionCodes[iso] === true ? 'u' : 'iu'
    )
  }))
);
// A flag is one more alias that matches literally, for every region including those with no other alias. One
// alternation keeps the pairwise test within its time limit; per-flag patterns made it 249 more regexes per name.
const legacyFlags = new Map(allRegions.map(([iso]) => [regionFlag(iso), iso]));
legacyAliases.push({iso: '', pattern: new RegExp([...legacyFlags.keys()].join('|'), 'u')});
function legacyRegionOf(name: string): string | null {
  let chosen: {iso: string; index: number; length: number} | undefined;
  for (const {iso, pattern} of legacyAliases) {
    const match = pattern.exec(name);
    if (match && (!chosen || match.index < chosen.index || (match.index === chosen.index && match[0].length > chosen.length)))
      chosen = {iso: iso || legacyFlags.get(match[0])!, index: match.index, length: match[0].length};
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
  ['United Statesman', null],
  ['🇭🇰-家宽-倍率', 'HK'],
  ['🇺🇸 LA 01', 'US'],
  ['🇹🇼', 'TW'],
  ['🇭🇰🇺🇸', 'HK'],
  ['🇰🇿 Almaty 01', 'KZ'],
  ['🇦🇹', 'AT'],
  ['🇵🇰-01', 'PK'],
  ['🇦🇶 01', 'AQ'],
  ['🇽🇽 01', null],
  ['🇽🇽 🇯🇵', 'JP'],
  ['🇦🇶 JP', 'AQ'],
  ['JP 🇦🇶', 'JP'],
  ['哈萨克 01', 'KZ'],
  ['哈薩克-01', 'KZ'],
  ['沙特 02', 'SA'],
  ['奥地利', 'AT'],
  ['Vienna 01', 'AT'],
  ['AT 01', 'AT'],
  ['at the gate', null],
  ['Santiago', 'CL'],
  ['Lagos 01', 'NG'],
  ['US-CL 01', 'US'],
  ['JP 🇭🇰', 'JP'],
  ['🇭🇰 JP', 'HK'],
  ['🇺🇭🇰', null],
  ['🇭', null]
])('uses bounded aliases and location order for %s', (name, expected) => expect(regionOf(name)).toBe(expected));

// Regions with no text alias match only by flag: their two-letter codes are ordinary words.
it.each(['AS', 'as', 'PM', 'pm', 'AM', 'am', 'is', 'be', 'at', 'Premium PM 8am to 5pm', 'Node as backup', 'Standard AS plan'])(
  'gives %s no region without a flag',
  name => expect(regionOf(name)).toBeNull()
);

it('caches both recognized and unknown regions without repeating detection', () => {
  const names = ['FRA region memo', 'unknown region memo'];
  expect(names.map(regionOf)).toEqual(['DE', null]);
  const spy = vi.spyOn(RegExp.prototype, 'exec');
  try {
    const detected = names.map(regionOf);
    const calls = spy.mock.calls.filter(([input]) => names.includes(input)).length;
    expect(detected).toEqual(['DE', null]);
    expect(calls).toBe(0);
  } finally {
    spy.mockRestore();
  }
});

it('evicts the oldest region lookup after two full pages of names', () => {
  const name = 'FRA oldest region cache entry';
  expect(regionOf(name)).toBe('DE');
  for (let i = 0; i < 2 * MAX_PAGE; i++) regionOf(`unknown region cache entry ${i}`);
  const spy = vi.spyOn(RegExp.prototype, 'exec');
  try {
    const region = regionOf(name);
    const calls = spy.mock.calls.filter(([input]) => input === name).length;
    expect(region).toBe('DE');
    expect(calls).toBeGreaterThan(0);
  } finally {
    spy.mockRestore();
  }
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

it('matches the per-alias reference on every alias paired with each region, and on every nested pair', () => {
  // Each alias before and after one alias of every region covers location order across regions; every alias that sits
  // inside another (in, india, indonesia) is paired in full. All ordered pairs grew past the time limit with 54 regions.
  const firsts = regions.map(([iso, aliases]) => aliases[0] ?? iso);
  const names = keys.flatMap(key => [
    ...firsts.flatMap(first => [`${key} ${first}`, `${first} ${key}`]),
    ...keys.flatMap(other => (key !== other && (key.includes(other) || other.includes(key)) ? [key + other, `${key}-${other}`, `${key} ${other}`] : []))
  ]);
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
