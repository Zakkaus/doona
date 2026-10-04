import {afterEach, expect, it} from 'vitest';
import {
  compareNames,
  formatBytes,
  formatDuration,
  formatRate,
  localMinute,
  localMonthDayFormat,
  localTime,
  localClockFormat,
  readDateFormat,
  readTimeFormat,
  setDateFormat,
  setTimeFormat,
  DATE_FORMATS,
  TIME_FORMATS,
  type DateFormat,
  type TimeFormat
} from './format';
import {LANGS, LOCALE} from './index';

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

it('sorts names by the interface language, numbers by value, whatever the case', () => {
  const list = ['上海 02', 'node10', '北京', 'Node2', '上海 01'];
  expect([...list].sort(compareNames(LOCALE['zh-CN']))).toEqual(['北京', '上海 01', '上海 02', 'Node2', 'node10']);
  expect([...list].sort(compareNames(LOCALE['zh-TW']))).toEqual(['上海 01', '上海 02', '北京', 'Node2', 'node10']);
  expect([...list].sort(compareNames(LOCALE.en))).toEqual(['Node2', 'node10', '上海 01', '上海 02', '北京']);
  for (const [lang] of LANGS) expect(compareNames(LOCALE[lang])('Alpha', 'alpha')).toBe(0);
  expect(compareNames(LOCALE.en)).toBe(compareNames(LOCALE.en));
});

// The browser's language tags for one test; `undefined` takes the property away, as a browser that offers none.
function browserTags(tags: string[] | undefined) {
  Object.defineProperty(navigator, 'languages', {configurable: true, get: () => tags});
  Object.defineProperty(navigator, 'language', {configurable: true, get: () => tags?.[0]});
}
afterEach(() => {
  Reflect.deleteProperty(navigator, 'languages');
  Reflect.deleteProperty(navigator, 'language');
  setDateFormat('automatic');
  setTimeFormat('24h');
});

it('writes times on a 24-hour clock with the date in the chosen or the browser order', () => {
  // A local afternoon, whatever the test machine's zone.
  const at = new Date(2026, 9, 27, 15, 4, 5).toISOString();
  // ICU may join the date and time with another space character.
  const time = (locale: string) => localTime(at, locale).replace(/\s/g, ' ');
  // [date format, browser tags, interface locale, time, minute, month and day]
  const cases: Array<[DateFormat, string[] | undefined, string, string, string, string]> = [
    ['automatic', ['en-AU', 'en'], 'en-US', '27/10/26, 15:04:05', '27/10/26, 15:04', '27/10'],
    ['automatic', ['en-US'], 'en-US', '10/27/26, 15:04:05', '10/27/26, 15:04', '10/27'],
    ['automatic', ['en-US'], 'zh-TW', '10/27/26, 15:04:05', '10/27/26, 15:04', '10/27'],
    ['automatic', ['zh-TW'], 'en-US', '2026/10/27 15:04:05', '2026/10/27 15:04', '10/27'],
    // A Thai region, whose calendar counts Buddhist years, still writes the Gregorian year.
    ['automatic', ['th-TH'], 'en-US', '27/10/26 15:04:05', '27/10/26 15:04', '27/10'],
    ['automatic', ['not a tag'], 'zh-TW', '2026/10/27 15:04:05', '2026/10/27 15:04', '10/27'],
    ['automatic', undefined, 'zh-CN', '2026/10/27 15:04:05', '2026/10/27 15:04', '10/27'],
    ['dmy', ['en-US'], 'en-US', '27/10/26, 15:04:05', '27/10/26, 15:04', '27/10'],
    ['dmy', ['zh-TW'], 'zh-TW', '27/10/26, 15:04:05', '27/10/26, 15:04', '27/10'],
    ['mdy', ['en-AU'], 'en-US', '10/27/26, 15:04:05', '10/27/26, 15:04', '10/27'],
    ['mdy', ['en-AU'], 'zh-CN', '10/27/26, 15:04:05', '10/27/26, 15:04', '10/27'],
    ['ymd', ['en-AU'], 'en-US', '2026-10-27 15:04:05', '2026-10-27 15:04', '10-27'],
    ['ymd', ['en-US'], 'zh-TW', '2026-10-27 15:04:05', '2026-10-27 15:04', '10-27']
  ];
  for (const [format, tags, locale, expectedTime, expectedMinute, monthDay] of cases) {
    browserTags(tags);
    setDateFormat(format);
    const row = [format, tags, locale];
    expect([...row, time(locale)]).toEqual([...row, expectedTime]);
    expect([...row, localMinute(at, locale).replace(/\s/g, ' ')]).toEqual([...row, expectedMinute]);
    expect([...row, localMonthDayFormat(locale).format(Date.parse(at))]).toEqual([...row, monthDay]);
  }
  // Year-Month-Day pads month and day itself, so it does not depend on what a locale does with them.
  browserTags(['en-US']);
  setDateFormat('ymd');
  const early = new Date(2026, 0, 5, 3, 4, 5).toISOString();
  expect([localTime(early, 'en'), localMinute(early, 'en'), localMonthDayFormat('en').format(Date.parse(early))]).toEqual([
    '2026-01-05 03:04:05',
    '2026-01-05 03:04',
    '01-05'
  ]);
  expect([localTime(null, 'en'), localMinute(null, 'en')]).toEqual(['—', '—']);
});

