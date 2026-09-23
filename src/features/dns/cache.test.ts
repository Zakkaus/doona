import {expect, it} from 'vitest';
import type {DnsCacheList} from '../../api/model';
import {translate, type Translator} from '../../i18n';
import {cacheCard} from './cache';

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

it('fills the bar by whichever limit is nearer, entries or bytes, and states both', () => {
  const byEntries = cacheCard(list({entries: '4096', entry_capacity: '8192', wire_bytes: '3200000', wire_byte_capacity: '32000000'}), 'en-US', t)!;
  expect(byEntries.usage?.pct).toBe(50);
  expect(cacheCard(list({entries: '5', entry_capacity: '8192', wire_bytes: '2100', wire_byte_capacity: '32000000'}), 'en-US', t)!.usage?.value).toBe('<1%');
  const byBytes = cacheCard(list({entries: '322', entry_capacity: '8192', wire_bytes: '10200000', wire_byte_capacity: '32000000'}), 'en-US', t)!;
  expect(byBytes.usage?.pct).toBe(31.88);
  expect(byBytes.usage?.facts).toBe('Entries: 322 / 8,192, size: 10 MB / 32 MB');
  expect(byBytes.note).toBeUndefined();
  expect(byBytes.coverage).toBe('Caches Positive answers; held in memory only, cleared on restart');
});

it('claims no capacity when the backend does not report usage', () => {
  const card = cacheCard(list(), 'en-US', t)!;
  expect(card.usage).toBeNull();
  expect(card.note).toBe('322 cache entries; this backend does not provide a capacity limit');
  expect(cacheCard(undefined, 'en-US', t)).toBeNull();
});
