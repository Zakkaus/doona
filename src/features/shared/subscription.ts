import type {Translator} from '../../i18n';
import {formatDuration} from '../../i18n/format';

const intervals = [3600, 21600, 43200, 86400];
export function intervalText(seconds: number, locale: string, t: Translator) {
  return seconds === 0
    ? t('nodes.manualOnly')
    : intervals.includes(seconds)
      ? t('nodes.everyHours', {n: seconds / 3600})
      : formatDuration(String(seconds), locale);
}
// The presets, with a value outside them kept so a select can show it.
export function intervalItems(current: number | null, locale: string, t: Translator) {
  return [0, ...intervals, ...(current === null || current === 0 || intervals.includes(current) ? [] : [current])].map(value => ({
    id: String(value),
    label: intervalText(value, locale, t)
  }));
}
