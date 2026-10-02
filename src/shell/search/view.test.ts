import {describe, expect, it} from 'vitest';
import {createMockApi} from '../../../mock';
import {translate} from '../../i18n';
import type {Capabilities, ConnectionList, DnsRuleList, Node, GroupSummary, ProviderList, EffectiveConfig, RuleList} from '../../api/model';
import {
  connectionEntries,
  dnsRuleEntries,
  featureEntries,
  globalSettingEntries,
  groupEntries,
  moduleEntries,
  nodeEntries,
  pageEntries,
  providerEntries,
  ruleEntries,
  searchSections,
  searchView as project,
  settingsEntries,
  sourceEntries,
  type SearchIndex
} from './view';
import {sourceKinds} from '../../dae/sources';
import {runtimeFieldLabels, settingsFields} from '../../features/settings/nav';
import {engineOf, type Engine} from '../../api/engines';
import type {Lang, Translator} from '../../i18n';

type SearchSources = {
  capabilities: {data: Capabilities | undefined};
  connections: {data: ConnectionList | undefined};
  nodes: {data: Node[] | undefined};
  groups: {data: GroupSummary[] | undefined};
  providers: {data: ProviderList | undefined};
  config: {data: EffectiveConfig | undefined};
  rules: {data: RuleList | undefined};
  dnsRules?: {data: DnsRuleList | undefined};
  version?: Engine;
};
// Every dataset projected at once, as useSearch does one memo at a time.
function searchIndex(sources: SearchSources, lang: Lang, t: Translator): SearchIndex {
  return searchSections(
    {
      pages: pageEntries(sources.capabilities.data, t, true),
      settings: settingsEntries(sources.capabilities.data, t),
      globals: globalSettingEntries(sources.version?.globalSettings ?? null, sources.capabilities.data, t),
      features: featureEntries(sources.capabilities.data, t),
      conns: connectionEntries(sources.connections.data, t),
      nodes: nodeEntries(sources.nodes.data, sources.providers.data, lang),
      groups: groupEntries(sources.groups.data),
      providers: providerEntries(sources.providers.data, t),
      sources: sourceEntries(sources.config.data, t),
      modules: moduleEntries(sources.config.data, engineOf(undefined), t),
      rules: ruleEntries(sources.rules.data, lang),
      dnsRules: dnsRuleEntries(sources.dnsRules?.data, lang, t)
    },
    sources.connections.data,
    t
  );
}
const searchView = (q: string, sources: SearchSources, t: Translator) => project(q, searchIndex(sources, 'en', t));

it('keeps destination identity and encoded queries when different hit types have the same label', async () => {
  const api = createMockApi();
  const node = (await api.nodes()).nodes[0];
  const group = (await api.groups())[0];
  const label = 'same & name';
  const sources: SearchSources = {
    capabilities: {data: await api.capabilities()},
    connections: {data: undefined},
    nodes: {data: [{...node, name: label, provider_id: 'provider & one'}]},
    groups: {data: [{...group, name: label}]},
    providers: {data: undefined},
    config: {data: undefined},
    rules: {data: undefined}
  };
  const view = searchView(label, sources, translate.bind(null, 'en'));
  const nodeHit = view.byId.get(`node:${node.id}`)!;
  const groupHit = view.byId.get(`group:${group.id}`)!;
  expect(nodeHit.route).toBe('nodes');
  expect(new URLSearchParams(nodeHit.query).get('q')).toBe(label);
  expect(new URLSearchParams(nodeHit.query).get('provider')).toBe('provider & one');
  expect(groupHit.route).toBe('policies');
  expect(new URLSearchParams(groupHit.query).get('group')).toBe(group.id);
  expect(view.sections.flatMap(section => section.items).map(item => item.id)).toEqual([nodeHit.id, groupHit.id]);
});

it('excludes unavailable DNS and Rules destinations even when their parent page is offered', async () => {
  const capabilities = await createMockApi().capabilities();
  capabilities.resources.dns_query.available = false;
  capabilities.resources.dns_log.available = false;
  capabilities.resources.rules.available = false;
  capabilities.resources.routing_trace.available = false;
  const sources: SearchSources = {
    capabilities: {data: capabilities},
    connections: {data: undefined},
    nodes: {data: undefined},
    groups: {data: undefined},
    providers: {data: undefined},
    config: {data: undefined},
    rules: {data: undefined}
  };
  const t = translate.bind(null, 'en');
  expect(searchView('query', sources, t).byId.has('page:dns?tab=query')).toBe(false);
  expect(searchView('cache', sources, t).byId.has('page:dns?tab=cache')).toBe(true);
  expect(searchView('trace', sources, t).byId.has('page:rules?tab=trace')).toBe(false);
  expect(searchView('record', sources, t).byId.has('page:flows?tab=records')).toBe(true);
});

