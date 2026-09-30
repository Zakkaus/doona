import {expect, it} from 'vitest';
import type {ConfigSource} from '../../api/model';
import {translate, type Translator} from '../../i18n';
import {writeTemplate} from '../../dae/setup';
import {currentTemplate, refusalReason, routingSources, ruleViewMode, templateImpact, templatesView, templateTarget, templateWrites} from './template';

const t: Translator = (key, params, pluralParam, precision) => translate('en', key, params, pluralParam, precision);
const source = (id: string, content: string, kind: ConfigSource['kind'] = 'include'): ConfigSource => ({
  id,
  path: `/etc/honk/${id}.dae`,
  kind,
  writable: true,
  loaded_at: '2026-09-30T00:00:00Z',
  content,
  content_sha256: '',
  bytes: content.length,
  line_count: 1
});

it('names the template the one routing file holds, in plain words', () => {
  const main = source('main', writeTemplate('group { proxy {} }\n', 'bypass', []), 'main');
  const view = templatesView([main, source('extra', 'node { a: "vless://x" }\n')], t);
  expect(view.current?.name).toBe('Bypass mainland China');
  expect(view.current?.help).toContain('Mainland China connects directly');
  expect(view.primary.map(choice => choice.id)).toEqual(['bypass', 'gfw', 'global']);
});

it('says which groups each of the ACL4SSR templates creates', () => {
  const view = templatesView([], t);
  expect(view.more.map(choice => choice.id)).toEqual(['mini', 'standard', 'full']);
  expect(view.more[0].help).toContain('Creates the groups proxy, auto.');
  expect(view.more[1].help).toContain('proxy, auto, telegram, media, apple');
});

it('reads routing split over files, or held by a generated file, as custom', () => {
  const bypass = writeTemplate('group { proxy {} }\n', 'bypass', []);
  expect(currentTemplate([source('main', bypass, 'main'), source('more', 'routing { fallback: proxy }\n')])).toBeNull();
  expect(routingSources([source('gen', bypass, 'generated')])).toEqual([]);
  expect(currentTemplate([source('main', bypass.replace('fallback: proxy', 'fallback: direct'), 'main')])).toBeNull();
});

const input = (sources: ConfigSource[], patch: Partial<Parameters<typeof templateTarget>[0]> = {}) =>
  templateTarget({sources, configWritable: true, daeText: true, complete: () => true, holdsCredentials: () => false, denied: null, ...patch});

it('writes the one file that holds the routing, or the main file when none does', () => {
  const main = source('main', 'group { proxy {} }\n', 'main');
  const rules = source('rules', 'routing { fallback: proxy }\n');
  expect(input([main, rules])).toEqual({source: rules, refusal: null});
  expect(input([main])).toEqual({source: main, refusal: null});
});

it('refuses routing split over files or pulling one in, and files it may not write', () => {
  const main = source('main', 'routing {\n  include rules.dae\n  fallback: proxy\n}\n', 'main');
  expect(input([main]).refusal).toBe('include');
  expect(input([main, source('more', 'routing { fallback: direct }\n')]).refusal).toBe('split');
  const plain = source('main', 'routing { fallback: proxy }\n', 'main');
  expect(input([plain], {configWritable: false}).refusal).toBe('writesOff');
  expect(input([plain], {daeText: false}).refusal).toBe('syntax');
  expect(input([plain], {holdsCredentials: () => true}).refusal).toBe('secret');
  expect(input([{...plain, writable: false}]).refusal).toBe('readOnly');
  expect(input([plain], {complete: () => false}).refusal).toBe('incomplete');
  expect(input([plain], {denied: 'main'}).refusal).toBe('denied');
  expect(input([]).refusal).toBe('noSource');
  expect(refusalReason('secret', plain, t)).toBe(
    'main.dae holds API listener settings or secrets, which the backend does not write back. Edit it on the host.'
  );
});

