import {afterEach, describe, expect, it, vi} from 'vitest';
import {createApi, ApiError} from './client';
import type {ApiEvent} from './model';

const acceptedBody = {operation_id: 'op-1', kind: 'reload', status: 'queued', href: '/api/v1/operations/op-1'};
const json = (body: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json', ...headers}});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

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
    await expect(createApi('https://honk.test', 'secret').runtime()).rejects.toMatchObject({status: 503, code: 'unavailable', message: 'Runtime unavailable', requestId: 'request-9'});
  });
  it('uses status text for non-JSON failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<h1>Forbidden</h1>', {status: 403, statusText: 'Forbidden'})));
    const failure = createApi('https://honk.test').nodes();
    await expect(failure).rejects.toBeInstanceOf(ApiError);
    await expect(failure).rejects.toMatchObject({status: 403, message: 'Forbidden', requestId: null});
  });
  it('sends conditional JSON Patch and accepts both contract success responses', async () => {
    const body = [{op: 'replace', path: '/config/tolerance', value: 100}] as const;
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
      expect(request.method).toBe('PATCH');
      expect(request.url).toBe('https://honk.test/api/v1/groups/proxy');
      expect(request.headers.get('If-Match')).toBe('\"40\"');
      expect(request.headers.get('Content-Type')).toBe('application/json-patch+json');
      expect(await request.json()).toEqual(body);
      return calls++ === 0
        ? json({...acceptedBody, kind: 'group_update'}, 202, {Location: acceptedBody.href, 'Retry-After': '2'})
        : json({id: 'proxy', config_revision: '41', config: {tolerance: 100}});
    }));
    const api = createApi('https://honk.test');
    await expect(api.patchGroup('proxy', [...body], '\"40\"')).resolves.toMatchObject({operation_id: 'op-1', kind: 'group_update', location: acceptedBody.href, retryAfter: 2});
    await expect(api.patchGroup('proxy', [...body], '\"40\"')).resolves.toMatchObject({id: 'proxy', config_revision: '41', config: {tolerance: 100}});
  });
  it('follows href, honors each polling floor, and returns failure as terminal', async () => {
    vi.useFakeTimers();
    const request = vi.fn()
      .mockResolvedValueOnce(json(acceptedBody, 202, {Location: acceptedBody.href, 'Retry-After': '2'}))
      .mockResolvedValueOnce(json({operation_id: 'op-1', status: 'running'}, 200, {'Retry-After': '3'}))
      .mockResolvedValueOnce(json({operation_id: 'op-1', status: 'failed', error: {code: 'reload_failed', message: 'Invalid configuration'}}));
    vi.stubGlobal('fetch', request);
    const api = createApi('https://honk.test');
    const accepted = await api.startReload();
    expect(accepted.location).toBe(acceptedBody.href);
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
    const request = vi.fn(); vi.stubGlobal('fetch', request);
    const controller = new AbortController();
    const accepted = {...acceptedBody, kind: 'reload' as const, status: 'queued' as const, location: acceptedBody.href, retryAfter: 0};
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
    const frame = ': heartbeat\r\nid: instance:9\r\nevent: runtime.updated\r\ndata: {"instance_id":"instance",\r\ndata: "observed_at":"2026-09-15T14:00:00Z","href":"/api/v1/runtime"}\r\n\r\n';
    const bytes = encoder.encode(frame);
    const stream = () => new Response(new ReadableStream({start(c) { for (const byte of bytes) c.enqueue(Uint8Array.of(byte)); c.close(); }}), {headers: {'Content-Type': 'text/event-stream'}});
    const request = vi.fn().mockResolvedValueOnce(json({error: {code: 'event_cursor_expired', message: 'Expired'}, request_id: null}, 409)).mockResolvedValueOnce(stream()).mockResolvedValueOnce(stream());
    vi.stubGlobal('fetch', request);
    const result = createApi('https://honk.test', 'secret').subscribeEvents({kinds: ['runtime.updated'], lastEventId: 'instance:1', signal: controller.signal, onEvent: event => { events.push(event); if (events.length === 2) controller.abort(); }});
    await vi.advanceTimersByTimeAsync(1000);
    await result;
    expect(events.map(event => [event.id, event.event, event.data.instance_id])).toEqual([['instance:9', 'runtime.updated', 'instance'], ['instance:9', 'runtime.updated', 'instance']]);
    expect(request.mock.calls.map(call => new Headers(call[1].headers).get('Last-Event-ID'))).toEqual(['instance:1', null, 'instance:9']);
    expect(new Headers(request.mock.calls[0][1].headers).get('Authorization')).toBe('Bearer secret');
    expect(String(request.mock.calls[0][0])).toBe('https://honk.test/api/v1/events?kinds=runtime.updated');
  });
  it('reports readiness and disconnection while waiting to resume the stream', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const states: boolean[] = [];
    const frame = 'id: instance:4\nevent: stream.ready\ndata: {\"instance_id\":\"instance\",\"observed_at\":\"2026-09-15T14:00:00Z\"}\n\n';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(frame, {headers: {'Content-Type': 'text/event-stream', 'Retry-After': '3'}})));
    const stream = createApi('https://honk.test').subscribeEvents({signal: controller.signal, onEvent: () => {}, onConnectionChange: state => states.push(state)});
    await vi.advanceTimersByTimeAsync(1);
    expect(states).toEqual([false, true, false]);
    controller.abort();
    await stream;
    expect(states.at(-1)).toBe(false);
  });
});
