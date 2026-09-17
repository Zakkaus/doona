import createClient from 'openapi-fetch';
import type {paths} from './types';
import type {Api} from './api';
import type {ApiEvent, EventKind, EventOptions, FlowDetail, LogOptions, LogRecord, OperationAccepted, OperationState, RoutingTraceResponse} from './model';
import {ApiError, responseError} from './error';
import {readSse} from './sse';
import {wait} from './wait';

export {ApiError} from './error';
const eventKinds: EventKind[] = ['stream.ready', 'runtime.updated', 'flow.updated', 'flow.gap', 'operation.updated', 'generation.changed'];
const retryAfter = (response: Response) => Math.max(1, Number(response.headers.get('Retry-After')) || 1);

function data<T>(result: {data?: T; response: Response}): T {
  if (result.data === undefined) throw new ApiError(result.response.status, 'empty_response', 'Response has no JSON body');
  return result.data;
}

function accepted(result: {data?: Omit<OperationAccepted, 'location' | 'retryAfter'>; response: Response}): OperationAccepted {
  const body = data(result);
  return {...body, location: result.response.headers.get('Location') ?? body.href, retryAfter: retryAfter(result.response)};
}

/** Base is the server root, optionally including a reverse-proxy prefix. */
export function createApi(base: string, token?: string): Api {
  const baseUrl = base.replace(/\/+$/, '');
  const headers: Record<string, string> = {Accept: 'application/json'};
  if (token) headers.Authorization = 'Bearer ' + token;
  const client = createClient<paths>({baseUrl, headers, cache: 'no-store'});
  client.use({
    onResponse: async ({response}) => {
      if (!response.ok) throw await responseError(response);
      return response;
    }
  });
  const resolveHref = (href: string) => {
    const root = new URL(baseUrl + '/', globalThis.location?.href);
    const url = new URL(href, root);
    if (url.origin !== root.origin) throw new ApiError(0, 'invalid_location', 'Operation URL has a different origin');
    return url;
  };
  async function pollOperation(accepted: OperationAccepted, signal?: AbortSignal): Promise<OperationState> {
    let delay = accepted.retryAfter;
    const url = resolveHref(accepted.href);
    while (true) {
      await wait(delay, signal);
      const response = await fetch(url, {headers, cache: 'no-store', signal});
      if (!response.ok) throw await responseError(response);
      const operation: OperationState = await response.json();
      if (operation.status === 'succeeded' || operation.status === 'failed') return operation;
      delay = retryAfter(response);
    }
  }
  async function subscribeEvents({kinds, lastEventId, signal, onEvent, onConnectionChange}: EventOptions): Promise<void> {
    let cursor = lastEventId;
    const url = new URL(baseUrl + '/api/v1/events', globalThis.location?.href);
    if (kinds?.length) url.searchParams.set('kinds', kinds.join(','));
    try {
      while (!signal?.aborted) {
        onConnectionChange?.(false);
        const streamHeaders = {...headers, Accept: 'text/event-stream', ...(cursor ? {'Last-Event-ID': cursor} : {})};
        const response = await fetch(url, {headers: streamHeaders, cache: 'no-store', signal});
        if (!response.ok) {
          const error = await responseError(response);
          if (cursor && error.status === 409 && error.code === 'event_cursor_expired') {
            cursor = undefined;
            continue;
          }
          throw error;
        }
        if (!response.body) throw new ApiError(response.status, 'empty_stream', 'Response has no event stream');
        await readSse(
          response.body,
          frame => {
            if (frame.id !== undefined) cursor = frame.id;
            if (!frame.data || !eventKinds.includes(frame.event as EventKind)) return;
            if (frame.event === 'stream.ready') onConnectionChange?.(true);
            onEvent({id: cursor ?? '', event: frame.event, data: JSON.parse(frame.data)} as ApiEvent);
          },
          signal
        );
        onConnectionChange?.(false);
        await wait(retryAfter(response), signal);
      }
    } catch (error) {
      if (!signal?.aborted) throw error;
    } finally {
      onConnectionChange?.(false);
    }
  }
  // The log stream follows the event stream's rules: stream.ready first, Last-Event-ID to resume, 409 when
  // the cursor is gone, a Retry-After pause between attempts.
  async function subscribeLogs({level, target, lastEventId, signal, onRecord, onConnectionChange}: LogOptions): Promise<void> {
    let cursor = lastEventId;
    const url = new URL(baseUrl + '/api/v1/logs', globalThis.location?.href);
    if (level) url.searchParams.set('level', level);
    if (target) url.searchParams.set('target', target);
    try {
      while (!signal?.aborted) {
        onConnectionChange?.(false);
        const streamHeaders = {...headers, Accept: 'text/event-stream', ...(cursor ? {'Last-Event-ID': cursor} : {})};
        const response = await fetch(url, {headers: streamHeaders, cache: 'no-store', signal});
        if (!response.ok) {
          const error = await responseError(response);
          if (cursor && error.status === 409 && error.code === 'event_cursor_expired') {
            cursor = undefined;
            continue;
          }
          throw error;
        }
        if (!response.body) throw new ApiError(response.status, 'empty_stream', 'Response has no event stream');
        await readSse(
          response.body,
          frame => {
            if (frame.id !== undefined) cursor = frame.id;
            if (frame.event === 'stream.ready') onConnectionChange?.(true);
            if (frame.event === 'log' && frame.data) onRecord({id: cursor ?? '', ...(JSON.parse(frame.data) as LogRecord)});
          },
          signal
        );
        onConnectionChange?.(false);
        await wait(retryAfter(response), signal);
      }
    } catch (error) {
      if (!signal?.aborted) throw error;
    } finally {
      onConnectionChange?.(false);
    }
  }
  return {
    discovery: async signal => data(await client.GET('/api', {signal})),
    version: async signal => data(await client.GET('/api/v1/version', {signal})),
    capabilities: async signal => data(await client.GET('/api/v1/capabilities', {signal})),
    runtime: async signal => data(await client.GET('/api/v1/runtime', {signal})),
    runtimeOutbounds: async signal => data(await client.GET('/api/v1/runtime/outbounds', {signal})),
    trafficHistory: async (query, signal) => data(await client.GET('/api/v1/runtime/traffic/history', {params: {query}, signal})),
    memoryHistory: async (query, signal) => data(await client.GET('/api/v1/runtime/memory/history', {params: {query}, signal})),
    datapath: async (detail, signal) => data(await client.GET('/api/v1/datapath', {params: {query: {detail}}, signal})),
    runtimeMemory: async signal => data(await client.GET('/api/v1/runtime/memory', {signal})),
    nodes: async (query, signal) => data(await client.GET('/api/v1/nodes', {params: {query}, signal})),
    groups: async signal => data(await client.GET('/api/v1/groups', {signal})),
    group: async (id, signal) => data(await client.GET('/api/v1/groups/{groupId}', {params: {path: {groupId: id}}, signal})),
    selectGroup: async (groupId, body, signal) => data(await client.PUT('/api/v1/groups/{groupId}/selection', {params: {path: {groupId}}, body, signal})),
    clearGroupOverride: async (groupId, network, signal) =>
      data(await client.DELETE('/api/v1/groups/{groupId}/selection', {params: {path: {groupId}, query: {network}}, signal})),
    patchGroup: async (groupId, body, ifMatch, signal) => {
      const result = await client.PATCH('/api/v1/groups/{groupId}', {
        params: {path: {groupId}, header: {'If-Match': ifMatch}},
        headers: {'Content-Type': 'application/json-patch+json'},
        body,
        signal
      });
      const value = data(result);
      return 'operation_id' in value ? accepted({data: value, response: result.response}) : value;
    },
    startProbe: async (body, signal) => accepted(await client.POST('/api/v1/probes', {body, signal})),
    connections: async (query, signal) => data(await client.GET('/api/v1/connections', {params: {query}, signal})),
    flows: async (query, signal) => data(await client.GET('/api/v1/flows', {params: {query}, signal})),
    // Readable in openapi-fetch drops required null fields from composed schemas.
    flow: async (id, signal) => data(await client.GET('/api/v1/flows/{flow_id}', {params: {path: {flow_id: id}}, signal})) as FlowDetail,
    dnsCache: async (query, signal) => data(await client.GET('/api/v1/dns/cache', {params: {query}, signal})),
    dnsLog: async (query, signal) => data(await client.GET('/api/v1/dns/log', {params: {query}, signal})),
    dnsQuery: async (domain, types, signal) => data(await client.GET('/api/v1/dns/query', {params: {query: {domain, type: types, detail: 'full'}}, signal})),
    // 204 carries no body; the response middleware has already turned any error status into an ApiError.
    closeConnection: async (connection_id, signal) => {
      await client.DELETE('/api/v1/connections/{connection_id}', {params: {path: {connection_id}}, signal});
    },
    runtimeSettings: async signal => data(await client.GET('/api/v1/runtime/settings', {signal})),
    runtimeMode: async signal => data(await client.GET('/api/v1/runtime/mode', {signal})),
    setRuntimeMode: async (body, signal) => data(await client.PUT('/api/v1/runtime/mode', {body, signal})),
    providers: async signal => data(await client.GET('/api/v1/providers', {params: {query: {limit: 1000}}, signal})),
    refreshProvider: async (id, signal) => accepted(await client.POST('/api/v1/providers/{id}/refresh', {params: {path: {id}}, signal})),
    config: async signal => data(await client.GET('/api/v1/config', {signal})),
    configSource: async (source_id, signal) => data(await client.GET('/api/v1/config/sources/{source_id}', {params: {path: {source_id}}, signal})),
    validateConfig: async (body, signal) => data(await client.POST('/api/v1/config/validate', {body, signal})),
    replaceConfigSource: async (source_id, content, ifMatch, signal) =>
      accepted(await client.PUT('/api/v1/config/sources/{source_id}', {params: {path: {source_id}, header: {'If-Match': ifMatch}}, body: {content}, signal})),
    patchRuntimeSettings: async (body, signal) => data(await client.PATCH('/api/v1/runtime/settings', {body, signal})),
    deleteDnsEntry: async (entry_id, signal) => data(await client.DELETE('/api/v1/dns/cache/{entry_id}', {params: {path: {entry_id}}, signal})),
    flushDnsCache: async signal => data(await client.POST('/api/v1/dns/cache/flush', {body: {}, signal})),
    // Readable also drops SimulationDnsData.attempt_id, whose contract value is null.
    routingTrace: async (body, signal) => data(await client.POST('/api/v1/routing/trace', {body, signal})) as RoutingTraceResponse,
    startReload: async signal => accepted(await client.POST('/api/v1/operations/reload', {body: {}, signal})),
    startSuspend: async signal => accepted(await client.POST('/api/v1/operations/suspend', {body: {}, signal})),
    startResume: async signal => accepted(await client.POST('/api/v1/operations/resume', {body: {}, signal})),
    operation: async (id, signal) => {
      const result = await client.GET('/api/v1/operations/{id}', {params: {path: {id}}, signal});
      return {...data(result), retryAfter: retryAfter(result.response)} as OperationState;
    },
    pollOperation,
    subscribeEvents,
    subscribeLogs
  };
}
