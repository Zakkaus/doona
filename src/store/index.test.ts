import {expect, it, vi} from 'vitest';
import {InflightRegistry, normalizeResourceKey} from '../api/inflight';
import {invalidations, shouldRefetch, type ResourceName} from '../api/invalidation';
import {createMockApi} from '../api/mock';
import {capabilities} from '../api/mock/fixtures';
import type {ApiEvent, Capabilities, EventKind} from '../api/model';
import {tcpProbe} from './index';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return {promise, resolve, reject};
}

it('normalizes query order and omitted undefined fields without merging different resources or values', () => {
  const key = normalizeResourceKey(['connections', {src: '10.0.0.1', limit: 1000}]);
  expect(normalizeResourceKey(['connections', {limit: 1000, cursor: undefined, src: '10.0.0.1'}])).toBe(key);
  expect(normalizeResourceKey(['connections', {src: undefined}])).toBe(normalizeResourceKey(['connections']));
  expect(normalizeResourceKey(['connections', {}])).toBe(normalizeResourceKey(['connections']));
  expect(normalizeResourceKey(['flows', {src: '10.0.0.1', limit: 1000}])).not.toBe(key);
  expect(normalizeResourceKey(['connections', {src: '10.0.0.2', limit: 1000}])).not.toBe(key);
  expect(normalizeResourceKey(['connections', {src: null}])).not.toBe(normalizeResourceKey(['connections']));
});

it('shares one capabilities request and keeps it alive until every consumer leaves', async () => {
  const api = createMockApi();
  const response = deferred<Capabilities>();
  const fetch = vi.spyOn(api, 'capabilities').mockImplementation(() => response.promise);
  const registry = new InflightRegistry();
  const key = normalizeResourceKey(['capabilities']);
  const first = registry.acquire(api, key, signal => api.capabilities(signal));
  const second = registry.acquire(api, key, signal => api.capabilities(signal));
  expect(first.promise).toBe(second.promise);
  await Promise.resolve();
  expect(fetch).toHaveBeenCalledTimes(1);
  const signal = fetch.mock.calls[0][0]!;
  first.release();
  first.release();
  expect(signal.aborted).toBe(false);
  response.resolve(capabilities);
  await expect(second.promise).resolves.toEqual(capabilities);
  second.release();
  expect(signal.aborted).toBe(false);
});

it('aborts an unsettled request only after the last release and permits a fresh acquire', async () => {
  const api = createMockApi();
  const response = deferred<number>();
  const fetch = vi.fn((_signal: AbortSignal) => response.promise);
  const registry = new InflightRegistry();
  const key = normalizeResourceKey(['runtime']);
  const first = registry.acquire(api, key, fetch);
  const second = registry.acquire(api, key, fetch);
  await Promise.resolve();
  first.release();
  expect(fetch.mock.calls[0][0].aborted).toBe(false);
  second.release();
  expect(fetch.mock.calls[0][0].aborted).toBe(true);
  const next = registry.acquire(api, key, fetch);
  expect(next.promise).not.toBe(first.promise);
  await Promise.resolve();
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls[1][0].aborted).toBe(false);
  response.resolve(2);
  await next.promise;
  next.release();
});

it.each(['resolve', 'reject'] as const)('drops entries after they %s, even before consumers release', async outcome => {
  const registry = new InflightRegistry();
  const api = createMockApi();
  const response = deferred<number>();
  const key = normalizeResourceKey(['runtime']);
  const first = registry.acquire(api, key, () => response.promise);
  const finished = first.promise.catch(() => -1);
  if (outcome === 'resolve') response.resolve(1);
  else response.reject(new Error('Request failed'));
  expect(await finished).toBe(outcome === 'resolve' ? 1 : -1);
  const second = registry.acquire(api, key, async () => 2);
  expect(second.promise).not.toBe(first.promise);
  await expect(second.promise).resolves.toBe(2);
  first.release();
  second.release();
});

it('does not let an abandoned request evict its replacement when it settles late', async () => {
  const registry = new InflightRegistry();
  const api = createMockApi();
  const oldResponse = deferred<number>();
  const newResponse = deferred<number>();
  const key = normalizeResourceKey(['runtime']);
  const old = registry.acquire(api, key, () => oldResponse.promise);
  old.release();
  const replacement = registry.acquire(api, key, () => newResponse.promise);
  oldResponse.resolve(1);
  await old.promise;
  const joined = registry.acquire(api, key, async () => 3);
  expect(joined.promise).toBe(replacement.promise);
  newResponse.resolve(2);
  await expect(joined.promise).resolves.toBe(2);
  replacement.release();
  joined.release();
});

