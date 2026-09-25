import {afterEach, expect, it, vi} from 'vitest';
import {createMockApi} from './index';

afterEach(() => vi.useRealTimers());

it('shares accepted routing rules and the mutable DNS cache with tracing', async () => {
  vi.useFakeTimers();
  const api = createMockApi();
  const main = (await api.config()).sources.find(source => source.kind === 'main')!;
  const content = `group { 'edited-group': { policy: fixed(0) } proxy { policy: fixed(0) } resilient { policy: fixed(0) } }
dns { routing { request { fallback: unused } } }
routing { domain(suffix: telegram.org) -> edited-group
  fallback: block
}`;
  const beforeRules = await api.rules();
  const accepted = await api.replaceConfigSource(main.id, content, `"${main.content_sha256}"`);
  expect((await api.config()).sources.find(source => source.id === main.id)).toEqual(main);
  expect(await api.rules()).toEqual(beforeRules);
  expect((await api.groups()).some(group => group.name === 'edited-group')).toBe(false);
  await vi.advanceTimersByTimeAsync(1000);
  expect((await api.operation(accepted.operation_id)).status).toBe('succeeded');
  expect((await api.config()).sources.find(source => source.id === main.id)?.content).toBe(content);
  expect((await api.groups()).find(group => group.name === 'edited-group')?.config_revision).toBe('41');
  const rules = await api.rules();
  expect(rules.rules.map(rule => [rule.expression, rule.outbound])).toEqual([
    ['domain(suffix: telegram.org)', 'edited-group'],
    ['fallback: block', 'block']
  ]);
  const request = {input: {network: 'tcp' as const, domain: 'api.telegram.org', dst_port: 443}, resolve: 'live' as const};
  const trace = await api.routingTrace(request);
  expect(trace.generation_id).toBe(rules.generation_id);
  expect(trace.evaluations[0]).toMatchObject({decision: 'determinate', outbound: 'edited-group'});
  expect(trace.evaluations[0].rules.map(rule => rule.rule_id)).toEqual(rules.rules.map(rule => rule.rule_id));
  const fallback = await api.routingTrace({input: {...request.input, domain: 'example.org'}, resolve: 'none'});
  expect(fallback.evaluations[0]).toMatchObject({decision: 'determinate', outbound: 'block'});
  await api.flushDnsCache();
  const flushed = await api.routingTrace(request);
  expect(flushed.dns).toMatchObject([{cache: 'miss', addresses: []}]);
  expect(flushed.evaluations).toEqual([]);
});

it('answers rules without a pinnable generation with a retryable 503, as the contract does', async () => {
  vi.useFakeTimers();
  const api = createMockApi();
  const main = (await api.config()).sources.find(source => source.kind === 'main')!;
  await api.replaceConfigSource(main.id, main.content.replace(/^\s*fallback:.*$/m, ''), `"${main.content_sha256}"`);
  await vi.advanceTimersByTimeAsync(1000);
  await expect(api.rules()).rejects.toMatchObject({status: 503, code: 'snapshot_unavailable', transient: true});
});

it('activates node membership and group policy with the accepted source, including group patches', async () => {
  vi.useFakeTimers();
  const api = createMockApi();
  const main = (await api.config()).sources.find(source => source.kind === 'main')!;
  const content = main
    .content!.replace("  'hk-01':", "  'new-node':")
    .replace('sub.example.net', 'updated.example.net')
    .replace('group {', 'group {\n  fresh { filter: name(new-node) policy: min_last_delay }');
  const reload = await api.replaceConfigSource(main.id, content, `"${main.content_sha256}"`);
  expect((await api.nodes()).nodes.some(node => node.name === 'new-node')).toBe(false);
  expect((await api.providers()).providers.find(provider => provider.id === 'sub-c')?.url_redacted).toContain('sub.example.net');
  await vi.advanceTimersByTimeAsync(1000);
  expect((await api.operation(reload.operation_id)).status).toBe('succeeded');
  const fresh = await api.group('fresh');
  expect(fresh.policy).toEqual({kind: 'urltest', native: 'min_last_delay'});
  expect(fresh.members.map(member => member.name)).toEqual(['new-node']);
  expect((await api.nodes({group_id: fresh.id})).nodes.map(node => node.name)).toEqual(['new-node']);
  expect((await api.providers()).providers.find(provider => provider.id === 'sub-c')?.url_redacted).toContain('updated.example.net');
  const before = await api.config();
  const patch = await api.patchGroup(fresh.id, [{op: 'replace', path: '/policy', value: {kind: 'selector', native: 'fixed(0)'}}], `"${fresh.config_revision}"`);
  if (!('operation_id' in patch)) throw new Error('Expected asynchronous group patch');
  expect(await api.config()).toEqual(before);
  expect((await api.group(fresh.id)).policy).toEqual(fresh.policy);
  await vi.advanceTimersByTimeAsync(1000);
  expect((await api.operation(patch.operation_id)).status).toBe('succeeded');
  expect((await api.group(fresh.id)).policy).toEqual({kind: 'selector', native: 'fixed(0)'});
  expect((await api.config()).sources.find(source => source.id === main.id)?.content).toContain('policy: fixed(0)');
  const again = await api.startReload();
  await vi.advanceTimersByTimeAsync(1000);
  expect((await api.operation(again.operation_id)).status).toBe('succeeded');
  expect((await api.group(fresh.id)).policy.kind).toBe('selector');
});

