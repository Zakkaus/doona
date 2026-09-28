import {expect, it} from 'vitest';
import type {ConfigSource} from '../../api/model';
import {parseRuleSeed, ruleSeedHref, sectionSourceHref} from './link';

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

const source = (id: string, kind: ConfigSource['kind'], content: string | undefined): ConfigSource => ({
  id,
  kind,
  path: `/etc/honk/${id}.dae`,
  content,
  writable: true,
  content_sha256: '',
  bytes: content?.length ?? 0,
  line_count: content?.split('\n').length ?? 0,
  loaded_at: ''
});

it('opens the first line of a section wherever an authored file holds it, else the main file', () => {
  const query = (link: string) => Object.fromEntries(new URLSearchParams(link.split('?')[1]));
  const main = source('main', 'main', 'global {}\nrouting {\n  dns {}\n}\n');
  const include = source('dns', 'include', '# upstreams\n\ndns {\n  upstream {}\n}\n');
  expect(query(sectionSourceHref([main, include], 'dns'))).toEqual({tab: 'source', source: 'dns', line: '3'});
  expect(query(sectionSourceHref([main, include], 'routing'))).toEqual({tab: 'source', source: 'main', line: '2'});
  // A nested block of the same name is not the section; a generated source and withheld text are not searched.
  const generated = source('gen', 'generated', 'dns {}\n');
  const withheld = source('secret', 'include', undefined);
  expect(query(sectionSourceHref([generated, withheld, main], 'dns'))).toEqual({tab: 'source', source: 'main'});
  expect(query(sectionSourceHref([], 'dns'))).toEqual({tab: 'source'});
});
