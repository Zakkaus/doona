import {expect, it} from 'vitest';
import {capabilities, capabilitiesBase, version} from '../../mock/fixtures';
import {configOf} from '../api/engines';
import {features, navAvailable} from './registry';
import {routePaths} from './routes';

const extension = configOf(version);

it('gates explicit resource absence but accepts either DNS resource', () => {
  const base = capabilitiesBase;
  expect(['rules', 'events'].map(route => navAvailable(route, base, extension))).toEqual([false, false]);
  expect(navAvailable('rules', undefined, extension)).toBe(true);
  expect(navAvailable('rules', capabilities, extension)).toBe(true);
  expect(navAvailable('dns', {...base, resources: {...base.resources, dns_query: {...base.resources.dns_query, available: false}}}, extension)).toBe(true);
});

it('offers the rules page for its DNS rules alone', () => {
  const base = capabilitiesBase;
  const dnsRules = {...base, resources: {...base.resources, dns_rules: {...base.resources.dns_rules, available: true}}};
  expect(navAvailable('rules', base, extension)).toBe(false);
  expect(navAvailable('rules', dnsRules, extension)).toBe(true);
});

it.each([
  [false, false, false],
  [false, true, true],
  [true, false, true]
])('offers Policies for runtime groups or configuration (%s, %s)', (groups, config, expected) => {
  expect(
    navAvailable(
      'policies',
      {
        ...capabilitiesBase,
        resources: {
          ...capabilitiesBase.resources,
          groups: {...capabilitiesBase.resources.groups, available: groups},
          config: {...capabilitiesBase.resources.config, available: config}
        }
      },
      extension
    )
  ).toBe(expected);
});

it.each([
  ['honk', true],
  ['other', false]
])("offers the configuration page for the %s engine's export and revisions alone", (name, expected) => {
  const unloaded = {...capabilities, resources: {...capabilities.resources, config: {...capabilities.resources.config, available: false}}};
  expect(navAvailable('config', unloaded, configOf({engine: {name, version: '1'}}))).toBe(expected);
});

it('registers a page for every route id', () => {
  expect(features.map(feature => feature.path)).toEqual([...routePaths]);
});
