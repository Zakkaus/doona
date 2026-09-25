import {describe, expect, it} from 'vitest';
import type {Node, ProbeResult, Provider} from '../../api/model';
import {readSubscriptions} from './subscriptions';
import {
  nodeRows,
  ownedNodes,
  providerRows,
  nodeRowView,
  probeToast,
  providerRowView,
  intervalText,
  intervalItems,
  providerCreate,
  selectedProvider
} from './view';
import {translate, type Translator} from '../../i18n';
import {nodeFixtures} from '../../api/mock/fixtures';
import {formatBytes} from '../../i18n/format';
const contains = (value: string, query: string) => value.toLowerCase().includes(query.toLowerCase());
const t: Translator = (key, params) => translate('en', key, params);

const provider = (id: string, overrides: Partial<Provider> = {}): Provider => ({
  id,
  name: `opaque-${id}`,
  kind: 'subscription',
  url_redacted: null,
  node_count: 0,
  updated_at: null,
  expires_at: null,
  traffic: null,
  status: 'stale',
  last_error: null,
  ...overrides
});
const node = (name: string, overrides: Partial<Node> = {}): Node => ({
  id: name,
  name,
  protocol: 'vless',
  subscription_tag: null,
  provider_id: null,
  group_ids: [],
  health: [],
  ...overrides
});

const entries = readSubscriptions(`subscription {
  primary: 'https://primary.example/sub'
  secondary: 'https://secondary.example/sub'
  spare: 'https://spare.example/sub'
}`);

describe('providerRows', () => {
  it('prefers node tags over URL hosts, then matches a unique host and the sole unclaimed entry', () => {
    const providers = [
      provider('a', {url_redacted: 'https://secondary.example/redacted'}),
      provider('b', {url_redacted: 'https://secondary.example/redacted'}),
      provider('c', {url_redacted: 'not a URL'}),
      provider('file', {kind: 'file', url_redacted: 'https://primary.example/redacted'})
    ];
    const nodes = [node('tagged', {provider_id: 'a', subscription_tag: 'primary'})];
    const rows = providerRows(providers, nodes, entries, t).list;
    expect(rows.map(item => item.displayName)).toEqual(['primary', 'secondary', 'spare', 'opaque-file']);
    expect(rows.map(item => item.configTag)).toEqual(['primary', undefined, undefined, undefined]);
    expect(providers.map(item => item.name)).toEqual(['opaque-a', 'opaque-b', 'opaque-c', 'opaque-file']);
  });

  it('does not guess between duplicate hosts or multiple unclaimed subscriptions', () => {
    const shared = readSubscriptions(`subscription {
      first: 'https://shared.example/one'
      second: 'https://shared.example/two'
    }`);
    expect(providerRows([provider('a', {url_redacted: 'https://shared.example/redacted'})], [], shared, t).list[0].name).toBe('opaque-a');
    expect(providerRows([provider('a'), provider('b')], [], entries.slice(0, 1), t).list.map(item => item.name)).toEqual(['opaque-a', 'opaque-b']);
  });

  it('groups null and omitted provider ids as unattributed provenance', () => {
    const remote = provider('remote');
    const nodes = [node('local'), node('remote', {provider_id: 'remote'}), node('unknown', {provider_id: undefined})];
    const result = providerRows([remote], nodes, [], t);
    expect(result.list.map(item => [item.id, item.name, item.kind, item.node_count])).toEqual([
      ['unattributed', t('nodes.kind.unattributed'), 'unattributed', 2],
      ['remote', 'opaque-remote', 'subscription', 0]
    ]);
    expect(ownedNodes(nodes, null).map(item => item.id)).toEqual(['local', 'unknown']);
  });

  it('does not attribute unknown nodes to a backend inline provider', () => {
    const inline = provider('backend-inline', {kind: 'inline', name: 'config.dae', node_count: 2});
    const nodes = [node('local'), node('owned', {provider_id: inline.id})];
    expect(providerRows([inline], nodes, [], t).list.map(item => item.kind)).toEqual(['unattributed', 'inline']);
    expect(ownedNodes(nodes, inline.id).map(item => item.id)).toEqual(['owned']);
  });
});

