import {afterEach, expect, it, vi} from 'vitest';
import {createMockApi} from './mock';
import {outboundUsage, preferredHealth} from './selectors';
import {formatBytes, formatRate} from './u64';
import type {ApiEvent} from './model';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it('exposes Activity figures through the same contract as native servers', async () => {
  const api = createMockApi();
  const runtime = await api.runtime();
  expect(formatRate(runtime.traffic.rates!.download_bytes_per_second)).toBe('3.4 MB/s');
  expect(formatRate(runtime.traffic.rates!.upload_bytes_per_second)).toBe('257 KB/s');
  expect(runtime.traffic.connections.total).toBe(8);
  const nodes = await api.nodes();
  expect(preferredHealth(nodes.nodes.find(n => n.name === 'hk-01')!)?.latency_ms).toBe(84);
  expect(preferredHealth(nodes.nodes.find(n => n.name === 'jp-01')!)?.state).toBe('unavailable');
  const usage = outboundUsage(await api.connections());
  const direct = usage.rows.find(row => row.name === 'direct')!;
  expect(formatBytes(direct.bytes)).toBe('1.1 GB');
  expect(Math.round(direct.percent!)).toBe(78);
  expect((await api.group('airport')).members).toHaveLength(100);
});
it('pages the airport override without losing members', async () => {
  vi.stubGlobal('localStorage', {getItem: () => '12'});
  const api = createMockApi();
  const first = await api.nodes({group_id: 'airport', limit: 7});
  const second = await api.nodes({group_id: 'airport', cursor: first.next_cursor!, limit: 7});
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
  expect(events.map(e => e.event)).toEqual(['stream.ready']);
  await vi.advanceTimersByTimeAsync(1000);
  await expect(terminal).resolves.toMatchObject({status: 'succeeded', result: {active_generation_id: '40'}});
  expect((await api.runtime()).last_reload).toMatchObject({operation_id: accepted.operation_id, status: 'succeeded'});
  await vi.advanceTimersByTimeAsync(4000);
  expect(events.map(e => e.event)).toEqual(['stream.ready', 'operation.updated', 'runtime.updated', 'runtime.updated']);
  controller.abort();
  await stream;
  await vi.advanceTimersByTimeAsync(5000);
  expect(events.map(e => e.event)).toEqual(['stream.ready', 'operation.updated', 'runtime.updated', 'runtime.updated']);
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
  await expect(api.selectGroup('gaming', {member_id: 'jp-01', network: 'both'})).rejects.toMatchObject({code: 'selection_not_supported'});
  await expect(api.selectGroup('proxy', {member_id: 'missing', network: 'both'})).rejects.toMatchObject({status: 404});
});

it('completes probes with fixture failures and publishes fresh health', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-15T15:00:00Z'));
  const api = createMockApi();
  const before = preferredHealth((await api.nodes()).nodes.find(n => n.id === 'hk-01')!)!;
  const accepted = await api.startProbe({target: {type: 'group', group_id: 'proxy'}, kind: 'tcp_connect', purpose: 'data', warmth: 'warm', transport: ['tcp'], ip_version: 'ipv4', members: 'direct'});
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
  expect(events.slice(-2)).toMatchObject([{event: 'operation.updated', data: {resource_id: suspend.operation_id, status: 'succeeded'}}, {event: 'runtime.updated'}]);
  const resume = await api.startResume();
  const resumed = api.pollOperation(resume);
  expect((await api.runtime()).lifecycle.state).toBe('suspended');
  await vi.advanceTimersByTimeAsync(1000);
  await expect(resumed).resolves.toMatchObject({status: 'succeeded', result: {runtime_state: 'running'}});
  expect((await api.runtime()).lifecycle.state).toBe('running');
  expect(events.slice(-2)).toMatchObject([{event: 'operation.updated', data: {resource_id: resume.operation_id, status: 'succeeded'}}, {event: 'runtime.updated'}]);
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
