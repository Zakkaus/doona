import {afterEach, describe, expect, it, vi} from 'vitest';
import {resourceByOperation, validateBody} from '../tools/conformance.mjs';
import {ApiError} from '../src/api/error';
import type {Capabilities} from '../src/api/model';
import {createMockApi, type MockApi, type MockOptions} from '.';
import {capabilities, capabilitiesBase, capabilitiesM1} from './fixtures/capabilities';
import {createFlow} from './flows';
import {connections} from './fixtures/network';

afterEach(() => vi.unstubAllGlobals());

// Each profile the demo serves, with the capabilities it advertises; the mock reads the profile from storage.
const profiles: Record<string, {capabilities: Capabilities; profile?: string; options?: MockOptions}> = {
  full: {capabilities},
  base: {capabilities: capabilitiesBase, profile: 'base'},
  m1: {capabilities: capabilitiesM1, profile: 'm1'},
  faults: {capabilities, options: {faults: true}}
};
function mockFor(name: string): MockApi {
  const {profile, options} = profiles[name];
  vi.stubGlobal('localStorage', {getItem: (key: string) => (key === 'doona-mock-profile' ? (profile ?? null) : null), setItem() {}, removeItem() {}});
  return createMockApi(options);
}

type Call = [operationId: string, status: number, call: (api: MockApi) => Promise<unknown>];
// The first item of a list, or none where the profile refuses the list.
const first = async <T>(list: Promise<T[]>): Promise<T | undefined> => (await list.catch(() => []))[0];
// Reads first, then the mutations, whose statuses are the success status the operation lists.
const calls: Call[] = [
  ['getDiscovery', 200, api => api.discovery()],
  ['getVersion', 200, api => api.version()],
  ['getCapabilities', 200, api => api.capabilities()],
  ['getRuntime', 200, api => api.runtime()],
  ['getRuntimeOutbounds', 200, api => api.runtimeOutbounds()],
  ['getTrafficHistory', 200, api => api.trafficHistory()],
  ['getMemoryHistory', 200, api => api.memoryHistory()],
  ['getDatapath', 200, api => api.datapath('summary')],
  ['getDatapath', 200, api => api.datapath('full')],
  ['getRuntimeMemory', 200, api => api.runtimeMemory()],
  ['getRuntimeSettings', 200, api => api.runtimeSettings()],
  ['listNodes', 200, api => api.nodes()],
  ['listProviders', 200, api => api.providers()],
  ['getGeoData', 200, api => api.geodata()],
  ['listGroups', 200, api => api.groups()],
  ['getGroup', 200, async api => api.group((await first(api.groups()))?.id ?? 'proxy')],
  ['listConnections', 200, api => api.connections()],
  ['listConnections', 200, api => api.connections({detail: 'summary'})],
  ['listFlows', 200, api => api.flows()],
  ['getFlow', 200, async api => api.flow((await first(api.flows().then(list => list.flows)))?.id ?? 'missing')],
  ['listRules', 200, api => api.rules()],
  ['listDnsRules', 200, api => api.dnsRules()],
  ['listDnsLog', 200, api => api.dnsLog()],
  ['listDnsCache', 200, api => api.dnsCache()],
  ['listDnsCache', 200, api => api.dnsCache({detail: 'summary'})],
  ['queryDns', 200, api => api.dnsQuery('example.com', ['A', 'AAAA'])],
  ['getConfig', 200, api => api.config()],
  ['validateConfig', 200, async api => api.validateConfig({mode: 'syntax', sources: [{id: 'main', content: 'global {}\n'}]})],
  // The demo's own diagnostics, one from the checks and one from include resolution.
  ['validateConfig', 200, api => api.validateConfig({mode: 'full', sources: [{id: 'main', content: 'mystery {}\ninclude { missing.dae }\n'}]})],
  ['traceRouting', 200, api => api.routingTrace({input: {network: 'tcp', dst_ip: '1.1.1.1', dst_port: 443}, resolve: 'none'})],
  ['selectGroupMember', 200, api => api.selectGroup('proxy', {member_id: 'sg-01', network: 'both'})],
  ['clearGroupOverride', 200, api => api.clearGroupOverride('proxy', 'both')],
  ['patchGroupConfig', 202, async api => api.patchGroup('proxy', [], `"${(await api.group('proxy')).config_revision}"`)],
  ['patchRuntimeSettings', 200, api => api.patchRuntimeSettings({log: {level: 'debug'}})],
  ['createProvider', 201, api => api.createProvider({name: 'contract', kind: 'subscription', url: 'https://example.net/sub'})],
  ['createNode', 201, api => api.createNode({name: 'contract', link: 'anytls://demo@edge.example.net:443'})],
  ['refreshProvider', 202, async api => api.refreshProvider((await first(api.providers().then(list => list.providers)))?.id ?? 'missing')],
  ['updateGeoData', 202, api => api.updateGeodata()],
  ['createConfigSource', 202, api => api.createConfigSource('config.d/contract.dae', '')],
  ['createConfigSource', 422, api => api.createConfigSource('unmatched.dae', '')],
  ['deleteDnsCacheEntry', 200, async api => api.deleteDnsEntry((await first(api.dnsCache().then(list => list.entries)))?.entry_id ?? 'missing')],
  ['deleteDnsCacheByName', 200, api => api.deleteDnsCacheByName({name: 'example.com.', type: ['A']})],
  ['flushDnsCache', 200, api => api.flushDnsCache()],
  ['closeConnections', 200, api => api.closeConnections({all: true})],
  ['startReload', 202, api => api.startReload()],
  [
    'getOperation',
    200,
    async api => {
      const accepted = await api.startSuspend().catch(() => null);
      return accepted ? api.pollOperation(accepted) : api.operation('missing');
    }
  ]
];

