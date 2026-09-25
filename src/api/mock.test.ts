import {afterEach, expect, it, vi} from 'vitest';
import {createMockApi} from './mock';
import {chainLabel, ipLiteral, outboundUsage, preferredHealth, sourceIp} from './selectors';
import {addU64} from './u64';
import type {ApiEvent} from './model';
import {connectionFixtures, trafficHistory} from './mock/fixtures';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('validates and enumerates quoted hashes without treating them as comments', async () => {
  vi.useFakeTimers();
  const api = createMockApi();
  const main = (await api.config()).sources.find(source => source.kind === 'main')!;
  const content = "routing {\n  pname('foo#bar') -> direct # trailing comment\n  fallback: direct\n}";
  expect((await api.validateConfig({mode: 'full', sources: [{id: main.id, content}]})).valid).toBe(true);
  const accepted = await api.replaceConfigSource(main.id, content, `"${main.content_sha256}"`);
  await vi.advanceTimersByTimeAsync(1000);
  expect((await api.operation(accepted.operation_id)).status).toBe('succeeded');
  expect((await api.rules()).rules.find(rule => rule.expression === "pname('foo#bar')")).toMatchObject({outbound: 'direct', must: false});
  const invalid = "routing {\n  pname('foo#bar') -> missing # trailing comment\n}";
  const check = await api.validateConfig({mode: 'full', sources: [{id: main.id, content: invalid}]});
  expect(check.diagnostics).toContainEqual(expect.objectContaining({code: 'unknown_outbound', line: 2, column: 23}));
});

it('serves cumulative outbound counters independently of live connection bytes', async () => {
  const api = createMockApi();
  const runtime = await api.runtime();
  const counters = await api.runtimeOutbounds();
  const history = await api.trafficHistory();
  expect(counters.counter_since).toBe(runtime.traffic.counter_since);
  expect(Date.parse(counters.counter_since)).toBeLessThan(Date.parse(counters.observed_at));
  expect(addU64(...counters.outbounds.map(r => r.download_bytes))).toBe(BigInt(runtime.traffic.bytes.download!));
  expect(addU64(...counters.outbounds.map(r => r.upload_bytes))).toBe(BigInt(runtime.traffic.bytes.upload!));
  expect(counters.outbounds.find(r => r.name === 'block')).toMatchObject({
    kind: 'builtin',
    active_connections: 0,
    upload_bytes: '0',
    download_bytes: '0',
    errors: '0'
  });
  for (const row of counters.outbounds) {
    expect(BigInt(row.total_connections)).toBeGreaterThanOrEqual(BigInt(row.active_connections));
    expect(BigInt(row.errors)).toBeGreaterThanOrEqual(0n);
  }
  const live = await api.connections();
  const active = [...live.tcp, ...live.udp].filter(row => row.state === 'active');
  expect(active.length).toBe(53);
  expect(new Set(active.map(row => sourceIp(row.src))).size).toBeGreaterThanOrEqual(5);
  expect(new Set(active.map(row => row.domain)).size).toBeGreaterThanOrEqual(40);
  expect(new Set(active.map(row => row.pname).filter(Boolean)).size).toBeGreaterThanOrEqual(5);
  expect(runtime.traffic.connections).toEqual({
    tcp: live.tcp.filter(row => row.state === 'active').length,
    udp: live.udp.filter(row => row.state === 'active').length,
    total: active.length
  });
  expect(counters.outbounds.reduce((sum, row) => sum + row.active_connections, 0)).toBe(active.length);
  const near = (a: string | null, b: string | null) => a !== null && b !== null && Math.abs(Number(a) / Number(b) - 1) <= 0.16;
  expect(near(runtime.traffic.rates!.upload_bytes_per_second, String(active.reduce((sum, row) => sum + Number(row.upload_bytes_per_second), 0)))).toBe(true);
  expect(near(runtime.traffic.rates!.download_bytes_per_second, String(active.reduce((sum, row) => sum + Number(row.download_bytes_per_second), 0)))).toBe(
    true
  );
  expect(outboundUsage(counters).total).not.toBe(addU64(...[...live.tcp, ...live.udp].map(c => c.download_bytes)));
  // The live sample continues the ring: sampled now, rates within a swell of the ring's last point.
  expect(Date.parse(runtime.traffic.sampled_at!)).toBeGreaterThanOrEqual(Date.parse(history.samples.at(-1)!.sampled_at));
  expect(runtime.traffic.connections.total).toBe(history.samples.at(-1)?.connections);
  expect(near(runtime.traffic.rates!.download_bytes_per_second, history.samples.at(-1)!.download_bytes_per_second!)).toBe(true);
  expect(near(runtime.traffic.rates!.upload_bytes_per_second, history.samples.at(-1)!.upload_bytes_per_second!)).toBe(true);
});

