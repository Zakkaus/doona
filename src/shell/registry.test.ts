import {expect, it} from 'vitest';
import {capabilities, capabilitiesBase} from '../../mock/fixtures';
import {features, navAvailable} from './registry';
import {routePaths} from './routes';

it('gates explicit resource absence but accepts either DNS resource', () => {
  const base = capabilitiesBase;
  expect(['rules', 'events'].map(route => navAvailable(route, base))).toEqual([false, false]);
  expect(navAvailable('rules', undefined)).toBe(true);
  expect(navAvailable('rules', capabilities)).toBe(true);
  expect(navAvailable('dns', {...base, resources: {...base.resources, dns_query: {...base.resources.dns_query, available: false}}})).toBe(true);
});

it('offers the rules page for its DNS rules alone', () => {
  const base = capabilitiesBase;
  const dnsRules = {...base, resources: {...base.resources, dns_rules: {...base.resources.dns_rules, available: true}}};
  expect(navAvailable('rules', base)).toBe(false);
  expect(navAvailable('rules', dnsRules)).toBe(true);
});

it.each([
  [false, false, false],
  [false, true, true],
  [true, false, true]
])('offers Policies for runtime groups or configuration (%s, %s)', (groups, config, expected) => {
  expect(
    navAvailable('policies', {
      ...capabilitiesBase,
      resources: {
        ...capabilitiesBase.resources,
        groups: {...capabilitiesBase.resources.groups, available: groups},
        config: {...capabilitiesBase.resources.config, available: config}
      }
    })
  ).toBe(expected);
});

it('registers a page for every route id', () => {
  expect(features.map(feature => feature.path)).toEqual([...routePaths]);
});
