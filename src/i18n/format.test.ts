import {expect, it} from 'vitest';
import {translate} from './index';
import {fmtRate} from './format';

it('keeps low traffic ticks distinct and preserves the rate unit', () => {
  const t = translate.bind(null, 'en');
  expect([0.6, 1.2].map(value => fmtRate(value, 'en', t))).toEqual(['0.6 KB/s', '1.2 KB/s']);
  expect(fmtRate(1500, 'en', t)).toBe('1.5 MB/s');
  expect(fmtRate(null, 'en', t)).toBe('—');
});
