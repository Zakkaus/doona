import {afterEach, expect, it, vi} from 'vitest';
import {createMockApi} from '../api/mock';
import {ApiError} from '../api/error';
import {optionsProbe, probeDefaults} from './probeOptions';
import {groupActions, groupConflict, groupProbeProtocols, patchConfig, probeGroup} from './groups';

afterEach(() => vi.useRealTimers());

it.each([256, 6])('probes every direct member within member and result budgets (%i results)', async maxResults => {
  vi.useFakeTimers();
  const api = createMockApi();
  const caps = await api.capabilities();
  caps.resources.probes.limits!.max_results_per_job = maxResults;
  const group = await api.group('backup');
  const start = api.startProbe;
  api.startProbe = vi.fn(async (request, signal) => {
    expect(Array.isArray(request.members)).toBe(true);
    expect(request.members!.length).toBeLessThanOrEqual(Math.min(64, Math.floor(maxResults / 2)));
    return start(request, signal);
  });
  const result = probeGroup(api, caps, group, new AbortController().signal);
  await vi.runAllTimersAsync();
  const completed = await result;
  expect(new Set(completed.results.map(row => row.member_id))).toEqual(new Set(group.members.map(member => member.id)));
  expect(completed.results).toHaveLength(group.members.length * 2);
  expect(completed.selection_before).toEqual(completed.selection_after);
});

it.each([
  [256, false],
  [6, false],
  [256, true],
  [6, true]
] as const)('batches chosen DNS options for 120 members (%i results, leaves %s)', async (maxResults, leaves) => {
  vi.useFakeTimers();
  const api = createMockApi();
  const caps = await api.capabilities();
  caps.resources.probes.limits!.max_results_per_job = maxResults;
  const group = await api.group('backup');
  expect(group.members).toHaveLength(120);
  const request = optionsProbe(caps, {type: 'group', group_id: group.id}, {...probeDefaults, choice: 'dns_both', cold: true, leaves}, group)!;
  const size = Math.min(caps.resources.probes.limits!.max_members_per_job, Math.floor(maxResults / 4));
  const start = api.startProbe;
  api.startProbe = vi.fn(async (batch, signal) => {
    expect(batch).toMatchObject({target: request.target, kind: 'dns', transport: ['tcp', 'udp'], ip_version: 'any', warmth: 'cold'});
    expect(Array.isArray(batch.members)).toBe(true);
    expect(batch.members!.length).toBeLessThanOrEqual(size);
    return start(batch, signal);
  });
  const outcome = probeGroup(api, caps, group, new AbortController().signal, request);
  await vi.runAllTimersAsync();
  const result = await outcome;
  expect(api.startProbe).toHaveBeenCalledTimes(Math.ceil(120 / size));
  expect(result.results).toHaveLength(120 * 4);
  expect(new Set(result.results.map(row => row.member_id))).toEqual(new Set(group.members.map(member => member.id)));
});

it('rejects oversized direct jobs in mock admission', async () => {
  const api = createMockApi();
  const caps = await api.capabilities();
  const request = optionsProbe(caps, {type: 'group', group_id: 'backup'})!;
  await expect(api.startProbe(request)).rejects.toMatchObject({status: 413, code: 'request_too_large'});
});

it('retains completed batches and fails the action when a later job is refused', async () => {
  vi.useFakeTimers();
  const api = createMockApi();
  const caps = await api.capabilities();
  const group = await api.group('backup');
  const start = api.startProbe;
  api.startProbe = vi
    .fn()
    .mockImplementationOnce(start)
    .mockRejectedValue(new ApiError(503, 'unavailable', 'offline'));
  const outcome = probeGroup(api, caps, group, new AbortController().signal).catch(error => error);
  await vi.runAllTimersAsync();
  const error = await outcome;
  expect(error).toBeInstanceOf(Error);
  expect(new Set(error.partialResult.results.map((row: {member_id: string}) => row.member_id))).toEqual(
    new Set(group.members.slice(0, 64).map(member => member.id))
  );
  expect(error).toMatchObject({key: 'ui.operationFailed', detail: null, completed: 64, total: group.members.length, cause: {message: 'offline'}});
  expect(api.startProbe).toHaveBeenCalledTimes(2);
});

it('does not submit the next batch after cancellation', async () => {
  vi.useFakeTimers();
  const api = createMockApi();
  const caps = await api.capabilities();
  const group = await api.group('backup');
  const controller = new AbortController();
  api.startProbe = vi.fn(api.startProbe);
  const result = probeGroup(api, caps, group, controller.signal).catch(error => error);
  controller.abort();
  await vi.runAllTimersAsync();
  expect(await result).toMatchObject({name: 'AbortError'});
  expect(api.startProbe).toHaveBeenCalledTimes(1);
});

it('treats a stale revision and a refused test op as the group changing first', () => {
  expect(groupConflict(new ApiError(412, 'stale_revision', 'Group configuration revision changed'))).toBe(true);
  expect(groupConflict(new ApiError(409, 'state_conflict', 'Patch test failed'))).toBe(true);
  expect(groupConflict(new ApiError(422, 'validation_failed', 'Invalid check URL'))).toBe(false);
  expect(groupConflict(new Error('offline'))).toBe(false);
  expect(groupConflict(undefined)).toBe(false);
});

