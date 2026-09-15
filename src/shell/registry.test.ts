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
  expect(['flows', 'rules', 'events'].map(route => navAvailable(route, base))).toEqual([false, false, false]);
  expect(navAvailable('flows', undefined)).toBe(true);
  expect(navAvailable('flows', capabilities)).toBe(true);
  expect(navAvailable('dns', {...capabilitiesBase, resources: {...base.resources, dns_query: {...base.resources.dns_query, available: false}}})).toBe(true);
  expect(navAvailable('config', base)).toBe(true);
});