describe('node rows', () => {
  it('distinguishes no filter, unknown provenance, and backend provider ownership', () => {
    const nodes = [node('local'), node('owned', {provider_id: 'backend-inline'}), node('unknown', {provider_id: undefined})];
    expect(ownedNodes(nodes, undefined).map(item => item.id)).toEqual(['local', 'owned', 'unknown']);
    expect(ownedNodes(nodes, null).map(item => item.id)).toEqual(['local', 'unknown']);
    expect(ownedNodes(nodes, 'backend-inline').map(item => item.id)).toEqual(['owned']);
  });

  it('combines trimmed case-insensitive search, group and protocol filters without reordering its input', () => {
    const nodes = [
      node('HK-10', {group_ids: ['gaming']}),
      node('hk-2', {group_ids: ['gaming']}),
      node('hk-1'),
      node('hk-3', {group_ids: ['gaming'], protocol: 'trojan'}),
      node('sg-1', {group_ids: ['gaming']})
    ];
    expect(nodeRows(nodes, ' HK- ', 'gaming', 'vless', {column: 'name', direction: 'ascending'}, contains).map(item => item.id)).toEqual(['hk-2', 'HK-10']);
    expect(nodes.map(item => item.id)).toEqual(['HK-10', 'hk-2', 'hk-1', 'hk-3', 'sg-1']);
    expect(nodeRows(nodes, '', '', '', {column: 'protocol', direction: 'ascending'}, contains).map(item => item.id)).toEqual([
      'hk-3',
      'HK-10',
      'hk-2',
      'hk-1',
      'sg-1'
    ]);
  });

  it('sorts measured latency before missing health and breaks ties by name in either direction', () => {
    const sample = {
      transport: 'tcp',
      purpose: 'data',
      ip_version: 'ipv4',
      warmth: 'warm',
      measurement: 'tcp_connect',
      sample_source: 'probe',
      state: 'healthy',
      latency_ms: 20,
      moving_avg_ms: null,
      avg10_ms: null,
      observed_at: '2026-01-01T00:00:00Z',
      error: null
    } satisfies Node['health'][number];
    const nodes = [
      node('slow-10', {health: [sample]}),
      node('missing'),
      node('slow-2', {health: [sample]}),
      node('zero', {health: [{...sample, latency_ms: 0}]}),
      node('unavailable', {health: [{...sample, state: 'unavailable', latency_ms: 1}]})
    ];
    const ascending = ['zero', 'slow-2', 'slow-10', 'missing', 'unavailable'];
    expect(nodeRows(nodes, '', '', '', {column: 'latency', direction: 'ascending'}, contains).map(item => item.id)).toEqual(ascending);
    expect(nodeRows(nodes, '', '', '', {column: 'latency', direction: 'descending'}, contains).map(item => item.id)).toEqual([...ascending].reverse());
  });
});

it('projects node protocol, membership, measured zero and unavailable health', () => {
  const sample = nodeFixtures(0).nodes[0].health.find(item => item.transport === 'tcp')!;
  const view = nodeRowView(
    node('a', {protocol: null, group_ids: ['group', 'unknown'], health: [{...sample, latency_ms: 0}]}),
    new Map([['group', 'Proxy']]),
    'en',
    t
  );
  expect(view.protocol).toBe('—');
  expect(view.groups).toContain('Proxy');
  expect(view.groups).toContain('unknown');
  expect(view.latency).toBe('0 ms');
  expect(nodeRowView(node('down', {health: [{...sample, state: 'unavailable'}]}), new Map(), 'en', t).latency).toBe(t('ui.unavailable'));
});

it('projects traffic without truncating counters and retains custom refresh intervals', () => {
  const row = providerRowView(provider('a', {traffic: {upload_bytes: '1', download_bytes: '1023', total_bytes: null}}), 90, 'en-US', t);
  expect(row.usage).toBe(formatBytes(1024n, 'en'));
  expect(row.intervals.at(-1)).toEqual({id: '90', label: intervalText(90, 'en-US', t)});
  expect(intervalText(0, 'en-US', t)).toBe(t('nodes.manualOnly'));
  expect(intervalText(3600, 'en-US', t)).toBe(t('nodes.everyHours', {n: '1'}));
  expect(providerRowView({...provider('unattributed'), kind: 'unattributed'}, undefined, 'en-US', t)).toMatchObject({
    usage: '—',
    status: null,
    hasInterval: false,
    expires: '—'
  });
});

it('separates built-in outbounds from unattributed nodes and avoids provider id collisions', () => {
  const nodes = [
    node('direct', {protocol: 'direct'}),
    node('block', {protocol: 'block', provider_id: undefined}),
    node('loose'),
    node('owned-direct', {protocol: 'direct', provider_id: 'builtin'})
  ];
  const rows = providerRows([provider('builtin')], nodes, [], t).list;
  expect(rows.map(row => [row.id, row.kind, row.node_count])).toEqual([
    ['builtin-', 'builtin', 2],
    ['unattributed', 'unattributed', 1],
    ['builtin', 'subscription', 0]
  ]);
  expect(ownedNodes(nodes, null, 'builtin').map(row => row.id)).toEqual(['direct', 'block']);
  expect(ownedNodes(nodes, null, 'unattributed').map(row => row.id)).toEqual(['loose']);
  expect(ownedNodes(nodes, 'builtin').map(row => row.id)).toEqual(['owned-direct']);
  expect(providerRowView(rows[0], undefined, 'en-US', t)).toMatchObject({
    name: t('nodes.kind.builtin'),
    kind: t('nodes.kind.builtin'),
    usage: '—',
    updatedAt: null,
    status: null
  });
});