it('isolates API instances, resource names and queries', async () => {
  const registry = new InflightRegistry();
  const api = createMockApi();
  const response = deferred<number>();
  const fetch = vi.fn(() => response.promise);
  const key = normalizeResourceKey(['connections', {src: '10.0.0.1'}]);
  const requests = [
    registry.acquire(api, key, fetch),
    registry.acquire(createMockApi(), key, fetch),
    registry.acquire(api, normalizeResourceKey(['connections', {src: '10.0.0.2'}]), fetch),
    registry.acquire(api, normalizeResourceKey(['flows', {src: '10.0.0.1'}]), fetch)
  ];
  await Promise.resolve();
  expect(fetch).toHaveBeenCalledTimes(4);
  response.resolve(1);
  await Promise.all(requests.map(request => request.promise));
  requests.forEach(request => request.release());
});

const event = (kind: EventKind) => ({event: kind}) as ApiEvent;

it('covers every contract event kind and ignores unknown event kinds', () => {
  expect(Object.keys(invalidations).sort()).toEqual(
    ['stream.ready', 'runtime.updated', 'flow.updated', 'flow.gap', 'operation.updated', 'generation.changed'].sort()
  );
  expect(shouldRefetch('runtime', event('unknown' as EventKind))).toBe(false);
  expect(shouldRefetch('runtime', event('toString' as EventKind))).toBe(false);
});

it('refreshes generation-dependent resources but leaves DNS cache to its poll', () => {
  for (const resource of [
    'capabilities',
    'runtime',
    'runtimeSettings',
    'config',
    'groups',
    'group',
    'nodes',
    'providers',
    'geodata',
    'rules',
    'datapath',
    'flows',
    'flow'
  ] as const) {
    expect(shouldRefetch(resource, event('generation.changed'))).toBe(true);
  }
  for (const resource of ['dnsLog', 'version'] as const) expect(shouldRefetch(resource, event('generation.changed'))).toBe(false);
  expect(shouldRefetch('runtimeSettings', event('runtime.updated'))).toBe(false);
  expect(shouldRefetch('runtimeSettings', event('operation.updated'))).toBe(true);
  expect(shouldRefetch('dnsCache', event('generation.changed'))).toBe(false);
});

it('limits flow notifications to flows and connection milestones, never capabilities', () => {
  expect(shouldRefetch('flows', event('flow.updated'))).toBe(true);
  expect(shouldRefetch('flow', event('flow.updated'))).toBe(true);
  expect(shouldRefetch('connections', event('flow.updated'))).toBe(true);
  expect(shouldRefetch('capabilities', event('flow.updated'))).toBe(false);
  expect(shouldRefetch('flows', event('flow.gap'))).toBe(true);
  expect(shouldRefetch('flow', event('flow.gap'))).toBe(true);
  expect(shouldRefetch('connections', event('flow.gap'))).toBe(false);
});

it('refreshes every resource on reconnect, not on initial or replayed readiness', () => {
  const resources: ResourceName[] = [
    'capabilities',
    'version',
    'runtime',
    'runtimeOutbounds',
    'trafficHistory',
    'memoryHistory',
    'connections',
    'nodes',
    'groups',
    'group',
    'flows',
    'flow',
    'datapath',
    'runtimeMemory',
    'dnsCache',
    'dnsLog'
  ];
  for (const resource of resources) {
    expect(shouldRefetch(resource, event('stream.ready'))).toBe(false);
    expect(shouldRefetch(resource, event('stream.ready'), true)).toBe(true);
  }
});

it('sends a group probe over its direct members and a node probe without a members field', () => {
  const probes = {available: true, kinds: ['tcp_connect'], transports: ['tcp'], targets: ['node', 'group'], ip_versions: ['ipv4']};
  const caps = {resources: {probes}} as unknown as Capabilities;
  expect(tcpProbe(caps, {type: 'group', group_id: 'g'})).toMatchObject({members: 'direct', ip_version: 'ipv4'});
  expect(tcpProbe(caps, {type: 'node', node_id: 'n'})).not.toHaveProperty('members');
  expect(tcpProbe({resources: {probes: {...probes, targets: ['group']}}} as unknown as Capabilities, {type: 'node', node_id: 'n'})).toBeNull();
});

it.each([
  {versions: ['ipv4'], expected: 'ipv4'},
  {versions: ['ipv6'], expected: 'ipv6'},
  {versions: ['ipv4', 'ipv6'], expected: 'any'},
  {versions: [], expected: null}
])('admits only advertised probe address families: $versions', ({versions, expected}) => {
  const caps = {resources: {probes: {available: true, kinds: ['tcp_connect'], transports: ['tcp'], targets: ['node'], ip_versions: versions}}} as Capabilities;
  expect(tcpProbe(caps, {type: 'node', node_id: 'n'})?.ip_version ?? null).toBe(expected);
});
