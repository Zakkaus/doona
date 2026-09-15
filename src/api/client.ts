import createClient from 'openapi-fetch';
import type {paths} from './types';
import type {Api} from './api';
import type {ApiEvent, EventKind, EventOptions, FlowDetail, OperationAccepted, OperationState} from './model';
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
  client.use({onResponse: async ({response}) => {
    if (!response.ok) throw await responseError(response);
    return response;
  }});
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
  async function subscribeEvents({kinds, lastEventId, signal, onEvent}: EventOptions): Promise<void> {
    let cursor = lastEventId;
    const url = new URL(baseUrl + '/api/v1/events', globalThis.location?.href);
    if (kinds?.length) url.searchParams.set('kinds', kinds.join(','));
    try {
      while (!signal?.aborted) {
        const streamHeaders = {...headers, Accept: 'text/event-stream', ...(cursor ? {'Last-Event-ID': cursor} : {})};
        const response = await fetch(url, {headers: streamHeaders, cache: 'no-store', signal});
        if (!response.ok) {
          const error = await responseError(response);
          if (cursor && error.status === 409 && error.code === 'event_cursor_expired') { cursor = undefined; continue; }
          throw error;
        }
        if (!response.body) throw new ApiError(response.status, 'empty_stream', 'Response has no event stream');
        await readSse(response.body, frame => {
          if (frame.id !== undefined) cursor = frame.id;
          if (!frame.data || !eventKinds.includes(frame.event as EventKind)) return;
          onEvent({id: cursor ?? '', event: frame.event, data: JSON.parse(frame.data)} as ApiEvent);
        }, signal);
        await wait(retryAfter(response), signal);
      }
    } catch (error) {
      if (!signal?.aborted) throw error;
    }
  }
  return {
    version: async signal => data(await client.GET('/api/v1/version', {signal})),
    capabilities: async signal => data(await client.GET('/api/v1/capabilities', {signal})),
    runtime: async signal => data(await client.GET('/api/v1/runtime', {signal})),
    nodes: async (query, signal) => data(await client.GET('/api/v1/nodes', {params: {query}, signal})),
    groups: async signal => data(await client.GET('/api/v1/groups', {signal})),
    group: async (id, signal) => data(await client.GET('/api/v1/groups/{groupId}', {params: {path: {groupId: id}}, signal})),
    selectGroup: async (groupId, body, signal) => data(await client.PUT('/api/v1/groups/{groupId}/selection', {params: {path: {groupId}}, body, signal})),
    patchGroup: async (groupId, body, ifMatch, signal) => {
      const result = await client.PATCH('/api/v1/groups/{groupId}', {params: {path: {groupId}, header: {'If-Match': ifMatch}}, headers: {'Content-Type': 'application/json-patch+json'}, body, signal});
      const value = data(result);
      return 'operation_id' in value ? accepted({data: value, response: result.response}) : value;
    },
    startProbe: async (body, signal) => accepted(await client.POST('/api/v1/probes', {body, signal})),
    connections: async (query, signal) => data(await client.GET('/api/v1/connections', {params: {query}, signal})),
    flows: async (query, signal) => data(await client.GET('/api/v1/flows', {params: {query}, signal})),
    // Readable in openapi-fetch drops required null fields from composed schemas.
    flow: async (id, signal) => data(await client.GET('/api/v1/flows/{flow_id}', {params: {path: {flow_id: id}}, signal})) as FlowDetail,
    dnsCache: async (query, signal) => data(await client.GET('/api/v1/dns/cache', {params: {query}, signal})),
    startReload: async signal => accepted(await client.POST('/api/v1/operations/reload', {body: {}, signal})),
    operation: async (id, signal) => {
      const result = await client.GET('/api/v1/operations/{id}', {params: {path: {id}}, signal});
      return {...data(result), retryAfter: retryAfter(result.response)} as OperationState;
    },
    pollOperation, subscribeEvents,
    history: () => null
  };
}
