import {afterEach, expect, it, vi} from 'vitest';
import {createMockApi} from '../api/mock';
import {capabilities, capabilitiesBase} from '../api/mock/fixtures';
import {navAvailable} from './registry';

afterEach(() => vi.unstubAllGlobals());

it('gates explicit resource absence but accepts either DNS resource', async () => {
  vi.stubGlobal('localStorage', {getItem: (key: string) => (key === 'doona-mock-profile' ? 'base' : null)});
  const base = await createMockApi().capabilities();
  expect(base.profiles).toEqual(['base']);
  expect(base.resources.runtime_outbounds.available).toBe(false);
  expect(base.resources.traffic_history.available).toBe(false);
  await expect(createMockApi().runtimeOutbounds()).rejects.toMatchObject({status: 404});
  await expect(createMockApi().trafficHistory()).rejects.toMatchObject({status: 404});
  expect(['flows', 'rules', 'events'].map(route => navAvailable(route, base, 'native'))).toEqual([false, false, false]);
  expect(navAvailable('flows', undefined, 'native')).toBe(true);
  expect(navAvailable('flows', capabilities, 'native')).toBe(true);
  expect(navAvailable('dns', {...capabilitiesBase, resources: {...base.resources, dns_query: {...base.resources.dns_query, available: false}}}, 'native')).toBe(
    true
  );
});

it('gates backend requirements even before capabilities arrive', () => {
  for (const route of ['resources', 'config', 'validate']) {
    expect(navAvailable(route, undefined, 'native')).toBe(false);
    expect(navAvailable(route, capabilities, 'native')).toBe(false);
    expect(navAvailable(route, capabilitiesBase, 'clash')).toBe(true);
  }
});
