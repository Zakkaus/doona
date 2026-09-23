import {expect, it} from 'vitest';
import {offered} from './capabilities';
import {capabilitiesBase} from './mock/fixtures';
import type {Capabilities} from './model';

it('answers from the capabilities once known and from whileLoading until then', () => {
  const resources = (dns_log: object): Capabilities['resources'] => ({...capabilitiesBase.resources, dns_log}) as Capabilities['resources'];
  expect(offered(resources({available: true}), 'dns_log', {whileLoading: false})).toBe(true);
  expect(offered(resources({available: false}), 'dns_log', {whileLoading: true})).toBe(false);
  // A resource that does not say it is available is not offered.
  expect(offered(resources({}), 'dns_log', {whileLoading: true})).toBe(false);
  expect(offered(undefined, 'dns_log', {whileLoading: true})).toBe(true);
  expect(offered(undefined, 'dns_log', {whileLoading: false})).toBe(false);
});
