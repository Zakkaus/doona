import {getApi} from '../api/index';
import type {Api} from '../api/api';
import type {FlowList, FlowQuery, RoutingTraceRequest, RoutingTraceResponse} from '../api/model';
import {ApiError} from '../api/error';
import {pageSize, useResource, walk} from './resource';
import {useCapabilities} from './runtime';

export async function routingTrace(
  api: Api,
  {
    input,
    resolve,
    recordTypes,
    maxAddresses
  }: Omit<RoutingTraceRequest, 'resolve'> & {
    resolve: RoutingTraceRequest['resolve'] | 'query';
    recordTypes: string[];
    maxAddresses?: number;
  },
  signal: AbortSignal
): Promise<RoutingTraceResponse> {
  if (resolve !== 'query') return api.routingTrace({input, resolve}, signal);
  const limit = maxAddresses ?? (await api.capabilities(signal)).resources.routing_trace.max_addresses;
  if (limit === undefined) throw new ApiError(422, 'unsupported_value', 'Routing trace address limits are unavailable');
  const lookup = await api.dnsQuery(input.domain!, recordTypes, signal);
  const dns: RoutingTraceResponse['dns'] = lookup.results.map(item => ({
    lookup_id: `query:${item.type}`,
    parent_lookup_id: null,
    attempt_id: null,
    purpose: 'dial_target',
    name: lookup.domain,
    qtype: item.type,
    source: item.cached ? 'cache' : 'upstream',
    upstream_transport: null,
    carrier_transport: null,
    cache: item.cached ? 'hit' : 'miss',
    cache_entry_id: item.cache_entry_id,
    upstream: item.upstream,
    route_evaluation_ids: [],
    status: item.status,
    addresses: (item.answers ?? []).filter(answer => answer.type === item.type).map(answer => answer.data),
    selected_ip: (item.answers ?? []).find(answer => answer.type === item.type)?.data ?? null,
    error: null
  }));
  const addresses = [...new Set(dns.filter(item => item.qtype === 'A' || item.qtype === 'AAAA').flatMap(item => item.addresses))];
  if (addresses.length > limit)
    throw new ApiError(422, 'unsupported_value', `DNS returned more than ${limit} distinct addresses; narrow the query before simulating`);
  const traces: RoutingTraceResponse[] = [];
  for (const address of addresses.length ? addresses : [null]) {
    traces.push(await api.routingTrace({input: address ? {...input, dst_ip: address} : input, resolve: 'none'}, signal));
  }
  if (traces.some(trace => trace.instance_id !== traces[0].instance_id || trace.generation_id !== traces[0].generation_id))
    throw new ApiError(409, 'snapshot_unavailable', 'The routing generation changed during simulation; retry the query');
  return {...traces[0], evaluations: traces.flatMap(trace => trace.evaluations), dns};
}

// The whole retained set, one snapshot per poll: a cursor is bound to a snapshot, so pages cannot be added to
// a list that the next poll replaces. Network and state narrow the walk on the backend instead.
export type FlowFilter = {connection_id?: string; network?: NonNullable<FlowQuery>['network']; state?: NonNullable<FlowQuery>['state']};
export function useFlows({connection_id, network = 'all', state = 'all'}: FlowFilter = {}, enabled = true) {
  const api = getApi();
  const capabilities = useCapabilities().data;
  const limit = pageSize(capabilities, capabilities?.resources.flows.max_page_size);
  return useResource(
    {
      key: ['flows', {connection_id, network, state, limit}],
      every: 15000,
      fetch: signal =>
        walk(
          cursor => api.flows({network, state, connection_id, cursor, limit, detail: 'full'}, signal),
          (acc: FlowList | undefined, page) => {
            if (!acc) return {...page, flows: [...page.flows]};
            acc.flows.push(...page.flows);
            return acc;
          }
        )
    },
    {enabled: enabled && capabilities !== undefined, pending: enabled && capabilities === undefined}
  );
}

export function useFlow(id: string | null) {
  const api = getApi();
  return useResource(
    {
      key: ['flow', {id}],
      fetch: signal => (id ? api.flow(id, signal) : Promise.resolve(null)),
      acceptEvent: event => event.event !== 'flow.updated' || event.data.resource_id === id
    },
    {enabled: id !== null}
  );
}
export function useRules(enabled = true) {
  const api = getApi();
  return useResource({key: ['rules'], every: 0, fetch: signal => api.rules(signal)}, {enabled});
}