describe.each(Object.keys(profiles))('the %s mock', name => {
  it('answers every call with a response or an error the contract lists', async () => {
    const api = mockFor(name);
    const failures: string[] = [];
    for (const [operationId, status, call] of calls) {
      const result = await call(api).then(
        body => ({status, body}),
        (error: unknown) => {
          if (!(error instanceof ApiError)) throw error;
          return {status: error.status, body: {error: {code: error.code, message: error.message, details: error.details}, request_id: error.requestId}};
        }
      );
      failures.push(...validateBody({operationId, ...result}).map(error => `${operationId} ${result.status}: ${error}`));
      const resource = resourceByOperation[operationId] as keyof Capabilities['resources'] | undefined;
      if (resource && !profiles[name].capabilities.resources[resource].available && result.status < 400)
        failures.push(`${operationId} answered although ${resource} is unavailable`);
    }
    expect(failures.join('\n')).toBe('');
  });
});

it('serves the public discovery view before sign-in and the password auth after it', async () => {
  const locked = createMockApi({signIn: true, session: null});
  expect(validateBody({operationId: 'getDiscovery', status: 200, body: await locked.discovery()})).toEqual([]);
  expect(await locked.discovery()).toMatchObject({auth: {mode: 'password', setup_required: false}});
  await expect(locked.runtime()).rejects.toMatchObject({status: 401, code: 'authentication_required'});
  const admitted = await createMockApi({signIn: true, session: 'demo-session-1'}).discovery();
  expect(admitted).toMatchObject({auth: {mode: 'password'}, links: {auth_login: '/api/v1/auth/login'}});
});

it('pages 100 items by default and refuses a page above 1000', async () => {
  const api = createMockApi();
  const page = await api.nodes();
  expect(page.nodes).toHaveLength(100);
  expect(page.next_cursor).not.toBeNull();
  expect((await api.nodes({limit: 1000})).nodes.length).toBeGreaterThan(100);
  await expect(api.nodes({limit: 1001})).rejects.toMatchObject({status: 400, code: 'invalid_request'});
});

it('leaves the full-only fields out of a summary', async () => {
  const api = createMockApi();
  const {tcp, udp} = await api.connections({detail: 'summary'});
  for (const row of [...tcp, ...udp]) for (const field of ['src', 'dst', 'domain']) expect(row).not.toHaveProperty(field);
  for (const entry of (await api.dnsCache({detail: 'summary'})).entries) expect(entry).not.toHaveProperty('answers');
});

