import {getApi} from '../api/index';
import {poll} from './cadence';
import type {Api} from '../api/api';
import type {FlowList, FlowQuery, RoutingTraceRequest, RoutingTraceResponse} from '../api/model';
import {clientError} from '../api/error';
import {pageSize, useResource, walk} from './resource';
import {useCapabilities} from './runtime';

export async function routingTrace(
  api: Api,
  {
    input,
    resolve,
    recordTypes
  }: Omit<RoutingTraceRequest, 'resolve'> & {
    resolve: RoutingTraceRequest['resolve'] | 'query';
    recordTypes: string[];
  },
  signal: AbortSignal
): Promise<RoutingTraceResponse> {
  if (resolve !== 'query') return api.routingTrace({input, resolve}, signal);
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
    selected_ip: item.type === 'A' || item.type === 'AAAA' ? ((item.answers ?? []).find(answer => answer.type === item.type)?.data ?? null) : null,
    error: null
  }));
  // A client dials one address per family, so the first A and the first AAAA answer are simulated; every lookup
  // keeps its full answer list, with the simulated address as its selected IP.
  const addresses = [...new Set(['A', 'AAAA'].flatMap(type => dns.find(item => item.qtype === type && item.selected_ip)?.selected_ip ?? []))];
  const traces: RoutingTraceResponse[] = [];
  for (const address of addresses.length ? addresses : [null]) {
    traces.push(await api.routingTrace({input: address ? {...input, dst_ip: address} : input, resolve: 'none'}, signal));
  }
  if (traces.some(trace => trace.instance_id !== traces[0].instance_id || trace.generation_id !== traces[0].generation_id))
    throw clientError(409, 'snapshot_unavailable', 'The routing generation changed during simulation; retry the query', 'ui.errGenerationChanged');
  return {...traces[0], evaluations: traces.flatMap(trace => trace.evaluations), dns};
}

// The whole retained set, one snapshot per poll: a cursor is bound to a snapshot, so pages cannot be added to
// a list that the next poll replaces. Network and state narrow the walk on the backend instead.
export type FlowFilter = {connection_id?: string; network?: NonNullable<FlowQuery>['network']; state?: NonNullable<FlowQuery>['state']};
export function useFlows({connection_id, network = 'all', state = 'all'}: FlowFilter = {}, enabled = true) {
  const api = getApi();
  const {data: capabilities, error: capabilitiesError} = useCapabilities();
  const limit = pageSize(capabilities, capabilities?.resources.flows.max_page_size);
  return useResource(
    {
      key: ['flows', {connection_id, network, state, limit}],
      every: poll.lists,
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
    {enabled: enabled && capabilities !== undefined, pending: enabled && capabilities === undefined && !capabilitiesError}
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