it('resolves loose nodes through collision-safe provider rows and qualifies an empty truncated search', async () => {
  const api = createMockApi();
  const node = (await api.nodes()).nodes[0];
  const providers = await api.providers();
  const connections = await api.connections();
  connections.truncated = true;
  const sources: SearchSources = {
    capabilities: {data: await api.capabilities()},
    connections: {data: connections},
    nodes: {
      data: [
        {...node, id: 'direct', name: 'direct', protocol: 'direct', provider_id: null},
        {...node, id: 'orphan', name: 'orphan', provider_id: null}
      ]
    },
    groups: {data: undefined},
    providers: {data: {...providers, providers: [{...providers.providers[0], id: 'unattributed'}]}},
    config: {data: undefined},
    rules: {data: undefined}
  };
  const t = translate.bind(null, 'en');
  const hit = searchView('orphan', sources, t).byId.get('node:orphan')!;
  expect(new URLSearchParams(hit.query).get('provider')).toBe('unattributed-');
  expect(new URLSearchParams(hit.query).get('q')).toBe('orphan');
  const empty = searchView('nothing-matches-this', sources, t);
  expect(empty.sections).toEqual([]);
  expect(empty.partial).not.toBeNull();
  connections.truncated = false;
  expect(searchView('nothing-matches-this', sources, t).partial).toBeNull();
});

it('formats rule positions, source kinds and node groups for the language', async () => {
  const api = createMockApi();
  const node = (await api.nodes()).nodes[0];
  const rules = await api.rules();
  const config = await api.config();
  const rule = rules.rules.find(item => item.kind === 'rule')!;
  const sources: SearchSources = {
    capabilities: {data: await api.capabilities()},
    connections: {data: undefined},
    nodes: {data: [{...node, group_ids: ['a', 'b']}]},
    groups: {data: undefined},
    providers: {data: undefined},
    config: {data: config},
    rules: {data: {...rules, rules: [{...rule, index: 1233}]}}
  };
  const t = translate.bind(null, 'zh-CN');
  const view = project('', searchIndex(sources, 'zh-CN', t));
  expect(view.byId.get(`rule:${rule.rule_id}`)!.description).toBe(`#1,234 → ${rule.outbound}`);
  expect(view.byId.get(`source:${config.sources[0].id}`)!.description).toBe(t(sourceKinds[config.sources[0].kind]));
  expect(view.byId.get(`node:${node.id}`)!.description).toBe('a、b');
});

it('offers the config tabs the page shows, including Modules and Config files without a validator', async () => {
  const capabilities = await createMockApi().capabilities();
  capabilities.resources.config_validate.available = false;
  const sources: SearchSources = {
    capabilities: {data: capabilities},
    connections: {data: undefined},
    nodes: {data: undefined},
    groups: {data: undefined},
    providers: {data: undefined},
    config: {data: undefined},
    rules: {data: undefined}
  };
  const t = translate.bind(null, 'en');
  const ids = searchView('config', sources, t).byId;
  expect(ids.has('page:config?tab=modules')).toBe(true);
  expect(ids.has('page:config?tab=global')).toBe(true);
  expect(ids.has('page:config?tab=source')).toBe(true);
  expect(ids.has('page:config?tab=setup')).toBe(false);
});

it('offers connections and nodes tabs, and no node tabs where nodes are not listed', async () => {
  const capabilities = await createMockApi().capabilities();
  const sources: SearchSources = {
    capabilities: {data: capabilities},
    connections: {data: undefined},
    nodes: {data: undefined},
    groups: {data: undefined},
    providers: {data: undefined},
    config: {data: undefined},
    rules: {data: undefined}
  };
  const t = translate.bind(null, 'en');
  expect(searchView('traffic', sources, t).byId.get('page:connections?tab=traffic')?.description).toBe('Connections');
  expect(searchView('latency', sources, t).byId.has('page:nodes?tab=latency')).toBe(true);
  capabilities.resources.nodes.available = false;
  expect(searchView('latency', sources, t).byId.has('page:nodes?tab=latency')).toBe(false);
});

