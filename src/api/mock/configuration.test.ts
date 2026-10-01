import {afterEach, expect, it, vi} from 'vitest';
import {createMockApi} from './index';
import {capabilities} from './fixtures/capabilities';
import type {Node, OperationAccepted, Provider} from '../model';
import {readGroupEntries, ruleCondition} from '../../dae/groups';
import {geodataPreset} from '../../dae/geodata';
import {ApiError, errorText} from '../error';
import {translate, type Translator} from '../../i18n';

it('returns a translated refusal and structured path for an unmatched new source', async () => {
  const error = await createMockApi()
    .createConfigSource('work.dae', '')
    .then(
      () => null,
      (failure: unknown) => failure as ApiError
    );
  expect(error).toBeInstanceOf(ApiError);
  expect(error?.details).toMatchObject({
    diagnostics: [{code: 'source-not-included', message: 'No include pattern matches work.dae', params: {path: 'work.dae'}}]
  });
  const t: Translator = (key, params) => translate('zh-TW', key, params);
  expect(errorText(error, t)).toBe(t('config.diagnostic.sourceNotIncluded', {path: 'work.dae'}));
});

afterEach(() => vi.useRealTimers());

it('shares accepted routing rules and the mutable DNS cache with tracing', async () => {
  vi.useFakeTimers();
  const api = createMockApi();
  const main = (await api.config()).sources.find(source => source.kind === 'main')!;
  const content = `group { 'edited-group': { policy: fixed(0) } proxy { policy: fixed(0) } auto { policy: fixed(0) } }
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
  await api.replaceConfigSource(main.id, main.content!.replace(/^  fallback:.*$/m, ''), `"${main.content_sha256}"`);
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
  expect((await api.providers()).providers.find(provider => provider.id === 'harbor')?.url_redacted).toContain('sub.example.net');
  await vi.advanceTimersByTimeAsync(1000);
  expect((await api.operation(reload.operation_id)).status).toBe('succeeded');
  const fresh = await api.group((await api.groups()).find(group => group.name === 'fresh')!.id);
  expect(fresh.policy).toEqual({kind: 'urltest', native: 'min_last_delay'});
  expect(fresh.members.map(member => member.name)).toEqual(['new-node']);
  expect((await api.nodes({group_id: fresh.id})).nodes.map(node => node.name)).toEqual(['new-node']);
  expect((await api.providers()).providers.find(provider => provider.id === 'harbor')?.url_redacted).toContain('updated.example.net');
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
  const controls = (await api.group('backup')).capabilities;
  const operation = await api.startReload();
  await vi.advanceTimersByTimeAsync(1000);
  expect((await api.operation(operation.operation_id)).status).toBe('succeeded');
  expect((await api.groups()).map(group => ({id: group.id, policy: group.policy}))).toEqual(before);
  expect((await api.group('backup')).capabilities).toEqual(controls);
});

it('admits AnyTLS share links and retains their protocol through reload', async () => {
  vi.useFakeTimers();
  const api = createMockApi();
  const created = (await api.createNode({name: 'anytls-test', link: 'anytls://demo@edge.example.net:443'})) as Node;
  expect(created.protocol).toBe('anytls');
  const operation = await api.startReload();
  await vi.advanceTimersByTimeAsync(1000);
  expect((await api.operation(operation.operation_id)).status).toBe('succeeded');
  expect((await api.nodes({limit: 1000})).nodes.find(node => node.id === created.id)?.protocol).toBe('anytls');
});

it('refuses names the configuration cannot quote instead of altering them', async () => {
  const api = createMockApi();
  const before = (await api.config()).sources.find(source => source.kind === 'main')!.content;
  await expect(api.createNode({name: "O'Reilly", link: 'anytls://demo@edge.example.net:443'})).rejects.toMatchObject({status: 422});
  await expect(api.createProvider({name: "O'Reilly", kind: 'subscription', url: 'https://example.net/sub'})).rejects.toMatchObject({status: 422});
  expect((await api.config()).sources.find(source => source.kind === 'main')!.content).toBe(before);
});

it('writes subscription options as a block, checks them against create_options and deletes the whole block', async () => {
  const api = createMockApi();
  const main = async () => (await api.config()).sources.find(source => source.kind === 'main')!.content;
  const before = await main();
  const base = {kind: 'subscription', url: 'https://example.net/sub?token=x'} as const;
  for (const invalid of [{update_interval: -1}, {update_interval: 31536001}, {user_agent: ''}, {user_agent: 'a\nb'}]) {
    await expect(api.createProvider({name: 'optioned', ...base, ...invalid})).rejects.toMatchObject({status: 422});
  }
  expect(await main()).toBe(before);
  const created = (await api.createProvider({name: 'optioned', ...base, update_interval: 3600, user_agent: 'clash.meta', cache: false})) as Provider;
  expect(created).toMatchObject({name: 'optioned', url_redacted: 'https://example.net/sub?token=x'});
  expect(await main()).toContain(
    "  optioned: {\n    url: 'https://example.net/sub?token=x'\n    ua: 'clash.meta'\n    interval: '3600s'\n    cache: false\n  }\n"
  );
  await api.deleteProvider(created.id);
  expect(await main()).toBe(before);
});

it('refuses the second of two concurrent replaces made against the same hash', async () => {
  const api = createMockApi();
  const main = (await api.config()).sources.find(source => source.kind === 'main')!;
  const write = (fallback: string) =>
    api.replaceConfigSource(main.id, main.content.replace(/fallback: \S+/, `fallback: ${fallback}`), `"${main.content_sha256}"`);
  const results = await Promise.allSettled([write('direct'), write('block')]);
  expect(results.map(result => result.status)).toEqual(['fulfilled', 'rejected']);
  expect((results[1] as PromiseRejectedResult).reason).toMatchObject({status: 412});
});

it('writes a patched default as the native default key so a later edit of it wins', async () => {
  vi.useFakeTimers();
  const api = createMockApi();
  const before = await api.group('proxy');
  const [first, second] = before.members.filter(member => member.kind === 'node');
  const accepted = await api.patchGroup('proxy', [{op: 'replace', path: '/config/default_member_id', value: first.id}], `"${before.config_revision}"`);
  if (!('operation_id' in accepted)) throw new Error('Expected asynchronous patch');
  await vi.advanceTimersByTimeAsync(1000);
  const main = (await api.config()).sources.find(source => source.kind === 'main')!;
  expect(main.content).toContain(`default: ${first.name}`);
  expect(main.content).not.toMatch(/default_member_id|final_outbound/);
  await api.replaceConfigSource(main.id, main.content.replace(`default: ${first.name}`, `default: ${second.name}`), `"${main.content_sha256}"`);
  await vi.advanceTimersByTimeAsync(1000);
  expect((await api.group('proxy')).config.default_member_id).toBe(second.id);
});

it('traces a negated condition and leaves an unreadable one undecided', async () => {
  vi.useFakeTimers();
  const api = createMockApi();
  const main = (await api.config()).sources.find(source => source.kind === 'main')!;
  const content = `group { proxy { policy: fixed(0) } }
routing { !domain(suffix: telegram.org) -> proxy
  dport(80) && unknown -> proxy
  fallback: direct
}`;
  await api.replaceConfigSource(main.id, content, `"${main.content_sha256}"`);
  await vi.advanceTimersByTimeAsync(1000);
  const trace = (domain: string) => api.routingTrace({input: {domain, network: 'tcp', dst_port: 443}, resolve: 'none'});
  expect((await trace('example.org')).evaluations[0]).toMatchObject({decision: 'determinate', outbound: 'proxy'});
  expect((await trace('api.telegram.org')).evaluations[0]).toMatchObject({decision: 'determinate', outbound: 'direct'});
  const undecided = await api.routingTrace({input: {domain: 'api.telegram.org', network: 'tcp', dst_port: 80}, resolve: 'none'});
  expect(undecided.evaluations[0]).toMatchObject({decision: 'indeterminate', outbound: null});
  expect(undecided.evaluations[0].rules[1].conditions[1]).toMatchObject({expression: 'unknown', result: 'indeterminate'});
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

it('changes nothing, geodata included, when any field of a settings patch is refused', async () => {
  const api = createMockApi();
  const before = await api.runtimeSettings();
  const patch = {geodata: {geosite: {urls: ['https://example.com/geosite.dat']}}, log: {level: 'loud' as never}};
  await expect(api.patchRuntimeSettings(patch)).rejects.toMatchObject({status: 400, code: 'invalid_request'});
  expect(await api.runtimeSettings()).toEqual(before);
});

it('reports the categories the active configuration uses once an edit activates', async () => {
  vi.useFakeTimers();
  const api = createMockApi();
  expect((await api.geodata()).required_codes?.geosite).not.toContain('category-ads-all');
  const main = (await api.config()).sources.find(source => source.kind === 'main')!;
  const content = `group { proxy { policy: fixed(0) } auto { policy: fixed(0) } }
dns { routing { request { fallback: unused } } }
routing { domain(geosite: category-ads-all@ads) -> block
  dip(geoip:private) -> direct
  fallback: block
}`;
  await api.replaceConfigSource(main.id, content, `"${main.content_sha256}"`);
  await vi.advanceTimersByTimeAsync(1000);
  expect((await api.geodata()).required_codes).toEqual({geosite: ['category-ads-all'], geoip: ['private']});
});

it('fails a geodata update whose file lacks a used category the way honk does, keeping the files', async () => {
  vi.useFakeTimers();
  const lite = geodataPreset('metacubex-lite');
  const update = async (api: ReturnType<typeof createMockApi>) => {
    await api.patchRuntimeSettings({geodata: {geosite: {urls: [...lite.urls.geosite]}, geoip: {urls: [...lite.urls.geoip]}}});
    const accepted = await api.updateGeodata();
    await vi.advanceTimersByTimeAsync(1000);
    return api.operation(accepted.operation_id);
  };
  // The regions template needs the full files, so both scenarios refuse the lite preset.
  const healthy = createMockApi();
  const full = await healthy.updateGeodata();
  await vi.advanceTimersByTimeAsync(1000);
  expect((await healthy.operation(full.operation_id)).status).toBe('succeeded');
  expect((await update(healthy)).status).toBe('failed');
  // The faults scenario adds a rule on geosite:category-ads-all, which they lack.
  const api = createMockApi({faults: true});
  const before = (await api.geodata()).assets;
  const operation = await update(api);
  expect(operation.status).toBe('failed');
  expect(operation.error).toMatchObject({
    code: 'geodata_update_failed',
    message: 'Geodata update did not complete successfully',
    details: {stage: 'asset_validation_failed', committed: false}
  });
  const data = await api.geodata();
  expect(data.last_error).toEqual({code: 'asset_validation_failed', message: 'Geodata update did not complete successfully', details: null});
  expect(data.assets).toEqual(before);
});

it('preserves ordinary credentials in a downloaded geodata URL', async () => {
  vi.useFakeTimers();
  const api = createMockApi();
  await api.patchRuntimeSettings({geodata: {geosite: {urls: ['https://example.com/geosite.dat?token=secret']}}});
  const accepted = await api.updateGeodata();
  await vi.advanceTimersByTimeAsync(1000);
  expect((await api.operation(accepted.operation_id)).status).toBe('succeeded');
  const asset = (await api.geodata()).assets.find(item => item.kind === 'geosite')!;
  expect(asset.source_redacted).toBe('https://example.com/geosite.dat?token=secret');
  expect(asset.fetched_url_redacted).toBe('https://example.com/geosite.dat?token=secret');
});

it('creates a source an included file loads, and refuses a write over the body limit', async () => {
  vi.useFakeTimers();
  const api = createMockApi();
  const rules = (await api.config()).sources.find(source => source.kind === 'include')!;
  await api.replaceConfigSource(rules.id, rules.content + '\ninclude { extra.d/*.dae }\n', `"${rules.content_sha256}"`);
  await vi.advanceTimersByTimeAsync(1000);
  await api.createConfigSource('extra.d/more.dae', '');
  await vi.advanceTimersByTimeAsync(1000);
  expect((await api.config()).sources.some(source => source.path.endsWith('/extra.d/more.dae'))).toBe(true);
  const big = '#'.repeat(70000);
  await expect(api.createConfigSource('extra.d/big.dae', big)).rejects.toMatchObject({status: 413, code: 'request_too_large'});
  const current = (await api.config()).sources.find(source => source.id === rules.id)!;
  await expect(api.replaceConfigSource(rules.id, big, `"${current.content_sha256}"`)).rejects.toMatchObject({status: 413});
  expect((await api.config()).sources.some(source => source.path.endsWith('/extra.d/big.dae'))).toBe(false);
});

it('resolves a nested include from the main directory, as honk does, when creating a source', async () => {
  vi.useFakeTimers();
  const api = createMockApi();
  // The fixture's main source loads config.d/*.dae; this file there includes lab/*.dae.
  await api.createConfigSource('config.d/lab.dae', "include { 'lab/*.dae' }\n");
  await vi.advanceTimersByTimeAsync(1000);
  await expect(api.createConfigSource('config.d/lab/a.dae', '')).rejects.toMatchObject({status: 422, code: 'unsupported_value'});
  await api.createConfigSource('lab/a.dae', 'group { nested { policy: fixed(0) } }\n');
  await vi.advanceTimersByTimeAsync(1000);
  expect((await api.config()).sources.some(source => source.path.endsWith('/etc/honk/lab/a.dae'))).toBe(true);
  expect((await api.groups()).map(group => group.name)).toContain('nested');
});

it('creates one source when two creates of the same path race', async () => {
  vi.useFakeTimers();
  const api = createMockApi();
  const results = await Promise.allSettled([api.createConfigSource('config.d/a.dae', ''), api.createConfigSource('config.d/a.dae', '')]);
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.find(result => result.status === 'rejected')).toMatchObject({reason: {status: 409, code: 'state_conflict'}});
  await vi.advanceTimersByTimeAsync(1000);
  expect((await api.config()).sources.filter(source => source.path.endsWith('/config.d/a.dae'))).toHaveLength(1);
});

it('refuses a create past the advertised max_sources', async () => {
  vi.useFakeTimers();
  const api = createMockApi();
  const max = (await api.capabilities()).resources.config.max_sources!;
  for (let count = (await api.config()).sources.length; count < max; count++) await api.createConfigSource(`config.d/s${count}.dae`, '');
  await expect(api.createConfigSource('config.d/over.dae', '')).rejects.toMatchObject({status: 413, code: 'request_too_large'});
  await vi.advanceTimersByTimeAsync(1000);
  expect((await api.config()).sources).toHaveLength(max);
});
it('answers node and provider writes with an operation when asked to', async () => {
  vi.useFakeTimers();
  const api = createMockApi({acceptWrites: true});
  const accepted = await api.createNode({name: 'queued-node', link: 'anytls://demo@edge.example.net:443'});
  expect(accepted).toMatchObject({kind: 'node_create', status: 'queued'});
  await vi.advanceTimersByTimeAsync(1000);
  const operation = await api.operation((accepted as OperationAccepted).operation_id);
  expect(operation).toMatchObject({kind: 'node_create', status: 'succeeded', result: {name: 'queued-node', protocol: 'anytls'}});
});

it.each([
  [ruleCondition('domainKeyword', 'tracker, ads, ad:slot')!, ['api.tracker.example', 'api.ads.example', 'api.ad:slot.example']],
  [`domain(keyword: 'track,er', keyword: "ad:slot")`, ['api.track,er.example', 'api.ad:slot.example']]
])('round trips %s and detects each keyword match in a routing trace', async (condition, domains) => {
  vi.useFakeTimers();
  const api = createMockApi();
  const main = (await api.config()).sources.find(source => source.kind === 'main')!;
  const content = `routing {
  ${condition} -> block
  fallback: direct
}`;
  const accepted = await api.replaceConfigSource(main.id, content, `"${main.content_sha256}"`);
  await vi.advanceTimersByTimeAsync(1000);
  expect((await api.operation(accepted.operation_id)).status).toBe('succeeded');
  expect((await api.rules()).rules[0].expression).toBe(condition);
  expect((await api.config()).sources.find(source => source.id === main.id)?.content).toBe(content);
  for (const domain of [...domains, 'example.org', 'api.track.example', 'api.er.example', 'api.ad.example']) {
    const outbound = domains.includes(domain) ? 'block' : 'direct';
    const trace = await api.routingTrace({input: {network: 'tcp', domain, dst_ip: '192.0.2.1', dst_port: 443}, resolve: 'none'});
    expect(trace.evaluations[0]).toMatchObject({decision: 'determinate', outbound});
  }
});

it('reports group body errors before a stale revision and requires a source precondition before body limits', async () => {
  const api = createMockApi();
  const group = (await api.groups())[0];
  await expect(api.patchGroup(group.id, [], '"stale"')).rejects.toMatchObject({status: 400});
  await expect(
    api.patchGroup(
      group.id,
      Array.from({length: 33}, () => ({op: 'remove', path: '/config/check_url'})),
      '"stale"'
    )
  ).rejects.toMatchObject({status: 413});
  const main = (await api.config()).sources.find(source => source.kind === 'main')!;
  await expect(api.replaceConfigSource(main.id, 'x'.repeat(70000), '')).rejects.toMatchObject({status: 428});
});

it.each(['main', 'include'])('patches the effective duplicate in %s without changing the earlier declaration or ID', async location => {
  vi.useFakeTimers();
  const api = createMockApi();
  const main = (await api.config()).sources.find(source => source.kind === 'main')!;
  const earlier = 'dup { filter: name(hk-01) policy: fixed(0) final: block tolerance: 11 }';
  const effective = 'group { dup { filter: name(hk-02) policy: fixed(0) final: direct tolerance: 22 } }';
  const content = `node {
  'hk-01': 'socks5://127.0.0.1:1081'
  'hk-02': 'socks5://127.0.0.1:1082'
}
group { ${earlier} }
${location === 'main' ? effective : 'include { config.d/*.dae }'}
routing { fallback: dup }`;
  await api.replaceConfigSource(main.id, content, `"${main.content_sha256}"`);
  await vi.advanceTimersByTimeAsync(1000);
  if (location === 'include') {
    await api.createConfigSource('config.d/groups.dae', effective);
    await vi.advanceTimersByTimeAsync(1000);
  }
  const before = (await api.groups()).find(group => group.name === 'dup')!;
  expect(await api.group(before.id)).toMatchObject({config: {final_outbound: 'direct', tolerance: 22}});
  const operation = await api.patchGroup(
    before.id,
    [
      {op: 'replace', path: '/config/final_outbound', value: 'block'},
      {op: 'replace', path: '/config/tolerance', value: 33}
    ],
    `"${before.config_revision}"`
  );
  await vi.advanceTimersByTimeAsync(1000);
  expect((await api.operation((operation as OperationAccepted).operation_id)).status).toBe('succeeded');
  expect(await api.group(before.id)).toMatchObject({id: before.id, config: {final_outbound: 'block', tolerance: 33}, members: [{name: 'hk-02'}]});
  const written = (await api.config()).sources.find(source => source.id === main.id)!.content;
  expect(written).toContain(earlier);
  const target = location === 'main' ? written : (await api.config()).sources.find(source => source.path.endsWith('/groups.dae'))!.content;
  expect(readGroupEntries(target).at(-1)?.final).toBe('block');
});

it('checks global write admission before headers, but source permissions after headers and body limits', async () => {
  const api = createMockApi();
  const readonly = (await api.config()).sources.find(source => !source.writable)!;
  await expect(api.replaceConfigSource(readonly.id, '', '')).rejects.toMatchObject({status: 428});
  await expect(api.replaceConfigSource(readonly.id, 'x'.repeat(70000), '"stale"')).rejects.toMatchObject({status: 413});
  await expect(api.replaceConfigSource(readonly.id, '', '"stale"')).rejects.toMatchObject({status: 403});
  const writable = capabilities.resources.config.writable;
  try {
    capabilities.resources.config.writable = false;
    await expect(api.replaceConfigSource(readonly.id, 'x'.repeat(70000), '')).rejects.toMatchObject({status: 403});
  } finally {
    capabilities.resources.config.writable = writable;
  }
});
