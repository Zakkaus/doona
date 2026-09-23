import {formatNumber, type Translator} from './index';
import {parseU64} from '../api/u64';

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
export const fmtRate = (kb: number | null | undefined, locale: string, t: Translator) =>
  kb == null
    ? '—'
    : kb >= 1000
      ? t('unit.mbPerSecond', {n: formatNumber(kb / 1000, locale, kb >= 10000 || kb % 1000 === 0 ? 0 : 1)})
      : t('unit.kbPerSecond', {n: formatNumber(kb, locale, kb < 10 && !Number.isInteger(kb) ? 1 : 0)});