it('reads a stored date format and falls back to automatic', () => {
  const stored = (value: string | null) => ({getItem: () => value});
  expect(DATE_FORMATS.map(value => readDateFormat(stored(value)))).toEqual(DATE_FORMATS);
  expect(readDateFormat(stored('dd/mm/yy'))).toBe('automatic');
  expect(readDateFormat(stored(null))).toBe('automatic');
  expect(
    readDateFormat({
      getItem: () => {
        throw new Error('blocked');
      }
    })
  ).toBe('automatic');
});

it("writes the clock the reader chose in every date order, with the interface language's day-period words", () => {
  const afternoon = new Date(2026, 9, 27, 15, 4, 5).toISOString();
  const morning = new Date(2026, 0, 5, 0, 4, 5).toISOString();
  const spaced = (text: string) => text.replace(/\s/g, ' ');
  // [time format, date format, browser tags, interface locale, afternoon, minute, midnight]
  const cases: Array<[TimeFormat, DateFormat, string[], string, string, string, string]> = [
    ['24h', 'mdy', ['en-US'], 'en-US', '10/27/26, 15:04:05', '10/27/26, 15:04', '1/5/26, 00:04:05'],
    ['12h', 'mdy', ['en-US'], 'en-US', '10/27/26, 3:04:05 PM', '10/27/26, 3:04 PM', '1/5/26, 12:04:05 AM'],
    ['12h', 'dmy', ['en-US'], 'en-US', '27/10/26, 3:04:05 pm', '27/10/26, 3:04 pm', '5/1/26, 12:04:05 am'],
    ['12h', 'automatic', ['zh-TW'], 'en-US', '2026/10/27 下午3:04:05', '2026/10/27 下午3:04', '2026/1/5 凌晨12:04:05'],
    ['12h', 'automatic', ['zh-CN'], 'zh-CN', '2026/10/27 下午03:04:05', '2026/10/27 下午03:04', '2026/1/5 上午12:04:05'],
    // Year-Month-Day has no locale of its own, so the clock is written in the interface language.
    ['12h', 'ymd', ['en-US'], 'en-US', '2026-10-27 3:04:05 PM', '2026-10-27 3:04 PM', '2026-01-05 12:04:05 AM'],
    ['12h', 'ymd', ['en-US'], 'zh-TW', '2026-10-27 下午3:04:05', '2026-10-27 下午3:04', '2026-01-05 凌晨12:04:05'],
    ['24h', 'ymd', ['en-US'], 'zh-TW', '2026-10-27 15:04:05', '2026-10-27 15:04', '2026-01-05 00:04:05'],
    // Automatic takes the clock of the browser's region, whatever the date order or the interface language.
    ['automatic', 'automatic', ['en-US'], 'zh-CN', '10/27/26, 3:04:05 PM', '10/27/26, 3:04 PM', '1/5/26, 12:04:05 AM'],
    ['automatic', 'automatic', ['en-AU'], 'en-US', '27/10/26, 3:04:05 pm', '27/10/26, 3:04 pm', '5/1/26, 12:04:05 am'],
    ['automatic', 'automatic', ['en-GB'], 'en-US', '27/10/2026, 15:04:05', '27/10/2026, 15:04', '05/01/2026, 00:04:05'],
    ['automatic', 'automatic', ['zh-TW'], 'en-US', '2026/10/27 下午3:04:05', '2026/10/27 下午3:04', '2026/1/5 凌晨12:04:05'],
    ['automatic', 'automatic', ['zh-CN'], 'en-US', '2026/10/27 15:04:05', '2026/10/27 15:04', '2026/1/5 00:04:05'],
    ['automatic', 'dmy', ['en-US'], 'zh-TW', '27/10/26, 3:04:05 pm', '27/10/26, 3:04 pm', '5/1/26, 12:04:05 am'],
    ['automatic', 'ymd', ['zh-CN'], 'zh-TW', '2026-10-27 15:04:05', '2026-10-27 15:04', '2026-01-05 00:04:05'],
    ['automatic', 'ymd', ['en-US'], 'zh-TW', '2026-10-27 下午3:04:05', '2026-10-27 下午3:04', '2026-01-05 凌晨12:04:05'],
    // Without a valid browser tag the interface language's own clock applies.
    ['automatic', 'automatic', ['not a tag'], 'zh-TW', '2026/10/27 下午3:04:05', '2026/10/27 下午3:04', '2026/1/5 凌晨12:04:05']
  ];
  for (const [clock, date, tags, locale, expectedTime, expectedMinute, expectedMidnight] of cases) {
    browserTags(tags);
    setDateFormat(date);
    setTimeFormat(clock);
    const row = [clock, date, tags, locale];
    expect([...row, spaced(localTime(afternoon, locale))]).toEqual([...row, expectedTime]);
    expect([...row, spaced(localMinute(afternoon, locale))]).toEqual([...row, expectedMinute]);
    expect([...row, spaced(localTime(morning, locale))]).toEqual([...row, expectedMidnight]);
  }
});