it('keeps the fuller demo history, cache and rankings internally consistent', async () => {
  const api = createMockApi();
  const [dns, cache, nodes, flows, rules, memory] = await Promise.all([
    api.dnsLog({limit: 500}),
    api.dnsCache(),
    api.nodes(),
    api.flows(),
    api.rules(),
    api.runtimeMemory()
  ]);
  expect(dns.total).toBeGreaterThan(450);
  expect(dns.records).toHaveLength(dns.total);
  expect(Date.parse(dns.records[0].observed_at) - Date.parse(dns.records.at(-1)!.observed_at)).toBeGreaterThan(4 * 3600 * 1000);
  expect(new Set(dns.records.map(record => record.question.name)).size).toBeGreaterThan(30);
  expect(new Set(dns.records.map(record => sourceIp(record.src!))).size).toBeGreaterThanOrEqual(7);
  expect(dns.records.filter(record => record.cached).length).toBeGreaterThan(100);
  expect(dns.records.filter(record => !record.cached && record.status === 'NOERROR').length).toBeGreaterThan(100);
  expect(dns.records.filter(record => record.status === 'NXDOMAIN').length).toBeGreaterThan(10);
  expect(dns.records.filter(record => record.status === 'REFUSED').length).toBeGreaterThan(3);
  expect(cache.total).toBe(cache.entries.length);
  expect(cache.usage?.entries).toBe(String(cache.total));
  expect(Number(cache.usage?.entry_capacity)).toBeGreaterThan(cache.total);
  for (const record of dns.records.filter(record => record.cached)) {
    const entry = cache.entries.find(entry => entry.domain === record.question.name && entry.type === record.question.type);
    expect(entry).toBeDefined();
    expect(record.status).toBe(entry!.status);
    expect(record.answers).toEqual(entry!.answers ?? []);
  }
  expect(nodes.nodes.length).toBeGreaterThan(120);
  expect(nodes.nodes.filter(node => node.health.some(sample => sample.latency_ms !== null)).length).toBeGreaterThan(110);
  expect(flows.flows.length).toBeGreaterThan(190);
  const knownRules = new Set(rules.rules.map(rule => rule.rule_id));
  expect(new Set(flows.flows.map(flow => flow.rule_id).filter(id => id && knownRules.has(id))).size).toBeGreaterThanOrEqual(3);
  for (const window_seconds of [120, 600, 3600, 21600, 86400, 604800]) {
    const [traffic, usage] = await Promise.all([api.trafficHistory({window_seconds}), api.memoryHistory({window_seconds})]);
    expect(traffic.samples.length).toBeGreaterThan(2);
    expect(usage.samples.length).toBeGreaterThan(2);
    expect(traffic.samples.at(-1)!.connections).toBe((await api.runtime()).traffic.connections.total);
    expect(Math.abs(Number(usage.samples.at(-1)!.rss_bytes) - Number(memory.process!.rss_bytes))).toBeLessThan(100000);
    expect(Math.abs(Number(usage.samples.at(-1)!.cgroup_current_bytes) - Number(memory.cgroup!.current_bytes))).toBeLessThan(100000);
  }
  const logRecords: Array<{level: string; ts: string}> = [];
  const logController = new AbortController();
  const logStream = api.subscribeLogs({level: 'trace', signal: logController.signal, onRecord: record => logRecords.push(record)});
  logController.abort();
  await logStream;
  expect(logRecords.length).toBeGreaterThan(300);
  expect(new Set(logRecords.map(record => record.level))).toEqual(new Set(['trace', 'debug', 'info', 'warn', 'error']));
  expect(Date.parse(logRecords.at(-1)!.ts) - Date.parse(logRecords[0].ts)).toBeGreaterThan(3 * 3600 * 1000);
  const eventRecords: ApiEvent[] = [];
  const eventController = new AbortController();
  const eventStream = api.subscribeEvents({signal: eventController.signal, onEvent: event => eventRecords.push(event)});
  eventController.abort();
  await eventStream;
  expect(eventRecords.length).toBeGreaterThan(25);
  for (const kind of ['flow.updated', 'flow.gap', 'operation.updated', 'generation.changed', 'runtime.updated'])
    expect(eventRecords.map(event => event.event)).toContain(kind);
});

