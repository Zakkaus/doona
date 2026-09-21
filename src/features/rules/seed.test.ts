import {expect, it} from 'vitest';
import {parseRuleSeed, ruleSeedHref} from './seed';

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
