import {expect, it} from 'vitest';
import {compareNames, formatBytes, formatDuration, formatRate} from './format';

it('keeps duration units, truncation and compound spacing in every language', () => {
  const cases = {
    en: ['0 sec', '59 sec', '1 min', '1 hr 0 min', '1 hr 1 min', '1 day 0 hr', '1 day 1 hr'],
    'zh-CN': ['0秒', '59秒', '1分钟', '1小时 0分钟', '1小时 1分钟', '1天 0小时', '1天 1小时'],
    'zh-TW': ['0 秒', '59 秒', '1 分鐘', '1 小時 0 分鐘', '1 小時 1 分鐘', '1 天 0 小時', '1 天 1 小時']
  };
  for (const [locale, expected] of Object.entries(cases))
    expect(['0', '59', '60', '3600', '3661', '86400', '90061'].map(seconds => formatDuration(seconds, locale))).toEqual(expected);
  expect(formatDuration(null, 'en')).toBe('—');
  expect(formatDuration('invalid', 'en')).toBe('—');
  expect(formatDuration('18446744073709551615', 'en')).toBe('213,503,982,334,601 days 7 hr');
});

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

it('writes every byte and byte-rate unit the same in English and Chinese', () => {
  for (const locale of ['en-US', 'zh-TW', 'zh-CN']) {
    const powers = [1n, 10n ** 3n, 10n ** 6n, 10n ** 9n, 10n ** 12n, 10n ** 15n, 10n ** 18n];
    expect(powers.map(value => formatBytes(value, locale))).toEqual(['1 B', '1 KB', '1 MB', '1 GB', '1 TB', '1 PB', '1 EB']);
    expect(powers.map(value => formatRate(value, locale))).toEqual(['1 B/s', '1 KB/s', '1 MB/s', '1 GB/s', '1 TB/s', '1 PB/s', '1 EB/s']);
    expect(formatBytes('18446744073709551615', locale)).toBe('18 EB');
    expect(formatRate('18446744073709551615', locale)).toBe('18 EB/s');
    expect(formatRate(1_500_000_000_000_000_000n, locale)).toBe('1.5 EB/s');
    expect(formatBytes(999_499n * 10n ** 12n, locale)).toBe('999 PB');
    expect(formatBytes(999_500n * 10n ** 12n, locale)).toBe('1 EB');
    expect(formatRate(9_950, locale)).toBe('10 KB/s');
  }
});

it('sorts Chinese names first by pinyin, then numbers by value, whatever the case', () => {
  expect(['上海 02', 'node10', '北京', 'Node2', '上海 01'].sort(compareNames)).toEqual(['北京', '上海 01', '上海 02', 'Node2', 'node10']);
  expect(compareNames('Alpha', 'alpha')).toBe(0);
});