it('advances the traffic history with the clock and keeps the samples it already served', async () => {
  const api = createMockApi();
  const before = await api.trafficHistory({window_seconds: 3600});
  vi.useFakeTimers({now: Date.now() + 600000});
  for (const window_seconds of [120, 21600]) {
    const history = await api.trafficHistory({window_seconds});
    expect(Date.now() - Date.parse(history.samples.at(-1)!.sampled_at)).toBeLessThan(history.sampled_every_seconds * 1000);
    expect(Date.now() - Date.parse(history.samples[0].sampled_at)).toBeGreaterThanOrEqual((window_seconds - history.sampled_every_seconds) * 1000);
  }
  const after = await api.trafficHistory({window_seconds: 3600});
  const served = new Map(before.samples.map(sample => [sample.sampled_at, sample]));
  const kept = after.samples.filter(sample => served.has(sample.sampled_at));
  expect(kept.length).toBeGreaterThan(290);
  for (const sample of kept) expect(sample).toEqual(served.get(sample.sampled_at));
});

it('filters the history window before thinning backwards without changing samples', async () => {
  const api = createMockApi();
  const result = await api.trafficHistory({window_seconds: 60, max_points: 4});
  expect(result.window_seconds).toBe(60);
  expect(result.sampled_every_seconds).toBe(20);
  expect(result.samples).toEqual([trafficHistory.samples.at(-5), trafficHistory.samples.at(-3), trafficHistory.samples.at(-1)]);
  const single = await api.trafficHistory({window_seconds: 1, max_points: 1});
  expect(single.samples).toEqual([trafficHistory.samples.at(-1)]);
  expect((await api.trafficHistory({window_seconds: 720})).samples).toHaveLength(72);
  await expect(api.trafficHistory({window_seconds: 604801})).rejects.toMatchObject({status: 400, code: 'invalid_request'});
  await expect(api.trafficHistory({max_points: 361})).rejects.toMatchObject({status: 400, code: 'invalid_request'});
  await expect(api.trafficHistory({max_points: 0})).rejects.toMatchObject({status: 400});
});

it('filters exact source IPs and protocol before computing totals and limiting rows', async () => {
  const api = createMockApi();
  const result = await api.connections({src: '10.0.0.12', limit: 1});
  expect(result).toMatchObject({total_tcp: 1, total_udp: 1, truncated: true, udp: []});
  expect(result.tcp.map(c => c.id)).toEqual(['1']);
  const udp = await api.connections({src: '10.0.0.12', type: 'udp', limit: 1});
  expect(udp).toMatchObject({total_tcp: 0, total_udp: 1, tcp: [], truncated: false});
  expect(udp.udp.map(c => c.id)).toEqual(['5']);
  expect(await api.connections({src: '10.0.0.1'})).toMatchObject({total_tcp: 0, total_udp: 0, tcp: [], udp: [], truncated: false});
  expect(ipLiteral('[2001:0db8::1]')).toBe('2001:db8::1');
  expect(sourceIp('[2001:db8::1]:443')).toBe('2001:db8::1');
  expect(sourceIp('10.0.0.12:443')).toBe('10.0.0.12');
  for (const value of ['api.telegram.org', '256.0.0.1', '10.0.0.12:443', '1.2.3', '2001:::1']) expect(ipLiteral(value)).toBeUndefined();
  await expect(api.connections({src: 'host.invalid'})).rejects.toMatchObject({status: 400});
});

