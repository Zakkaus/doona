import {afterEach, describe, expect, it, vi} from 'vitest';
import {createApi} from './client';
import {ApiError, send} from './error';
import {createServerClock, selectServerClock} from './serverClock';
import type {ApiEvent, OperationAccepted} from './model';
import {currentRefusal} from './refusal';
import {eventSummary} from './selectors';

const acceptedBody = {operation_id: 'op-1', kind: 'reload', status: 'queued', href: '/api/v1/operations/op-1'};
const json = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json', ...headers}});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('native transport', () => {
  it('reads the host clock from the observed_at of a response', async () => {
    const behind = Date.now() - 600_000;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({observed_at: new Date(behind).toISOString()}))
    );
    const clock = createServerClock();
    await createApi('https://honk.test', undefined, clock).runtime();
    expect(Math.abs(clock.now() - behind)).toBeLessThan(1000);
  });
  it('keeps a previous backend response off the new backend clock', async () => {
    const behind = Date.now() - 600_000;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({observed_at: new Date(behind).toISOString()}))
    );
    const previous = createServerClock();
    const current = createServerClock();
    selectServerClock(current);
    await createApi('https://old.test', undefined, previous).runtime();
    expect(Math.abs(current.now() - Date.now())).toBeLessThan(1000);
    selectServerClock(createServerClock());
  });
  it('retries a refused mutation with the same body and idempotency key after the floor', async () => {
    vi.useFakeTimers();
    const attempts: Array<{body: string; key: string | null}> = [];
    const request = vi.fn(async (input: Request) => {
      attempts.push({body: await input.text(), key: input.headers.get('Idempotency-Key')});
      return attempts.length === 1 ? json({}, 503, {'Retry-After': '3'}) : json(acceptedBody, 202);
    });
    vi.stubGlobal('fetch', request);
    const result = createApi('https://honk.test').replaceConfigSource('main', 'routing {}', '"digest"');
    await vi.advanceTimersByTimeAsync(2999);
    expect(request).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toMatchObject({operation_id: 'op-1'});
    expect(attempts[0].key).toBeTruthy();
    expect(attempts[1]).toEqual(attempts[0]);
  });
  it('waits out a DNS query refusal and cancels a refused control request', async () => {
    vi.useFakeTimers();
    const request = vi
      .fn()
      .mockResolvedValueOnce(json({}, 429, {'Retry-After': '2'}))
      .mockResolvedValueOnce(json({domain: 'example.org', results: []}));
    vi.stubGlobal('fetch', request);
    const api = createApi('https://honk.test');
    const query = api.dnsQuery('example.org', ['A']);
    await vi.advanceTimersByTimeAsync(1999);
    expect(request).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(query).resolves.toMatchObject({domain: 'example.org'});
    const sent: Request = request.mock.calls[0][0];
    expect([sent.method, new URL(sent.url).search, await sent.json()]).toEqual([
      'POST',
      '?detail=full',
      {domain: 'example.org', type: ['A'], cache_mode: 'normal'}
    ]);
    request.mockResolvedValue(json({}, 503, {'Retry-After': '3'}));
    const controller = new AbortController();
    const result = api.startReload(controller.signal);
    const failure = expect(result).rejects.toMatchObject({name: 'AbortError'});
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await failure;
    await vi.advanceTimersByTimeAsync(3000);
    expect(request).toHaveBeenCalledTimes(3);
  });
  it('shows a long rate-limit wait while it lasts', async () => {
    vi.useFakeTimers();
    const request = vi
      .fn()
      .mockResolvedValueOnce(json({}, 429, {'Retry-After': '30'}))
      .mockResolvedValueOnce(json({domain: 'example.org', results: []}));
    vi.stubGlobal('fetch', request);
    const query = createApi('https://honk.test').dnsQuery('example.org', ['A']);
    await vi.advanceTimersByTimeAsync(0);
    expect(currentRefusal()).toMatchObject({status: 429});
    await vi.advanceTimersByTimeAsync(30000);
    await expect(query).resolves.toMatchObject({domain: 'example.org'});
    expect(currentRefusal()).toBeNull();
  });
  it('waits out a refused validation or routing trace, which write nothing', async () => {
    vi.useFakeTimers();
    const request = vi
      .fn()
      .mockResolvedValueOnce(json({}, 503, {'Retry-After': '1'}))
      .mockResolvedValueOnce(json({valid: true, diagnostics: []}))
      .mockResolvedValueOnce(json({}, 429, {'Retry-After': '1'}))
      .mockResolvedValueOnce(json({evaluations: []}));
    vi.stubGlobal('fetch', request);
    const api = createApi('https://honk.test');
    const validation = api.validateConfig({sources: [{id: 'main', content: 'routing {}'}], mode: 'full'});
    await vi.advanceTimersByTimeAsync(1000);
    await expect(validation).resolves.toMatchObject({valid: true});
    const trace = api.routingTrace({input: {network: 'tcp', dst_ip: '1.1.1.1', dst_port: 443}, resolve: 'none'});
    await vi.advanceTimersByTimeAsync(1000);
    await expect(trace).resolves.toMatchObject({evaluations: []});
    expect(request).toHaveBeenCalledTimes(4);
  });
  it('does not replay a refused mutation that carries no idempotency key', async () => {
    const request = vi.fn(async () => json({error: {code: 'temporarily_unavailable', message: 'busy'}, request_id: null}, 503, {'Retry-After': '1'}));
    vi.stubGlobal('fetch', request);
    const api = createApi('https://honk.test');
    await expect(api.createNode({name: 'hk', link: 'ss://node'})).rejects.toMatchObject({status: 503});
    await expect(api.deleteProvider('sub')).rejects.toMatchObject({status: 503});
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('does not replay a refused synchronous write, whose key the contract does not replay', async () => {
    const keys: Array<string | null> = [];
    const request = vi.fn(async (input: Request) => {
      keys.push(input.headers.get('Idempotency-Key'));
      return json({error: {code: 'temporarily_unavailable', message: 'busy'}, request_id: null}, 503, {'Retry-After': '1'});
    });
    vi.stubGlobal('fetch', request);
    const api = createApi('https://honk.test');
    await expect(api.closeConnections({src: '192.168.1.100'})).rejects.toMatchObject({status: 503});
    await expect(api.closeConnection('conn-1')).rejects.toMatchObject({status: 503});
    await expect(api.patchRuntimeSettings({log: {level: 'debug'}})).rejects.toMatchObject({status: 503});
    expect(request).toHaveBeenCalledTimes(3);
    expect(keys).toEqual([null, null, null]);
  });
  it('does not replay an ambiguously failed mutation', async () => {
    const request = vi.fn().mockRejectedValue(new TypeError('network down'));
    vi.stubGlobal('fetch', request);
    await expect(createApi('https://honk.test').startReload()).rejects.toThrow('network down');
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('reports a request that got no response as a network failure with a translated text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(createApi('https://honk.test').dnsCache()).rejects.toMatchObject({status: 0, code: 'network_error', text: {key: 'ui.errNetwork'}});
  });
  // A backend that accepts the connection and never answers: the request settles only when its signal aborts.
  const hanging = () =>
    vi.fn(
      (_input: Request | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason), {once: true}))
    );
  it('gives up on a read that gets no answer after the read deadline', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', hanging());
    let settled = false;
    const result = createApi('https://honk.test').runtime();
    const failure = expect(result).rejects.toMatchObject({status: 0, code: 'timeout', text: {key: 'ui.errTimeout', params: {seconds: 15}}});
    void result.catch(() => (settled = true));
    await vi.advanceTimersByTimeAsync(14999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await failure;
  });
  it('gives a mutation the write deadline and says the change may have been applied', async () => {
    vi.useFakeTimers();
    const request = hanging();
    vi.stubGlobal('fetch', request);
    const api = createApi('https://honk.test');
    let settled = false;
    const reload = api.startReload();
    const failure = expect(reload).rejects.toMatchObject({code: 'timeout', text: {key: 'ui.errTimeoutWrite', params: {seconds: 30}}});
    void reload.catch(() => (settled = true));
    // A read-only POST writes nothing, so it keeps the read deadline and text.
    const trace = api.routingTrace({input: {network: 'tcp', dst_ip: '1.1.1.1', dst_port: 443}, resolve: 'none'});
    const traced = expect(trace).rejects.toMatchObject({code: 'timeout', text: {key: 'ui.errTimeout'}});
    await vi.advanceTimersByTimeAsync(15000);
    await traced;
    await vi.advanceTimersByTimeAsync(14999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await failure;
    expect(request).toHaveBeenCalledTimes(2);
  });
  // Headers arrive, then the body stalls part way; the engine errors the stream with a plain AbortError on abort.
  const stalling = () =>
    vi.fn(
      async (_input: Request | URL, init?: RequestInit) =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(c) {
              c.enqueue(new TextEncoder().encode('{"observed_at":'));
              init?.signal?.addEventListener('abort', () => c.error(new DOMException('', 'AbortError')), {once: true});
            }
          }),
          {headers: {'Content-Type': 'application/json'}}
        )
    );
  it.each([
    ['read', 15, 'ui.errTimeout'],
    ['write', 30, 'ui.errTimeoutWrite']
  ] as const)('fails a %s whose body stalls mid-read with the timeout error', async (kind, seconds, key) => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', stalling());
    const api = createApi('https://honk.test');
    const result: Promise<unknown> = kind === 'read' ? api.runtime() : api.startReload();
    const failure = expect(result).rejects.toMatchObject({status: 0, code: 'timeout', text: {key, params: {seconds}}});
    await vi.advanceTimersByTimeAsync(seconds * 1000);
    await failure;
  });
  // A large body that keeps arriving: each chunk comes 10 seconds after the last, 50 seconds in all.
  it('reads a body that arrives slowly but steadily past the read limit', async () => {
    vi.useFakeTimers();
    const parts = ['{"observed_at":', '"2026-09-15', 'T14:00:00Z"', ',"x":1', '}'];
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (_input: Request | URL, init?: RequestInit) =>
          new Response(
            new ReadableStream<Uint8Array>({
              start(c) {
                init?.signal?.addEventListener('abort', () => c.error(new DOMException('', 'AbortError')), {once: true});
              },
              async pull(c) {
                await new Promise(resolve => setTimeout(resolve, 10000));
                const part = parts.shift();
                if (part === undefined) c.close();
                else c.enqueue(new TextEncoder().encode(part));
              }
            }),
            {headers: {'Content-Type': 'application/json'}}
          )
      )
    );
    const result = createApi('https://honk.test').runtime();
    const read = expect(result).resolves.toMatchObject({observed_at: '2026-09-15T14:00:00Z'});
    await vi.advanceTimersByTimeAsync(60000);
    await read;
  });
  it('keeps the url of the response it rebuilds around the body', async () => {
    const response = json({observed_at: new Date().toISOString()});
    Object.defineProperty(response, 'url', {value: 'https://honk.test/api/v1/runtime'});
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response)
    );
    expect((await send('https://honk.test/api/v1/runtime')).url).toBe('https://honk.test/api/v1/runtime');
  });
  // Chromium hands a 204 an empty body stream rather than none; the response still carries no body.
  it('passes a no-content response through with its empty body', async () => {
    const empty = new Response(null, {status: 204});
    Object.defineProperty(empty, 'body', {value: new ReadableStream()});
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => empty)
    );
    await createApi('https://honk.test').closeConnection('c1');
  });
  it('leaves an open event stream to its own silence limit', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const signals: AbortSignal[] = [];
    const request = vi.fn(async (_input: URL, init?: RequestInit) => {
      signals.push(init!.signal!);
      return new Response(
        new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(new TextEncoder().encode('id: i:1\nevent: stream.ready\ndata: {"instance_id":"i","observed_at":"2026-09-15T14:00:00Z"}\n\n'));
          }
        })
      );
    });
    vi.stubGlobal('fetch', request);
    const stream = createApi('https://honk.test').subscribeEvents({signal: controller.signal, heartbeatSeconds: 60, onEvent: () => {}});
    await vi.advanceTimersByTimeAsync(60000);
    expect(request).toHaveBeenCalledTimes(1);
    expect(signals[0].aborted).toBe(false);
    controller.abort();
    await stream;
  });
  it('passes an event of a kind it does not know on, unless its payload is not an object', async () => {
    const frames = [
      'id: i:1\nevent: stream.ready\ndata: {"instance_id":"i","observed_at":"2026-09-15T14:00:00Z"}\n\n',
      'id: i:2\nevent: route.changed\ndata: {"resource_id":"r1","observed_at":"2026-09-15T14:00:01Z"}\n\n',
      'id: i:3\nevent: route.dropped\ndata: ["r2"]\n\n',
      'id: i:4\nevent: route.dropped\ndata: null\n\n',
      'id: i:6\nevent: route.changed\ndata: {"resource_id":"r3","observed_at":{}}\n\n',
      'id: i:5\nevent: runtime.updated\ndata: {"instance_id":"i","observed_at":"2026-09-15T14:00:02Z","href":"/api/v1/runtime"}\n\n'
    ].join('');
    const controller = new AbortController();
    const events: ApiEvent[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(frames, {headers: {'Content-Type': 'text/event-stream'}}))
    );
    await createApi('https://honk.test').subscribeEvents({
      signal: controller.signal,
      onEvent: event => {
        events.push(event);
        if (event.id === 'i:5') controller.abort();
      }
    });
    expect(events.map(event => [event.id, event.event])).toEqual([
      ['i:1', 'stream.ready'],
      ['i:2', 'route.changed'],
      ['i:6', 'route.changed'],
      ['i:5', 'runtime.updated']
    ]);
    expect(eventSummary(events[1])).toEqual({key: 'event.resource', params: {resource: 'r1'}});
    expect(events[1].data.observed_at).toBe('2026-09-15T14:00:01Z');
    expect(events[2].data.observed_at).toBe('');
  });
  it('keeps a caller abort before the deadline an abort', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', hanging());
    const controller = new AbortController();
    const result = createApi('https://honk.test').runtime(controller.signal);
    const failure = expect(result).rejects.toMatchObject({name: 'AbortError'});
    await vi.advanceTimersByTimeAsync(5000);
    controller.abort();
    await failure;
  });
  it('releases the deadline once the response is read or the request fails', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({observed_at: new Date().toISOString()}))
    );
    const api = createApi('https://honk.test');
    await api.runtime();
    expect(vi.getTimerCount()).toBe(0);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"observed_at":', {headers: {'Content-Type': 'application/json'}}))
    );
    await expect(api.runtime()).rejects.toBeInstanceOf(SyntaxError);
    expect(vi.getTimerCount()).toBe(0);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      })
    );
    await expect(api.runtime()).rejects.toMatchObject({code: 'network_error'});
    expect(vi.getTimerCount()).toBe(0);
  });
  it('drops the forwarding listeners of an engine without AbortSignal.any once the request is over', async () => {
    const any = AbortSignal.any;
    Object.defineProperty(AbortSignal, 'any', {value: undefined, configurable: true});
    try {
      const signals: AbortSignal[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn(async (_input: URL, init?: RequestInit) => {
          signals.push(init!.signal!);
          return json({observed_at: new Date().toISOString()});
        })
      );
      const controller = new AbortController();
      await createApi('https://honk.test').runtime(controller.signal);
      controller.abort();
      expect(signals[0].aborted).toBe(false);
    } finally {
      Object.defineProperty(AbortSignal, 'any', {value: any, configurable: true});
    }
  });
  it.each(['events', 'logs'] as const)('skips malformed id-less %s frames without reconnecting', async kind => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const event = kind === 'events' ? 'runtime.updated' : 'log';
    const request = vi.fn(async () => new Response(`event: ${event}\ndata: invalid\n\nid: good\nevent: ${event}\ndata: {"message":"valid"}\n\n`));
    vi.stubGlobal('fetch', request);
    const received = vi.fn(() => controller.abort());
    const api = createApi('https://honk.test');
    await (kind === 'events'
      ? api.subscribeEvents({signal: controller.signal, onEvent: received})
      : api.subscribeLogs({signal: controller.signal, onRecord: received}));
    expect(received).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(1);
  });
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
        expect(request.url).toBe('https://honk.test/api/v1/groups/proxy/config');
        expect(request.headers.get('If-Match')).toBe('\"40\"');
        expect(request.headers.get('Content-Type')).toBe('application/json-patch+json');
        keys.push(request.headers.get('Idempotency-Key') ?? '');
        expect(await request.json()).toEqual(body);
        return calls++ === 0
          ? json({...acceptedBody, kind: 'group_update'}, 202, {Location: acceptedBody.href, 'Retry-After': '2'})
          : json({policy: {kind: 'urltest', native: 'min_moving_avg'}, config: {tolerance: 100}}, 200, {ETag: '"41"'});
      })
    );
    const api = createApi('https://honk.test');
    await expect(api.patchGroup('proxy', [...body], '\"40\"')).resolves.toMatchObject({
      operation_id: 'op-1',
      kind: 'group_update',
      retryAfter: 2
    });
    await expect(api.patchGroup('proxy', [...body], '\"40\"')).resolves.toMatchObject({policy: {kind: 'urltest'}, config: {tolerance: 100}});
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
  const node = {id: 'node-1', name: 'edge', protocol: 'vless', subscription_tag: null, provider_id: 'inline', group_ids: [], health: []};
  const provider = {id: 'sub-1', name: 'sub', kind: 'subscription', url_redacted: null, node_count: 0, updated_at: null, expires_at: null};
  const writes = [
    {kind: 'node_create', method: 'POST', path: '/api/v1/nodes', call: api => api.createNode({name: 'edge', link: 'vless://x@h:1'}), result: node},
    {kind: 'node_delete', method: 'DELETE', path: '/api/v1/nodes/node-1', call: api => api.deleteNode('node-1'), result: {deleted: 1}},
    {
      kind: 'provider_create',
      method: 'POST',
      path: '/api/v1/providers',
      call: api => api.createProvider({name: 'sub', kind: 'subscription', url: 'https://example.net/sub'}),
      result: provider
    },
    {kind: 'provider_delete', method: 'DELETE', path: '/api/v1/providers/sub-1', call: api => api.deleteProvider('sub-1'), result: {deleted: 1}}
  ] satisfies Array<{kind: string; method: string; path: string; call: (api: ReturnType<typeof createApi>) => Promise<unknown>; result: object}>;
  it.each(writes)('follows a 202 $kind to its result after Retry-After, without an idempotency key', async ({kind, method, path, call, result}) => {
    vi.useFakeTimers();
    const href = '/api/v1/operations/op-7';
    const request = vi
      .fn()
      .mockResolvedValueOnce(json({operation_id: 'op-7', kind, status: 'queued', href}, 202, {Location: href, 'Retry-After': '2'}))
      .mockResolvedValueOnce(json({operation_id: 'op-7', kind, status: 'succeeded', result, error: null}));
    vi.stubGlobal('fetch', request);
    const api = createApi('https://honk.test');
    const accepted = await call(api);
    const sent = request.mock.calls[0][0] as Request;
    expect([sent.method, new URL(sent.url).pathname, sent.headers.get('Idempotency-Key')]).toEqual([method, path, null]);
    expect(accepted).toMatchObject({operation_id: 'op-7', kind, retryAfter: 2});
    const operation = api.pollOperation(accepted as OperationAccepted);
    await vi.advanceTimersByTimeAsync(1999);
    expect(request).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(String(request.mock.calls[1][0])).toBe('https://honk.test' + href);
    await expect(operation).resolves.toMatchObject({status: 'succeeded', result});
  });
  it.each(writes)('returns a synchronous $kind answer as it is', async ({method, call, result}) => {
    const request = vi.fn().mockResolvedValueOnce(json(result, method === 'POST' ? 201 : 200));
    vi.stubGlobal('fetch', request);
    await expect(call(createApi('https://honk.test'))).resolves.toEqual(result);
    expect((request.mock.calls[0][0] as Request).headers.get('Idempotency-Key')).toBeNull();
  });
  it('keeps a proxy prefix when following an operation href', async () => {
    vi.useFakeTimers();
    const request = vi
      .fn()
      .mockResolvedValueOnce(json(acceptedBody, 202, {Location: acceptedBody.href, 'Retry-After': '1'}))
      .mockResolvedValueOnce(json({operation_id: 'op-1', status: 'succeeded'}));
    vi.stubGlobal('fetch', request);
    const api = createApi('https://honk.test/doona');
    const result = api.pollOperation(await api.startReload());
    await vi.advanceTimersByTimeAsync(1000);
    expect(String(request.mock.calls[1][0])).toBe('https://honk.test/doona' + acceptedBody.href);
    await expect(result).resolves.toMatchObject({status: 'succeeded'});
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
    const expired = vi.fn();
    const result = createApi('https://honk.test', 'secret').subscribeEvents({
      kinds: ['runtime.updated'],
      lastEventId: 'instance:1',
      signal: controller.signal,
      onCursorExpired: expired,
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
    // Only the refused cursor lost history; resuming after EOF did not.
    expect(expired).toHaveBeenCalledOnce();
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
  // Events advertise their heartbeat interval; logs fall back to the contract ceiling of 15 seconds.
  it.each([
    ['events', 10],
    ['logs', 15]
  ] as const)('reconnects a silent %s stream after missed heartbeats and resumes from its cursor', async (kind, seconds) => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const states: boolean[] = [];
    const encoder = new TextEncoder();
    let beat: ReadableStreamDefaultController<Uint8Array> | undefined;
    const open = () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(c) {
            beat = c;
            c.enqueue(encoder.encode('id: instance:4\nevent: stream.ready\ndata: {"instance_id":"instance","observed_at":"2026-09-15T14:00:00Z"}\n\n'));
          }
        }),
        {headers: {'Content-Type': 'text/event-stream'}}
      );
    const request = vi.fn(async () => open());
    vi.stubGlobal('fetch', request);
    const api = createApi('https://honk.test');
    const options = {signal: controller.signal, onConnectionChange: (state: boolean) => states.push(state)};
    const stream =
      kind === 'events' ? api.subscribeEvents({...options, heartbeatSeconds: seconds, onEvent: () => {}}) : api.subscribeLogs({...options, onRecord: () => {}});
    // Heartbeat comments keep a quiet stream open.
    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(seconds * 2000);
      beat!.enqueue(encoder.encode(': heartbeat\n'));
    }
    expect(request).toHaveBeenCalledTimes(1);
    expect(states).toEqual([false, true]);
    // Two and a half intervals of silence: the stream is reported down and reopened from its cursor.
    await vi.advanceTimersByTimeAsync(seconds * 2500 - 1);
    expect(states).toEqual([false, true]);
    await vi.advanceTimersByTimeAsync(1);
    expect(states.at(-1)).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(request).toHaveBeenCalledTimes(2);
    expect(new Headers((request.mock.calls[1] as unknown as [URL, RequestInit])[1].headers).get('Last-Event-ID')).toBe('instance:4');
    expect(states.at(-1)).toBe(true);
    controller.abort();
    await stream;
  });
  it.each([
    [0, 37500],
    [Number.NaN, 37500],
    [1, 10000]
  ])('keeps the silence limit sane for an advertised heartbeat of %s seconds', async (seconds, limit) => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const request = vi.fn(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(c) {
              c.enqueue(new TextEncoder().encode('id: i:1\nevent: stream.ready\ndata: {"instance_id":"i","observed_at":"2026-09-15T14:00:00Z"}\n\n'));
            }
          })
        )
    );
    vi.stubGlobal('fetch', request);
    const stream = createApi('https://honk.test').subscribeEvents({signal: controller.signal, heartbeatSeconds: seconds, onEvent: () => {}});
    await vi.advanceTimersByTimeAsync(limit - 1);
    expect(request).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1001);
    expect(request).toHaveBeenCalledTimes(2);
    controller.abort();
    await stream;
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
  expect(capabilities.unreported).toContain('geodata');
  expect(capabilities.unreported).not.toContain('connections');
});
