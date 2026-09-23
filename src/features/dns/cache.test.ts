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

it('fills the bar by the entry count, its only limit, and states it as a fraction per locale', async () => {
  const card = cacheCard(list({entries: '4096', entry_capacity: '100000'}), 'en-US', t)!;
  expect(card.usage?.pct).toBe(4.1);
  expect(card.usage?.facts).toBe('Entries: 4,096 / 100,000');
  expect(card.note).toBeUndefined();
  expect(card.coverage).toBe('Caches Positive answers; held in memory only, cleared on restart');
  expect(cacheCard(list({entries: '5', entry_capacity: '100000'}), 'en-US', t)!.usage?.value).toBe('<1%');
  // Chinese writes the fraction with a full-width slash and no spaces.
  await Promise.all([loadLanguage('zh-TW'), loadLanguage('zh-CN')]);
  for (const lang of ['zh-TW', 'zh-CN'] as const)
    expect(cacheCard(list({entries: '322', entry_capacity: '100000'}), lang, (key, params) => translate(lang, key, params))!.usage?.facts).toMatch(
      /322\uFF0F100,000$/
    );
});

it('claims no capacity when the backend does not report usage', () => {
  const card = cacheCard(list(), 'en-US', t)!;
  expect(card.usage).toBeNull();
  expect(card.note).toBe('Entries: 322, capacity limit: not reported');
  expect(cacheCard(undefined, 'en-US', t)).toBeNull();
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
