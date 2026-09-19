import {afterEach, describe, expect, it, vi} from 'vitest';
import {createApi} from './client';
import {ApiError} from './error';
import type {ApiEvent} from './model';

const acceptedBody = {operation_id: 'op-1', kind: 'reload', status: 'queued', href: '/api/v1/operations/op-1'};
const json = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json', ...headers}});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('native transport', () => {
  it('sends authenticated uncached requests and exposes structured failures', async () => {
    const request = vi.fn(async (input: Request) => {
      expect(input.url).toBe('https://honk.test/api/v1/runtime');
      expect(input.headers.get('Authorization')).toBe('Bearer secret');
      expect(input.headers.get('Accept')).toBe('application/json');
      expect(input.cache).toBe('no-store');
      return json({error: {code: 'unavailable', message: 'Runtime unavailable'}, request_id: 'request-9'}, 503);
    });
    vi.stubGlobal('fetch', request);
    await expect(createApi('https://honk.test', 'secret').runtime()).rejects.toMatchObject({
      status: 503,
      code: 'unavailable',
      message: 'Runtime unavailable',
      requestId: 'request-9'
    });
  });
  it('uses status text for non-JSON failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<h1>Forbidden</h1>', {status: 403, statusText: 'Forbidden'}))
    );
    const failure = createApi('https://honk.test').nodes();
    await expect(failure).rejects.toBeInstanceOf(ApiError);
    await expect(failure).rejects.toMatchObject({status: 403, message: 'Forbidden', requestId: null});
  });
  it('sends conditional JSON Patch and accepts both contract success responses', async () => {
    const body = [{op: 'replace', path: '/config/tolerance', value: 100}] as const;
    let calls = 0;
    const keys: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: Request) => {
        expect(request.method).toBe('PATCH');
        expect(request.url).toBe('https://honk.test/api/v1/groups/proxy');
        expect(request.headers.get('If-Match')).toBe('\"40\"');
        expect(request.headers.get('Content-Type')).toBe('application/json-patch+json');
        keys.push(request.headers.get('Idempotency-Key') ?? '');
        expect(await request.json()).toEqual(body);
        return calls++ === 0
          ? json({...acceptedBody, kind: 'group_update'}, 202, {Location: acceptedBody.href, 'Retry-After': '2'})
          : json({id: 'proxy', config_revision: '41', config: {tolerance: 100}});
      })
    );
    const api = createApi('https://honk.test');
    await expect(api.patchGroup('proxy', [...body], '\"40\"')).resolves.toMatchObject({
      operation_id: 'op-1',
      kind: 'group_update',
      retryAfter: 2
    });
    await expect(api.patchGroup('proxy', [...body], '\"40\"')).resolves.toMatchObject({id: 'proxy', config_revision: '41', config: {tolerance: 100}});
    // Each attempt carries its own idempotency key, so a retry cannot replay as a new operation.
    expect(keys.every(key => /^[0-9a-f-]{36}$/.test(key))).toBe(true);
    expect(new Set(keys).size).toBe(2);
  });
  it('follows href, honors each polling floor, and returns failure as terminal', async () => {
    vi.useFakeTimers();
    const request = vi
      .fn()
      .mockResolvedValueOnce(json(acceptedBody, 202, {Location: acceptedBody.href, 'Retry-After': '2'}))
      .mockResolvedValueOnce(json({operation_id: 'op-1', status: 'running'}, 200, {'Retry-After': '3'}))
      .mockResolvedValueOnce(json({operation_id: 'op-1', status: 'failed', error: {code: 'reload_failed', message: 'Invalid configuration'}}));
    vi.stubGlobal('fetch', request);
    const api = createApi('https://honk.test');
    const accepted = await api.startReload();
    const result = api.pollOperation(accepted);
    await vi.advanceTimersByTimeAsync(1999);
    expect(request).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(String(request.mock.calls[1][0])).toBe('https://honk.test' + acceptedBody.href);
    await vi.advanceTimersByTimeAsync(2999);
    expect(request).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toMatchObject({status: 'failed', error: {code: 'reload_failed'}});
  });
  it('enforces the one-second floor and aborts without another GET', async () => {
    vi.useFakeTimers();
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    const controller = new AbortController();
    const accepted = {...acceptedBody, kind: 'reload' as const, status: 'queued' as const, retryAfter: 0};
    const result = createApi('https://honk.test').pollOperation(accepted, controller.signal);
    const rejection = expect(result).rejects.toMatchObject({name: 'AbortError'});
    await vi.advanceTimersByTimeAsync(999);
    expect(request).not.toHaveBeenCalled();
    controller.abort();
    await rejection;
  });
  it('reassembles SSE frames, resumes after EOF, and drops expired cursors', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const events: ApiEvent[] = [];
    const encoder = new TextEncoder();
    const frame =
      ': heartbeat\r\nid: instance:9\r\nevent: runtime.updated\r\ndata: {"instance_id":"instance",\r\ndata: "observed_at":"2026-09-15T14:00:00Z","href":"/api/v1/runtime"}\r\n\r\n';
    const bytes = encoder.encode(frame);
    const stream = () =>
      new Response(
        new ReadableStream({
          start(c) {
            for (const byte of bytes) c.enqueue(Uint8Array.of(byte));
            c.close();
          }
        }),
        {headers: {'Content-Type': 'text/event-stream'}}
      );
    const request = vi
      .fn()
      .mockResolvedValueOnce(json({error: {code: 'event_cursor_expired', message: 'Expired'}, request_id: null}, 409))
      .mockResolvedValueOnce(stream())
      .mockResolvedValueOnce(stream());
    vi.stubGlobal('fetch', request);
    const result = createApi('https://honk.test', 'secret').subscribeEvents({
      kinds: ['runtime.updated'],
      lastEventId: 'instance:1',
      signal: controller.signal,
      onEvent: event => {
        events.push(event);
        if (events.length === 2) controller.abort();
      }
    });
    await vi.advanceTimersByTimeAsync(1000);
    await result;
    expect(events.map(event => [event.id, event.event, event.data.instance_id])).toEqual([
      ['instance:9', 'runtime.updated', 'instance'],
      ['instance:9', 'runtime.updated', 'instance']
    ]);
    expect(request.mock.calls.map(call => new Headers(call[1].headers).get('Last-Event-ID'))).toEqual(['instance:1', null, 'instance:9']);
    expect(new Headers(request.mock.calls[0][1].headers).get('Authorization')).toBe('Bearer secret');
    expect(String(request.mock.calls[0][0])).toBe('https://honk.test/api/v1/events?kinds=runtime.updated');
  });
  it('retries after a network failure or 5xx with backoff and Retry-After, and ends on a definitive 4xx', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const events: string[] = [];
    const frame = 'id: instance:4\nevent: stream.ready\ndata: {"instance_id":"instance","observed_at":"2026-09-15T14:00:00Z"}\n\n';
    const ready = () => new Response(frame, {headers: {'Content-Type': 'text/event-stream', 'Retry-After': '1'}});
    const request = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('network down'))
      .mockResolvedValueOnce(json({error: {code: 'temporarily_unavailable', message: 'restarting'}, request_id: null}, 503, {'Retry-After': '5'}))
      .mockResolvedValueOnce(ready())
      .mockResolvedValueOnce(json({error: {code: 'permission_denied', message: 'no'}, request_id: null}, 403));
    vi.stubGlobal('fetch', request);
    const outcome = createApi('https://honk.test')
      .subscribeEvents({signal: controller.signal, onEvent: event => events.push(event.event)})
      .then(
        () => null,
        (error: unknown) => error
      );
    // Network failure: one second of backoff before the next attempt.
    await vi.advanceTimersByTimeAsync(999);
    expect(request).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(request).toHaveBeenCalledTimes(2);
    // 503 with Retry-After 5 outranks the two-second backoff.
    await vi.advanceTimersByTimeAsync(4999);
    expect(request).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(request).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1000);
    expect(events).toEqual(['stream.ready']);
    // A 403 is definitive: the stream ends with that error and no further attempt.
    expect(await outcome).toMatchObject({status: 403, code: 'permission_denied'});
    expect(request).toHaveBeenCalledTimes(4);
  });
  it('reports readiness and disconnection while waiting to resume the stream', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const states: boolean[] = [];
    const frame = 'id: instance:4\nevent: stream.ready\ndata: {\"instance_id\":\"instance\",\"observed_at\":\"2026-09-15T14:00:00Z\"}\n\n';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(frame, {headers: {'Content-Type': 'text/event-stream', 'Retry-After': '3'}}))
    );
    const stream = createApi('https://honk.test').subscribeEvents({
      signal: controller.signal,
      onEvent: () => {},
      onConnectionChange: state => states.push(state)
    });
    await vi.advanceTimersByTimeAsync(1);
    expect(states).toEqual([false, true, false]);
    controller.abort();
    await stream;
    expect(states.at(-1)).toBe(false);
  });
});

it('fills resource keys a backend on an older contract pin leaves out as unavailable', async () => {
  const {normalizeCapabilities} = await import('./capabilities');
  const raw = {
    observed_at: '2026-09-15T14:00:00Z',
    profiles: ['base'],
    limits: {},
    resources: {runtime: {available: true}, connections: {available: true, can_close: false}}
  };
  const capabilities = normalizeCapabilities(raw as never);
  expect(capabilities.resources.runtime.available).toBe(true);
  expect(capabilities.resources.geodata.available).toBe(false);
  expect(capabilities.resources.nodes.available).toBe(false);
  expect(capabilities.resources.rules.available).toBe(false);
  // An offered mode from a pin before `writable` existed was always switchable; a declared flag is kept.
  expect(capabilities.resources.runtime_mode).toEqual({available: false});
  expect(normalizeCapabilities({...raw, resources: {runtime_mode: {available: true, modes: ['rule']}}} as never).resources.runtime_mode).toEqual({
    available: true,
    modes: ['rule'],
    writable: true
  });
  expect(
    normalizeCapabilities({...raw, resources: {runtime_mode: {available: true, writable: false, modes: ['rule']}}} as never).resources.runtime_mode.writable
  ).toBe(false);
});