it('finds DNS rules by expression and target, with their list and position, and opens the DNS rules tab', async () => {
  const api = createMockApi();
  const dnsRules = await api.dnsRules();
  const rule = dnsRules.request.find(item => item.kind === 'rule' && item.upstream)!;
  const fallback = dnsRules.request.find(item => item.kind === 'fallback')!;
  const sources: SearchSources = {
    capabilities: {data: await api.capabilities()},
    connections: {data: undefined},
    nodes: {data: undefined},
    groups: {data: undefined},
    providers: {data: undefined},
    config: {data: undefined},
    rules: {data: undefined},
    dnsRules: {data: {...dnsRules, request: [{...rule, index: 1233}, fallback], response: []}}
  };
  const t = translate.bind(null, 'en');
  const hit = searchView(rule.expression, sources, t).byId.get(`dns-rule:${rule.rule_id}`)!;
  expect(hit.route).toBe('rules');
  expect(hit.query).toBe(`tab=dns&list=request&rule=${encodeURIComponent(rule.rule_id)}`);
  expect(hit.description).toBe(`Request rules #1,234 → ${rule.upstream}`);
  expect(searchView(rule.upstream!, sources, t).byId.has(hit.id)).toBe(true);
  expect(project('', searchIndex(sources, 'en', t)).byId.has(`dns-rule:${fallback.rule_id}`)).toBe(false);
});

const runtimeIds = Object.keys(runtimeFieldLabels) as Array<keyof typeof runtimeFieldLabels>;
// Every capability that gates a field, feature or tab, offered.
async function everything(): Promise<SearchSources> {
  const api = createMockApi();
  const capabilities = await api.capabilities();
  const resources = capabilities.resources;
  resources.geodata.available = true;
  resources.geodata.configurable_sources = true;
  resources.runtime_settings.available = true;
  resources.runtime_settings.fields = [...runtimeIds, 'geodata'];
  resources.config.writable = true;
  resources.providers.can_manage = true;
  resources.nodes.can_manage = true;
  capabilities.extensions = {
    ...capabilities.extensions,
    'x-honk': {config_export: {available: true}, config_import: {available: true}, config_revisions: {available: true}}
  };
  return {
    capabilities: {data: capabilities},
    connections: {data: undefined},
    nodes: {data: await api.nodes().then(list => list.nodes)},
    groups: {data: undefined},
    providers: {data: await api.providers()},
    config: {data: await api.config()},
    rules: {data: undefined},
    version: engineOf(await api.version())
  };
}

