import {expect, it} from 'vitest';
import {geoInput} from './geoInput';

it.each([
  ['geosite:gfw', {action: 'show', code: 'gfw'}],
  ['geosite:GFW', {action: 'show', code: 'GFW'}],
  ['geosite:google', {action: 'show', code: 'google'}],
  ['GEOSITE:CN ', {action: 'show', code: 'CN'}],
  [' geosite: gfw ', {action: 'show', code: 'gfw'}]
] as const)('maps %j to a category listing', (input, query) => {
  expect(geoInput(input)).toStrictEqual({ok: true, query});
});

it.each([['example.com'], ['Example.COM.'], ['sub.example.co.uk'], ['gfw']] as const)('maps %j to a domain reverse-lookup', input => {
  expect(geoInput(input)).toStrictEqual({ok: true, query: {action: 'find', value: input.toLowerCase().replace(/\.$/, '')}});
});

it.each([
  ['', 'dns.geodataEmpty'],
  ['   ', 'dns.geodataEmpty'],
  ['geosite:', 'dns.geodataEmpty'],
  ['geosite:  ', 'dns.geodataEmpty'],
  ['geoip:cn', 'dns.geodataGeoipUnsupported'],
  ['GEOIP:CN', 'dns.geodataGeoipUnsupported'],
  ['1.1.1.1', 'dns.geodataGeoipUnsupported'],
  ['[2001:db8::1]', 'dns.geodataGeoipUnsupported'],
  ['foo:bar', 'dns.geodataBadPrefix'],
  ['example.com:443', 'dns.geodataBadPrefix'],
  ['exa mple.com', 'dns.geodataBadPrefix']
] as const)('refuses %j with %j', (input, error) => {
  expect(geoInput(input)).toStrictEqual({ok: false, error});
});
