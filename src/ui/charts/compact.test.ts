import {expect, it} from 'vitest';
import {compactSamples} from './compact';
it('keeps the current reading without a near-vertical terminal segment', () => {
  expect(compactSamples([0, 5000, 10000, 10001])).toEqual([0, 1, 3]);
  expect(compactSamples([0, 5000, 10000])).toEqual([0, 1, 2]);
});