it('does not authorize writes from shared-host guesses or conflicting node tags', () => {
  const providers = [
    provider('main', {url_redacted: 'https://primary.example/redacted'}),
    provider('include', {url_redacted: 'https://primary.example/redacted'})
  ];
  expect(providerRows(providers, [], entries, t).list.every(row => row.configTag === undefined)).toBe(true);
  const nodes = [node('one', {provider_id: 'main', subscription_tag: 'primary'}), node('two', {provider_id: 'main', subscription_tag: 'secondary'})];
  expect(providerRows(providers, nodes, entries, t).list.every(row => row.configTag === undefined)).toBe(true);
  expect(providerRowView(provider('a'), undefined, 'en-US', t)).toMatchObject({interval: '—', hasInterval: false, intervals: []});
  const unspecified = providerRowView(provider('a'), null, 'en-US', t);
  expect(unspecified).toMatchObject({interval: '—', intervalValue: '', hasInterval: true});
  expect(unspecified.intervals.map(item => item.id)).toEqual(['0', '3600', '21600', '43200', '86400']);
});

describe('providerCreate', () => {
  const form = {name: ' sub-a ', value: ' https://example.org/sub ', interval: '', agent: '', cache: null};
  const options = {update_interval: 86400, user_agent: 'honk/1.0', cache: true};

  it('sends only the options that differ from the backend default', () => {
    const base = {name: 'sub-a', kind: 'subscription', url: 'https://example.org/sub'};
    expect(providerCreate(form, options)).toEqual(base);
    expect(providerCreate({...form, interval: '86400', agent: ' honk/1.0 ', cache: true}, options)).toEqual(base);
    expect(providerCreate({...form, interval: '0', agent: ' clash.meta ', cache: false}, options)).toEqual({
      ...base,
      update_interval: 0,
      user_agent: 'clash.meta',
      cache: false
    });
  });

  it('never sends an option the backend does not list', () => {
    const chosen = {...form, interval: '3600', agent: 'clash.meta', cache: false};
    expect(providerCreate(chosen, undefined)).toEqual({name: 'sub-a', kind: 'subscription', url: 'https://example.org/sub'});
    expect(providerCreate(chosen, {user_agent: 'honk/1.0'})).toEqual({
      name: 'sub-a',
      kind: 'subscription',
      url: 'https://example.org/sub',
      user_agent: 'clash.meta'
    });
  });

  it('offers the table presets and keeps a default outside them', () => {
    expect(intervalItems(86400, 'en-US', t).map(item => item.id)).toEqual(['0', '3600', '21600', '43200', '86400']);
    expect(intervalItems(7200, 'en-US', t).map(item => item.id)).toEqual(['0', '3600', '21600', '43200', '86400', '7200']);
    expect(intervalItems(null, 'en-US', t).map(item => item.id)).toEqual(['0', '3600', '21600', '43200', '86400']);
  });
});

it('falls back to the first real source when the linked provider is no longer listed', () => {
  const {list} = providerRows([provider('a'), provider('b')], [], [], t);
  expect(selectedProvider(list, 'b')).toBe('b');
  expect(selectedProvider(list, 'gone')).toBe('a');
});

it('tells a failed probe from one whose result is unknown', () => {
  const item = (state: 'healthy' | 'unavailable' | 'unknown', latency_ms: number | null, error: string | null = null) =>
    ({member_id: 'hk', state, latency_ms, error}) as ProbeResult['results'][number];
  const result = (...results: ProbeResult['results']) => ({results}) as ProbeResult;
  expect(probeToast(result(item('healthy', 5.4)), 'hk', 'HK', t)).toEqual({kind: 'positive', text: t('nodes.probed', {name: 'HK', n: 5.4})});
  expect(probeToast(result(item('unavailable', null, 'refused')), 'hk', 'HK', t)).toEqual({kind: 'negative', text: t('nodes.probeFailed', {name: 'HK'})});
  expect(probeToast(result(item('unknown', null, 'probe timed out')), 'hk', 'HK', t)).toEqual({
    kind: 'neutral',
    text: t('nodes.probeUnknownWhy', {name: 'HK', error: 'probe timed out'})
  });
  expect(probeToast(result(item('unknown', null)), 'hk', 'HK', t)).toEqual({kind: 'neutral', text: t('nodes.probeUnknown', {name: 'HK'})});
  expect(probeToast(result(), 'hk', 'HK', t)).toEqual({kind: 'neutral', text: t('nodes.probeUnknown', {name: 'HK'})});
});
