import {expect, it} from 'vitest';
import type {ConfigSource, GroupSummary, Node} from '../../api/model';
import {configSources} from '../../api/mock/fixtures/configuration';
import {nodeFixtures, providers as providerFixtures} from '../../api/mock/fixtures/inventory';
import {templates, templateRules, type RuleTemplate, type TemplateOptions} from '../../dae/templates';
import {setupCompletion} from './gettingStarted';

const {nodes, groups} = nodeFixtures(0);
const summaries: GroupSummary[] = groups.map(group => ({
  id: group.id,
  name: group.name,
  icon: group.icon,
  config_revision: group.config_revision,
  policy: group.policy,
  member_count: group.members.length,
  selection: {tcp_member_id: group.runtime.selection.tcp?.member_id ?? null, udp_member_id: null}
}));
const unmeasured = nodes.map(node => ({...node, health: []}));
const source = (content: string): ConfigSource => ({
  id: 'main',
  path: '/etc/honk/config.dae',
  kind: 'main',
  writable: true,
  loaded_at: '',
  content,
  content_sha256: '',
  bytes: 0,
  line_count: 0
});
const defaults = source('routing {\n' + templates.global.rules.join('\n') + '\nfallback: direct\n}');
const builtin: Node = {...nodes[0], id: 'direct', name: 'direct', protocol: 'direct'};

it('keeps every step open with no proxy nodes and only preset routing', () => {
  expect(setupCompletion([builtin], [defaults], [], [])).toEqual({nodes: false, rules: false, connection: false});
});
it('completes only the first step for unmeasured nodes with default routing', () => {
  expect(setupCompletion(unmeasured, [defaults], summaries, [])).toEqual({nodes: true, rules: false, connection: false});
});
it('completes the first step for a subscription before it has any nodes', () => {
  expect(setupCompletion([], [defaults], [], [{kind: 'subscription'}])).toEqual({nodes: true, rules: false, connection: false});
  expect(setupCompletion([builtin], [defaults], [], [{kind: 'inline'}]).nodes).toBe(false);
});
it('keeps the first step complete after a subscription refresh fails with no nodes', () => {
  const failed = {...providerFixtures[0], node_count: 0, status: 'error' as const, last_error: {code: 'fetch_failed', message: 'HTTP 502', details: null}};
  expect(setupCompletion([], [defaults], [], [failed]).nodes).toBe(true);
});
it('ignores DNS-only includes when deciding whether routing has been chosen', () => {
  const dns = {...source('dns { routing { request { qname(example.org) -> cloudflare\nfallback: cloudflare } } }'), kind: 'include' as const};
  expect(setupCompletion([], [defaults, dns], [], []).rules).toBe(false);
  expect(setupCompletion([], [source('global {}'), dns], [], []).rules).toBe(false);
});
it.each([false, true])('recognises preset routing split across main and an include (wrapped: %s)', wrapped => {
  const rules = templates.global.rules.join('\n');
  const include = {...source(wrapped ? 'routing {\n' + rules + '\n}' : rules), kind: 'include' as const};
  expect(setupCompletion([], [source('routing { fallback: direct }'), include], [], []).rules).toBe(false);
  expect(setupCompletion([], [include, source('routing { fallback: direct }')], [], []).rules).toBe(false);
  expect(setupCompletion([], [source('routing { fallback: proxy }'), include], [], []).rules).toBe(true);
});

const options: TemplateOptions[] = [false, true].flatMap(blockAds =>
  [false, true].flatMap(blockQuic => [false, true].map(networkManagerDirect => ({blockAds, blockQuic, networkManagerDirect})))
);
it.each((Object.keys(templates) as RuleTemplate[]).flatMap(template => options.map(options => [template, options] as const)))(
  'completes routing when the %s template is applied with %j',
  (template, options) => {
    const text =
      'routing {\n' +
      templateRules(template, options).join('\n').replaceAll('{group}', 'proxy') +
      '\nfallback: ' +
      templates[template].fallback.replaceAll('{group}', 'proxy') +
      '\n}';
    expect(setupCompletion(unmeasured, [source(text)], summaries, []).rules).toBe(true);
  }
);
it('keeps honk default routing pending, including comments and spacing', () => {
  for (const text of ['', 'routing { fallback: direct }', 'routing { # unchanged\n fallback : direct\n}'])
    expect(setupCompletion([], [source(text)], [], []).rules).toBe(false);
});
it('counts custom routing and preset option changes as a routing choice', () => {
  expect(setupCompletion(unmeasured, [source('routing { domain(example.org) -> proxy\nfallback: direct }')], summaries, []).rules).toBe(true);
  for (const option of options) {
    const changed = option.blockAds || !option.blockQuic || !option.networkManagerDirect;
    const text = 'routing {\n' + templateRules('global', option).join('\n') + '\nfallback: direct\n}';
    expect(setupCompletion(unmeasured, [source(text)], summaries, []).rules).toBe(changed);
  }
});
it('requires a successful latency on the selected proxy node', () => {
  expect(setupCompletion(nodes, [defaults], summaries, []).connection).toBe(true);
  expect(setupCompletion(nodes, [defaults], [], []).connection).toBe(false);
  const failed = nodes.map(node => ({...node, health: node.health.map(health => ({...health, state: 'unavailable' as const}))}));
  expect(setupCompletion(failed, [defaults], summaries, []).connection).toBe(false);
  expect(setupCompletion([builtin], [defaults], [{...summaries[0], selection: {tcp_member_id: 'direct', udp_member_id: null}}], []).connection).toBe(false);
});
it('follows nested group selections and rejects an unresolved cycle', () => {
  const nested = {...summaries[0], selection: {tcp_member_id: summaries[1].id, udp_member_id: null}};
  expect(setupCompletion(nodes, [], [nested, summaries[1]], []).connection).toBe(true);
  expect(setupCompletion(nodes, [], [{...nested, selection: {tcp_member_id: nested.id, udp_member_id: null}}], []).connection).toBe(false);
});

it.each(['direct', 'missing', null])('checks UDP when TCP selects %s', tcp => {
  const group = {...summaries[0], selection: {tcp_member_id: tcp, udp_member_id: nodes[0].id}};
  expect(setupCompletion([builtin, ...nodes], [], [group], []).connection).toBe(true);
});
it('checks UDP when the TCP node has no successful measurement', () => {
  const group = {...summaries[0], selection: {tcp_member_id: unmeasured[0].id, udp_member_id: nodes[1].id}};
  expect(setupCompletion([unmeasured[0], nodes[1]], [], [group], []).connection).toBe(true);
});

it('keeps the demo starting routing pending and detects an edited include', () => {
  expect(setupCompletion(nodes, configSources, summaries, []).rules).toBe(false);
  const edited = configSources.map(source => (source.kind === 'include' ? {...source, content: source.content + '\ndomain(example.org) -> proxy\n'} : source));
  expect(setupCompletion(nodes, edited, summaries, []).rules).toBe(true);
});
