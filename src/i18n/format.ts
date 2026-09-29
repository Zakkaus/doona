import {formatNumber, languages, REFERENCE_LANG, translate, type Key, type Translator} from './index';
import {millis, parseU64} from '../api/u64';

const relativeTimes = new Map<string, Intl.RelativeTimeFormat>();
export function relativeStart(startedAt: string | null, locale: string, now = Date.now()): string {
  if (!startedAt) return '—';
  const seconds = Math.floor((Date.parse(startedAt) - now) / 1000);
  if (!Number.isFinite(seconds)) return '—';
  let formatter = relativeTimes.get(locale);
  if (!formatter) relativeTimes.set(locale, (formatter = new Intl.RelativeTimeFormat(locale, {numeric: 'auto'})));
  if (Math.abs(seconds) < 60) return formatter.format(seconds, 'second');
  if (Math.abs(seconds) < 3600) return formatter.format(Math.trunc(seconds / 60), 'minute');
  if (Math.abs(seconds) < 86400) return formatter.format(Math.trunc(seconds / 3600), 'hour');
  return formatter.format(Math.trunc(seconds / 86400), 'day');
}
// The catalogue language for an Intl locale, for formatters that take a locale.
const langOf = (locale: string) => languages.find(language => language.locale === locale)?.id ?? REFERENCE_LANG;
const durationUnits = new Map<string, Intl.NumberFormat>();
/** Seconds (a UInt64 string) as days / hours / minutes; below a minute, seconds. */
export function formatDuration(seconds: string | null, locale: string): string {
  if (seconds === null) return '—';
  const total = parseU64(seconds);
  if (total === null) return '—';
  const d = total / 86400n,
    h = (total % 86400n) / 3600n,
    m = (total % 3600n) / 60n;
  const unit = (value: bigint, name: string) => {
    const key = locale + '/' + name;
    let formatter = durationUnits.get(key);
    if (!formatter) durationUnits.set(key, (formatter = new Intl.NumberFormat(locale, {style: 'unit', unit: name, unitDisplay: 'short'})));
    return formatter.format(value);
  };
  if (d > 0n) return translate(langOf(locale), 'ui.duration.dayHour', {days: unit(d, 'day'), hours: unit(h, 'hour')});
  if (h > 0n) return translate(langOf(locale), 'ui.duration.hourMinute', {hours: unit(h, 'hour'), minutes: unit(m, 'minute')});
  if (m > 0n) return unit(m, 'minute');
  return unit(total, 'second');
}
const localTimes = new Map<string, Intl.DateTimeFormat>();
export function localTimeFormat(locale: string) {
  let formatter = localTimes.get(locale);
  if (!formatter) localTimes.set(locale, (formatter = new Intl.DateTimeFormat(locale, {dateStyle: 'short', timeStyle: 'medium'})));
  return formatter;
}
export function localTime(iso: string | null, locale: string): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return localTimeFormat(locale).format(t);
}
// Each unit is a catalogue message around the formatted number, so a language writes its own symbol and spacing.
export type UnitKey = Extract<Key, `unit.${string}`>;
const byteUnits = ['unit.byte', 'unit.kilobyte', 'unit.megabyte', 'unit.gigabyte', 'unit.terabyte', 'unit.petabyte', 'unit.exabyte'] as const;
const byteRateUnits = [
  'unit.bytePerSecond',
  'unit.kilobytePerSecond',
  'unit.megabytePerSecond',
  'unit.gigabytePerSecond',
  'unit.terabytePerSecond',
  'unit.petabytePerSecond',
  'unit.exabytePerSecond'
] as const;
// A number with `digits` decimals in a unit. Callers pass an Intl locale; the unit message is read in its language.
export function formatUnit(value: number | bigint, locale: string, unit: UnitKey, digits = 0): string {
  return translate(langOf(locale), unit, {n: formatNumber(value, locale, digits)});
}
// Decimal units, scaled in bigint so counters above 2^53 stay exact: one decimal below ten of a unit, whole numbers
// above. A number (a chart value) is rounded to whole bytes. A value that rounds up to 1000 of a unit takes the next.
function scaledBytes(input: string | bigint | number | null, locale: string, units: readonly UnitKey[]): string {
  const value =
    typeof input === 'number' ? (Number.isFinite(input) && input >= 0 ? BigInt(Math.round(input)) : null) : typeof input === 'bigint' ? input : parseU64(input);
  if (value === null || value < 0n) return '—';
  let unit = 0,
    scale = 1n;
  while (unit < units.length - 1 && value + scale / 2n >= scale * 1000n) {
    unit++;
    scale *= 1000n;
  }
  const tenths = (value * 10n + scale / 2n) / scale;
  return unit > 0 && value < scale * 10n && tenths % 10n !== 0n
    ? formatUnit(Number(tenths) / 10, locale, units[unit], 1)
    : formatUnit((value + scale / 2n) / scale, locale, units[unit]);
}
export function formatBytes(input: string | bigint | number | null, locale: string): string {
  return scaledBytes(input, locale, byteUnits);
}
export function formatRate(input: string | bigint | number | null, locale: string): string {
  return scaledBytes(input, locale, byteRateUnits);
}
// Names sort Chinese first by pinyin, then numbers by value and text without regard to case, in every language, so a
// node or group name sits in the same place on every page whatever the browser's own language.
const names = new Intl.Collator(['zh-Hans-CN', 'en'], {numeric: true, sensitivity: 'base'});
export const compareNames = (a: string, b: string) => names.compare(a, b);
// Unknown or unmeasured latency is a dash, like any other missing value.
export const formatLatency = (value: number | null | undefined, t: Translator) => (value == null ? '—' : t('ui.latency', {n: millis(value)}));

// Percent of one CPU core, so a busy engine on several cores can pass 100. Null until the backend has two samples.
export function formatCpu(percent: number | null | undefined, t: Translator): string {
  return percent == null ? '—' : t('ui.percent', {n: percent}, 'n', {n: 1});
}
