import {expect, it} from 'vitest';
import type {DnsCacheList} from '../../api/model';
import {loadLanguage, translate, type Translator} from '../../i18n';
import {ApiError} from '../../api/error';
import {cacheCard, cacheCardState} from './cache';

const t: Translator = (key, params) => translate('en', key, params);
const list = (usage?: DnsCacheList['usage']) =>
  ({
    observed_at: '2026-09-23T12:00:00Z',
    coverage: {positive: true, negative: false, persistent: false},
    entries: [],
    total: 322,
    next_cursor: null,
    usage
  }) as DnsCacheList;

it('meters the entry count, its only limit, and states entries and capacity apart', async () => {
  const card = cacheCard(list({entries: '4096', entry_capacity: '100000'}), 'en-US', t)!;
  expect(card.usage?.meter).toEqual({value: 4.1, valueLabel: '4%'});
  expect(card.usage?.facts).toEqual([
    {label: 'Entries', value: '4,096'},
    {label: 'Capacity', value: '100,000'}
  ]);
  expect(card.note).toBeUndefined();
  expect(cacheCard(list({entries: '5', entry_capacity: '100000'}), 'en-US', t)!.usage?.meter?.valueLabel).toBe('<1%');
  // A capacity past Number's exact range keeps every digit.
  expect(cacheCard(list({entries: '1', entry_capacity: '18446744073709551615'}), 'en-US', t)!.usage?.facts[1].value).toBe('18,446,744,073,709,551,615');
  await loadLanguage('zh-TW');
  expect(cacheCard(list({entries: '322', entry_capacity: '100000'}), 'zh-TW', (key, params) => translate('zh-TW', key, params))!.usage?.facts).toEqual([
    {label: '條目', value: '322'},
    {label: '容量', value: '100,000'}
  ]);
});

it('keeps the facts without a meter when the capacity is zero', () => {
  const card = cacheCard(list({entries: '0', entry_capacity: '0'}), 'en-US', t)!;
  expect(card.usage?.meter).toBeNull();
  expect(card.usage?.facts).toEqual([
    {label: 'Entries', value: '0'},
    {label: 'Capacity', value: '0'}
  ]);
});

it('claims no capacity when the backend does not report usage', () => {
  const card = cacheCard(list(), 'en-US', t)!;
  expect(card.usage).toBeNull();
  expect(card.note).toBe('Entries: 322, capacity limit: not reported');
  expect(cacheCard(undefined, 'en-US', t)).toBeNull();
});

it('shows the entry count without a percentage when usage reports no capacity', () => {
  const card = cacheCard(list({entries: '4096', entry_capacity: null}), 'en-US', t)!;
  expect(card.usage).toBeNull();
  expect(card.note).toBe('Entries: 4,096');
});

it('says the listing is unavailable after a 503, even with a reading kept from an earlier poll', () => {
  const unavailable = new ApiError(503, 'unavailable', 'DNS cache unavailable');
  expect(cacheCardState(true, true, null)).toBe('ready');
  expect(cacheCardState(true, true, unavailable)).toBe('unavailable');
  expect(cacheCardState(true, false, unavailable)).toBe('unavailable');
  // Any other failure keeps the last reading on screen.
  expect(cacheCardState(true, true, new ApiError(500, 'internal', 'boom'))).toBe('ready');
  expect(cacheCardState(true, false, new ApiError(500, 'internal', 'boom'))).toBe('error');
  expect(cacheCardState(false, false, null)).toBe('unlisted');
});