it('limits the large connection snapshot without losing totals or deterministic IDs', async () => {
  vi.stubGlobal('localStorage', {getItem: (key: string) => (key === 'doona-mock-big' ? '100' : null)});
  const fixture = connectionFixtures().connections;
  const generated = [...fixture.tcp, ...fixture.udp].sort((a, b) => a.id.localeCompare(b.id));
  expect(generated.map(row => row.id)).toEqual(Array.from({length: 1200}, (_, i) => 'c-' + String(i + 1).padStart(4, '0')));
  expect(connectionFixtures().connections).toEqual(fixture);
  expect(generated.filter(row => row.flow_id).map(row => row.id)).toEqual(generated.filter((_, i) => (i + 1) % 3 === 0).map(row => row.id));
  const ages = generated.map(row => Date.parse(fixture.observed_at) - Date.parse(row.started_at!));
  expect(Math.min(...ages)).toBe(0);
  expect(Math.max(...ages)).toBe(3597000);
  const api = createMockApi();
  const snapshot = await api.connections({limit: 1000});
  expect(snapshot).toMatchObject({total_tcp: fixture.total_tcp, total_udp: fixture.total_udp, truncated: true});
  expect(snapshot.total_tcp + snapshot.total_udp).toBe(1200);
  expect([...snapshot.tcp, ...snapshot.udp].map(row => row.id)).toEqual([...fixture.tcp, ...fixture.udp].slice(0, 1000).map(row => row.id));
  expect(await api.connections({type: 'udp', limit: 1000})).toMatchObject({
    total_tcp: 0,
    total_udp: fixture.total_udp,
    truncated: false,
    tcp: [],
    udp: fixture.udp
  });
  const linked = snapshot.tcp.find(row => row.flow_id)!;
  expect(await api.flow(linked.flow_id!)).toMatchObject({connection_id: linked.id, started_at: linked.started_at, input: {dst: linked.dst}});
});

it('finds a retained flow by connection ID when the live row has no flow ID', async () => {
  const api = createMockApi();
  const c = (await api.connections()).tcp.find(c => c.id === '3')!;
  expect(c.flow_id).toBeNull();
  const result = await api.flows({connection_id: c.id, limit: 1});
  expect(result.flows.map(f => f.id)).toEqual(['flow-3']);
  expect(result.next_cursor).toBeNull();
  expect((await api.flow(result.flows[0].id)).connection_id).toBe(c.id);
  expect((await api.flows({connection_id: c.id, network: 'udp'})).flows).toEqual([]);
  expect((await api.flows({connection_id: 'missing'})).flows).toEqual([]);
});

it('omits unavailable summary input without losing retained detail evidence', async () => {
  const api = createMockApi();
  const snapshot = await api.flows();
  const summary = snapshot.flows.find(flow => flow.id === 'flow-unobserved')!;
  expect(summary).not.toHaveProperty('input');
  expect(summary).toMatchObject({rule_id: null, rule_expression: null, outbound: null, chain: [], chain_source: 'unknown'});
  expect(BigInt(snapshot.dropped_records!)).toBeGreaterThan(0n);
  const detail = await api.flow(summary.id);
  expect(detail.input.src).toBe('10.0.0.12');
  expect(detail.trace.status).toBe('partial');
  expect((await api.flows()).flows.find(flow => flow.id === summary.id)).not.toHaveProperty('input');
});

it('keeps list decisions consistent with recorded traces rather than current selections', async () => {
  const api = createMockApi();
  await api.selectGroup('proxy', {member_id: 'sg-01', network: 'both'});
  const snapshot = await api.connections();
  const summaries = (await api.flows()).flows;
  for (const c of [...snapshot.tcp, ...snapshot.udp]) {
    const flow = await api.flow(c.state === 'blocked' ? 'flow-blocked' : 'flow-' + c.id);
    const outbound = flow.trace.steps.find(s => s.stage === 'outbound')?.data;
    const route = flow.trace.steps.find(s => s.stage === 'route')!.data;
    const fields = {
      chain: outbound ? [...outbound.selection_path.map(p => p.group_id), outbound.leaf_node_id] : [],
      chain_source: outbound ? 'evaluation' : 'unknown',
      rule_id: route.rule_id,
      rule_expression: route.rules.find(r => r.rule_id === route.rule_id)?.expression,
      rule_source: route.plane === 'kernel' ? 'kernel' : 'recomputed',
      ingress: flow.input.ingress,
      domain_source: flow.input.domain_source
    };
    expect(c).toMatchObject(fields);
    expect(summaries.find(f => f.id === flow.id)).toMatchObject(fields);
    expect(chainLabel(c)).toBe(outbound ? c.chain.join(' → ') : c.outbound);
    if (outbound) {
      expect(outbound.selection_path[0].member_name).toBe(outbound.leaf_node_name);
      expect(outbound.selection_path[0].selection?.candidates[0]).toMatchObject({
        member_name: outbound.leaf_node_name,
        leaf_node_name: outbound.leaf_node_name
      });
    }
  }
  expect(snapshot.tcp[0].chain).toEqual(['proxy', 'hk-01']);
  expect((await api.groups()).find(g => g.id === 'proxy')?.config_revision).toBe((await api.group('proxy')).config_revision);
});

