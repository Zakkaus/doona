import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {createMockApi} from '../../mock';
import type {Api} from '../api/api';
import {actionCell} from './action';
import {useNodeProbe} from './nodes';
import {capabilities} from '../../mock/fixtures';
import {deferred} from './testHelpers';

const state = vi.hoisted(() => ({api: null as unknown as Api, cell: null as unknown as ReturnType<typeof actionCell>}));
vi.mock('react', async original => ({...(await original<typeof import('react')>()), useCallback: (callback: unknown) => callback}));
vi.mock('../api/index', () => ({getApi: () => state.api}));
vi.mock('./runtime', () => ({useCapabilities: () => ({data: capabilities})}));
vi.mock('./probeOptions', async original => ({
  ...(await original<typeof import('./probeOptions')>()),
  useProbeOptions: () => ({choice: 'dns_udp', family: 'ipv6', cold: true, leaves: true})
}));
vi.mock('./action', async original => ({
  ...(await original<typeof import('./action')>()),
  useAction: () => ({
    ...state.cell.snapshot(),
    cancel: state.cell.cancel,
    run: <T>(kind: string, action: (signal: AbortSignal) => Promise<T>) => state.cell.run(kind, action, true)
  })
}));
beforeEach(() => {
  vi.useFakeTimers();
  state.api = createMockApi();
  state.cell = actionCell(state.api);
});
afterEach(() => vi.useRealTimers());

it('tests all nodes with default options and no more than four operations in flight, including failures', async () => {
  const nodes = (await state.api.nodes({limit: 10})).nodes;
  const start = state.api.startProbe;
  const poll = state.api.pollOperation;
  let active = 0,
    maximum = 0;
  state.api.startProbe = vi.fn(async (request, signal) => {
    expect(request).toMatchObject({kind: 'http', warmth: 'warm', ip_version: 'any'});
    if (request.target.type === 'node' && request.target.node_id === nodes[4].id) throw new Error('refused');
    active++;
    maximum = Math.max(maximum, active);
    return start(request, signal);
  });
  state.api.pollOperation = async (accepted, signal) => {
    const result = await poll(accepted, signal);
    active--;
    return result;
  };
  const progress = vi.fn();
  const probe = useNodeProbe(vi.fn());
  const sent = probe.probeMany(nodes, progress);
  expect(state.api.startProbe).toHaveBeenCalledTimes(4);
  expect(await probe.probe(nodes[0])).toBeUndefined();
  await vi.runAllTimersAsync();
  const result = await sent;
  expect(result?.tested).toBe(nodes.length);
  expect(result?.unavailable).toBeGreaterThanOrEqual(1);
  expect(maximum).toBe(4);
  expect(active).toBe(0);
  expect(progress.mock.calls.map(([done]) => done)).toEqual(nodes.map((_, index) => index + 1));
  expect(state.api.startProbe).toHaveBeenCalledTimes(nodes.length);
});
it('cancels active requests and never starts another node or publishes stale progress', async () => {
  const nodes = (await state.api.nodes({limit: 10})).nodes;
  const blocked = deferred<never>();
  const signals: AbortSignal[] = [];
  state.api.startProbe = vi.fn((_request, signal) => {
    signals.push(signal!);
    return blocked.promise;
  });
  const progress = vi.fn();
  const probe = useNodeProbe(vi.fn());
  const sent = probe.probeMany(nodes, progress);
  expect(signals).toHaveLength(4);
  probe.cancel();
  expect(signals.every(signal => signal.aborted)).toBe(true);
  blocked.reject(new Error('aborted'));
  expect(await sent).toBeUndefined();
  expect(state.api.startProbe).toHaveBeenCalledTimes(4);
  expect(progress).not.toHaveBeenCalled();
});
