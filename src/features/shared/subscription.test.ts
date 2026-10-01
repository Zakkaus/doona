import {expect, it} from 'vitest';
import {translate, type Translator} from '../../i18n';
import {changeTypedInterval, draftInterval, intervalItems, intervalProblem, intervalText, intervalTyped, startTyping} from './subscription';

const t: Translator = (key, params) => translate('en', key, params);

it.each([
  [86400, ['0', '3600', '21600', '43200', '86400', 'typed']],
  [7200, ['0', '3600', '21600', '43200', '86400', 'typed']],
  [10000, ['0', '3600', '21600', '43200', '86400', '10000', 'typed']],
  [null, ['0', '3600', '21600', '43200', '86400', 'typed']]
])('offers the presets and typing, keeping a default of %s that typing cannot show', (current, ids) => {
  expect(intervalItems(current, 'en-US', t).map(item => item.id)).toEqual(ids);
});

it.each([
  // draft, shown as typed, seconds, error, start of typing
  ['', null, undefined, null, 'h'],
  ['0', null, 0, null, 'h'],
  ['21600', null, 21600, null, '6h'],
  ['10000', null, 10000, null, 'h'],
  ['7200', {count: '2', unit: 'h'}, 7200, null, '2h'],
  ['5400', {count: '90', unit: 'm'}, 5400, null, 'h'],
  ['90m', {count: '90', unit: 'm'}, 5400, null, 'h'],
  ['+2h', {count: '+2', unit: 'h'}, 7200, null, 'h'],
  ['2h', {count: '2', unit: 'h'}, 7200, null, 'h'],
  ['h', {count: '', unit: 'h'}, null, null, 'h'],
  ['0m', {count: '0', unit: 'm'}, 0, null, 'h'],
  ['1.5h', {count: '1.5', unit: 'h'}, null, 'nodes.intervalInvalid', 'h'],
  ['-5m', {count: '-5', unit: 'm'}, null, 'nodes.intervalInvalid', 'h'],
  ['99999999999999h', {count: '99999999999999', unit: 'h'}, null, 'nodes.intervalTooLarge', 'h']
])('reads the interval draft %j', (draft, typed, seconds, problem, start) => {
  expect(intervalTyped(draft)).toEqual(typed);
  expect(draftInterval(draft)).toBe(seconds);
  expect(intervalProblem(draft)).toBe(problem);
  expect(startTyping(draft)).toBe(start);
});

it.each([
  [0, t('nodes.manualOnly')],
  [21600, t('nodes.everyHours', {n: 6})],
  [172800, t('nodes.everyHours', {n: 48})],
  [2700, t('nodes.everyDuration', {duration: '45 min'})],
  [5400, t('nodes.everyDuration', {duration: '1 hr 30 min'})]
])('words an interval of %i seconds like the presets', (seconds, text) => {
  expect(intervalText(seconds, 'en-US', t)).toBe(text);
});

it.each([
  ['90', 'm', '90m', 5400],
  ['2', 'h', '2h', 7200],
  ['2', 'm', '2m', 120],
  ['+2', 'h', '+2h', 7200],
  ['0', 'm', '0', 0],
  ['+0', 'h', '0', 0],
  ['', 'h', 'h', null],
  ['1.5', 'h', '1.5h', null],
  ['-1', 'm', '-1m', null]
] as const)('changes typed count %s in %s to %s', (count, unit, draft, seconds) => {
  expect(changeTypedInterval(count, unit)).toBe(draft);
  expect(draftInterval(draft)).toBe(seconds);
  if (seconds === 0) expect(intervalTyped(draft)).toBeNull();
});

it.each([
  ['9007199254740991', 9007199254740991, null],
  ['9007199254740992', null, 'nodes.intervalTooLarge'],
  ['2e2h', null, 'nodes.intervalInvalid'],
  ['  +2h  ', 7200, null]
])('validates parser and precision boundaries for %s', (draft, seconds, problem) => {
  expect(draftInterval(draft as string)).toBe(seconds);
  expect(intervalProblem(draft as string)).toBe(problem);
});
