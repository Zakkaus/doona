import {expect, it} from 'vitest';
import {regionOf} from './geo';

it('guesses regions from whole Latin tokens and spaced phrases', () => {
  expect(regionOf('HK-01')).toBe('HK');
  expect(regionOf('FRA 02')).toBe('DE');
  expect(regionOf('Paris CDG')).toBe('FR');
  expect(regionOf('San Jose premium')).toBe('US');
  expect(regionOf('shkhk')).toBeNull();
});
