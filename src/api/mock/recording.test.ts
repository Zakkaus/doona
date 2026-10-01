import {afterEach, expect, it, vi} from 'vitest';
import {createMockApi} from './index';

afterEach(() => vi.useRealTimers());

it('keeps diagnostic demand independent from ordinary events and other recorder grace', async () => {
  vi.useFakeTimers();
  const api = createMockApi();
  const state = async () => (await api.runtimeSettings()).recording!;
  const controller = new AbortController();
  const events = api.subscribeEvents({signal: controller.signal, onEvent: vi.fn()});
  expect(await state()).toMatchObject({events: {active: true}, flows: {active: false}, logs: {active: false}, dns_log: {active: false}});
  await expect(api.flow('missing')).rejects.toMatchObject({status: 404});
  expect((await state()).flows?.active).toBe(false);
  await api.flows();
  await vi.advanceTimersByTimeAsync(30000);
  await api.dnsLog();
  expect(await state()).toMatchObject({flows: {active: true}, logs: {active: false}, dns_log: {active: true}});
  await vi.advanceTimersByTimeAsync(30001);
  expect(await state()).toMatchObject({events: {active: true}, flows: {active: false}, dns_log: {active: true}});
  controller.abort();
  await events;
  expect((await state()).grace_remaining_seconds).toBe(60);
  await vi.advanceTimersByTimeAsync(30000);
  expect(await state()).toMatchObject({events: {active: true}, dns_log: {active: false}});
  await api.patchRuntimeSettings({record_logs: 'on'});
  await vi.advanceTimersByTimeAsync(30000);
  expect(await state()).toMatchObject({events: {active: true}, logs: {active: true}, flows: {active: false}});
  await api.patchRuntimeSettings({record_logs: 'auto'});
  expect(await state()).toMatchObject({events: {active: false}, logs: {active: false}});
});

it('leases only the admitted stream demand and releases it when the stream closes', async () => {
  vi.useFakeTimers();
  const api = createMockApi();
  await expect(api.subscribeLogs({lastEventId: 'missing', onRecord: vi.fn()})).rejects.toMatchObject({status: 409});
  expect((await api.runtimeSettings()).recording?.logs?.active).toBe(false);
  const flowController = new AbortController();
  const logController = new AbortController();
  const flow = api.subscribeEvents({kinds: ['flow.updated'], signal: flowController.signal, onEvent: vi.fn()});
  const logs = api.subscribeLogs({signal: logController.signal, onRecord: vi.fn()});
  expect((await api.runtimeSettings()).recording).toMatchObject({flows: {active: true}, logs: {active: true}, dns_log: {active: false}});
  flowController.abort();
  await flow;
  await vi.advanceTimersByTimeAsync(60001);
  expect((await api.runtimeSettings()).recording).toMatchObject({flows: {active: false}, logs: {active: true}});
  logController.abort();
  await logs;
  await vi.advanceTimersByTimeAsync(60001);
  expect((await api.runtimeSettings()).recording).toMatchObject({events: {active: false}, logs: {active: false}});
});

it('reports flow policy independently from current demand and isolates demo sessions', async () => {
  const api = createMockApi();
  expect((await api.capabilities()).resources.flows.recording).toBe('auto');
  expect((await api.runtimeSettings()).recording?.flows?.active).toBe(false);
  await api.patchRuntimeSettings({record_flows: 'on'});
  expect((await api.capabilities()).resources.flows.recording).toBe('on');
  await api.patchRuntimeSettings({record_flows: 'off'});
  expect((await api.capabilities()).resources.flows.recording).toBe('off');
  expect((await createMockApi().capabilities()).resources.flows.recording).toBe('auto');
});
