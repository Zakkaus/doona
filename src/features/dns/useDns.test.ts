import {beforeEach, expect, it, vi} from 'vitest';
import type * as React from 'react';
import type * as I18n from '../../i18n';
import {capabilities} from '../../../mock/fixtures';
import {hookHarness} from '../../store/testHelpers';
import {useDnsCacheTab} from './useDns';

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
  cache: {data: undefined, loading: false, error: null, refetch: vi.fn()},
  busy: null,
  remove: vi.fn(),
  removeName: vi.fn(),
  removeMany: vi.fn(),
  flush: vi.fn(),
  cancel: vi.fn()
};
const read = () => hookHarness.render(() => useDnsCacheTab(''));
beforeEach(() => {
  hookHarness.reset();
  dns.capabilities.data = structuredClone(capabilities);
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
