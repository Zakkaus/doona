import createClient from 'openapi-fetch';
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
// Requests that write nothing, so a refusal is safe to replay without an Idempotency-Key.
const readOnlyPaths = ['/dns/query', '/config/validate', '/routing/trace'];
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
  const headers: Record<string, string> = {Accept: 'application/json'};
  if (token) headers.Authorization = 'Bearer ' + token;
  const client = createClient<paths>({
    baseUrl,
    headers,
    cache: 'no-store',
    fetch: async request => {
      // A mutation is replayed only under an Idempotency-Key, so a refusal that already wrote something cannot
      // repeat the write.
      const {pathname} = new URL(request.url);
      const retryable = request.headers.has('Idempotency-Key') || readOnlyPaths.some(path => pathname.endsWith(path));
      if (!retryable) return send(request);
      // A refusal with Retry-After is waited out a few times; the caller sees the last refusal after that.
      for (let refused = 0; ; refused++) {
        const response = await send(request.clone());
        if ((response.status !== 503 && response.status !== 429) || refused >= MAX_REFUSALS) return response;
        const error = await responseError(response.clone());
        if (!error.transient) return response;
        await response.body?.cancel();
        await waitOutRefusal(response.status, error.retryAfter!, request.signal);
      }
    }
  });
  client.use({
    onResponse: async ({response}) => {
      if (!response.ok) throw await responseError(response);
      return response;
    }
  });
  // A fresh key per mutation prevents transport retries from starting a second operation.
  const once = () => ({'Idempotency-Key': uuid()});
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
  // 4xx stops, and transient failures and silent connections back off to 30 seconds.
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
          if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 429) throw error;
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
      (event, data, cursor) => {
        if (eventKinds.includes(event as EventKind)) onEvent({id: cursor, event, data} as ApiEvent);
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
    group: async (id, signal) => read(await client.GET('/api/v1/groups/{groupId}', {params: {path: {groupId: id}}, signal})),
    selectGroup: async (groupId, body, signal) => read(await client.PUT('/api/v1/groups/{groupId}/selection', {params: {path: {groupId}}, body, signal})),
    clearGroupOverride: async (groupId, network, signal) =>
      read(await client.DELETE('/api/v1/groups/{groupId}/selection', {params: {path: {groupId}, query: {network}}, signal})),
    patchGroup: async (groupId, body, ifMatch, signal) => {
      const result = await client.PATCH('/api/v1/groups/{groupId}', {
        params: {path: {groupId}, header: {'If-Match': ifMatch}},
        headers: {'Content-Type': 'application/json-patch+json', ...once()},
        body,
        signal
      });
      const value = read(result);
      return 'operation_id' in value ? accepted({data: value, response: result.response}) : value;
    },
    startProbe: async (body, signal) => accepted(await client.POST('/api/v1/probes', {body, headers: once(), signal})),
    connections: async (query, signal) => read(await client.GET('/api/v1/connections', {params: {query}, signal})),
    flows: async (query, signal) => read(await client.GET('/api/v1/flows', {params: {query}, signal})),
    // Readable in openapi-fetch drops required null fields from composed schemas.
    flow: async (id, signal) => read(await client.GET('/api/v1/flows/{flow_id}', {params: {path: {flow_id: id}}, signal})) as FlowDetail,
    dnsCache: async (query, signal) => read(await client.GET('/api/v1/dns/cache', {params: {query}, signal})),
    dnsLog: async (query, signal) => read(await client.GET('/api/v1/dns/log', {params: {query}, signal})),
    dnsQuery: async (domain, types, signal) => read(await client.GET('/api/v1/dns/query', {params: {query: {domain, type: types, detail: 'full'}}, signal})),
    // 204 carries no body; the response middleware has already turned any error status into an ApiError.
    closeConnection: async (connection_id, signal) => {
      await client.DELETE('/api/v1/connections/{connection_id}', {params: {path: {connection_id}}, headers: once(), signal});
    },
    closeConnections: async (query, signal) => read(await client.DELETE('/api/v1/connections', {params: {query}, headers: once(), signal})),
    runtimeSettings: async signal => read(await client.GET('/api/v1/runtime/settings', {signal})),
    providers: async (query, signal) => read(await client.GET('/api/v1/providers', {params: {query}, signal})),
    refreshProvider: async (id, signal) => accepted(await client.POST('/api/v1/providers/{id}/refresh', {params: {path: {id}}, headers: once(), signal})),
    createProvider: async (body, signal) => read(await client.POST('/api/v1/providers', {body, signal})),
    deleteProvider: async (id, signal) => read(await client.DELETE('/api/v1/providers/{id}', {params: {path: {id}}, signal})),
    createNode: async (body, signal) => read(await client.POST('/api/v1/nodes', {body, signal})),
    deleteNode: async (id, signal) => read(await client.DELETE('/api/v1/nodes/{id}', {params: {path: {id}}, signal})),
    geodata: async signal => read(await client.GET('/api/v1/geodata', {signal})),
    rules: async signal => read(await client.GET('/api/v1/rules', {signal})),
    updateGeodata: async signal => accepted(await client.POST('/api/v1/geodata/update', {headers: once(), signal})),
    config: async signal => read(await client.GET('/api/v1/config', {signal})),
    validateConfig: async (body, signal) => read(await client.POST('/api/v1/config/validate', {body, signal})),
    replaceConfigSource: async (source_id, content, ifMatch, signal) =>
      accepted(
        await client.PUT('/api/v1/config/sources/{source_id}', {
          params: {path: {source_id}, header: {'If-Match': ifMatch}},
          headers: once(),
          body: {content},
          signal
        })
      ),
    patchRuntimeSettings: async (body, signal) => read(await client.PATCH('/api/v1/runtime/settings', {body, headers: once(), signal})),
    deleteDnsEntry: async (entry_id, signal) => read(await client.DELETE('/api/v1/dns/cache/{entry_id}', {params: {path: {entry_id}}, signal})),
    flushDnsCache: async signal => read(await client.POST('/api/v1/dns/cache/flush', {body: {}, signal})),
    // Readable also drops SimulationDnsData.attempt_id, whose contract value is null.
    routingTrace: async (body, signal) => read(await client.POST('/api/v1/routing/trace', {body, signal})) as RoutingTraceResponse,
    startReload: async signal => accepted(await client.POST('/api/v1/operations/reload', {body: {}, headers: once(), signal})),
    startSuspend: async signal => accepted(await client.POST('/api/v1/operations/suspend', {body: {}, headers: once(), signal})),
    startResume: async signal => accepted(await client.POST('/api/v1/operations/resume', {body: {}, headers: once(), signal})),
    operation: async (id, signal) => {
      const result = await client.GET('/api/v1/operations/{id}', {params: {path: {id}}, signal});
      return {...read(result), retryAfter: retryAfter(result.response)} as OperationState;
    },
    pollOperation,
    subscribeEvents,
    subscribeLogs
  };
}
