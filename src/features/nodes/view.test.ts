import {describe, expect, it} from 'vitest';
import type {Node, Provider} from '../../api/model';
import {readSubscriptions} from './subscriptions';
import {nodeRows, ownedNodes, providerRows} from './view';

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
    expect(providerRows(providers, nodes, entries, 'Inline').list.map(item => item.name)).toEqual(['primary', 'secondary', 'spare', 'opaque-file']);
    expect(providers.map(item => item.name)).toEqual(['opaque-a', 'opaque-b', 'opaque-c', 'opaque-file']);
  });

  it('does not guess between duplicate hosts or multiple unclaimed subscriptions', () => {
    const shared = readSubscriptions(`subscription {
      first: 'https://shared.example/one'
      second: 'https://shared.example/two'
    }`);
    expect(providerRows([provider('a', {url_redacted: 'https://shared.example/redacted'})], [], shared, 'Inline').list[0].name).toBe('opaque-a');
    expect(providerRows([provider('a'), provider('b')], [], entries.slice(0, 1), 'Inline').list.map(item => item.name)).toEqual(['opaque-a', 'opaque-b']);
  });

  it('groups null and omitted provider ids as unknown provenance', () => {
    const remote = provider('remote');
    const nodes = [node('local'), node('remote', {provider_id: 'remote'}), node('unknown', {provider_id: undefined})];
    const result = providerRows([remote], nodes, [], 'Unknown');
    expect(result.list.map(item => [item.id, item.name, item.kind, item.node_count])).toEqual([
      ['unknown', 'Unknown', 'unknown', 2],
      ['remote', 'opaque-remote', 'subscription', 0]
    ]);
    expect(ownedNodes(nodes, null).map(item => item.id)).toEqual(['local', 'unknown']);
  });

  it('does not attribute unknown nodes to a backend inline provider', () => {
    const inline = provider('backend-inline', {kind: 'inline', name: 'config.dae', node_count: 2});
    const nodes = [node('local'), node('owned', {provider_id: inline.id})];
    expect(providerRows([inline], nodes, [], 'Unknown').list.map(item => item.kind)).toEqual(['unknown', 'inline']);
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
    expect(nodeRows(nodes, ' HK- ', 'gaming', 'vless', {column: 'name', direction: 'ascending'}).map(item => item.id)).toEqual(['hk-2', 'HK-10']);
    expect(nodes.map(item => item.id)).toEqual(['HK-10', 'hk-2', 'hk-1', 'hk-3', 'sg-1']);
    expect(nodeRows(nodes, '', '', '', {column: 'protocol', direction: 'ascending'}).map(item => item.id)).toEqual(['hk-3', 'HK-10', 'hk-2', 'hk-1', 'sg-1']);
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
    expect(nodeRows(nodes, '', '', '', {column: 'latency', direction: 'ascending'}).map(item => item.id)).toEqual(ascending);
    expect(nodeRows(nodes, '', '', '', {column: 'latency', direction: 'descending'}).map(item => item.id)).toEqual([...ascending].reverse());
  });
});