it('ranks the latency column by warmth, measurement and IPv4 before IPv6', async () => {
  const node = (await createMockApi().nodes()).nodes[0];
  const exact = preferredHealth(node)!;
  expect([exact.measurement, exact.warmth]).toEqual(['tcp_connect', 'warm']);
  const headers = {...exact, measurement: 'http_headers' as const, warmth: 'unknown' as const};
  const roundTrip = {...exact, measurement: 'http_round_trip' as const};
  const cold = {...exact, warmth: 'cold' as const};
  const others = [
    {...exact, purpose: 'dns' as const},
    {...exact, transport: 'udp' as const}
  ];
  const v6 = {...exact, ip_version: 'ipv6' as const};
  expect(preferredHealth({...node, health: others})).toBeUndefined();
  // honk's periodic probe: HTTP headers over a session of unknown warmth is still a TCP data measurement.
  expect(preferredHealth({...node, health: [...others, headers]})).toBe(headers);
  expect(preferredHealth({...node, health: [cold, roundTrip, headers, exact]})).toBe(exact);
  expect(preferredHealth({...node, health: [cold, headers, roundTrip]})).toBe(roundTrip);
  expect(preferredHealth({...node, health: [...others, v6]})).toBe(v6);
  expect(preferredHealth({...node, health: [v6, exact]})).toBe(exact);
});
it('pages the airport override without losing members', async () => {
  vi.stubGlobal('localStorage', {getItem: () => '12'});
  const api = createMockApi();
  const first = await api.nodes({group_id: 'skylink', limit: 7});
  const second = await api.nodes({group_id: 'skylink', cursor: first.next_cursor!, limit: 7});
  expect(new Set([...first.nodes, ...second.nodes].map(n => n.id)).size).toBe(12);
  expect(second.next_cursor).toBeNull();
});
it('advances reload operations and emits invalidations until aborted', async () => {
  vi.useFakeTimers();
  const api = createMockApi();
  const accepted = await api.startReload();
  expect(accepted.status).toBe('queued');
  expect((await api.operation(accepted.operation_id)).status).toBe('running');
  const terminal = api.pollOperation(accepted);
  const controller = new AbortController();
  const events: ApiEvent[] = [];
  const stream = api.subscribeEvents({signal: controller.signal, onEvent: event => events.push(event)});
  expect(events[0].event).toBe('stream.ready');
  expect(events.map(e => e.event)).toContain('flow.gap');
  const baseline = events.length;
  await vi.advanceTimersByTimeAsync(1000);
  // A reload activates a new generation: the result names it and generation.changed is published.
  await expect(terminal).resolves.toMatchObject({status: 'succeeded', result: {active_generation_id: '41'}});
  expect((await api.runtime()).last_reload).toMatchObject({operation_id: accepted.operation_id, status: 'succeeded'});
  expect((await api.runtime()).generation.active_id).toBe('41');
  await vi.advanceTimersByTimeAsync(4000);
  expect(events.slice(baseline).map(e => e.event)).toEqual(['generation.changed', 'operation.updated', 'runtime.updated', 'runtime.updated']);
  controller.abort();
  await stream;
  await vi.advanceTimersByTimeAsync(5000);
  expect(events.slice(baseline).map(e => e.event)).toEqual(['generation.changed', 'operation.updated', 'runtime.updated', 'runtime.updated']);
});