it('preserves group policies across an unchanged reload', async () => {
  vi.useFakeTimers();
  const api = createMockApi();
  const before = (await api.groups()).map(group => ({id: group.id, policy: group.policy}));
  const controls = (await api.group('skylink')).capabilities;
  const operation = await api.startReload();
  await vi.advanceTimersByTimeAsync(1000);
  expect((await api.operation(operation.operation_id)).status).toBe('succeeded');
  expect((await api.groups()).map(group => ({id: group.id, policy: group.policy}))).toEqual(before);
  expect((await api.group('skylink')).capabilities).toEqual(controls);
});

it('admits AnyTLS share links and retains their protocol through reload', async () => {
  vi.useFakeTimers();
  const api = createMockApi();
  const created = await api.createNode({name: 'anytls-test', link: 'anytls://demo@edge.example.net:443'});
  expect(created.protocol).toBe('anytls');
  const operation = await api.startReload();
  await vi.advanceTimersByTimeAsync(1000);
  expect((await api.operation(operation.operation_id)).status).toBe('succeeded');
  expect((await api.nodes()).nodes.find(node => node.id === created.id)?.protocol).toBe('anytls');
});

it('refuses names the configuration cannot quote instead of altering them', async () => {
  const api = createMockApi();
  const before = (await api.config()).sources.find(source => source.kind === 'main')!.content;
  await expect(api.createNode({name: "O'Reilly", link: 'anytls://demo@edge.example.net:443'})).rejects.toMatchObject({status: 422});
  await expect(api.createProvider({name: "O'Reilly", kind: 'subscription', url: 'https://example.net/sub'})).rejects.toMatchObject({status: 422});
  expect((await api.config()).sources.find(source => source.kind === 'main')!.content).toBe(before);
});

it('activates included groups and rules and rejects an unresolved native include without writing', async () => {
  vi.useFakeTimers();
  const api = createMockApi();
  const config = await api.config();
  const include = config.sources.find(source => source.kind === 'include')!;
  await api.replaceConfigSource(
    include.id,
    'group { included { policy: fixed(0) } }\nrouting { domain(full: example.org) -> included }',
    `\"${include.content_sha256}\"`
  );
  await vi.advanceTimersByTimeAsync(1000);
  const main = (await api.config()).sources.find(source => source.kind === 'main')!;
  const content = 'include { rules.dae }\nrouting { fallback: direct }';
  await api.replaceConfigSource(main.id, content, `\"${main.content_sha256}\"`);
  await vi.advanceTimersByTimeAsync(1000);
  expect((await api.groups()).map(group => group.name)).toEqual(['included']);
  const trace = await api.routingTrace({input: {domain: 'example.org', network: 'tcp', dst_port: 443}, resolve: 'none'});
  expect(trace.evaluations[0]).toMatchObject({decision: 'determinate', outbound: 'included'});
  const current = (await api.config()).sources.find(source => source.id === main.id)!;
  await expect(api.replaceConfigSource(main.id, content.replace('rules.dae', 'missing.dae'), `\"${current.content_sha256}\"`)).rejects.toMatchObject({
    status: 422
  });
  expect((await api.config()).sources.find(source => source.id === main.id)?.content).toBe(content);
});
