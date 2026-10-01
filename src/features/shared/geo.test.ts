import {expect, it, vi} from 'vitest';
import {regionOf} from './geo';

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
