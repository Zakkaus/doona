import {parseInterval} from '../../dae/subscriptions';
import type {Key, Translator} from '../../i18n';
import {formatDuration} from '../../i18n/format';

const intervals = [3600, 21600, 43200, 86400];
export function intervalText(seconds: number, locale: string, t: Translator) {
  return seconds === 0
    ? t('nodes.manualOnly')
    : seconds % 3600 === 0
      ? t('nodes.everyHours', {n: seconds / 3600})
      : t('nodes.everyDuration', {duration: formatDuration(String(seconds), locale)});
}

// A draft interval is '' while untouched, a preset's seconds, or a typed whole number and its unit ("90m", "2h"), as
// the controls hold it until it is saved.
export type IntervalUnit = 'm' | 'h';
function typedInterval(text: string): {count: string; unit: IntervalUnit} | null {
  const unit = text.at(-1);
  return unit === 'm' || unit === 'h' ? {count: text.slice(0, -1), unit} : null;
}
// The typed form of a value the presets lack, when it is whole minutes; honk reads any number of seconds, but the
// controls offer minutes and hours.
function typedOf(seconds: number) {
  if (seconds === 0 || intervals.includes(seconds) || seconds % 60) return null;
  return seconds % 3600 ? {count: String(seconds / 60), unit: 'm' as const} : {count: String(seconds / 3600), unit: 'h' as const};
}
// What the controls show: the typed count and unit, or null for a preset or a value kept as written.
export function intervalTyped(text: string) {
  return typedInterval(text) ?? (/^\d+$/.test(text) ? typedOf(Number(text)) : null);
}
// The draft a switch to typing starts from: the preset shown, in hours, or an empty count of hours.
export function startTyping(text: string) {
  const seconds = Number(text);
  return seconds > 0 && seconds % 3600 === 0 ? `${seconds / 3600}h` : 'h';
}
// The seconds a draft stands for: undefined while untouched, null while a typed value cannot be saved. honk takes any
// whole number of seconds, including 0 for manual updates.
export function draftInterval(text: string): number | null | undefined {
  if (text === '') return undefined;
  const seconds = parseInterval(text);
  return seconds !== null && Number.isSafeInteger(seconds) ? seconds : null;
}
// The error under a typed count; an empty one only waits for input.
export function intervalProblem(text: string): Key | null {
  if (text === '' || typedInterval(text)?.count === '') return null;
  const seconds = parseInterval(text);
  return seconds === null ? 'nodes.intervalInvalid' : !Number.isSafeInteger(seconds) ? 'nodes.intervalTooLarge' : null;
}
export function changeTypedInterval(count: string, unit: IntervalUnit) {
  const text = count + unit;
  return draftInterval(text) === 0 ? '0' : text;
}
// The presets, a value outside them that is not whole minutes kept so the select can show it, and typing.
export function intervalItems(current: number | null, locale: string, t: Translator) {
  return [
    ...[0, ...intervals, ...(current === null || current % 60 === 0 ? [] : [current])].map(value => ({
      id: String(value),
      label: intervalText(value, locale, t)
    })),
    {id: 'typed', label: t('nodes.intervalCustom')}
  ];
}