it('accepts a check_url read back with its listener secrets masked', async () => {
  const group = await createMockApi().group('proxy');
  const body = {...group, config: {...group.config, check_url: 'https://example.invalid/<redacted>-<redacted>/check'}};
  expect(validateBody({operationId: 'getGroup', status: 200, body})).toEqual([]);
});

it('ends a DNS log page early at a large answer and still offers the next page', async () => {
  const api = createMockApi({faults: true});
  const limit = capabilities.resources.dns_log.max_page_size!;
  const short = [];
  for (let page = await api.dnsLog({limit}); ; page = await api.dnsLog({limit, cursor: page.next_cursor!})) {
    if (page.records.length < limit && page.next_cursor) short.push(page);
    if (!page.next_cursor) break;
  }
  expect(short.length).toBeGreaterThan(0);
});

const disabledCalls: Array<[keyof Capabilities['resources'], string, (api: MockApi) => Promise<unknown>]> = [
  ['groups', 'available', api => api.selectGroup('proxy', {member_id: 'sg-01', network: 'both'})],
  ['groups', 'selection', api => api.selectGroup('proxy', {member_id: 'sg-01', network: 'both'})],
  ['groups', 'available', api => api.clearGroupOverride('auto', 'both')],
  ['groups', 'selection', api => api.clearGroupOverride('auto', 'both')],
  ['groups', 'available', api => api.patchGroup('proxy', [{op: 'replace', path: '/config/tolerance', value: 20}], '"40"')],
  ['groups', 'config_patch', api => api.patchGroup('proxy', [{op: 'replace', path: '/config/tolerance', value: 20}], '"40"')],
  ['dns_cache', 'available', api => api.deleteDnsEntry('c1')],
  ['dns_cache', 'delete_entry', api => api.deleteDnsEntry('c1')],
  ['dns_cache', 'available', api => api.flushDnsCache()],
  ['dns_cache', 'flush', api => api.flushDnsCache()],
  ['dns_cache', 'read', api => api.dnsCache()],
  ['reload', 'available', api => api.startReload()],
  ['suspend', 'available', api => api.startSuspend()],
  ['resume', 'available', api => api.startResume()],
  ['runtime', 'available', api => api.runtime()],
  ['operations', 'available', api => api.operation('missing')]
];
it.each(disabledCalls)('refuses calls when %s.%s is disabled', async (resource, flag, call) => {
  const limited = structuredClone(capabilities);
  Object.assign(limited.resources[resource], {[flag]: false});
  await expect(call(createMockApi({isolated: true, capabilities: limited}))).rejects.toMatchObject({status: 404, code: 'capability_not_supported'});
});

it.each(['not-an-ip', '999.0.0.1', ''])('refuses an invalid DNS log source filter %j', async src => {
  await expect(createMockApi({isolated: true}).dnsLog({src})).rejects.toMatchObject({status: 400, code: 'invalid_request'});
});

it.each([
  ['10.0.0.12', '203.0.113.20:443', '10.0.0.12', '203.0.113.20', null],
  ['[2001:db8::1]:5000', '[2001:db8::2]:443', '2001:db8::1', '2001:db8::2', 5000]
] as const)('keeps flow address evidence consistent for %s to %s', (src, dst, src_ip, dst_ip, src_port) => {
  const flow = createFlow({...connections.tcp[0], src, dst}, 'tcp', connections.observed_at, connections.instance_id);
  expect(flow.trace.steps.find(step => step.stage === 'route')?.data.input).toMatchObject({src_ip, src_port, dst_ip, dst_port: 443});
  expect(flow.trace.steps.find(step => step.stage === 'dns')?.data).toMatchObject({addresses: [dst_ip], selected_ip: dst_ip});
  expect(flow.trace.steps.find(step => step.stage === 'outbound')?.data).toMatchObject({dial_ip: dst_ip, target: 'api.telegram.org:443'});
});