it('writes a group check URL at its revision and refuses a stale revision or an unsafe URL', async () => {
  vi.useFakeTimers();
  const api = createMockApi();
  const group = await api.group('auto');
  const url = 'https://cp.cloudflare.com/generate_204';
  let done = false;
  const saved = patchConfig(api, group, [{op: 'replace', path: '/config/check_url', value: url}]).finally(() => (done = true));
  // The write hashes the source before its operation starts, which takes real time; waitFor yields to the event loop
  // between checks and moves the fake clock each time, so the operation's timer fires however long the hash takes.
  await vi.waitFor(() => expect(done).toBe(true), {timeout: 4000, interval: 50});
  await saved;
  const after = await api.group('auto');
  expect(after.config.check_url).toBe(url);
  await expect(patchConfig(api, group, [{op: 'replace', path: '/config/check_url', value: null}])).rejects.toMatchObject({status: 412});
  for (const value of ['ftp://a.example/', 'http://user@a.example/', 'http://a.example/a,b'])
    await expect(patchConfig(api, after, [{op: 'replace', path: '/config/check_url', value}])).rejects.toMatchObject({status: 422});
  // A selector group does not list the check URL as writable.
  await expect(patchConfig(api, await api.group('proxy'), [{op: 'replace', path: '/config/check_url', value: url}])).rejects.toMatchObject({status: 422});
});

it('offers a group only the actions the backend offers for groups as a whole', async () => {
  const api = createMockApi();
  const caps = await api.capabilities();
  const group = await api.group('backup');
  group.capabilities = {...group.capabilities, can_select: true, can_override: true, mutable_config: ['interrupt_connections', 'check_url']};
  const offered = (groups: Partial<typeof caps.resources.groups> | null) =>
    groupActions(group, groups ? {...caps, resources: {...caps.resources, groups: {...caps.resources.groups, ...groups}}} : undefined).capabilities;

  expect(groupActions(group, caps)).toBe(group);
  expect(offered({selection: false})).toMatchObject({can_select: false, can_override: false, mutable_config: group.capabilities.mutable_config});
  expect(offered({config_patch: false})).toMatchObject({can_select: true, can_override: true, mutable_config: []});
  expect(offered({available: false, selection: true, config_patch: true})).toMatchObject({can_select: false, can_override: false, mutable_config: []});
  expect(offered(null)).toMatchObject({can_select: false, can_override: false, mutable_config: []});
  // A discovery without the flags leaves the group's own in charge.
  expect(offered({selection: undefined, config_patch: undefined})).toEqual(group.capabilities);
  expect(group.capabilities.mutable_config).toEqual(['interrupt_connections', 'check_url']);
});

it('inspects nested group leaves before choosing a common probe kind', async () => {
  const api = createMockApi();
  const nodes = (await api.nodes({limit: 1000})).nodes;
  const group = await api.group('backup');
  const parent = {...group, id: 'parent', members: [{id: group.id, name: group.name, kind: 'group' as const}]};
  const protocols = await groupProbeProtocols(api, parent, nodes);
  expect(protocols).toHaveLength(group.members.length);
  expect(protocols).toContain('hysteria2');
  const request = optionsProbe(await api.capabilities(), {type: 'group', group_id: parent.id}, {...probeDefaults, choice: 'tcp_connect'}, parent, protocols);
  expect(request).toMatchObject({kind: 'http', transport: ['tcp']});
});

it('mock accepts QUIC TCP connect as a failed measurement, while HTTP still succeeds', async () => {
  vi.useFakeTimers();
  const api = createMockApi();
  const node = (await api.nodes({limit: 1000})).nodes.find(node => node.protocol === 'hysteria2')!;
  for (const kind of ['tcp_connect', 'http'] as const) {
    const accepted = await api.startProbe({target: {type: 'node', node_id: node.id}, kind, transport: ['tcp'], ip_version: 'ipv4', warmth: 'warm'});
    await vi.runAllTimersAsync();
    const result = await api.operation(accepted.operation_id);
    expect(result).toMatchObject({
      status: 'succeeded',
      result: {results: [expect.objectContaining(kind === 'http' ? {state: 'healthy', error: null} : {state: 'unavailable', error: 'probe_failed'})]}
    });
  }
});

it('mock rejects VMess UDP at admission', async () => {
  const api = createMockApi();
  await api.createNode({name: 'vmess-probe', link: 'vmess://demo@vmess.example.net:443'});
  const node = (await api.nodes({limit: 1000})).nodes.find(node => node.name === 'vmess-probe')!;
  await expect(
    api.startProbe({target: {type: 'node', node_id: node.id}, kind: 'dns', transport: ['udp'], ip_version: 'ipv4', warmth: 'cold'})
  ).rejects.toMatchObject({status: 422, code: 'unsupported_value'});
});
