import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import type {Api} from '../api/api';
import type {ApiEvent, Capabilities, EventOptions} from '../api/model';
import {createMockApi} from '../api/mock';
import {eventStatus, subscribeEvents} from './events';
import {watchResource} from './resource';

const disposers: Array<() => void> = [];
const flowKinds = ['runtime.updated', 'operation.updated', 'generation.changed', 'flow.updated', 'flow.gap'];
const ready = (id: string): ApiEvent => ({id, event: 'stream.ready', data: {instance_id: 'engine', observed_at: ''}});
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('document', Object.assign(new EventTarget(), {hidden: false}));
});
afterEach(() => {
  disposers.splice(0).forEach(dispose => dispose());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
function backend() {
  const api = createMockApi();
  const sessions: Array<EventOptions & {reject: (error: Error) => void}> = [];
  vi.spyOn(api, 'subscribeEvents').mockImplementation(options => {
    expect(sessions.filter(session => !session.signal?.aborted)).toHaveLength(0);
    return new Promise<void>((_, reject) => sessions.push({...options, reject}));
  });
  return {api, sessions};
}
function listen(api: Api, listener = vi.fn(), flows = false) {
  const stop = subscribeEvents(api, listener, undefined, flows);
  disposers.push(stop);
  return stop;
}

it('unions actual resource interest without restarting for extra consumers or closing another consumer', async () => {
  const {api, sessions} = backend();
  const activity = vi.fn();
  const stopActivity = listen(api, activity);
  const runtime = watchResource(api, {key: ['runtime'], every: 0, fetch: async () => 'runtime'}, () => {});
  disposers.push(runtime.dispose);
  await vi.advanceTimersByTimeAsync(0);
  expect(sessions).toHaveLength(1);
  expect(sessions[0].kinds).toBeUndefined();
  sessions[0].onEvent(ready('base:1'));

  const flows = watchResource(api, {key: ['flows'], every: 0, fetch: async () => []}, () => {});
  disposers.push(flows.dispose);
  await vi.advanceTimersByTimeAsync(0);
  expect(sessions).toHaveLength(2);
  expect(sessions[0].signal?.aborted).toBe(true);
  expect(sessions[1].kinds).toEqual(flowKinds);
  expect(sessions[1].lastEventId).toBeUndefined();
  expect(eventStatus(api).cursor).toBeNull();
  sessions[1].onEvent(ready('flows:1'));
  expect(activity).toHaveBeenLastCalledWith(ready('flows:1'), true);

  const flow = watchResource(api, {key: ['flow', {id: 'one'}], every: 0, fetch: async () => 'one'}, () => {});
  disposers.push(flow.dispose);
  const stopEvents = listen(api, vi.fn(), true);
  await vi.advanceTimersByTimeAsync(0);
  expect(sessions).toHaveLength(2);
  flows.dispose();
  flow.dispose();
  await vi.advanceTimersByTimeAsync(0);
  expect(sessions).toHaveLength(2);
  expect(sessions[1].signal?.aborted).toBe(false);

  stopEvents();
  await vi.advanceTimersByTimeAsync(0);
  expect(sessions).toHaveLength(3);
  expect(sessions[1].signal?.aborted).toBe(true);
  expect(sessions[2].kinds).toBeUndefined();
  expect(sessions[2].lastEventId).toBeUndefined();
  sessions[2].onEvent(ready('base:2'));
  expect(activity).toHaveBeenLastCalledWith(ready('base:2'), true);
  stopActivity();
  expect(sessions[2].signal?.aborted).toBe(false);
  runtime.dispose();
  expect(sessions[2].signal?.aborted).toBe(true);
  expect(eventStatus(api).available).toBeNull();
});

it('reconciles on filter-ready and reconnect-ready, fencing retired events, statuses and failures', async () => {
  const {api, sessions} = backend();
  const fetch = vi.fn().mockResolvedValue('initial');
  const runtime = watchResource(api, {key: ['runtime'], every: 0, fetch}, () => {});
  disposers.push(runtime.dispose);
  await vi.advanceTimersByTimeAsync(0);
  sessions[0].onEvent(ready('base:1'));
  await vi.advanceTimersByTimeAsync(0);
  expect(fetch).toHaveBeenCalledTimes(1);
  listen(api, vi.fn(), true);
  await vi.advanceTimersByTimeAsync(0);
  fetch.mockResolvedValue('after filter change');
  sessions[1].onConnectionChange?.(true);
  sessions[1].onEvent(ready('flows:1'));
  await vi.advanceTimersByTimeAsync(0);
  expect(runtime.getSnapshot().data).toBe('after filter change');
  expect(fetch).toHaveBeenCalledTimes(2);
  const state = eventStatus(api);
  sessions[0].onConnectionChange?.(false);
  sessions[0].onEvent(ready('stale:1'));
  sessions[0].reject(new Error('retired stream failed'));
  await vi.advanceTimersByTimeAsync(0);
  expect(eventStatus(api)).toBe(state);
  expect(fetch).toHaveBeenCalledTimes(2);
  fetch.mockResolvedValue('after reconnect');
  sessions[1].onEvent(ready('flows:2'));
  await vi.advanceTimersByTimeAsync(0);
  expect(runtime.getSnapshot().data).toBe('after reconnect');
  expect(fetch).toHaveBeenCalledTimes(3);
});

it('does not resurrect a stopped or replaced stream when capabilities complete late', async () => {
  const {api, sessions} = backend();
  const capabilities = await api.capabilities();
  const pending: Array<{signal?: AbortSignal; resolve: (value: Capabilities) => void}> = [];
  vi.spyOn(api, 'capabilities').mockImplementation(signal => new Promise(resolve => pending.push({signal, resolve})));
  const stop = listen(api);
  await vi.advanceTimersByTimeAsync(0);
  stop();
  expect(pending[0].signal?.aborted).toBe(true);
  listen(api, vi.fn(), true);
  await vi.advanceTimersByTimeAsync(0);
  pending[0].resolve(capabilities);
  await vi.advanceTimersByTimeAsync(0);
  expect(sessions).toHaveLength(0);
  pending[1].resolve(capabilities);
  await vi.advanceTimersByTimeAsync(0);
  expect(sessions).toHaveLength(1);
  expect(sessions[0].kinds).toEqual(flowKinds);
});

it('changes pending interest before admission and never opens the superseded filter', async () => {
  const {api, sessions} = backend();
  const capabilities = await api.capabilities();
  const pending: Array<(value: Capabilities) => void> = [];
  vi.spyOn(api, 'capabilities').mockImplementation(() => new Promise(resolve => pending.push(resolve)));
  listen(api);
  await vi.advanceTimersByTimeAsync(0);
  const stopFlows = listen(api, vi.fn(), true);
  await vi.advanceTimersByTimeAsync(0);
  stopFlows();
  await vi.advanceTimersByTimeAsync(0);
  pending.forEach(resolve => resolve(capabilities));
  await vi.advanceTimersByTimeAsync(0);
  expect(sessions).toHaveLength(1);
  expect(sessions[0].kinds).toBeUndefined();
});

it('preserves unavailable capability and active stream errors', async () => {
  const unavailable = backend();
  const capabilities = await unavailable.api.capabilities();
  capabilities.resources.events.available = false;
  vi.spyOn(unavailable.api, 'capabilities').mockResolvedValue(capabilities);
  listen(unavailable.api, vi.fn(), true);
  await vi.advanceTimersByTimeAsync(0);
  expect(unavailable.sessions).toHaveLength(0);
  expect(eventStatus(unavailable.api).available).toBe(false);

  const {api, sessions} = backend();
  listen(api);
  await vi.advanceTimersByTimeAsync(0);
  const error = new Error('admission denied');
  sessions[0].reject(error);
  await vi.advanceTimersByTimeAsync(0);
  expect(eventStatus(api).error).toBe(error);
  expect(eventStatus(api).connected).toBe(false);
});