it('selects both networks with an independent revision and preserves configuration', async () => {
  const api = createMockApi();
  const before = await api.group('proxy');
  const first = await api.selectGroup('proxy', {member_id: 'sg-01', network: 'both'});
  const selected = await api.group('proxy');
  expect(selected.runtime.selection).toMatchObject({tcp: {member_id: 'sg-01'}, udp: {member_id: 'sg-01'}});
  expect(selected.config_revision).toBe(before.config_revision);
  const second = await api.selectGroup('proxy', {member_id: 'hk-02', network: 'udp'});
  expect(BigInt(second.selection_revision)).toBeGreaterThan(BigInt(first.selection_revision));
  expect((await api.group('proxy')).runtime.selection).toMatchObject({tcp: {member_id: 'sg-01'}, udp: {member_id: 'hk-02'}});
  // An automatic group takes the pick as a pin and hands it back on clear.
  const pinned = await api.selectGroup('gaming', {member_id: 'jp-01', network: 'both'});
  expect(pinned).toMatchObject({member_id: 'jp-01', source: 'override'});
  expect((await api.group('gaming')).runtime.selection.tcp).toMatchObject({member_id: 'jp-01', source: 'override'});
  const released = await api.clearGroupOverride('gaming', 'both');
  expect(released).toMatchObject({network: 'both', selection: {tcp: {member_id: 'hk-02', source: 'policy'}, udp: {member_id: 'hk-02', source: 'policy'}}});
  expect((await api.group('gaming')).runtime.selection.udp).toMatchObject({member_id: 'hk-02', source: 'policy'});
  await expect(api.clearGroupOverride('proxy', 'both')).rejects.toMatchObject({code: 'state_conflict'});
  await expect(api.selectGroup('proxy', {member_id: 'missing', network: 'both'})).rejects.toMatchObject({status: 404});
});

it('completes probes with fixture failures and publishes fresh health', async () => {
  vi.useFakeTimers();
  const api = createMockApi();
  const before = preferredHealth((await api.nodes()).nodes.find(n => n.id === 'hk-01')!)!;
  vi.setSystemTime(Date.parse(before.observed_at) + 1000);
  const accepted = await api.startProbe({
    target: {type: 'group', group_id: 'proxy'},
    kind: 'tcp_connect',
    purpose: 'data',
    warmth: 'warm',
    transport: ['tcp'],
    ip_version: 'ipv4',
    members: 'direct'
  });
  const terminal = api.pollOperation(accepted);
  await vi.advanceTimersByTimeAsync(999);
  expect((await api.operation(accepted.operation_id)).status).toBe('running');
  await vi.advanceTimersByTimeAsync(1);
  const result = await terminal;
  if (result.status !== 'succeeded' || result.kind !== 'probe') throw new Error('Probe did not succeed');
  expect(result.result.results.find(r => r.member_id === 'jp-01')).toMatchObject({state: 'unavailable', latency_ms: null, error: 'timeout'});
  expect(result.result.results.find(r => r.member_id === 'hk-01')).toMatchObject({state: 'healthy', latency_ms: 84, health_updated: true});
  expect(result.result.results.find(r => r.member_id === 'resilient')).toMatchObject({resolved_leaf_node_id: 'sg-01', state: 'healthy', latency_ms: 63});
  const health = preferredHealth((await api.nodes()).nodes.find(n => n.id === 'hk-01')!)!;
  expect(Date.parse(health.observed_at)).toBeGreaterThan(Date.parse(before.observed_at));
  expect(health.latency_ms).toBe(84);
  expect(result.result.selection_after).toEqual(result.result.selection_before);
});

