import {expect, it} from 'vitest';
import type {ConfigSource} from '../../api/model';
import {groupQuery, nodeHref, outboundTag, parseRuleSeed, parseTraceLink, sectionSourceHref, traceQuery} from './link';
import {translate, type Translator} from '../../i18n';

const t: Translator = (key, params) => translate('en', key, params);
import {tagId} from './taggedId';

it('round trips IPv6 and reserved URL characters without reinterpreting the condition kind', () => {
  for (const seed of [
    {kind: 'dip' as const, value: '2001:db8::1'},
    {kind: 'domainSuffix' as const, value: 'a+b&c.example'},
    {kind: 'domainKeyword' as const, value: 'tracker+ads&metrics'}
  ]) {
    const query = new URLSearchParams({tab: 'list', add: tagId(seed.kind, seed.value)}).toString();
    expect(parseRuleSeed(new URLSearchParams(query).get('add'))).toEqual(seed);
  }
  expect(parseRuleSeed('unknown:value')).toBeNull();
  expect(parseRuleSeed('domainSuffix')).toBeNull();
  expect(parseRuleSeed(null)).toBeNull();
});

it('reads a DNS request seed only with the DNS condition kinds', () => {
  expect(parseRuleSeed('qnameSuffix:example.com', ['qnameSuffix', 'qnameFull'])).toEqual({kind: 'qnameSuffix', value: 'example.com'});
  expect(parseRuleSeed('qnameSuffix:example.com')).toBeNull();
});

const source = (id: string, kind: ConfigSource['kind'], content: string): ConfigSource => ({
  id,
  kind,
  path: `/etc/honk/${id}.dae`,
  content,
  writable: true,
  content_sha256: '',
  bytes: content.length,
  line_count: content.split('\n').length,
  loaded_at: ''
});

it('opens the first line of a section wherever an authored file holds it, else the main file', () => {
  const query = (link: string) => Object.fromEntries(new URLSearchParams(link.split('?')[1]));
  const main = source('main', 'main', 'global {}\nrouting {\n  dns {}\n}\n');
  const include = source('dns', 'include', '# upstreams\n\ndns {\n  upstream {}\n}\n');
  expect(query(sectionSourceHref([main, include], 'dns'))).toEqual({tab: 'source', source: 'dns', line: '3'});
  expect(query(sectionSourceHref([main, include], 'routing'))).toEqual({tab: 'source', source: 'main', line: '2'});
  // A nested block of the same name is not the section; a generated source is not searched.
  const generated = source('gen', 'generated', 'dns {}\n');
  expect(query(sectionSourceHref([generated, main], 'dns'))).toEqual({tab: 'source', source: 'main'});
  expect(query(sectionSourceHref([], 'dns'))).toEqual({tab: 'source'});
});

it('opens a node under the owner the nodes page files it under', () => {
  expect(nodeHref({provider_id: 'sub', protocol: 'vmess', name: 'hk 01'}, [])).toBe('#/nodes?provider=sub&q=hk+01');
  // A built-in node has no provider; the page's stand-in owner steps past a provider that took its id.
  expect(nodeHref({provider_id: null, protocol: 'direct', name: 'direct'}, [{id: 'builtin'}])).toBe('#/nodes?provider=builtin-&q=direct');
});

it('focuses a group by its backend id, and opens the page unfocused before the list holds it', () => {
  const groups = [{id: 'group-proxy', name: 'proxy'}];
  expect(groupQuery(groups, 'proxy')).toBe('group=group-proxy');
  expect(groupQuery(groups, 'new')).toBe('');
  expect(groupQuery(undefined, 'proxy')).toBe('');
});

it('carries a trace target, source and process through the address and back', () => {
  const link = {network: 'udp', domain: 'example.com', dst_ip: '2001:db8::1', dst_port: '443', src_ip: '10.0.0.2', src_port: '5353', pname: 'curl'} as const;
  expect(parseTraceLink(traceQuery(link))).toEqual(link);
  // Empty values stay out of the address; a missing network is TCP.
  expect(traceQuery({dst_ip: '1.1.1.1', domain: '', dst_port: '53'})).toBe('tab=trace&dst_ip=1.1.1.1&dst_port=53');
  expect(parseTraceLink('tab=trace&dst_ip=1.1.1.1')).toEqual({
    network: 'tcp',
    domain: '',
    dst_ip: '1.1.1.1',
    dst_port: '',
    src_ip: '',
    src_port: '',
    pname: ''
  });
  expect(parseTraceLink('tab=trace&src_ip=10.0.0.2')).toBeNull();
  expect(parseTraceLink('tab=trace')).toBeNull();
});

it.each([
  ['a listed group', 'proxy', {label: 'proxy', href: '#/policies?group=g1'}],
  ['a node', 'hk-01', {label: 'hk-01', href: null}],
  ['a built-in', 'direct', {label: 'direct', href: null}],
  ['nothing recorded', null, {label: 'Unknown', href: null}]
])('shows the outbound of %s as a tag', (_, name, view) => {
  expect(outboundTag(name, [{id: 'g1', name: 'proxy'}], t)).toEqual(view);
});
