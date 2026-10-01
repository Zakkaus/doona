import createClient, {type Middleware} from 'openapi-fetch';
import type {paths} from './types';
import type {Api} from './api';
import {
  operationDone,
  type ApiEvent,
  type EventKind,
  type EventOptions,
  type FlowDetail,
  type LogOptions,
  type LogRecord,
  type OperationAccepted,
  type OperationState,
  type RoutingTraceResponse
} from './model';
import {ApiError, clientError, responseError, send} from './error';
import {uuid} from './hash';
import {readSse} from './sse';
import {wait} from './wait';
import {waitOutRefusal} from './refusal';
import {eventKinds} from './selectors';
import {normalizeCapabilities} from './capabilities';
import {createServerClock, type ServerClock} from './serverClock';

const retryAfter = (response: Response) => Math.max(1, Number(response.headers.get('Retry-After')) || 1);

function data<T>(result: {data?: T; response: Response}): T {
  if (result.data === undefined) throw clientError(result.response.status, 'empty_response', 'Response has no JSON body', 'ui.errNoJson');
  return result.data;
}

function accepted(result: {data?: Omit<OperationAccepted, 'retryAfter'>; response: Response}): OperationAccepted {
  return {...data(result), retryAfter: retryAfter(result.response)};
}

// Keyed mutations and requests that write nothing retry explicit transient refusals this many times.
const MAX_REFUSALS = 3;
// The contract replays a repeated Idempotency-Key only for operation starts, the calls that can answer 202 with a
// retained operation. Synchronous writes accept a key but run again, so they are sent without one.
type OperationStarts = {
  [P in keyof paths]: {[M in keyof paths[P] as paths[P][M] extends {responses: {202: unknown}} ? M : never]: paths[P][M]};
};
// Requests that write nothing, so a refusal is safe to replay without an Idempotency-Key.
const readOnlyPaths = ['/dns/query', '/config/validate', '/routing/trace'];
// These requests write configuration; a missing reason still needs the backend's specific refusal message.
const configurationWrites = new Set([
  'PUT /api/v1/config/sources/{source_id}',
  'POST /api/v1/config/sources',
  'PATCH /api/v1/groups/{group_id}/config',
  'POST /api/v1/nodes',
  'DELETE /api/v1/nodes/{node_id}',
  'POST /api/v1/providers',
  'DELETE /api/v1/providers/{provider_id}'
]);
// Both streams send a heartbeat comment at least this often while idle. A half-open connection never errors, so a
// stream silent for MISSED_HEARTBEATS intervals is treated as dropped.
const HEARTBEAT_SECONDS = 15;
const MISSED_HEARTBEATS = 2.5;
// A tiny advertised interval must not turn a brief stall into a reconnect storm.
const MIN_SILENCE_MS = 10000;
const silenceLimit = (seconds: number) =>
  Math.max(MIN_SILENCE_MS, (Number.isFinite(seconds) && seconds > 0 ? seconds : HEARTBEAT_SECONDS) * MISSED_HEARTBEATS * 1000);