it('applies a conditional patch asynchronously and revises interrupted flows', async () => {
  vi.useFakeTimers();
  const api = createMockApi();
  const before = await api.group('proxy');
  const flow = await api.flow('flow-1');
  const counters = await api.runtimeOutbounds();
  const accepted = await api.patchGroup('proxy', [{op: 'replace', path: '/config/interrupt_connections', value: true}], '\"' + before.config_revision + '\"');
  if (!('operation_id' in accepted)) throw new Error('Expected asynchronous patch');
  expect((await api.group('proxy')).config.interrupt_connections).toBe(false);
  const terminal = api.pollOperation(accepted);
  await vi.advanceTimersByTimeAsync(1000);
  await expect(terminal).resolves.toMatchObject({kind: 'group_update', status: 'succeeded'});
  const changed = await api.group('proxy');
  expect(changed.config.interrupt_connections).toBe(true);
  expect(changed.config_revision).not.toBe(before.config_revision);
  await expect(api.patchGroup('proxy', [], '\"' + before.config_revision + '\"')).rejects.toMatchObject({status: 412});
  const selection = await api.selectGroup('proxy', {member_id: 'sg-01', network: 'both'});
  expect(selection.connections_interrupted).toBe(true);
  const after = await api.flow('flow-1');
  expect(after.revision).toBe(flow.revision + 1);
  expect(after.state).toBe('closed');
  expect(after.trace.steps.at(-1)).toMatchObject({stage: 'connection', data: {state: 'closed', milestone: 'terminal'}});
  expect((await api.connections()).tcp.find(c => c.id === after.connection_id)?.state).toBe('closed');
  expect((await api.flow('flow-2')).state).toBe('active');
  const afterCounters = await api.runtimeOutbounds();
  const beforeProxy = counters.outbounds.find(r => r.name === 'proxy')!;
  expect(afterCounters.counter_since).toBe(counters.counter_since);
  expect(afterCounters.outbounds.find(r => r.name === 'proxy')).toEqual({...beforeProxy, active_connections: 0});
});

it('links recorded connections while retaining a blocked flow without a connection', async () => {
  const api = createMockApi();
  const connections = await api.connections();
  for (const c of [...connections.tcp, ...connections.udp]) if (c.flow_id) expect((await api.flow(c.flow_id)).connection_id).toBe(c.id);
  const proxy = await api.flow('flow-1');
  expect(proxy.trace.status).toBe('complete');
  expect(proxy.trace.steps.find(s => s.stage === 'outbound')).toMatchObject({data: {selection_path: [{group_id: 'proxy', member_id: 'hk-01'}]}});
  expect((await api.flow('flow-2')).trace).toMatchObject({status: 'partial', missing: ['not_instrumented']});
  const blocked = await api.flow('flow-blocked');
  expect(blocked).toMatchObject({state: 'blocked', connection_id: null});
  expect(blocked.trace.steps.some(s => s.stage === 'outbound' || s.stage === 'connection')).toBe(false);
});

it('changes lifecycle only after suspend and resume complete, then invalidates runtime', async () => {
  vi.useFakeTimers();
  const api = createMockApi();
  const controller = new AbortController();
  const events: ApiEvent[] = [];
  const stream = api.subscribeEvents({signal: controller.signal, onEvent: event => events.push(event)});
  const suspend = await api.startSuspend();
  const suspended = api.pollOperation(suspend);
  await vi.advanceTimersByTimeAsync(999);
  expect((await api.runtime()).lifecycle.state).toBe('running');
  await vi.advanceTimersByTimeAsync(1);
  await expect(suspended).resolves.toMatchObject({status: 'succeeded', result: {runtime_state: 'suspended'}});
  expect((await api.runtime()).lifecycle.state).toBe('suspended');
  expect(events.slice(-2)).toMatchObject([
    {event: 'operation.updated', data: {resource_id: suspend.operation_id, status: 'succeeded'}},
    {event: 'runtime.updated'}
  ]);
  const resume = await api.startResume();
  const resumed = api.pollOperation(resume);
  expect((await api.runtime()).lifecycle.state).toBe('suspended');
  await vi.advanceTimersByTimeAsync(1000);
  await expect(resumed).resolves.toMatchObject({status: 'succeeded', result: {runtime_state: 'running'}});
  expect((await api.runtime()).lifecycle.state).toBe('running');
  expect(events.slice(-2)).toMatchObject([
    {event: 'operation.updated', data: {resource_id: resume.operation_id, status: 'succeeded'}},
    {event: 'runtime.updated'}
  ]);
  controller.abort();
  await stream;
});

