import {expect, it} from 'vitest';
import {capabilities, capabilitiesBase} from '../api/mock/fixtures';
import {features, navAvailable} from './registry';
import {routePaths} from './routes';

it('gates explicit resource absence but accepts either DNS resource', () => {
  const base = capabilitiesBase;
  expect(['rules', 'events'].map(route => navAvailable(route, base))).toEqual([false, false]);
  expect(navAvailable('rules', undefined)).toBe(true);
  expect(navAvailable('rules', capabilities)).toBe(true);
  expect(navAvailable('dns', {...base, resources: {...base.resources, dns_query: {...base.resources.dns_query, available: false}}})).toBe(true);
});

it('registers a page for every route id', () => {
  expect(features.map(feature => feature.path)).toEqual([...routePaths]);
});
