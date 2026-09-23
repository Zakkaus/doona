import {formatNumber, type Translator} from './index';
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
/** Seconds (a UInt64 string) as days / hours / minutes; below a minute, seconds. */
const durationUnits = new Map<string, Intl.NumberFormat>();
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
  if (d > 0n) return `${unit(d, 'day')} ${unit(h, 'hour')}`;
  if (h > 0n) return `${unit(h, 'hour')} ${unit(m, 'minute')}`;
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
const byteUnits = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB'];
// Decimal units, scaled in bigint so counters above 2^53 stay exact: one decimal below ten of a unit, whole numbers
// above. A number (a chart value) is rounded to whole bytes.
export function formatBytes(input: string | bigint | number | null, locale: string): string {
  const value =
    typeof input === 'number' ? (Number.isFinite(input) && input >= 0 ? BigInt(Math.round(input)) : null) : typeof input === 'bigint' ? input : parseU64(input);
  if (value === null || value < 0n) return '—';
  let unit = 0,
    scale = 1n;
  while (unit < byteUnits.length - 1 && value >= scale * 1000n) {
    unit++;
    scale *= 1000n;
  }
  const tenths = (value * 10n + scale / 2n) / scale;
  const text =
    unit > 0 && value < scale * 10n && tenths % 10n !== 0n ? formatNumber(Number(tenths) / 10, locale, 1) : formatNumber((value + scale / 2n) / scale, locale);
  return `${text} ${byteUnits[unit]}`;
}
export function formatRate(input: string | bigint | number | null, locale: string): string {
  const text = formatBytes(input, locale);
  return text === '—' ? text : text + '/s';
}
// Unknown or unmeasured latency is a dash, like any other missing value.
export const formatLatency = (value: number | null | undefined, t: Translator) => (value == null ? '—' : t('ui.latency', {n: millis(value)}));