it('deletes entries idempotently and flushes exactly the remaining cache', async () => {
  const api = createMockApi();
  const before = await api.dnsCache();
  const entry = before.entries[0];
  expect((await api.dnsQuery(entry.domain, [entry.type])).results[0]).toMatchObject({cached: true, cache_entry_id: entry.entry_id});
  await expect(api.deleteDnsEntry(entry.entry_id)).resolves.toEqual({deleted: 1});
  await expect(api.deleteDnsEntry(entry.entry_id)).resolves.toEqual({deleted: 0});
  expect((await api.dnsQuery(entry.domain, [entry.type])).results[0]).toMatchObject({cached: false, cache_entry_id: null, upstream: 'udp://192.0.2.53'});
  await expect(api.flushDnsCache()).resolves.toEqual({matched: before.total - 1, deleted: before.total - 1});
  expect((await api.dnsCache()).entries).toEqual([]);
  await expect(api.flushDnsCache()).resolves.toEqual({matched: 0, deleted: 0});
  expect((await createMockApi().dnsCache()).total).toBe(before.total);
});

it('traces a geosite domain and resolves each cached address in live mode', async () => {
  const api = createMockApi();
  const request = {input: {network: 'tcp' as const, domain: 'api.telegram.org', dst_port: 443}, resolve: 'live' as const};
  const result = await api.routingTrace(request);
  expect(result.dns).toMatchObject([{source: 'cache', addresses: ['149.154.167.220']}]);
  expect(result.evaluations).toMatchObject([{dst_ip: '149.154.167.220', decision: 'determinate', outbound: 'proxy', missing_inputs: []}]);
  expect(result.evaluations[0].rules.map(r => [r.rule_id, r.result])).toEqual([
    ['r1', 'not_matched'],
    ['r2', 'not_matched'],
    ['r3', 'not_matched'],
    ['r4', 'not_matched'],
    ['r5', 'matched'],
    ['r6', 'skipped'],
    ['r7', 'skipped'],
    ['r8', 'skipped'],
    ['fallback', 'skipped']
  ]);
  const unresolved = await api.routingTrace({...request, resolve: 'none'});
  expect(unresolved.dns).toEqual([]);
  expect(unresolved.evaluations[0]).toMatchObject({dst_ip: null, decision: 'indeterminate', outbound: null, missing_inputs: ['dst_ip']});
});

it('keeps domain rules indeterminate for destination-IP-only input', async () => {
  const result = await createMockApi().routingTrace({input: {network: 'tcp', dst_ip: '198.51.100.20', dst_port: 443}, resolve: 'none'});
  const evaluation = result.evaluations[0];
  expect(evaluation).toMatchObject({decision: 'indeterminate', outbound: null});
  expect(evaluation.missing_inputs).toContain('domain');
  expect(evaluation.rules.find(r => r.rule_id === 'r1')).toMatchObject({result: 'indeterminate', missing_inputs: ['domain']});
  expect(evaluation.rules.find(r => r.rule_id === 'r2')).toMatchObject({result: 'not_matched', missing_inputs: []});
});

it('uses fallback when every earlier predicate is false', async () => {
  const result = await createMockApi().routingTrace({input: {network: 'tcp', domain: 'example.org', dst_ip: '2001:db8::1', dst_port: 443}, resolve: 'none'});
  const evaluation = result.evaluations[0];
  expect(evaluation).toMatchObject({decision: 'determinate', outbound: 'resilient', missing_inputs: []});
  expect(evaluation.rules.slice(0, -1).every(r => r.result === 'not_matched')).toBe(true);
  expect(evaluation.rules.at(-1)).toMatchObject({rule_id: 'fallback', result: 'matched'});
});

it('serves the base profile from storage and refuses its unavailable resources', async () => {
  vi.stubGlobal('localStorage', {getItem: (key: string) => (key === 'doona-mock-profile' ? 'base' : null)});
  try {
    const base = await createMockApi().capabilities();
    expect(base.profiles).toEqual(['base']);
    expect(base.resources.runtime_outbounds.available).toBe(false);
    expect(base.resources.traffic_history.available).toBe(false);
    await expect(createMockApi().runtimeOutbounds()).rejects.toMatchObject({status: 404});
    await expect(createMockApi().trafficHistory()).rejects.toMatchObject({status: 404});
  } finally {
    vi.unstubAllGlobals();
  }
});