describe('settings, features and aliases', () => {
  it('offers every Settings control the page registers, focused on its card', async () => {
    const index = searchIndex(await everything(), 'en', translate.bind(null, 'en'));
    const settings = index.sections.find(section => section.id === 'settings')!.entries.map(entry => entry.hit);
    const ids = [...settingsFields.map(field => field.id), ...runtimeIds];
    expect(settings.map(hit => hit.id).sort()).toEqual(ids.map(id => `setting:${id}`).sort());
    for (const field of settingsFields) {
      const hit = settings.find(item => item.id === `setting:${field.id}`)!;
      expect([hit.route, new URLSearchParams(hit.query).get('card'), new URLSearchParams(hit.query).get('field')]).toEqual(['settings', field.card, field.id]);
    }
  });

  // The cards mark each control with `data-setting`; a marked control the registry lacks, or a registered one no card
  // marks, has no search entry or a dead one.
  it('matches the controls the Settings cards mark', () => {
    const cards = import.meta.glob<string>('../../features/settings/*Settings.tsx', {query: '?raw', import: 'default', eager: true});
    const marked = Object.values(cards).flatMap(source => [...source.matchAll(/data-setting="([^"]+)"/g)].map(match => match[1]));
    // The runtime card marks its numeric and recorder fields by their registry ids; log level is its one literal.
    expect(marked.sort()).toEqual([...settingsFields.map(field => field.id), 'log.level'].sort());
  });

  it.each([
    ['zh-TW', '配色', 'setting:palette'],
    ['en', '配色', 'setting:palette'],
    ['zh-CN', 'palette', 'setting:palette'],
    ['en', '  Palette ', 'setting:palette'],
    ['zh-TW', '訂閱', 'feature:nodes:add-subscription'],
    ['en', '订阅', 'feature:nodes:add-subscription'],
    ['zh-TW', 'subscription', 'feature:nodes:sources'],
    ['zh-TW', 'dns cache', 'page:dns?tab=cache'],
    ['zh-TW', 'geoip', 'page:settings?card=geodata'],
    ['en', 'geosite', 'page:settings?card=geodata'],
    ['zh-CN', 'geodata', 'page:settings?card=geodata'],
    ['en', 'start page', 'setting:startPage'],
    ['zh-TW', '國旗', 'setting:countryFlags'],
    ['en', 'flags', 'setting:countryFlags'],
    ['zh-TW', '匯出', 'feature:config:export'],
    ['en', 'import', 'feature:config:import'],
    ['en', 'history', 'page:config?tab=history'],
    ['zh-TW', 'revision', 'page:config?tab=history'],
    ['zh-TW', 'dial_mode', 'global:dial_mode'],
    ['en', 'log level', 'setting:log.level'],
    ['en', 'new group', 'feature:policies:new'],
    ['zh-TW', 'template', 'feature:rules:modes'],
    ['en', 'share link', 'feature:nodes:link'],
    ['en', 'edit dashboard', 'feature:dashboard:edit'],
    ['en', 'widget panel', 'feature:widgets:edit']
  ] as const)('in %s, %j finds %s', async (lang, query, id) => {
    expect(project(query, searchIndex(await everything(), lang, translate.bind(null, lang))).byId.has(id)).toBe(true);
  });

  it('opens entry points without running their action', async () => {
    const index = searchIndex(await everything(), 'en', translate.bind(null, 'en'));
    const hit = (q: string, id: string) => project(q, index).byId.get(id)!;
    expect([hit('subscription', 'feature:nodes:add-subscription').route, hit('subscription', 'feature:nodes:add-subscription').query]).toEqual([
      'nodes',
      'add=subscription'
    ]);
    expect([hit('export', 'feature:config:export').route, hit('export', 'feature:config:export').query]).toEqual(['config', 'tab=history']);
    expect(hit('widget panel', 'feature:widgets:edit').route).toBeNull();
    expect(hit('widget panel', 'feature:widgets:edit').open).toBeTypeOf('function');
  });

  it('withholds entry points the backend does not offer', async () => {
    const sources = await everything();
    const resources = sources.capabilities.data!.resources;
    resources.config.writable = false;
    resources.providers.can_manage = false;
    resources.geodata.configurable_sources = false;
    resources.runtime_settings.fields = ['log.level'];
    sources.capabilities.data!.extensions = {};
    const index = searchIndex(sources, 'en', translate.bind(null, 'en'));
    const all = index.sections.flatMap(section => section.entries.map(entry => entry.hit.id));
    for (const id of [
      'feature:rules:add',
      'feature:policies:new',
      'feature:nodes:add-subscription',
      'feature:config:export',
      'setting:geodataSource',
      'setting:flows.max_flows'
    ])
      expect(all).not.toContain(id);
    expect(all).toContain('setting:log.level');
    expect(all).toContain('setting:geodataUpdate');
  });

  it('lands nodes on their exact row and configuration sections on their first line', async () => {
    const sources = await everything();
    const node = sources.nodes.data![0];
    const hit = project(node.name, searchIndex(sources, 'en', translate.bind(null, 'en'))).byId.get(`node:${node.id}`)!;
    expect(new URLSearchParams(hit.query).get('node')).toBe(node.id);
    const index = searchIndex(sources, 'en', translate.bind(null, 'en'));
    const module = index.sections.find(section => section.id === 'modules')!.entries[0].hit;
    expect(module.route).toBe('config');
    expect(new URLSearchParams(module.query).get('tab')).toBe('source');
    expect(Number(new URLSearchParams(module.query).get('line'))).toBeGreaterThan(0);
  });
});

describe('ranking', () => {
  const groups = (names: string[]) => names.map((name, i) => ({id: `g${i}`, name, policy: {native: 'min'}}) as GroupSummary);
  const ranked = (names: string[], q: string) =>
    project(
      q,
      searchSections(
        {
          pages: [],
          settings: [],
          globals: [],
          features: [],
          conns: [],
          nodes: [],
          groups: groupEntries(groups(names)),
          providers: [],
          sources: [],
          modules: [],
          rules: [],
          dnsRules: []
        },
        undefined,
        translate.bind(null, 'en')
      )
    ).sections[0]?.items.map(item => item.label) ?? [];
  it.each([
    ['exact before substring', ['hk-telegram', 'telegram'], 'telegram', ['telegram', 'hk-telegram']],
    ['prefix before substring', ['my-tele', 'tele-x'], 'tele', ['tele-x', 'my-tele']],
    ['ties keep the section order', ['b-tele', 'a-tele'], 'tele', ['b-tele', 'a-tele']],
    [
      'an exact match past the limit still shows',
      [...Array.from({length: 9}, (_, i) => `x-${i}-hk`), 'hk'],
      'hk',
      ['hk', 'x-0-hk', 'x-1-hk', 'x-2-hk', 'x-3-hk', 'x-4-hk', 'x-5-hk', 'x-6-hk']
    ]
  ])('%s', (_, names, q, expected) => {
    expect(ranked(names, q)).toEqual(expected);
  });
});