it('writes the clock alone for chart axes and the log heatmap in the chosen clock', () => {
  const at = new Date(2026, 9, 27, 15, 4, 5).getTime();
  const spaced = (text: string) => text.replace(/\s/g, ' ');
  // [time format, browser tags, locale, to the minute, to the second]
  const cases: Array<[TimeFormat, string[], string, string, string]> = [
    ['24h', ['en-US'], 'en-US', '15:04', '15:04:05'],
    ['24h', ['en-US'], 'zh-TW', '15:04', '15:04:05'],
    ['12h', ['en-US'], 'en-US', '3:04 PM', '3:04:05 PM'],
    ['12h', ['en-US'], 'zh-TW', '下午3:04', '下午3:04:05'],
    ['automatic', ['en-US'], 'zh-TW', '下午3:04', '下午3:04:05'],
    ['automatic', ['zh-CN'], 'en-US', '15:04', '15:04:05']
  ];
  for (const [clock, tags, locale, minute, second] of cases) {
    browserTags(tags);
    setTimeFormat(clock);
    const row = [clock, tags, locale];
    expect([...row, spaced(localClockFormat(locale).format(at))]).toEqual([...row, minute]);
    expect([...row, spaced(localClockFormat(locale, true).format(at))]).toEqual([...row, second]);
  }
});

it('reads a stored time format and falls back to 24-hour', () => {
  const stored = (value: string | null) => ({getItem: () => value});
  expect(TIME_FORMATS.map(value => readTimeFormat(stored(value)))).toEqual(TIME_FORMATS);
  expect(readTimeFormat(stored('13h'))).toBe('24h');
  expect(readTimeFormat(stored(null))).toBe('24h');
  expect(
    readTimeFormat({
      getItem: () => {
        throw new Error('blocked');
      }
    })
  ).toBe('24h');
});
