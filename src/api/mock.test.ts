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
  expect((await api.flow('flow-1')).trace.steps.map(s => s.stage)).toEqual(['input', 'route', 'datapath', 'dial_mode', 'dns', 'reroute', 'outbound', 'connection']);
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
  await vi.advanceTimersByTimeAsync(4000);
  expect(events.map(e => e.event)).toEqual(['stream.ready', 'runtime.updated']);
  controller.abort();
  await stream;
  await vi.advanceTimersByTimeAsync(5000);
  expect(events.map(e => e.event)).toEqual(['stream.ready', 'runtime.updated']);
});