it('lists the groups a template creates and the existing ones it routes to, flagging one pinned to a node', () => {
  const main = source('main', 'group {\n  proxy { filter: name(hk-01) }\n}\nrouting { fallback: proxy }\n', 'main');
  expect(templateImpact('bypass', main, [main], [])).toEqual({created: [], reused: [{name: 'proxy', pinned: true}], collisions: []});
  expect(templateImpact('mini', main, [main], ['auto'])).toEqual({
    created: [{name: 'auto', label: '自动选择'}],
    reused: [{name: 'proxy', pinned: true}],
    collisions: ['auto']
  });
  const open = source('main', 'group {\n  proxy { filter: subtag(sub) policy: min_moving_avg }\n}\n', 'main');
  expect(templateImpact('gfw', open, [open], []).reused).toEqual([{name: 'proxy', pinned: false}]);
});

it('creates the default group only when no file declares one, and reuses one declared elsewhere', () => {
  const empty = source('main', 'routing { fallback: direct }\n', 'main');
  expect(templateImpact('global', empty, [empty], [])).toEqual({created: [{name: 'proxy', label: null}], reused: [], collisions: []});
  const other = source('groups', 'group { proxy { policy: fixed(0) } }\n');
  expect(templateImpact('standard', empty, [empty, other], []).reused).toEqual([{name: 'proxy', pinned: true}]);
});

it('takes a group named include as a route target, not as an include', () => {
  const main = source('main', 'group { include {} }\nrouting {\n  domain(example.org) -> include\n  fallback: include\n}\n', 'main');
  expect(input([main]).refusal).toBeNull();
});

it('reads a quoted group as its own group when listing what a template creates and keeps', () => {
  const main = source('main', "group {\n  'proxy' { filter: name(hk-01) }\n}\n", 'main');
  expect(templateImpact('mini', main, [main], [])).toEqual({
    created: [
      {name: 'proxy', label: '节点选择'},
      {name: 'auto', label: '自动选择'}
    ],
    reused: [],
    collisions: []
  });
  expect(templateImpact('bypass', main, [main], []).reused).toEqual([{name: "'proxy'", pinned: true}]);
});

it('opens the routing list on the simple view unless the link names a view or points at a rule', () => {
  expect(ruleViewMode('')).toBe('simple');
  expect(ruleViewMode('tab=list')).toBe('simple');
  expect(ruleViewMode('view=advanced')).toBe('advanced');
  for (const query of ['tab=list&rule=r1', 'edit=r1', 'add=domain%3Aexample.org', 'held=1']) expect(ruleViewMode(query)).toBe('advanced');
  expect(ruleViewMode('rule=r1&view=simple')).toBe('simple');
});

it('offers the DNS split while no file has a dns block, and writes it only when asked', () => {
  const main = source('main', 'group {\n  proxy { policy: min_moving_avg }\n}\nrouting {\n  fallback: proxy\n}\n', 'main');
  const {plain, withDns} = templateWrites('bypass', main, [main], t);
  expect(plain.after).not.toContain('dns {');
  expect(withDns).not.toBeNull();
  expect(withDns!.after.startsWith(plain.after.replace(/\n$/, ''))).toBe(true);
  for (const line of [
    'dns {',
    "    cloudflare: 'tls://1.1.1.1:853'",
    "    alidns: 'udp://223.5.5.5:53'",
    '      qname(geosite:cn) -> alidns',
    '      fallback: cloudflare'
  ])
    expect(withDns!.diff).toContainEqual({kind: 'add', text: line});
});

it('leaves DNS alone when any loaded file has a dns block', () => {
  const main = source('main', 'routing {\n  fallback: direct\n}\n', 'main');
  const dns = source('dns', "dns {\n  upstream {\n    google: 'udp://8.8.8.8:53'\n  }\n}\n");
  const {plain, withDns} = templateWrites('global', main, [main, dns], t);
  expect(withDns).toBeNull();
  expect(plain.after).not.toContain('dns {');
});
