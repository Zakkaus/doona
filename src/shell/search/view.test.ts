import {expect, it} from 'vitest';
import {createMockApi} from '../../api/mock';
import {translate} from '../../i18n';
import type {Capabilities, ConnectionList, DnsRuleList, Node, GroupSummary, ProviderList, EffectiveConfig, RuleList} from '../../api/model';
import {
  connectionEntries,
  dnsRuleEntries,
  groupEntries,
  nodeEntries,
  pageEntries,
  providerEntries,
  ruleEntries,
  searchSections,
  searchView as project,
  sourceEntries,
  type SearchIndex
} from './view';
import {sourceKinds} from '../../features/config/nav';
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
};
// Every dataset projected at once, as useSearch does one memo at a time.
function searchIndex(sources: SearchSources, lang: Lang, t: Translator): SearchIndex {
  return searchSections(
    {
      pages: pageEntries(sources.capabilities.data, sources.config.data, t),
      conns: connectionEntries(sources.connections.data, t),
      nodes: nodeEntries(sources.nodes.data, sources.providers.data, lang),
      groups: groupEntries(sources.groups.data),
      providers: providerEntries(sources.providers.data, t),
      sources: sourceEntries(sources.config.data, t),
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

it('offers the config tabs the page shows, including Modules and Validate without a validator', async () => {
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
  expect(ids.has('page:config?tab=validate')).toBe(true);
  expect(ids.has('page:config?tab=setup')).toBe(false);
});

it('offers the connections, nodes and policies tabs, and no node tabs where nodes are not listed', async () => {
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
  expect(searchView('membership', sources, t).byId.has('page:policies?tab=arrange')).toBe(true);
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
  expect(hit.query).toBe('tab=dns');
  expect(hit.description).toBe(`Request rules #1,234 → ${rule.upstream}`);
  expect(searchView(rule.upstream!, sources, t).byId.has(hit.id)).toBe(true);
  expect(project('', searchIndex(sources, 'en', t)).byId.has(`dns-rule:${fallback.rule_id}`)).toBe(false);
});
