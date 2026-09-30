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
  const main = source('main', writeTemplate('group { proxy {} }\n', 'bypass', [], {t}), 'main');
  const view = templatesView([main, source('extra', 'node { a: "vless://x" }\n')], t);
  expect(view.current?.name).toBe('Bypass mainland China');
  expect(view.current?.help).toContain('Connects directly for Google China services');
  expect(view.primary.map(choice => choice.id)).toEqual(['bypass', 'gfw', 'global']);
});

it.each([
  {blockAds: false, blockQuic: true, networkManagerDirect: true},
  {blockAds: true, blockQuic: false, networkManagerDirect: false},
  {blockAds: false, blockQuic: false, networkManagerDirect: true},
  {blockAds: true, blockQuic: true, networkManagerDirect: false}
])('restores and writes template options $blockAds/$blockQuic/$networkManagerDirect', options => {
  const main = source('main', writeTemplate('', 'bypass', [], {t, ...options}), 'main');
  expect(templatesView([main], t)).toMatchObject(options);
  for (const sources of [[], [source('main', 'routing { fallback: direct }', 'main')]])
    expect(templatesView(sources, t)).toMatchObject({blockAds: false, blockQuic: true, networkManagerDirect: true});
  const {plain, withDns} = templateWrites('bypass', source('main', '', 'main'), [], t, options);
  for (const write of [plain, withDns]) expect(templatesView([source('main', write!.after, 'main')], t)).toMatchObject(options);
});

it('shows region flags in the apply impact while other labels stay plain', () => {
  const main = source('main', '', 'main');
  const created = templateImpact('regions', main, [main], [], t).created;
  expect(created.find(group => group.name === 'hk')?.label).toBe('🇭🇰 Hong Kong');
  expect(created.find(group => group.name === 'proxy')?.label).toBe('Proxy');
  expect(templateImpact('homebound', main, [main], [], t).created).toEqual([{name: 'cn', label: '🇨🇳 Mainland China'}]);
});

it('says which groups each template creates', () => {
  const view = templatesView([], t);
  expect(view.more.map(choice => choice.id)).toEqual(['single', 'services', 'regions', 'homebound']);
  expect(view.more[0].help).toContain('Uses the groups proxy, auto, creating any that are missing.');
  expect(view.more[1].help).toContain('proxy, auto, telegram, media, apple');
});

it('reads routing split over files, or held by a generated file, as custom', () => {
  const bypass = writeTemplate('group { proxy {} }\n', 'bypass', [], {t});
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

it('refuses routing split over files and files it may not write', () => {
  const main = source('main', 'routing {\n  include rules.dae\n  fallback: proxy\n}\n', 'main');
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
    'main.dae contains native_api or clash_api settings and cannot be rewritten through the backend. Edit the file on the host.'
  );
});

it('allows routing includes and lists the paths removed by applying a template', () => {
  const main = source(
    'main',
    "include { groups.dae }\nrouting {\n  include rules.dae # kept on disk\n  include 'rules/more rules.dae'\n  include rules/*.dae\n  fallback: proxy\n}\n",
    'main'
  );
  expect(input([main])).toEqual({source: main, refusal: null});
  expect(templateImpact('global', main, [main], [], t).removedIncludes).toEqual(['rules.dae', "'rules/more rules.dae'", 'rules/*.dae']);
  const {plain} = templateWrites('global', main, [main], t);
  expect(plain.after).not.toContain('include rules.dae');
  expect(plain.after).toContain('include { groups.dae }');
  expect(plain.diff).toContainEqual({kind: 'del', text: '  include rules.dae # kept on disk'});
});

it('counts parentheses inside routing independently of earlier unquoted paths', () => {
  const main = source(
    'main',
    'global { log_file: /var/log/honk(.log }\nrouting {\n  domain(\n    include\n  ) -> direct\n  include rules.dae\n  fallback: include\n}\n',
    'main'
  );
  expect(templateImpact('global', main, [main], [], t).removedIncludes).toEqual(['rules.dae']);
});

it('lists the groups a template creates and the existing ones it routes to, flagging one pinned to a node', () => {
  const main = source('main', 'group {\n  proxy { filter: name(hk-01) }\n}\nrouting { fallback: proxy }\n', 'main');
  expect(templateImpact('bypass', main, [main], [], t)).toEqual({created: [], reused: [{name: 'proxy', pinned: true}], collisions: [], removedIncludes: []});
  expect(templateImpact('single', main, [main], ['auto'], t)).toEqual({
    created: [{name: 'auto', label: 'Automatic'}],
    reused: [{name: 'proxy', pinned: true}],
    collisions: ['auto'],
    removedIncludes: []
  });
  const open = source('main', 'group {\n  proxy { filter: subtag(sub) policy: min_moving_avg }\n}\n', 'main');
  expect(templateImpact('gfw', open, [open], [], t).reused).toEqual([{name: 'proxy', pinned: false}]);
});

it('creates the default group only when no file declares one, and reuses one declared elsewhere', () => {
  const empty = source('main', 'routing { fallback: direct }\n', 'main');
  expect(templateImpact('global', empty, [empty], [], t)).toEqual({created: [{name: 'proxy', label: null}], reused: [], collisions: [], removedIncludes: []});
  const other = source('groups', 'group { proxy { policy: fixed(0) } }\n');
  expect(templateImpact('services', empty, [empty, other], [], t).reused).toEqual([{name: 'proxy', pinned: true}]);
});

it('takes a group named include as a route target, not as an include', () => {
  const main = source('main', 'group { include {} }\nrouting {\n  domain(example.org) -> include\n  fallback: include\n}\n', 'main');
  expect(input([main]).refusal).toBeNull();
  expect(templateImpact('global', main, [main], [], t).removedIncludes).toEqual([]);
});

it('reads a quoted group as its own group when listing what a template creates and keeps', () => {
  const main = source('main', "group {\n  'proxy' { filter: name(hk-01) }\n}\n", 'main');
  expect(templateImpact('single', main, [main], [], t)).toEqual({
    created: [
      {name: 'proxy', label: 'Proxy'},
      {name: 'auto', label: 'Automatic'}
    ],
    reused: [],
    collisions: [],
    removedIncludes: []
  });
  expect(templateImpact('bypass', main, [main], [], t).reused).toEqual([{name: "'proxy'", pinned: true}]);
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
