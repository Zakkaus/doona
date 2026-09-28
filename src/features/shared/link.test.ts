import {expect, it} from 'vitest';
import {parseRuleSeed, ruleSeedHref} from './link';

it('round trips IPv6 and reserved URL characters without reinterpreting the condition kind', () => {
  for (const seed of [
    {kind: 'dip' as const, value: '2001:db8::1'},
    {kind: 'domainSuffix' as const, value: 'a+b&c.example'}
  ]) {
    const query = ruleSeedHref(seed).split('?')[1];
    expect(parseRuleSeed(new URLSearchParams(query).get('add'))).toEqual(seed);
  }
  expect(parseRuleSeed('unknown:value')).toBeNull();
  expect(parseRuleSeed('domainSuffix')).toBeNull();
  expect(parseRuleSeed(null)).toBeNull();
});

it('seeds a DNS request rule on the DNS tab, readable only with the DNS condition kinds', () => {
  const href = ruleSeedHref({kind: 'qnameSuffix', value: 'example.com'}, 'dns');
  const params = new URLSearchParams(href.split('?')[1]);
  expect(params.get('tab')).toBe('dns');
  expect(parseRuleSeed(params.get('add'), ['qnameSuffix', 'qnameFull'])).toEqual({kind: 'qnameSuffix', value: 'example.com'});
  expect(parseRuleSeed(params.get('add'))).toBeNull();
});
