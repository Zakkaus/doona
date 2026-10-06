import {beforeEach, expect, it, vi} from 'vitest';
import type * as React from 'react';
import type * as I18n from '../../i18n';
import {capabilities, dnsCache} from '../../../mock/fixtures';
import {hookHarness} from '../../store/testHelpers';
import {useDnsCacheTab} from './useDns';
import type {DnsCacheList} from '../../api/model';

vi.mock('react', async original => ({
  ...(await original<typeof React>()),
  ...hookHarness.hooks,
  useCallback: (callback: unknown) => callback
}));
vi.mock('react-aria-components', () => ({useFilter: () => ({contains: (value: string, query: string) => value.includes(query)})}));
vi.mock('../../store', () => ({useDnsControl: () => dns}));
vi.mock('../../ui/ui', () => ({useTabShown: () => true, useDebounced: (value: unknown) => value, useLinked: vi.fn(), toast: vi.fn()}));
vi.mock('../../i18n', async original => {
  const actual = await original<typeof I18n>();
  return {
    ...actual,
    useLang: () => 'en',
    useT: () => (key: Parameters<typeof actual.translate>[1], params: Parameters<typeof actual.translate>[2]) => actual.translate('en', key, params)
  };
});

const dns = {
  capabilities: {data: structuredClone(capabilities), loading: false},
  cache: {data: undefined as DnsCacheList | undefined, loading: false, error: null, refetch: vi.fn()},
  busy: null,
  remove: vi.fn(),
  removeName: vi.fn(),
  removeMany: vi.fn(),
  flush: vi.fn(),
  cancel: vi.fn()
};
const read = (domain = '') => hookHarness.render(() => useDnsCacheTab(domain));
beforeEach(() => {
  hookHarness.reset();
  dns.capabilities.data = structuredClone(capabilities);
  dns.cache.data = undefined;
  dns.removeName.mockReset().mockResolvedValue({deleted: 0});
  dns.removeMany.mockReset();
});

it.each(['all', 'AAAA'])('deletes an exact name without cache reading for %s', async type => {
  const caps = dns.capabilities.data.resources.dns_cache;
  caps.read = false;
  caps.delete_name = true;
  caps.delete_entry = false;
  read().setMatchKind('full');
  read().setMatchText('example.com');
  read().setMatchType(type);
  const view = read();
  expect(view.matchDisabled).toBe(false);
  expect(view.matchConfirmation).toContain('example.com');
  expect(view.matchConfirmation).toContain(type === 'all' ? 'All supported types' : type);
  await view.removeMatching();
  expect(dns.removeName).toHaveBeenCalledWith({name: 'example.com', type: type === 'all' ? undefined : [type]});
  expect(dns.removeMany).not.toHaveBeenCalled();
});

it.each(['full', 'suffix', 'keyword'] as const)('requires listed matches for per-entry %s deletion', kind => {
  dns.capabilities.data.resources.dns_cache.delete_name = false;
  dns.capabilities.data.resources.dns_cache.delete_entry = true;
  read().setMatchKind(kind);
  read().setMatchText('example.com');
  expect(read().matchDisabled).toBe(true);
});

const cache = () => ({
  ...dnsCache,
  entries: [
    {...dnsCache.entries[0], entry_id: 'cdn-a', domain: 'cdn.bilibili.com.', type: 'A'},
    {...dnsCache.entries[0], entry_id: 'cdn-aaaa', domain: 'cdn.bilibili.com.', type: 'AAAA'},
    {...dnsCache.entries[0], entry_id: 'other-a', domain: 'api.telegram.org.', type: 'A'}
  ]
});
it('shares displayed rows and deletion candidates across name, type and clear criteria', async () => {
  dns.cache.data = cache();
  expect(read().rows).toHaveLength(3);
  expect(read().matchDisabled).toBe(true);
  read().setMatchText('cdn');
  expect(read().rows).toEqual([]);
  read().setMatchKind('keyword');
  expect(read().rows.map(row => row.id)).toEqual(['cdn-a', 'cdn-aaaa']);
  read().setMatchType('A');
  const filtered = read();
  expect(filtered.rows.map(row => row.id)).toEqual(filtered.matchListed.map(entry => entry.entry_id));
  await filtered.removeMatching();
  expect(dns.removeMany).toHaveBeenCalledWith(['cdn-a']);
  read().setMatchText('  ');
  expect(read().rows.map(row => row.id)).toEqual(['cdn-a', 'other-a']);
  read().clearMatches();
  expect(read().rows).toHaveLength(3);
  expect(read().filtered).toBe(false);
  expect(read().matchDisabled).toBe(true);
});

it('adopts a linked domain as a visible keyword criterion and offers filtering without deletion', () => {
  dns.cache.data = cache();
  Object.assign(dns.capabilities.data.resources.dns_cache, {delete_name: false, delete_entry: false});
  const linked = read('cdn');
  expect(linked.matchKind).toBe('keyword');
  expect(linked.matchText).toBe('cdn');
  expect(linked.rows.map(row => row.id)).toEqual(['cdn-a', 'cdn-aaaa']);
  expect(linked.matchAvailable).toBe(true);
  expect(linked.matchDisabled).toBe(true);
  linked.clearMatches();
  expect(read().rows).toHaveLength(3);
});
