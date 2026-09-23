import {expect, it} from 'vitest';
import type {DnsCacheList} from '../../api/model';
import {cacheState} from './cache';

const now = Date.UTC(2026, 8, 23, 12);
const entry = (minutes: number, status = 'NOERROR') => ({
  entry_id: String(Math.random()),
  domain: 'a.org.',
  type: 'A',
  class: 'IN',
  status,
  expires_at: new Date(now + minutes * 60000).toISOString(),
  stale_until: new Date(now + (minutes + 10) * 60000).toISOString()
});

it('splits the cache into fresh and stale entries and positive and negative answers', () => {
  const list = {
    observed_at: new Date(now).toISOString(),
    coverage: {positive: true, negative: true, persistent: false},
    entries: [entry(5), entry(1), entry(-2), entry(3, 'NXDOMAIN')],
    total: 40,
    next_cursor: null
  } as DnsCacheList;
  expect(cacheState(list, now)).toEqual({
    total: 40,
    loaded: 4,
    fresh: 3,
    stale: 1,
    negative: 1,
    positive: 3,
    coverage: {positive: true, negative: true, persistent: false}
  });
  expect(cacheState(undefined, now)).toBeNull();
});