/** Base is the server root, optionally including a reverse-proxy prefix. */
export function createApi(base: string, token?: string, clock: ServerClock = createServerClock()): Api {
  const baseUrl = base.replace(/\/+$/, '');
  const read = <T>(result: {data?: T; response: Response}): T => {
    const value = data(result);
    clock.note((value as {observed_at?: unknown} | null)?.observed_at);
    return value;
  };
  // A write that may run in the background answers with its result, or 202 with the operation that produces it.
  const resultOrAccepted = <R extends object>(result: {data?: R | Omit<OperationAccepted, 'retryAfter'>; response: Response}): R | OperationAccepted => {
    const value = read(result);
    return 'operation_id' in value ? accepted({data: value, response: result.response}) : (value as R);
  };
  const headers: Record<string, string> = {Accept: 'application/json'};
  if (token) headers.Authorization = 'Bearer ' + token;
  const options = {
    baseUrl,
    headers,
    cache: 'no-store' as const,
    fetch: async (request: Request) => {
      // A mutation is replayed only under an Idempotency-Key, which only operation starts carry, so a refusal that
      // already wrote something cannot repeat the write.
      const {pathname} = new URL(request.url);
      const readOnly = readOnlyPaths.some(path => pathname.endsWith(path));
      // A read-only POST gets the read deadline and text: it cannot have changed anything.
      const write = request.method !== 'GET' && !readOnly;
      const retryable = request.headers.has('Idempotency-Key') || readOnly;
      if (!retryable) return send(request, undefined, write);
      // A refusal with Retry-After is waited out a few times; the caller sees the last refusal after that.
      for (let refused = 0; ; refused++) {
        const response = await send(request.clone(), undefined, write);
        if ((response.status !== 503 && response.status !== 429) || refused >= MAX_REFUSALS) return response;
        const error = await responseError(response.clone());
        if (!error.transient) return response;
        await response.body?.cancel();
        await waitOutRefusal(response.status, error.retryAfter!, request.signal);
      }
    }
  };
  const failures: Middleware = {
    onResponse: async ({request, response, schemaPath}) => {
      if (!response.ok) {
        const error = await responseError(response);
        error.configurationWrite = configurationWrites.has(`${request.method} ${schemaPath}`);
        throw error;
      }
      return response;
    }
  };
  const client = createClient<paths>(options);
  client.use(failures);
  // A fresh key per operation start prevents transport retries from starting a second operation.
  const starts = createClient<OperationStarts>(options);
  starts.use({onRequest: ({request}) => request.headers.set('Idempotency-Key', uuid())}, failures);
  // Resolve contract-absolute hrefs under the configured reverse-proxy prefix, not the origin.
  const resolveHref = (href: string) => {
    const root = new URL(baseUrl + '/', globalThis.location?.href);
    const url = new URL(href.replace(/^\/+/, ''), root);
    if (url.origin !== root.origin) throw clientError(0, 'invalid_location', 'Operation URL has a different origin', 'ui.errOtherOrigin');
    return url;
  };
  async function pollOperation(accepted: OperationAccepted, signal?: AbortSignal): Promise<OperationState> {
    let delay = accepted.retryAfter;
    let dropped = 0;
    const url = resolveHref(accepted.href);
    while (true) {
      await wait(delay, signal);
      let response: Response;
      try {
        response = await send(url, {headers, cache: 'no-store', signal});
        dropped = 0;
      } catch (error) {
        // A dropped connection says nothing about the accepted operation; ask again a few times before giving up.
        if (signal?.aborted || ++dropped > 3) throw error;
        delay = Math.min(delay * 2, 30);
        continue;
      }
      if (!response.ok) {
        const error = await responseError(response);
        // Rate limited or briefly unavailable: the accepted operation is still running, so keep polling.
        if (!error.transient) throw error;
        delay = error.retryAfter!;
        continue;
      }
      const operation: OperationState = await response.json();
      if (operationDone(operation.status)) return operation;
      delay = retryAfter(response);
    }
  }
  // Both SSE feeds resume with Last-Event-ID and honour Retry-After; cursor expiry restarts at the head, a definitive
  // 4xx or an oversized frame stops, and transient failures and silent connections back off to 30 seconds.
  async function subscribeStream(
    url: URL,
    lastEventId: string | undefined,
    signal: AbortSignal | undefined,
    onConnectionChange: ((ready: boolean) => void) | undefined,
    onCursorExpired: (() => void) | undefined,
    onFrame: (event: string, data: unknown, cursor: string) => void,
    heartbeatSeconds = HEARTBEAT_SECONDS
  ): Promise<void> {
    let cursor = lastEventId;
    let backoff = 1;
    // A failed attempt's Retry-After, honoured on top of the backoff; cleared once used.
    let pause = 0;
    try {
      while (!signal?.aborted) {
        onConnectionChange?.(false);
        const attempt = new AbortController();
        const cancel = () => attempt.abort(signal?.reason);
        signal?.addEventListener('abort', cancel, {once: true});
        let silence: ReturnType<typeof setTimeout> | undefined;
        const alive = () => {
          clearTimeout(silence);
          silence = setTimeout(() => attempt.abort(), silenceLimit(heartbeatSeconds));
        };
        alive();
        try {
          const streamHeaders = {...headers, Accept: 'text/event-stream', ...(cursor ? {'Last-Event-ID': cursor} : {})};
          const response = await fetch(url, {headers: streamHeaders, cache: 'no-store', signal: attempt.signal});
          if (!response.ok) {
            const error = await responseError(response);
            if (cursor && error.status === 409 && error.code === 'event_cursor_expired') {
              cursor = undefined;
              onCursorExpired?.();
              continue;
            }
            pause = retryAfter(response);
            throw error;
          }
          if (!response.body) throw clientError(response.status, 'empty_stream', 'Response has no event stream', 'ui.errNoStream');
          await readSse(
            response.body,
            frame => {
              if (frame.id !== undefined) cursor = frame.id;
              if (frame.event === 'stream.ready') {
                backoff = 1;
                onConnectionChange?.(true);
              }
              if (frame.data) {
                let value: unknown;
                try {
                  value = JSON.parse(frame.data);
                } catch {
                  return;
                }
                onFrame(frame.event, value, cursor ?? '');
              }
            },
            attempt.signal,
            alive
          );
          onConnectionChange?.(false);
          await wait(retryAfter(response), signal);
        } catch (error) {
          if (signal?.aborted) throw error;
          // An oversized frame would arrive again on resuming, so it ends the stream like a definitive 4xx.
          if (error instanceof ApiError && ((error.status >= 400 && error.status < 500 && error.status !== 429) || error.code === 'frame_too_large'))
            throw error;
          onConnectionChange?.(false);
          await wait(Math.max(backoff, pause), signal);
          pause = 0;
          backoff = Math.min(backoff * 2, 30);
        } finally {
          clearTimeout(silence);
          signal?.removeEventListener('abort', cancel);
        }
      }
    } catch (error) {
      if (!signal?.aborted) throw error;
    } finally {
      onConnectionChange?.(false);
    }
  }
  function subscribeEvents({kinds, lastEventId, heartbeatSeconds, signal, onEvent, onConnectionChange, onCursorExpired}: EventOptions): Promise<void> {
    const url = new URL(baseUrl + '/api/v1/events', globalThis.location?.href);
    if (kinds?.length) url.searchParams.set('kinds', kinds.join(','));
    return subscribeStream(
      url,
      lastEventId,
      signal,
      onConnectionChange,
      onCursorExpired,
      // A kind from a newer backend still reaches the feeds, which describe it generically. Its payload has to be an
      // object, as every event's is, and the time the feeds print is kept only when it is a string.
      (event, data, cursor) => {
        if (eventKinds.includes(event as EventKind)) onEvent({id: cursor, event, data} as ApiEvent);
        else if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
          const observed = (data as {observed_at?: unknown}).observed_at;
          onEvent({id: cursor, event, data: {...data, observed_at: typeof observed === 'string' ? observed : ''}} as ApiEvent);
        }
      },
      heartbeatSeconds
    );
  }
  function subscribeLogs({level, target, lastEventId, signal, onRecord, onConnectionChange, onCursorExpired}: LogOptions): Promise<void> {
    const url = new URL(baseUrl + '/api/v1/logs', globalThis.location?.href);
    if (level) url.searchParams.set('level', level);
    if (target) url.searchParams.set('target', target);
    return subscribeStream(url, lastEventId, signal, onConnectionChange, onCursorExpired, (event, data, cursor) => {
      if (event === 'log') onRecord({id: cursor, ...(data as LogRecord)});
    });
  }
  return {
    discovery: async signal => read(await client.GET('/api', {signal})),
    version: async signal => read(await client.GET('/api/v1/version', {signal})),
    capabilities: async signal => normalizeCapabilities(read(await client.GET('/api/v1/capabilities', {signal}))),
    runtime: async signal => read(await client.GET('/api/v1/runtime', {signal})),
    runtimeOutbounds: async signal => read(await client.GET('/api/v1/runtime/outbounds', {signal})),
    trafficHistory: async (query, signal) => read(await client.GET('/api/v1/runtime/traffic/history', {params: {query}, signal})),
    memoryHistory: async (query, signal) => read(await client.GET('/api/v1/runtime/memory/history', {params: {query}, signal})),
    datapath: async (detail, signal) => read(await client.GET('/api/v1/datapath', {params: {query: {detail}}, signal})),
    runtimeMemory: async signal => read(await client.GET('/api/v1/runtime/memory', {signal})),
    nodes: async (query, signal) => read(await client.GET('/api/v1/nodes', {params: {query}, signal})),
    groups: async signal => read(await client.GET('/api/v1/groups', {signal})),
    group: async (id, signal) => read(await client.GET('/api/v1/groups/{group_id}', {params: {path: {group_id: id}}, signal})),
    selectGroup: async (groupId, body, signal) =>
      read(await client.PUT('/api/v1/groups/{group_id}/selection', {params: {path: {group_id: groupId}}, body, signal})),
    clearGroupOverride: async (groupId, network, signal) =>
      read(await client.DELETE('/api/v1/groups/{group_id}/selection', {params: {path: {group_id: groupId}, query: {network}}, signal})),
    patchGroup: async (groupId, body, ifMatch, signal) => {
      const result = await starts.PATCH('/api/v1/groups/{group_id}/config', {
        params: {path: {group_id: groupId}, header: {'If-Match': ifMatch}},
        headers: {'Content-Type': 'application/json-patch+json'},
        body,
        signal
      });
      return resultOrAccepted(result);
    },
    startProbe: async (body, signal) => accepted(await starts.POST('/api/v1/probes', {body, signal})),
    connections: async (query, signal) => read(await client.GET('/api/v1/connections', {params: {query}, signal})),
    flows: async (query, signal) => read(await client.GET('/api/v1/flows', {params: {query}, signal})),
    // Readable in openapi-fetch drops required null fields from composed schemas.
    flow: async (id, signal) => read(await client.GET('/api/v1/flows/{flow_id}', {params: {path: {flow_id: id}}, signal})) as FlowDetail,
    dnsCache: async (query, signal) => read(await client.GET('/api/v1/dns/cache', {params: {query}, signal})),
    dnsLog: async (query, signal) => read(await client.GET('/api/v1/dns/log', {params: {query}, signal})),
    dnsQuery: async (domain, types, signal, cacheMode = 'normal') =>
      read(await client.POST('/api/v1/dns/query', {params: {query: {detail: 'full'}}, body: {domain, type: types, cache_mode: cacheMode}, signal})),
    // 204 carries no body; the response middleware has already turned any error status into an ApiError.
    closeConnection: async (connection_id, signal) => {
      await client.DELETE('/api/v1/connections/{connection_id}', {params: {path: {connection_id}}, signal});
    },
    closeConnections: async (query, signal) => read(await client.DELETE('/api/v1/connections', {params: {query}, signal})),
    runtimeSettings: async signal => read(await client.GET('/api/v1/runtime/settings', {signal})),
    providers: async (query, signal) => read(await client.GET('/api/v1/providers', {params: {query}, signal})),
    refreshProvider: async (id, signal) => accepted(await starts.POST('/api/v1/providers/{provider_id}/refresh', {params: {path: {provider_id: id}}, signal})),
    // Node and provider writes may answer 202 with an operation, yet the contract keeps them out of Idempotency-Key
    // replay, so they go through the plain client.
    createProvider: async (body, signal) => resultOrAccepted(await client.POST('/api/v1/providers', {body, signal})),
    deleteProvider: async (id, signal) => resultOrAccepted(await client.DELETE('/api/v1/providers/{provider_id}', {params: {path: {provider_id: id}}, signal})),
    createNode: async (body, signal) => resultOrAccepted(await client.POST('/api/v1/nodes', {body, signal})),
    deleteNode: async (id, signal) => resultOrAccepted(await client.DELETE('/api/v1/nodes/{node_id}', {params: {path: {node_id: id}}, signal})),
    geodata: async signal => read(await client.GET('/api/v1/geodata', {signal})),
    rules: async signal => read(await client.GET('/api/v1/rules', {signal})),
    dnsRules: async signal => read(await client.GET('/api/v1/dns/rules', {signal})),
    updateGeodata: async signal => accepted(await starts.POST('/api/v1/geodata/update', {signal})),
    config: async signal => read(await client.GET('/api/v1/config', {signal})),
    validateConfig: async (body, signal) => read(await client.POST('/api/v1/config/validate', {body, signal})),
    replaceConfigSource: async (source_id, content, ifMatch, signal) =>
      accepted(
        await starts.PUT('/api/v1/config/sources/{source_id}', {
          params: {path: {source_id}, header: {'If-Match': ifMatch}},
          body: {content},
          signal
        })
      ),
    createConfigSource: async (path, content, signal) => accepted(await starts.POST('/api/v1/config/sources', {body: {path, content}, signal})),
    patchRuntimeSettings: async (body, signal) => read(await client.PATCH('/api/v1/runtime/settings', {body, signal})),
    deleteDnsEntry: async (entry_id, signal) => read(await client.DELETE('/api/v1/dns/cache/{entry_id}', {params: {path: {entry_id}}, signal})),
    flushDnsCache: async signal => read(await client.POST('/api/v1/dns/cache/flush', {body: {}, signal})),
    // Readable also drops SimulationDnsData.attempt_id, whose contract value is null.
    routingTrace: async (body, signal) => read(await client.POST('/api/v1/routing/trace', {body, signal})) as RoutingTraceResponse,
    startReload: async signal => accepted(await starts.POST('/api/v1/operations/reload', {body: {}, signal})),
    startSuspend: async signal => accepted(await starts.POST('/api/v1/operations/suspend', {body: {}, signal})),
    startResume: async signal => accepted(await starts.POST('/api/v1/operations/resume', {body: {}, signal})),
    pollOperation,
    subscribeEvents,
    subscribeLogs
  };
}
