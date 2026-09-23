import {expect, it} from 'vitest';
import {formatBytes, formatRate} from './format';

it('keeps low traffic ticks distinct and preserves the rate unit', () => {
  expect([600, 1200].map(value => formatRate(value, 'en'))).toEqual(['600 B/s', '1.2 KB/s']);
  expect(formatRate(1_500_000, 'en')).toBe('1.5 MB/s');
  expect(formatRate(null, 'en')).toBe('—');
});

it('scales chart numbers like counters and formats them for the locale', () => {
  expect(formatBytes(1536.4, 'en')).toBe('1.5 KB');
  expect(formatBytes(Number.NaN, 'en')).toBe('—');
  expect(formatBytes('12345678901234567', 'en')).toBe('12 PB');
  expect(formatBytes('18446744073709551615', 'zh-TW')).toBe('18 EB');
  expect(formatBytes(1100, 'de')).toBe('1,1 KB');
});

it('takes the next unit when rounding reaches a thousand', () => {
  expect(formatBytes(999_499, 'en')).toBe('999 KB');
  expect(formatBytes(999_500, 'en')).toBe('1 MB');
  expect(formatBytes(999_999, 'en')).toBe('1 MB');
  expect(formatBytes(999, 'en')).toBe('999 B');
  expect(formatRate(999_999_999, 'en')).toBe('1 GB/s');
});
